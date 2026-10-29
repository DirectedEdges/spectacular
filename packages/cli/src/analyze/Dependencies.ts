import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import type { Transformer, TransformerContext } from '../transforms/transformer.js';
import { ANALYSIS_DIR } from '../utilities/specsLayout.js';

type EdgeKind = 'instance' | 'slot' | 'example';

/** Every edge kind, for counts that must cover all of them. */
const EDGE_KINDS: EdgeKind[] = ['instance', 'slot', 'example'];

/** Which spec section a prop configuration site was found in. */
type SiteOrigin = 'default' | 'variant' | 'example';

interface UsageSite {
  target: string;
  prop: string;
  value: string;
  origin: SiteOrigin;
}

interface NestedSite {
  anchorTarget: string;
  path: string[];
  props: Array<{ prop: string; value: string }>;
  origin: SiteOrigin;
}

interface SpecRecord {
  props: string[];
  /** Top-level anatomy/element key → raw instanceOf target name. */
  elementTargets: Map<string, string>;
  /** Raw target name → element keys where an instance is placed. */
  instanceSites: Map<string, Set<string>>;
  /** Raw candidate name → element keys, from instance-swap prop bindings. Matched against known components only. */
  swapCandidates: Map<string, Set<string>>;
  /** Raw target name → slot prop names allowing it via anyOf. */
  slotTargets: Map<string, Set<string>>;
  /** Raw target name → slotContentExamples entry names referencing it. */
  exampleTargets: Map<string, Set<string>>;
  usageSites: UsageSite[];
  nestedSites: NestedSite[];
}

interface EdgeJson {
  from: string;
  to: string;
  kind: EdgeKind;
  elements?: string[];
  slots?: string[];
  examples?: string[];
  count?: number;
}

interface NodeJson {
  external: boolean;
  /** Components this one relates to, across every edge kind. */
  dependsOn: number;
  /** Components relating to this one, across every edge kind. */
  dependedOnBy: number;
  /** The same two counts split by the kind of relationship behind them. */
  byKind: Record<EdgeKind, { dependsOn: number; dependedOnBy: number }>;
}

interface GraphJson {
  summary: {
    components: number;
    externals: number;
    edges: Record<EdgeKind, number>;
    /** Nothing relates to these — across every edge kind, as `nodes[].dependedOnBy` counts. */
    roots: string[];
    /** These relate to nothing — across every edge kind, as `nodes[].dependsOn` counts. */
    leaves: string[];
    /**
     * Neither depended on nor depending on anything. Held apart from the two
     * lists above rather than appearing in both, which is true of an unconnected
     * component but says nothing a reader can use.
     */
    isolated: string[];
    /** Composition cycles, over instance edges only — a slot constraint cannot cycle. */
    cycles: string[][];
  };
  nodes: Record<string, NodeJson>;
  edges: EdgeJson[];
}

interface ConsumerUsage {
  default: number;
  variants: number;
  examples: number;
  values: Record<string, number>;
}

interface PropUsageEntry {
  configuredBy: number;
  consumers: Record<string, ConsumerUsage>;
  values: Record<string, string[]>;
}

interface PropUsageAccumulator {
  sites: number;
  consumers: Map<string, { default: number; variants: number; examples: number; values: Map<string, number> }>;
  values: Map<string, Set<string>>;
}

interface ByComponentEntry {
  directDependents: string[];
  transitiveDependents: Record<string, number>;
  directDependencies: string[];
  transitiveDependencies: Record<string, number>;
  contractDependents: string[];
  contractDependencies: string[];
  propUsage: Record<string, PropUsageEntry>;
}

export class DependenciesAnalyzer implements Transformer {
  readonly name = 'dependencies';
  // A composition is the clearest dependency data a library has — a screen states
  // which components it is built from — and it carries real styling of its own.
  readonly readsKinds = ['component', 'composition'] as const;

  private readonly _records = new Map<string, SpecRecord>();
  private _outputFormat: 'JSON' | 'YAML' = 'JSON';

