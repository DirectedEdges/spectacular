import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import type { Transformer, TransformerContext } from '../transforms/transformer.js';
import { RunMetadataReader } from '../writers/RunMetadataFile.js';
import { FIGMA_PLATFORM, platformOf } from '../config/PlatformConventions.js';
import { ANALYSIS_DIR } from '../utilities/specsLayout.js';

/**
 * Reports Figma layer and property names that a formatted key cannot reconstruct
 * (ADR-066), so they can be tidied at the source.
 *
 * Reads generated specs, and therefore sees a name only where the producer recorded it
 * in `$extensions['com.figma'].name`. That happens when `format.figmaKeys` declares a
 * source convention — under the `NONE` default nothing diverges and this report is
 * empty, which is correct: no convention was declared, so no name departed from one.
 *
 * A recorded name is NOT by itself a naming problem. The field has two independent
 * triggers: format divergence (ADR-066) and wrapper-collapse provenance (ADR-058), and
 * the latter fires on the `root` key regardless of `figmaKeys` or of how well-formed
 * the name is. `Text` on a collapsed root is perfectly safe under SENTENCE and
 * round-trips unaided. So each recorded name is re-tested against the safe key grammar
 * here, and only genuine failures are reported.
 */

type Surface = 'anatomy' | 'prop';

type DeclaredConvention = 'SENTENCE' | 'TITLE';

/**
 * The safe key grammar. These mirror the `SafeKeySentence` and `SafeKeyTitle`
 * definitions in `component.schema.json`, which remain the contract — kept as literals
 * here because the CLI bundles to a single file and reading the schema JSON at runtime
 * would make the report depend on a resolvable package path. If the schema patterns
 * change, change these.
 */
const SAFE_KEY_PATTERNS: Record<DeclaredConvention, RegExp> = {
  SENTENCE: /^[A-Z][a-z]*( ([a-z]+|[0-9]+))*$/,
  TITLE: /^[A-Z][a-z]*( ([A-Z][a-z]*|[0-9]+))*$/,
};

/** Why a Figma name falls outside the safe key grammar. First match wins. */
type Cause =
  | 'separator'
  | 'symbol'
  | 'non-ascii'
  | 'mixed-letter-digit'
  | 'digit-initial'
  | 'casing'
  | 'already-a-key';

interface NameEntry {
  key: string;
  figmaName: string;
  cause: Cause;
  /**
   * Present, and only present, on a folded object-prop member (ADR-111), naming the
   * part of the compound name that failed. Without it the row shows a name whose
   * separator is legitimate beside a cause that describes one of its segments, and the
   * separator reads as the defect. First failing segment wins, as with `cause`.
   */
  segment?: string;
}

/** Empty surfaces are omitted rather than emitted as `[]`, to keep the checklist quiet. */
interface ComponentEntry {
  divergent: number;
  props?: NameEntry[];
  anatomy?: NameEntry[];
}

interface CauseEntry {
  cause: Cause;
  occurrences: number;
  names: string[];
}

interface NameFrequencyEntry {
  figmaName: string;
  occurrences: number;
  components: string[];
  cause: Cause;
  /** As on {@link NameEntry} — the failing part of a folded member's name. */
  segment?: string;
}

interface KeysAggregate {
  summary: {
    /**
     * The convention the names were measured against, or `null` when none is declared.
     *
     * With no convention every name passes vacuously, so `divergentNames: 0` across
     * hundreds of names means "not measured" rather than "clean" — and the two are
     * indistinguishable in the file. The warning that says so goes to stdout, which is
     * gone by the time anyone reads this; the file is what gets committed.
     */
    namingConvention: string | null;
    /** Whether a convention was declared, so the zeroes below mean something. */
    measured: boolean;
    totalComponents: number;
    componentsWithDivergence: number;
    totalNames: number;
    divergentNames: number;
    causeDistribution: Record<string, number>;
  };
  byComponent: Record<string, ComponentEntry>;
  byCause: CauseEntry[];
  byName: NameFrequencyEntry[];
}

interface Collected extends NameEntry {
  component: string;
  surface: Surface;
}

/** One `byName` row under construction — the name and cause it groups, and its members. */
interface FrequencyRecord {
  components: Set<string>;
  occurrences: number;
  figmaName: string;
  cause: Cause;
  segment?: string;
}

export class KeysAnalyzer implements Transformer {
  readonly name = 'keys';
  /** The report measures Figma names against the Figma naming convention (ADR-073). */
  readonly platformId = FIGMA_PLATFORM;

