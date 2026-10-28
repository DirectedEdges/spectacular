import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import type { Metadata, RunMetadata as SchemaRunMetadata } from '@directededges/specs-schema';
import { FileWriter } from './FileWriter.js';
import type { OutputFormat } from '../writers/outputConfig.js';

/**
 * The base name of the document a run writes its own facts to (ADR-089).
 *
 * "latest" because a directory holds the most recent run's record, not a history
 * of them — a second run over the same output replaces it, the same way it
 * replaces the specs beside it.
 */
export const RUN_METADATA_BASENAME = 'latest.metadata';

/** How far above a spec folder the run document is looked for. See `ancestorsOf`. */
const SEARCH_DEPTH = 4;

/** The `metadata` block of a spec, as it exists before the run's facts are lifted out. */
type SpecMetadata = Metadata & Record<string, unknown>;

/**
 * The `Metadata` keys that describe the run rather than the component carrying
 * them. `satisfies` ties the list to the schema: a key added to or removed from
 * `RunMetadata` fails this file to compile rather than silently leaking into the
 * per-component block or going missing from the run document.
 */
const RUN_METADATA_KEYS = [
  'author',
  'lastUpdated',
  'generator',
  'schema',
  'conventions',
  'settings',
] as const satisfies ReadonlyArray<keyof SchemaRunMetadata>;

/**
 * A run states its facts once, in a document of its own, and every component it
 * produced keeps only `metadata.source` (ADR-089).
 *
 * The six lifted keys — author, timestamp, generator, schema, conventions,
 * settings — are identical on every component a run produces. Repeating them per
 * component is redundant on its own; with `--split-concerns` the block repeats
 * once per api/variants/examples document and again for every subcomponent
 * inside each, which is where the weight lands.
 */
export class RunMetadataFile {

  /**
   * Lift the run's facts out of every spec, reducing each `metadata` block —
   * including the ones on nested subcomponents — to `source` alone.
   *
   * Returns the run's facts when the specs agree on them, and `undefined` when
   * there are none to lift or the specs disagree. A disagreement means the specs
   * did not come from one run, so no single document can speak for them; the
   * caller leaves them as they are rather than publishing one component's record
   * as the whole set's.
   */
  static separate(specs: Array<{ name: string; spec: Record<string, unknown> }>): SchemaRunMetadata | undefined {
    let run: SchemaRunMetadata | undefined;

    for (const { spec } of specs) {
      const found = this.firstRun(spec);
      if (!found) continue;
      if (!run) { run = found; continue; }
      if (!this.agree(run, found)) return undefined;
    }

    if (!run) return undefined;

    for (const { spec } of specs) this.reduce(spec);
    return run;
  }

  /** Write the run's facts beside the specs they describe. */
  static write(run: SchemaRunMetadata, baseDir: string, format: OutputFormat): string {
    const filePath = path.join(baseDir, `${RUN_METADATA_BASENAME}.${format}`);
    fs.mkdirSync(baseDir, { recursive: true });
    fs.writeFileSync(filePath, FileWriter.serialize(run as unknown as Record<string, unknown>, format), 'utf8');
    return filePath;
  }

  /**
   * Whether two run records state the same facts.
   *
   * `lastUpdated` is excluded: it moves within a single run and says nothing
   * about whether the rest agrees.
   */
  private static agree(a: SchemaRunMetadata, b: SchemaRunMetadata): boolean {
    const stated = ({ lastUpdated: _lastUpdated, ...rest }: SchemaRunMetadata) => rest;
    return JSON.stringify(stated(a)) === JSON.stringify(stated(b));
  }

  /**
   * The run's facts as stated by this metadata block, or `undefined` when it does
   * not state all six — a partial record would leave a reader unable to tell a
   * missing fact from one stated elsewhere, which is why `RunMetadata` requires
   * every key.
   */
  private static runOf(metadata: SpecMetadata): SchemaRunMetadata | undefined {
    if (!RUN_METADATA_KEYS.every(key => metadata[key] !== undefined)) return undefined;
    return {
      author: metadata.author,
      lastUpdated: metadata.lastUpdated,
      generator: metadata.generator,
      schema: metadata.schema,
      conventions: metadata.conventions,
      settings: metadata.settings,
    } as SchemaRunMetadata;
  }