  async run(apiYaml: Record<string, unknown>, context: TransformerContext): Promise<void> {
    const { outputDir, componentKey, outputFormat } = context;
    this._outputFormat = outputFormat;

    // In split-concerns output, variant elements live in variants.yaml and
    // slot-content examples in examples.yaml. Fall back to apiYaml itself
    // for single-file format.
    const variantsSource = (await loadConcernYaml(outputDir, 'variants.yaml')) ?? apiYaml;
    const examplesSource = (await loadConcernYaml(outputDir, 'examples.yaml')) ?? apiYaml;

    const record: SpecRecord = {
      props: [],
      elementTargets: new Map(),
      instanceSites: new Map(),
      swapCandidates: new Map(),
      slotTargets: new Map(),
      exampleTargets: new Map(),
      usageSites: [],
      nestedSites: [],
    };

    const props = (apiYaml.props ?? {}) as Record<string, unknown>;
    record.props = Object.keys(props).sort((a, b) => a.localeCompare(b));

    collectSlotTargets(props, record);
    collectAnatomy((apiYaml.anatomy ?? {}) as Record<string, unknown>, record, true);

    const apiSubcomponents = (apiYaml.subcomponents ?? {}) as Record<string, unknown>;
    for (const sub of Object.values(apiSubcomponents)) {
      const subEntry = sub as Record<string, unknown>;
      collectSlotTargets((subEntry.props ?? {}) as Record<string, unknown>, record);
      // Subcomponents collapse into the parent: their instances become parent
      // edges, but their element keys stay out of nested-path resolution.
      collectAnatomy((subEntry.anatomy ?? {}) as Record<string, unknown>, record, false);
    }

    collectVariantSections(variantsSource, props, record);
    const sourceSubcomponents = (variantsSource.subcomponents ?? {}) as Record<string, unknown>;
    for (const [subName, sub] of Object.entries(sourceSubcomponents)) {
      const subProps = ((apiSubcomponents[subName] as Record<string, unknown> | undefined)?.props ?? {}) as Record<string, unknown>;
      collectVariantSections(sub as Record<string, unknown>, subProps, record);
    }

    const slotContentExamples = (examplesSource.slotContentExamples ?? {}) as Record<string, unknown>;
    for (const [exampleName, content] of Object.entries(slotContentExamples)) {
      collectExampleContent(exampleName, content as Record<string, unknown>, record);
    }

    this._records.set(componentKey, record);
  }