  private readonly _divergent: Collected[] = [];
  private readonly _components = new Set<string>();
  private _totalNames = 0;
  private _outputFormat: 'JSON' | 'YAML' = 'JSON';
  /** Resolved from the spec, its run document, or the workspace; undefined means none declared. */
  private _convention: DeclaredConvention | undefined;
  /** The object-prop member separator (ADR-111), resolved alongside the convention. */
  private _separator = DEFAULT_OBJECT_PROP_SEPARATOR;

  async run(apiYaml: Record<string, unknown>, context: TransformerContext): Promise<void> {
    const { componentKey, outputFormat } = context;
    this._outputFormat = outputFormat;
    this._components.add(componentKey);
    const rules = resolveFigmaRules(apiYaml, context);
    this._convention = rules.convention ?? this._convention;
    this._separator = rules.separator;

    this.collect(componentKey, apiYaml);

    const subcomponents = (apiYaml.subcomponents ?? {}) as Record<string, unknown>;
    for (const [subName, subRaw] of Object.entries(subcomponents)) {
      this.collect(`${componentKey}.${subName}`, subRaw as Record<string, unknown>);
    }
  }

  /**
   * Walks a component's anatomy and props. Compositions and slot content carry their own
   * nested anatomy, so those are walked too — the producer records names at every depth.
   */
  private collect(component: string, comp: Record<string, unknown>): void {
    this.collectAnatomy(component, comp.anatomy);
    this.collectProps(component, comp.props);

    const slotContent = (comp.slotContentExamples ?? {}) as Record<string, unknown>;
    for (const entry of Object.values(slotContent)) {
      this.collectAnatomy(component, (entry as Record<string, unknown>)?.anatomy);
    }

    const compositions = (comp.compositions ?? {}) as Record<string, unknown>;
    for (const entry of Object.values(compositions)) {
      this.collectAnatomy(component, (entry as Record<string, unknown>)?.anatomy);
    }
  }

  private collectAnatomy(component: string, anatomy: unknown): void {
    for (const [key, raw] of Object.entries((anatomy ?? {}) as Record<string, unknown>)) {
      this._totalNames++;
      this.record(component, key, 'anatomy', figmaNameOf(raw));
    }
  }

  /**
   * An object prop (ADR-111) has no Figma name of its own: it is the fold of its
   * members' separator-delimited source names, and each of those is a real property in
   * the file that someone has to rename. So the members are what gets measured and
   * counted, and the container — which nobody can see in Figma — is neither. Before
   * the fold existed each of those names was an ordinary prop and was reported; left
   * alone, this read the container, found no name, and dropped the whole group.
   */
  private collectProps(component: string, props: unknown): void {
    for (const [key, raw] of Object.entries((props ?? {}) as Record<string, unknown>)) {
      const members = objectPropMembers(raw);
      if (!members) {
        this._totalNames++;
        this.record(component, key, 'prop', figmaNameOf(raw));
        continue;
      }
      for (const [memberKey, member] of Object.entries(members)) {
        this._totalNames++;
        this.record(component, `${key}.${memberKey}`, 'prop', figmaNameOf(member), true);
      }
    }
  }

  /**
   * Records a name only if it actually fails the declared grammar. A recorded name that
   * passes was written for the other reason the field exists — wrapper-collapse
   * provenance — and is not a naming problem: it reconstructs from its key unaided.
   */
  private record(
    component: string,
    key: string,
    surface: Surface,
    figmaName: string | undefined,
    compound = false,
  ): void {
    if (!figmaName || !this._convention) return;
    const pattern = SAFE_KEY_PATTERNS[this._convention];
    // A folded member's name is measured segment by segment: the separator is declared
    // convention, not a stray symbol, so testing the whole name would report every
    // object-prop member in the library as a symbol problem and name no real edit.
    const segments = compound ? figmaName.split(this._separator) : [figmaName];
    const failing = segments.find(segment => !pattern.test(segment));
    if (failing === undefined) return;
    this._divergent.push({
      component,
      key,
      figmaName,
      surface,
      cause: causeOf(failing),
      ...(segments.length > 1 ? { segment: failing } : {}),
    });
  }

  async finalize(outputDir: string, analysisDir?: string): Promise<void> {
    if (this._totalNames === 0) return;

    // Without a convention every name passes vacuously, and a zero report reads as a
    // clean catalogue rather than as one that was never measured. Say which it is.
    if (!this._convention) {
      console.warn('Warning: no Figma naming convention declared — `analyze keys` has nothing to measure names against, so it reports zero divergence. Set `naming` in config/conventions/figma.yaml.');
    }

    const outDir = analysisDir ?? path.join(outputDir, ANALYSIS_DIR);
    await fs.ensureDir(outDir);

    const aggregate = this.buildAggregate();
    const ext = this._outputFormat === 'JSON' ? 'json' : 'yaml';
    const content = this._outputFormat === 'JSON'
      ? JSON.stringify(aggregate, null, 2) + '\n'
      : yaml.stringify(aggregate, { lineWidth: 120 });
    await fs.writeFile(path.join(outDir, `keys.${ext}`), content, 'utf-8');
  }