  /** The first complete run record found on a spec or any of its subcomponents. */
  private static firstRun(node: Record<string, unknown>): SchemaRunMetadata | undefined {
    const metadata = node.metadata as SpecMetadata | undefined;
    if (metadata) {
      const run = this.runOf(metadata);
      if (run) return run;
    }
    for (const child of this.subcomponentsOf(node)) {
      const found = this.firstRun(child);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Reduce this node's `metadata` to `source`, then every subcomponent's.
   *
   * Keys the spec carries beyond the schema's — a writer's `concern` marker, say —
   * are dropped along with the run's facts: they describe the document or the run,
   * never the component.
   */
  private static reduce(node: Record<string, unknown>): void {
    const metadata = node.metadata as SpecMetadata | undefined;
    if (metadata?.source) node.metadata = { source: metadata.source };
    for (const child of this.subcomponentsOf(node)) this.reduce(child);
  }

  private static subcomponentsOf(node: Record<string, unknown>): Array<Record<string, unknown>> {
    const subcomponents = node.subcomponents as Record<string, unknown> | undefined;
    if (!subcomponents || typeof subcomponents !== 'object') return [];
    return Object.values(subcomponents).filter(
      (child): child is Record<string, unknown> => !!child && typeof child === 'object'
    );
  }
}

/**
 * Reads the run metadata document a generate run left beside its specs (ADR-089).
 *
 * A reduced spec states only `metadata.source`, so anything that has to recover the
 * conventions and settings the spec was produced under — render, above all — reads
 * them from here. Without this the reduced spec would fall back to the workspace's
 * current configuration, which is a different question: what the workspace is set to
 * now, not what produced the spec.
 */
export class RunMetadataReader {

  /**
   * Find the run metadata document governing `specPath`.
   *
   * Looks in the spec's own directory and then one level up, because a spec written
   * under `--split-components` sits in a component folder while the run document sits
   * at the root of the output directory beside it. Both formats are tried: a run
   * writes the document in the format it wrote its specs in.
   */
  static find(specPath: string): SchemaRunMetadata | undefined {
    const start = fs.existsSync(specPath) && fs.statSync(specPath).isDirectory()
      ? specPath
      : path.dirname(specPath);

    // Up to the specs root, not a fixed two levels. Under the ADR-096 layout a spec
    // sits at `specs/components/<key>/` and the run document at `specs/` — three
    // levels apart for a subcomponent — so a fixed climb stopped one short and the
    // run facts were silently lost. Bounded by the filesystem root.
    for (const dir of this.ancestorsOf(start)) {
      for (const format of ['yaml', 'json'] as const) {
        const candidate = path.join(dir, `${RUN_METADATA_BASENAME}.${format}`);
        if (!fs.existsSync(candidate)) continue;
        const parsed = this.parse(candidate, format);
        if (parsed) return parsed;
      }
    }
    return undefined;
  }

  /**
   * `dir` and up to `SEARCH_DEPTH` ancestors, nearest first. The nearest run document
   * wins, so a workspace keeping one beside its specs beats one further up.
   *
   * Bounded rather than walked to the filesystem root: an unbounded climb out of the
   * workspace could adopt an unrelated document from a parent directory, which is a
   * worse failure than finding none. The depth covers every real layout — a spec at
   * `specs/components/<key>/`, a subcomponent one deeper, and a legacy flat
   * `specs/<key>/` — with one level of headroom.
   */
  private static ancestorsOf(dir: string): string[] {
    const chain: string[] = [];
    let current = dir;
    for (let level = 0; level <= SEARCH_DEPTH; level++) {
      chain.push(current);
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return chain;
  }

  /** A malformed run document is skipped, not fatal — the caller still has the workspace config. */
  private static parse(filePath: string, format: 'yaml' | 'json'): SchemaRunMetadata | undefined {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = format === 'json' ? JSON.parse(raw) : yaml.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed as SchemaRunMetadata : undefined;
    } catch {
      return undefined;
    }
  }
}