  async finalize(outputDir: string, analysisDir?: string): Promise<void> {
    if (this._records.size === 0) return;

    const outDir = analysisDir ?? path.join(outputDir, ANALYSIS_DIR);
    await fs.ensureDir(outDir);

    const known = new Set(this._records.keys());
    const normalized = new Map<string, string>();
    for (const key of known) normalized.set(normalizeName(key), key);
    const resolve = (name: string): { id: string; external: boolean } => {
      if (known.has(name)) return { id: name, external: false };
      const match = normalized.get(normalizeName(name));
      if (match) return { id: match, external: false };
      return { id: name, external: true };
    };

    // Deduped edges keyed by from\x00to\x00kind, carrying their site labels.
    const edgeMap = new Map<string, { from: string; to: string; kind: EdgeKind; labels: Set<string> }>();
    const externals = new Set<string>();
    const addEdge = (from: string, rawTarget: string, kind: EdgeKind, labels: Iterable<string>, knownOnly = false): void => {
      const { id, external } = resolve(rawTarget);
      if (external && knownOnly) return;
      if (external) externals.add(id);
      const key = `${from}\x00${id}\x00${kind}`;
      const edge = edgeMap.get(key) ?? { from, to: id, kind, labels: new Set<string>() };
      for (const label of labels) edge.labels.add(label);
      edgeMap.set(key, edge);
    };

    for (const [from, record] of this._records) {
      for (const [target, elements] of record.instanceSites) addEdge(from, target, 'instance', elements);
      for (const [target, elements] of record.swapCandidates) addEdge(from, target, 'instance', elements, true);
      for (const [target, slots] of record.slotTargets) addEdge(from, target, 'slot', slots);
      for (const [target, examples] of record.exampleTargets) addEdge(from, target, 'example', examples);
    }

    // Adjacency over instance edges: forward = dependencies, reverse = dependents.
    // Kept separate from the contract relations because composition is what a
    // cycle can exist in, and what the transitive closures below walk.
    const forward = new Map<string, Set<string>>();
    const reverse = new Map<string, Set<string>>();
    const contractForward = new Map<string, Set<string>>();
    const contractReverse = new Map<string, Set<string>>();
    // Per-kind adjacency, so a node's counts can name what each is made of and
    // the summary's edge totals and the node counts describe one set of edges.
    const byKindForward: Record<EdgeKind, Map<string, Set<string>>> =
      { instance: new Map(), slot: new Map(), example: new Map() };
    const byKindReverse: Record<EdgeKind, Map<string, Set<string>>> =
      { instance: new Map(), slot: new Map(), example: new Map() };
    const add = (m: Map<string, Set<string>>, from: string, to: string): void => {
      (m.get(from) ?? m.set(from, new Set()).get(from)!).add(to);
    };
    for (const edge of edgeMap.values()) {
      const [fwd, rev] = edge.kind === 'instance'
        ? [forward, reverse]
        : [contractForward, contractReverse];
      add(fwd, edge.from, edge.to);
      add(rev, edge.to, edge.from);
      add(byKindForward[edge.kind], edge.from, edge.to);
      add(byKindReverse[edge.kind], edge.to, edge.from);
    }

    const propUsage = this._aggregatePropUsage(resolve);

    await this._writeGraph(outDir, known, externals, edgeMap, byKindForward, byKindReverse, forward);
    await this._writeByComponent(outDir, known, forward, reverse, contractForward, contractReverse, propUsage);
  }

  private _aggregatePropUsage(
    resolve: (name: string) => { id: string; external: boolean }
  ): Map<string, Map<string, PropUsageAccumulator>> {
    const usage = new Map<string, Map<string, PropUsageAccumulator>>();
    const addSite = (targetKey: string, consumer: string, prop: string, value: string, origin: SiteOrigin): void => {
      const perProp = usage.get(targetKey) ?? usage.set(targetKey, new Map()).get(targetKey)!;
      const entry = perProp.get(prop)
        ?? perProp.set(prop, { sites: 0, consumers: new Map(), values: new Map() }).get(prop)!;
      entry.sites++;
      (entry.values.get(value) ?? entry.values.set(value, new Set()).get(value)!).add(consumer);
      const consumerEntry = entry.consumers.get(consumer)
        ?? entry.consumers.set(consumer, { default: 0, variants: 0, examples: 0, values: new Map() }).get(consumer)!;
      if (origin === 'default') consumerEntry.default++;
      else if (origin === 'variant') consumerEntry.variants++;
      else consumerEntry.examples++;
      consumerEntry.values.set(value, (consumerEntry.values.get(value) ?? 0) + 1);
    };

    for (const [consumer, record] of this._records) {
      for (const site of record.usageSites) {
        const { id, external } = resolve(site.target);
        if (external) continue;
        addSite(id, consumer, site.prop, site.value, site.origin);
      }
      for (const nested of record.nestedSites) {
        const terminal = this._resolveNestedTerminal(nested, resolve);
        if (!terminal) continue;
        for (const { prop, value } of nested.props) addSite(terminal, consumer, prop, value, nested.origin);
      }
    }
    return usage;
  }

  /** Walk a $nested path through successive components' element targets to the terminal instance. */
  private _resolveNestedTerminal(
    nested: NestedSite,
    resolve: (name: string) => { id: string; external: boolean }
  ): string | null {
    let current = resolve(nested.anchorTarget);
    if (current.external) return null;
    for (const segment of nested.path) {
      const record = this._records.get(current.id);
      const rawTarget = record?.elementTargets.get(segment);
      if (!rawTarget) return null;
      current = resolve(rawTarget);
      if (current.external) return null;
    }
    return current.id;
  }