  private buildAggregate(): KeysAggregate {
    const surfaces = new Map<string, { props: NameEntry[]; anatomy: NameEntry[] }>();
    for (const entry of this._divergent) {
      const bucket = surfaces.get(entry.component)
        ?? surfaces.set(entry.component, { props: [], anatomy: [] }).get(entry.component)!;
      const list = entry.surface === 'prop' ? bucket.props : bucket.anatomy;
      list.push({
        key: entry.key,
        figmaName: entry.figmaName,
        cause: entry.cause,
        ...(entry.segment ? { segment: entry.segment } : {}),
      });
    }
    const byComponent: Record<string, ComponentEntry> = {};
    for (const [component, { props, anatomy }] of surfaces) {
      props.sort((a, b) => a.figmaName.localeCompare(b.figmaName));
      anatomy.sort((a, b) => a.figmaName.localeCompare(b.figmaName));
      byComponent[component] = {
        divergent: props.length + anatomy.length,
        ...(props.length ? { props } : {}),
        ...(anatomy.length ? { anatomy } : {}),
      };
    }

    const causeDistribution: Record<string, number> = {};
    const causeNames = new Map<Cause, Set<string>>();
    for (const entry of this._divergent) {
      causeDistribution[entry.cause] = (causeDistribution[entry.cause] ?? 0) + 1;
      (causeNames.get(entry.cause) ?? causeNames.set(entry.cause, new Set()).get(entry.cause)!).add(entry.figmaName);
    }
    const byCause: CauseEntry[] = [...causeNames.entries()]
      .map(([cause, names]) => ({ cause, occurrences: causeDistribution[cause], names: [...names].sort() }))
      .sort((a, b) => b.occurrences - a.occurrences);

    // A name wrong in twelve components is one decision, not twelve — which is what a
    // per-component checklist cannot show on its own.
    //
    // Grouped by name AND cause, because one Figma name can now fail in two ways: the
    // same `Margin.Compact` is measured whole where it stays a flat prop and segment by
    // segment where `objectProps` folded it, so `symbol` in one component and `casing`
    // in another. Keying on the name alone kept whichever cause arrived first and
    // contradicted `byComponent` for every other component in the row. They are also
    // two different edits, so one row could not have named both.
    //
    // The composite id is unambiguous because no cause contains a space.
    const frequency = new Map<string, FrequencyRecord>();
    for (const entry of this._divergent) {
      const id = `${entry.figmaName} ${entry.cause}`;
      const record = frequency.get(id) ?? {
        components: new Set<string>(),
        occurrences: 0,
        figmaName: entry.figmaName,
        cause: entry.cause,
        segment: entry.segment,
      };
      record.components.add(entry.component);
      record.occurrences++;
      frequency.set(id, record);
    }
    const byName: NameFrequencyEntry[] = [...frequency.values()]
      .map(r => ({
        figmaName: r.figmaName,
        occurrences: r.occurrences,
        components: [...r.components].sort(),
        cause: r.cause,
        ...(r.segment ? { segment: r.segment } : {}),
      }))
      .sort((a, b) =>
        b.occurrences - a.occurrences
        || a.figmaName.localeCompare(b.figmaName)
        || a.cause.localeCompare(b.cause));

    return {
      summary: {
        // The same truthiness `record()` gates on, so the field cannot claim a
        // measurement the per-name check skipped.
        namingConvention: this._convention || null,
        measured: Boolean(this._convention),
        totalComponents: this._components.size,
        componentsWithDivergence: Object.keys(byComponent).length,
        totalNames: this._totalNames,
        divergentNames: this._divergent.length,
        causeDistribution,
      },
      byComponent: Object.fromEntries(Object.entries(byComponent).sort(([a], [b]) => a.localeCompare(b))),
      byCause,
      byName,
    };
  }
}

/**
 * The members of an object prop (ADR-111), or undefined for every other prop shape.
 * Both the type and a populated `members` map are required, so a malformed prop reads
 * as an ordinary one rather than silently contributing no names at all.
 */
function objectPropMembers(raw: unknown): Record<string, unknown> | undefined {
  const prop = raw as Record<string, unknown> | undefined;
  if (prop?.type !== 'object') return undefined;
  const members = prop.members;
  if (!members || typeof members !== 'object' || Array.isArray(members)) return undefined;
  const entries = members as Record<string, unknown>;
  return Object.keys(entries).length > 0 ? entries : undefined;
}