  private async _writeGraph(
    outDir: string,
    known: Set<string>,
    externals: Set<string>,
    edgeMap: Map<string, { from: string; to: string; kind: EdgeKind; labels: Set<string> }>,
    byKindForward: Record<EdgeKind, Map<string, Set<string>>>,
    byKindReverse: Record<EdgeKind, Map<string, Set<string>>>,
    instanceForward: Map<string, Set<string>>
  ): Promise<void> {
    const sortedKnown = Array.from(known).sort((a, b) => a.localeCompare(b));
    const sortedExternals = Array.from(externals).sort((a, b) => a.localeCompare(b));

    // A relationship of any kind counts. Counting instance edges only left a
    // component related through nothing but a slot reading as unconnected, and
    // put components in the roots and leaves lists at once.
    const relatedCount = (by: Record<EdgeKind, Map<string, Set<string>>>, id: string): number =>
      new Set(EDGE_KINDS.flatMap(kind => [...(by[kind].get(id) ?? [])])).size;

    const nodes: Record<string, NodeJson> = {};
    for (const id of [...sortedKnown, ...sortedExternals].sort((a, b) => a.localeCompare(b))) {
      nodes[id] = {
        external: externals.has(id),
        dependsOn: relatedCount(byKindForward, id),
        dependedOnBy: relatedCount(byKindReverse, id),
        byKind: Object.fromEntries(
          EDGE_KINDS.map(kind => [kind, {
            dependsOn: byKindForward[kind].get(id)?.size ?? 0,
            dependedOnBy: byKindReverse[kind].get(id)?.size ?? 0,
          }])
        ) as NodeJson['byKind'],
      };
    }

    const LABEL_KEY: Record<EdgeKind, 'elements' | 'slots' | 'examples'> = {
      instance: 'elements',
      slot: 'slots',
      example: 'examples',
    };
    const edges: EdgeJson[] = Array.from(edgeMap.values())
      .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind))
      .map(edge => {
        const labels = Array.from(edge.labels).sort((a, b) => a.localeCompare(b));
        const json: EdgeJson = { from: edge.from, to: edge.to, kind: edge.kind };
        json[LABEL_KEY[edge.kind]] = labels;
        json.count = labels.length;
        return json;
      });

    const edgeCounts: Record<EdgeKind, number> = { instance: 0, slot: 0, example: 0 };
    for (const edge of edgeMap.values()) edgeCounts[edge.kind]++;

    const graph: GraphJson = {
      summary: {
        components: known.size,
        externals: externals.size,
        edges: edgeCounts,
        roots: sortedKnown.filter(id => nodes[id].dependedOnBy === 0 && nodes[id].dependsOn > 0),
        leaves: sortedKnown.filter(id => nodes[id].dependsOn === 0 && nodes[id].dependedOnBy > 0),
        isolated: sortedKnown.filter(id => nodes[id].dependsOn === 0 && nodes[id].dependedOnBy === 0),
        cycles: findCycles(sortedKnown, instanceForward),
      },
      nodes,
      edges,
    };

    await this._writeFile(outDir, 'dependencies.graph', graph);
  }

  private async _writeByComponent(
    outDir: string,
    known: Set<string>,
    forward: Map<string, Set<string>>,
    reverse: Map<string, Set<string>>,
    contractForward: Map<string, Set<string>>,
    contractReverse: Map<string, Set<string>>,
    propUsage: Map<string, Map<string, PropUsageAccumulator>>
  ): Promise<void> {
    const out: Record<string, ByComponentEntry> = {};

    for (const key of Array.from(known).sort((a, b) => a.localeCompare(b))) {
      const dependents = closure(key, reverse);
      const dependencies = closure(key, forward);
      const direct = (map: Map<string, number>): string[] =>
        Array.from(map.entries()).filter(([, depth]) => depth === 1).map(([id]) => id).sort((a, b) => a.localeCompare(b));
      const transitive = (map: Map<string, number>): Record<string, number> =>
        Object.fromEntries(
          Array.from(map.entries())
            .filter(([, depth]) => depth > 1)
            .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
        );
      const contractRelations = (map: Map<string, Set<string>>, structural: Map<string, number>): string[] =>
        Array.from(map.get(key) ?? [])
          .filter(id => structural.get(id) !== 1)
          .sort((a, b) => a.localeCompare(b));

      const record = this._records.get(key)!;
      const perProp = propUsage.get(key);
      const propNames = Array.from(new Set([...record.props, ...(perProp?.keys() ?? [])]))
        .sort((a, b) => a.localeCompare(b));
      const usage: Record<string, PropUsageEntry> = {};
      for (const prop of propNames) {
        const entry = perProp?.get(prop);
        usage[prop] = {
          configuredBy: entry?.sites ?? 0,
          consumers: Object.fromEntries(
            Array.from(entry?.consumers.entries() ?? [])
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([consumer, c]) => [consumer, {
                default: c.default,
                variants: c.variants,
                examples: c.examples,
                values: Object.fromEntries(
                  Array.from(c.values.entries()).sort((a, b) => a[0].localeCompare(b[0]))
                ),
              }])
          ),
          values: Object.fromEntries(
            Array.from(entry?.values.entries() ?? [])
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([value, consumers]) => [value, Array.from(consumers).sort((a, b) => a.localeCompare(b))])
          ),
        };
      }

      out[key] = {
        directDependents: direct(dependents),
        transitiveDependents: transitive(dependents),
        directDependencies: direct(dependencies),
        transitiveDependencies: transitive(dependencies),
        contractDependents: contractRelations(contractReverse, dependents),
        contractDependencies: contractRelations(contractForward, dependencies),
        propUsage: usage,
      };
    }

    await this._writeFile(outDir, 'dependencies.byComponent', out);
  }

  private async _writeFile(outDir: string, baseName: string, data: unknown): Promise<void> {
    const ext = this._outputFormat === 'YAML' ? 'yaml' : 'json';
    const content = this._outputFormat === 'YAML'
      ? yaml.stringify(data, { lineWidth: 120 })
      : JSON.stringify(data, null, 2) + '\n';
    await fs.writeFile(path.join(outDir, `${baseName}.${ext}`), content, 'utf-8');
  }
}

/** BFS from start over the given adjacency; returns reachable node → min depth (start excluded). */
function closure(start: string, adjacency: Map<string, Set<string>>): Map<string, number> {
  const depths = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [{ id: start, depth: 0 }];
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    for (const next of adjacency.get(id) ?? []) {
      if (depths.has(next)) continue;
      depths.set(next, depth + 1);
      queue.push({ id: next, depth: depth + 1 });
    }
  }
  return depths;
}

/** Strongly connected components of size > 1, plus self-loops, over instance edges. Iterative Tarjan. */
function findCycles(nodeIds: string[], forward: Map<string, Set<string>>): string[][] {
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  let counter = 0;

  for (const root of nodeIds) {
    if (index.has(root)) continue;
    const work: Array<{ id: string; neighbors: string[]; next: number }> = [
      { id: root, neighbors: Array.from(forward.get(root) ?? []), next: 0 },
    ];
    index.set(root, counter);
    lowlink.set(root, counter);
    counter++;
    stack.push(root);
    onStack.add(root);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      if (frame.next < frame.neighbors.length) {
        const neighbor = frame.neighbors[frame.next++];
        if (!index.has(neighbor)) {
          index.set(neighbor, counter);
          lowlink.set(neighbor, counter);
          counter++;
          stack.push(neighbor);
          onStack.add(neighbor);
          work.push({ id: neighbor, neighbors: Array.from(forward.get(neighbor) ?? []), next: 0 });
        } else if (onStack.has(neighbor)) {
          lowlink.set(frame.id, Math.min(lowlink.get(frame.id)!, index.get(neighbor)!));
        }
      } else {
        work.pop();
        if (work.length > 0) {
          const parent = work[work.length - 1];
          lowlink.set(parent.id, Math.min(lowlink.get(parent.id)!, lowlink.get(frame.id)!));
        }
        if (lowlink.get(frame.id) === index.get(frame.id)) {
          const component: string[] = [];
          let member: string;
          do {
            member = stack.pop()!;
            onStack.delete(member);
            component.push(member);
          } while (member !== frame.id);
          const isSelfLoop = component.length === 1 && (forward.get(component[0])?.has(component[0]) ?? false);
          if (component.length > 1 || isSelfLoop) {
            cycles.push(component.sort((a, b) => a.localeCompare(b)));
          }
        }
      }
    }
  }

  return cycles.sort((a, b) => a[0].localeCompare(b[0]));
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function loadConcernYaml(outputDir: string, fileName: string): Promise<Record<string, unknown> | null> {
  const filePath = path.join(outputDir, fileName);
  if (!fs.existsSync(filePath)) return null;
  const raw = await fs.readFile(filePath, 'utf-8');
  return yaml.parse(raw) as Record<string, unknown>;
}