function figmaNameOf(raw: unknown): string | undefined {
  const extensions = (raw as Record<string, unknown>)?.$extensions as Record<string, unknown> | undefined;
  const figma = extensions?.['com.figma'] as Record<string, unknown> | undefined;
  const name = figma?.name;
  return typeof name === 'string' ? name : undefined;
}

/**
 * Classifies why a name diverged. Ordered most-specific first: a name with both a
 * symbol and odd casing is reported as a symbol problem, because that is the edit to
 * make. `already-a-key` is last — it is not a defect, just a name authored in the
 * spec's own convention rather than as a Figma display name.
 */
function causeOf(name: string): Cause {
  if (/[\-_]/.test(name) && !/\s/.test(name)) return 'already-a-key';
  if (/[^\x20-\x7E]/.test(name)) return 'non-ascii';
  if (/[^A-Za-z0-9 ]/.test(name)) return 'symbol';
  if (/\s\s|^\s|\s$|[\t\n]/.test(name)) return 'separator';
  if (/[A-Za-z][0-9]|[0-9][A-Za-z]/.test(name)) return 'mixed-letter-digit';
  if (/^[0-9]/.test(name)) return 'digit-initial';
  // Characters and word shape are all fine, so the only rule left to fail is casing.
  // Reached only for names that already failed the grammar, so this is a verdict rather
  // than a catch-all — a well-formed name never gets here.
  return 'casing';
}

/** The `objectProps.separator` default the conventions loader applies (ADR-111). */
const DEFAULT_OBJECT_PROP_SEPARATOR = '.';

/**
 * The two Figma-side facts the report measures against, most specific statement first.
 *
 * A spec's own metadata is the most specific record, but since ADR-089 a generated
 * spec keeps only `metadata.source` and the run's facts live in `latest.metadata.yaml`
 * beside it — so the run document is read next, and the workspace's own
 * `config/conventions/figma.yaml` (arriving as `context.platform`) last. Reading only
 * the per-spec block, as this did, found nothing on any current output and reported
 * zero divergence for every catalogue.
 *
 * Both facts are resolved in one pass because finding the run document is a filesystem
 * walk per spec, and a second resolver would double it. The separator skips the
 * per-spec tier the convention has, because that tier reads a path no current output
 * writes (see `declaredConvention`) and a second lookup there would find nothing.
 *
 * The separator always answers, unlike the convention: it is only consulted for a prop
 * already typed `object`, so whether the block was declared is not in question by then
 * — only which character it named.
 */
function resolveFigmaRules(
  apiYaml: Record<string, unknown>,
  context: TransformerContext,
): { convention: DeclaredConvention | undefined; separator: string } {
  const run = platformOf(RunMetadataReader.find(context.specDir)?.conventions, FIGMA_PLATFORM);
  return {
    convention: declaredConvention(apiYaml)
      ?? asConvention(run.naming)
      ?? asConvention(context.platform?.naming),
    separator: asSeparator(run.objectProps)
      ?? asSeparator(context.platform?.objectProps)
      ?? DEFAULT_OBJECT_PROP_SEPARATOR,
  };
}

/** A declared `objectProps` block's separator, or undefined when the block is absent. */
function asSeparator(objectProps: unknown): string | undefined {
  if (!objectProps || typeof objectProps !== 'object') return undefined;
  const separator = (objectProps as Record<string, unknown>).separator;
  return typeof separator === 'string' && separator.length > 0
    ? separator
    : DEFAULT_OBJECT_PROP_SEPARATOR;
}

/** Only SENTENCE and TITLE have a safe key grammar to test against. */
function asConvention(value: unknown): DeclaredConvention | undefined {
  return value === 'SENTENCE' || value === 'TITLE' ? value : undefined;
}

/** The convention the spec was generated under, from its own metadata. */
function declaredConvention(apiYaml: Record<string, unknown>): DeclaredConvention | undefined {
  const metadata = apiYaml.metadata as Record<string, unknown> | undefined;
  // A spec generated since the conventions/settings split (ADR-071) records the Figma
  // naming convention at `metadata.conventions.figma.naming`; older specs carry
  // `metadata.config.format.figmaKeys`. Read the new key first and fall back so
  // pre-split specs still analyze.
  const conventions = metadata?.conventions as Record<string, unknown> | undefined;
  const figma = conventions?.figma as Record<string, unknown> | undefined;
  const legacyConfig = metadata?.config as Record<string, unknown> | undefined;
  const legacyFormat = legacyConfig?.format as Record<string, unknown> | undefined;
  return asConvention(figma?.naming ?? legacyFormat?.figmaKeys);
}