/** Sentinel emitted by specs-from-figma when a slot constraint's component key cannot be resolved. */
const UNRESOLVED_INSTANCE = '(unresolved instance)';

function instanceTarget(value: unknown): string | null {
  return typeof value === 'string' && value !== UNRESOLVED_INSTANCE ? value : null;
}

/** `$`-prefixed anyOf values are reserved composable-slot markers (ADR-102), not component targets. */
function isReservedSlotMarker(value: string): boolean {
  return value.startsWith('$');
}

function bindingTarget(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const binding = (value as Record<string, unknown>).$binding;
  if (typeof binding !== 'string') return null;
  return binding.match(/^#\/props\/(.+)$/)?.[1] ?? null;
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  (map.get(key) ?? map.set(key, new Set()).get(key)!).add(value);
}

function collectSlotTargets(props: Record<string, unknown>, record: SpecRecord): void {
  for (const [propName, raw] of Object.entries(props)) {
    const prop = raw as Record<string, unknown>;
    if (prop.type !== 'slot' || !Array.isArray(prop.anyOf)) continue;
    for (const target of prop.anyOf) {
      if (typeof target === 'string' && target !== UNRESOLVED_INSTANCE && !isReservedSlotMarker(target)) {
        addToSetMap(record.slotTargets, target, propName);
      }
    }
  }
}

function collectAnatomy(
  anatomy: Record<string, unknown>,
  record: SpecRecord,
  trackElementTargets: boolean
): void {
  for (const [elementKey, raw] of Object.entries(anatomy)) {
    const target = instanceTarget((raw as Record<string, unknown>).instanceOf);
    if (!target) continue;
    addToSetMap(record.instanceSites, target, elementKey);
    if (trackElementTargets) record.elementTargets.set(elementKey, target);
  }
}

function collectVariantSections(
  source: Record<string, unknown>,
  props: Record<string, unknown>,
  record: SpecRecord
): void {
  const defaultSection = source.default as Record<string, unknown> | undefined;
  if (defaultSection?.elements) {
    collectElements(defaultSection.elements as Record<string, unknown>, props, record, 'default');
  }
  const variants = (source.variants ?? []) as Array<Record<string, unknown>>;
  for (const variant of variants) {
    if (variant.elements) {
      collectElements(variant.elements as Record<string, unknown>, props, record, 'variant');
    }
  }
}

function collectElements(
  elements: Record<string, unknown>,
  props: Record<string, unknown>,
  record: SpecRecord,
  origin: SiteOrigin
): void {
  for (const [elementKey, raw] of Object.entries(elements)) {
    const element = raw as Record<string, unknown>;

    const target = instanceTarget(element.instanceOf);
    if (target) {
      addToSetMap(record.instanceSites, target, elementKey);
      if (!record.elementTargets.has(elementKey)) record.elementTargets.set(elementKey, target);
    }

    // An instance swap bound to a prop: the prop's enum values are candidate
    // component names. Matched against known components only at finalize.
    const boundProp = bindingTarget(element.instanceOf);
    if (boundProp) {
      const propDef = props[boundProp] as Record<string, unknown> | undefined;
      if (Array.isArray(propDef?.enum)) {
        for (const candidate of propDef.enum) {
          if (typeof candidate === 'string') addToSetMap(record.swapCandidates, candidate, elementKey);
        }
      }
    }

    const resolvedTarget = target ?? record.elementTargets.get(elementKey) ?? null;
    const configurations = element.propConfigurations as Record<string, unknown> | undefined;
    if (configurations) {
      collectPropConfigurations(configurations, resolvedTarget, record, origin);
    }
  }
}

function collectPropConfigurations(
  configurations: Record<string, unknown>,
  target: string | null,
  record: SpecRecord,
  origin: SiteOrigin
): void {
  for (const [prop, rawValue] of Object.entries(configurations)) {
    if (prop === '$nested') {
      if (!target || !Array.isArray(rawValue)) continue;
      for (const entry of rawValue as Array<Record<string, unknown>>) {
        const pathSegments = entry.path;
        if (!Array.isArray(pathSegments)) continue;
        const nestedProps: Array<{ prop: string; value: string }> = [];
        for (const [nestedProp, nestedValue] of Object.entries(entry)) {
          if (nestedProp === 'path') continue;
          for (const { prop: sited, value } of configValueSites(nestedProp, nestedValue)) {
            nestedProps.push({ prop: sited, value });
          }
        }
        record.nestedSites.push({ anchorTarget: target, path: pathSegments as string[], props: nestedProps, origin });
      }
      continue;
    }

    if (!target) continue;
    for (const { prop: sited, value } of configValueSites(prop, rawValue)) {
      record.usageSites.push({ target, prop: sited, value, origin });
    }
  }
}

/**
 * The usage sites one configuration entry contributes: a scalar or reference is
 * one site under its own prop, and a member-keyed object (ADR-111) is one site
 * per member under `prop.member` — a null member leaves that member untouched
 * and records nothing.
 */
function configValueSites(prop: string, rawValue: unknown): Array<{ prop: string; value: string }> {
  if (isMemberObject(rawValue)) {
    const sites: Array<{ prop: string; value: string }> = [];
    for (const [memberKey, memberValue] of Object.entries(rawValue as Record<string, unknown>)) {
      if (memberValue === null) continue;
      const serialized = serializeConfigValue(memberValue);
      if (serialized !== null) sites.push({ prop: `${prop}.${memberKey}`, value: serialized });
    }
    return sites;
  }
  const serialized = serializeConfigValue(rawValue);
  return serialized !== null ? [{ prop, value: serialized }] : [];
}

/**
 * A member-keyed object value (ADR-111) — a plain object none of whose keys
 * begin with `$`, which is what keeps it distinguishable from `$binding`,
 * `$slotContent`, and image bindings.
 */
function isMemberObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every(key => !key.startsWith('$'));
}

function serializeConfigValue(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.$binding === 'string') {
      return `$binding:${obj.$binding.replace(/^#\/props\//, '')}`;
    }
    if (typeof obj.$slotContent === 'string') {
      return `$slotContent:${obj.$slotContent.split('/').pop() ?? obj.$slotContent}`;
    }
  }
  return null;
}

function collectExampleContent(
  exampleName: string,
  content: Record<string, unknown>,
  record: SpecRecord
): void {
  const targets = new Map<string, string>();

  const anatomy = (content.anatomy ?? {}) as Record<string, unknown>;
  for (const [elementKey, raw] of Object.entries(anatomy)) {
    const target = instanceTarget((raw as Record<string, unknown>).instanceOf);
    if (target) targets.set(elementKey, target);
  }

  const elements = (content.elements ?? {}) as Record<string, unknown>;
  for (const [elementKey, raw] of Object.entries(elements)) {
    const element = raw as Record<string, unknown>;
    const target = instanceTarget(element.instanceOf) ?? targets.get(elementKey) ?? null;
    if (target) targets.set(elementKey, target);

    const configurations = element.propConfigurations as Record<string, unknown> | undefined;
    if (configurations && target) {
      collectPropConfigurations(configurations, target, record, 'example');
    }
  }

  for (const target of targets.values()) {
    addToSetMap(record.exampleTargets, target, exampleName);
  }
}
