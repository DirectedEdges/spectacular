/**
 * Report renderer — the format canon iterated in the premerge report, applied to
 * one change dataset with two renderings (pre-merge and pre-release reports) plus
 * the itemized changelog.
 *
 * Everything is generated. Generated prose is factual — it says what changed,
 * never what anyone should do about it — and regeneration is lossless, so nothing
 * in a report can drift from the data. There is deliberately no written summary:
 * it would restate the impact table in prose.
 */

import { concernCategory } from '../rules/grade.js';
import { genuinelyMoved } from '../diff/compare.js';
import type { DiffEntry, Impact } from '../types.js';

const code = (v: unknown) => `\`${v}\``;

/** How many nested lines one finding may carry before the rest are counted instead. */
const MAX_NESTED = 8;

export interface ComponentChange {
  name: string;
  title: string;
  previousTitle?: string;
  presence: 'changed' | 'added' | 'removed' | 'renamed' | 'unchanged';
  entries: DiffEntry[];
  warnings: string[];
  /** Version movement, when known (pre-release path). */
  from?: string | null;
  to?: string | null;
}

/**
 * A composition that moved. Structurally a `ComponentChange` minus the version
 * movement: a composition declares no contract, so nothing depends on it and
 * there is no version for it to move between (ADR-096). It is reported by name
 * and by what changed inside it.
 */
export interface CompositionChange {
  name: string;
  title: string;
  presence: 'added' | 'removed' | 'changed';
  entries: DiffEntry[];
}

export interface RenameRecord {
  from: string;
  to: string;
  scope?: string;
  provenance: 'recorded' | 'inferred';
  confidence?: number;
  reason?: string;
}

export interface ChangeDataset {
  /** What is being updated — printed on the left of the arrow. */
  target: { label: string; detail?: string };
  /** What arrives — printed on the right. */
  source: { label: string; detail?: string };
  date: string;
  title: string;
  /** Who ran it, from the workspace's settings. Omitted when unset. */
  author?: string;
  components: ComponentChange[];
  /** Compositions that moved. Reported separately: they are not components. */
  compositions: CompositionChange[];
  assetEntries: DiffEntry[];
  runEntries: DiffEntry[];
  renames: RenameRecord[];
  /** Rows for the closing "How this was produced" table. */
  provenance: Array<[string, string]>;
}

// ---------------------------------------------------------------- values

function safeParse(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * A value as a reader needs it: a token by its name, a raw value as itself, a
 * binding by its target, and a composite (padding, spacing) unpacked into its
 * parts — printing the JSON hides exactly the thing worth seeing.
 */
export function valueText(value: unknown): string {
  const v = typeof value === 'string' && /^[[{]/.test(value) ? safeParse(value) ?? value : value;
  if (v === null || v === undefined) return String(v);
  if (typeof v !== 'object') return String(v);
  const obj = v as Record<string, unknown>;
  if ('$token' in obj) return String(obj.$token);
  if ('$binding' in obj) return `bound to ${obj.$binding}`;
  if (Array.isArray(v)) return v.map(valueText).join(', ');
  const parts = Object.entries(obj)
    .filter(([k]) => k !== '$type')
    .map(([k, sub]) => `${k} ${valueText(sub)}`);
  return parts.length ? parts.join(', ') : JSON.stringify(v);
}

/** `{"size":"S","selected":true}` → `size: S, selected: true` */
export function configText(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return String(value);
  return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(', ');
}

/**
 * A finding with several values under it, as a lead-in and indented sub-bullets,
 * capped — one per line is scannable; run together they read as a wall.
 */
function nest(lead: string, items: string[]): string {
  const shown = items.slice(0, MAX_NESTED);
  const lines = shown.map(i => `  - ${i}`);
  if (items.length > shown.length) lines.push(`  - …and ${items.length - shown.length} more`);
  return `${lead}\n${lines.join('\n')}`;
}

/** Prop definition summarized for a sentence: `boolean, default false`. */
function propSummary(def: unknown): string {
  if (!def || typeof def !== 'object') return String(def);
  const d = def as Record<string, unknown>;
  const parts: string[] = [];
  if (d.type !== undefined) parts.push(String(d.type));
  if (Array.isArray(d.enum)) parts.push(`one of ${d.enum.map(v => String(v)).join(' | ')}`);
  if (d.default !== undefined) parts.push(`default ${valueText(d.default)}`);
  if (d.nullable === true) parts.push('nullable');
  return parts.join(', ') || JSON.stringify(def);
}

// ---------------------------------------------------------------- sentences

const VARIANT_PATH = /^((?:subcomponents\.[^.[]+\.)*)variants\[([^\]]*)\]$/;
const STYLE_ANCHOR = /^((?:subcomponents\.[^.[]+\.)*(?:variants\[[^\]]*\]|default)(?:\.elements\.[^.[]+)?)\.?(.*)$/;
/** One variant's whole body: `default`, or `variants[<configuration>]`. */
const VARIANT_SCOPE = /^((?:subcomponents\.[^.[]+\.)*(?:variants\[[^\]]*\]|default))\.(.+)$/;

function subcomponentOf(path: string): string | null {
  return path.match(/^subcomponents\.([^.[]+)\./)?.[1] ?? null;
}

function withinText(path: string): string {
  const sub = subcomponentOf(path);
  return sub ? ` on its ${sub} subcomponent` : '';
}

/** The styles a variant sets, as flat `element.property = value` pairs. */
function variantStyles(variant: unknown): string[] {
  if (!variant || typeof variant !== 'object') return [];
  const pairs: string[] = [];
  const elements = (variant as Record<string, any>).elements ?? {};
  for (const [element, body] of Object.entries(elements as Record<string, any>)) {
    for (const [property, value] of Object.entries((body as any)?.styles ?? {})) {
      pairs.push(`${code(`${element}.styles.${property}`)}: ${code(valueText(value))}`);
    }
  }
  return pairs;
}

/**
 * One factual sentence (possibly with sub-bullets) for one change. The subject
 * is only ever read for its title, so a composition is as valid a subject as a
 * component — the diff reads the same either way.
 */
export function bulletFor(component: { title: string }, entry: DiffEntry): string {
  const title = `**${component.title}**`;
  const where = withinText(entry.path);
  const shortPath = entry.path.replace(/^subcomponents\.[^.[]+\./, '');
  const defects = (entry.defects ?? []).map(d => `defect: ${d}`);

  const withDefects = (sentence: string): string =>
    defects.length === 0 ? sentence : nest(sentence.replace(/\.$/, ':'), defects);

  // Whole-component presence entries.
  if (entry.concernFile === 'component') {
    if (entry.operation === 'removed') {
      if (entry.flags?.includes('unpublished')) {
        return `${title} — no longer published as a spec. The component is still in Figma; its ${code(entry.newValue ?? 'dev status not set')} means it is not marked ready, and components that are not marked ready are not written out.`;
      }
      return `${title} — no longer in the library.`;
    }
    if (entry.operation === 'added') {
      if (entry.flags?.includes('published')) {
        return `${title} — published as a spec for the first time, following a dev status change.`;
      }
      return `${title} — new component.`;
    }
    if (entry.operation === 'renamed') return `${title} — renamed from ${code(entry.oldValue)}.`;
  }

  // Variants matched by configuration.
  const variantMatch = entry.path.match(VARIANT_PATH);
  if (variantMatch && entry.concernFile === 'variants.yaml') {
    const config = variantMatch[2].replace(/"/g, '');
    if (entry.operation === 'added') {
      const styles = variantStyles(entry.newValue);
      if (styles.length === 0) return `${title} — a new variant appeared, ${code(config)}${where}.`;
      return nest(`${title} — a new variant appeared, ${code(config)}${where}, setting:`, styles);
    }
    if (entry.operation === 'removed') return `${title} — removed the variant ${code(config)}${where}.`;
  }
  if (entry.operation === 'reordered' && /(^|\.)variants$/.test(entry.path) && entry.concernFile === 'variants.yaml') {
    const moved = genuinelyMoved(
      ((entry.oldValue ?? []) as string[]).filter(k => ((entry.newValue ?? []) as string[]).includes(k)),
      ((entry.newValue ?? []) as string[]).filter(k => ((entry.oldValue ?? []) as string[]).includes(k)),
    );
    const which = moved.map(m => code(m.replace(/"/g, ''))).join(', ');
    return `${title} — ${moved.length} ${moved.length === 1 ? 'variant' : 'variants'} moved position${where}${which ? `: ${which}` : ''}, unchanged otherwise.`;
  }

  switch (entry.operation) {
    case 'renamed':
      if (/(^|\.)title$/.test(entry.path)) {
        return `${title} — renamed from ${code(entry.oldValue)} (recorded in the rename ledger).`;
      }
      if (/\.enum$/.test(entry.path)) {
        return withDefects(`${title} — ${code(shortPath)}: value ${code(entry.oldValue)} → ${code(entry.newValue)} — renamed${where}; the mapping is recorded.`);
      }
      return withDefects(`${title} — ${code(shortPath)} → ${code(`${shortPath.replace(/[^.]+$/, '')}${entry.newValue}`)} — renamed${where}; the mapping is recorded.`);
    case 'added':
      if (/(^|\.)props\.[^.[]+$/.test(entry.path)) {
        const requiredness = entry.flags?.includes('required') ? 'required' : 'optional';
        return `${title} — added ${code(shortPath)}${where} — ${propSummary(entry.newValue)} (${requiredness}).`;
      }
      if (/(^|\.)invalidPropCombinations$/.test(entry.path)) {
        return `${title} — the combination ${code(configText(entry.newValue))} is declared unsupported${where}.`;
      }
      if (/\.enum$/.test(entry.path)) return `${title} — ${code(shortPath)}: added value ${code(entry.newValue)}${where}.`;
      return `${title} — added ${code(shortPath)}${where}${typeof entry.newValue === 'string' || typeof entry.newValue === 'number' || typeof entry.newValue === 'boolean' ? `: ${code(valueText(entry.newValue))}` : ''}.`;
    case 'removed':
      if (/(^|\.)props\.[^.[]+$/.test(entry.path)) {
        return withDefects(`${title} — removed ${code(shortPath)}${where} (was ${propSummary(entry.oldValue)}).`);
      }
      if (/(^|\.)invalidPropCombinations$/.test(entry.path)) {
        return `${title} — the combination ${code(configText(entry.oldValue))} is no longer declared unsupported${where}.`;
      }
      if (/\.enum$/.test(entry.path)) {
        return withDefects(`${title} — ${code(shortPath)}: removed value ${code(entry.oldValue)}${where}.`);
      }
      return withDefects(`${title} — removed ${code(shortPath)}${where}.`);
    case 'reordered':
      return `${title} — ${code(shortPath)} reordered${where}: ${code(valueText(entry.oldValue))} → ${code(valueText(entry.newValue))}.`;
    default:
      return withDefects(`${title} — ${code(shortPath)}${where}: ${code(valueText(entry.oldValue))} → ${code(valueText(entry.newValue))}.`);
  }
}

// ---------------------------------------------------------------- grouping

/**
 * A variant is the unit a reader thinks in, so it is the unit a bullet reports:
 * one bullet per variant, its changes beneath it, each naming what happened and
 * where inside that variant. Reported one leaf per bullet they read as a wall;
 * grouped by the element they touch they read as an index of elements, which is
 * not a question anyone asked.
 */
function groupedVariantBullets(component: ComponentChange, entries: DiffEntry[]): string[] {
  const groups = new Map<string, DiffEntry[]>();
  const singles: DiffEntry[] = [];
  // New variants, collected per component: what a reader needs is which
  // configurations arrived, not what each one styles — the styles are the
  // variant, and listing them buries the list.
  const arrived = new Map<string, string[]>();
  for (const entry of entries) {
    const added = entry.concernFile === 'variants.yaml' && entry.operation === 'added'
      ? entry.path.match(VARIANT_PATH)
      : null;
    if (added) {
      const where = withinText(entry.path);
      if (!arrived.has(where)) arrived.set(where, []);
      arrived.get(where)!.push(added[2].replace(/"/g, ''));
      continue;
    }
    const scope = entry.concernFile === 'variants.yaml' ? entry.path.match(VARIANT_SCOPE) : null;
    if (scope) {
      const anchor = scope[1];
      if (!groups.has(anchor)) groups.set(anchor, []);
      groups.get(anchor)!.push(entry);
    } else {
      singles.push(entry);
    }
  }

  const bullets: string[] = [];
  for (const [where, configs] of arrived) {
    bullets.push(nest(
      `**${component.title}**${where} — ${configs.length === 1 ? 'added variant' : 'added variants'}:`,
      configs.map(c => code(c)),
    ));
  }
  for (const [anchor, group] of groups) {
    const config = anchor.match(/variants\[([^\]]*)\]$/)?.[1];
    const scopeText = config === undefined ? 'default' : `variant ${code(config.replace(/"/g, ''))}`;
    const items = group.map(e => {
      const leaf = e.path.slice(anchor.length).replace(/^\./, '');
      if (e.operation === 'added') {
        const value = valueText(e.newValue);
        return value && value.length <= 60 ? `added ${code(leaf)}: ${code(value)}` : `added ${code(leaf)}`;
      }
      if (e.operation === 'removed') {
        const value = valueText(e.oldValue);
        return value && value.length <= 60 ? `removed ${code(leaf)}: was ${code(value)}` : `removed ${code(leaf)}`;
      }
      if (e.operation === 'reordered') return `reordered ${code(leaf)}`;
      return `updated ${code(leaf)}: ${code(valueText(e.oldValue))} → ${code(valueText(e.newValue))}`;
    });
    bullets.push(nest(`**${component.title}**${withinText(anchor)} — ${scopeText}:`, items));
  }
  for (const entry of singles) bullets.push(bulletFor(component, entry));
  return bullets;
}

/**
 * A graded section is a list of components, each with its findings — so the
 * component is a heading and its findings are the list beneath it, rather than
 * a name repeated at the head of every bullet.
 */
function sectionBody(groups: Array<{ subject: string; bullets: string[] }>): string[] {
  const lines: string[] = [];
  const populated = groups.filter(g => g.bullets.length > 0);
  if (populated.length === 0) return ['None.', ''];
  for (const { subject, bullets } of populated) {
    lines.push(`### ${subject}`);
    lines.push('');
    for (const b of bullets) lines.push(`- ${unprefix(b, subject)}`);
    lines.push('');
  }
  return lines;
}

/** Drop the `**Subject** — ` a bullet leads with; the heading above it says that now. */
function unprefix(bullet: string, subject: string): string {
  const stripped = bullet.startsWith(`**${subject}**`) ? bullet.slice(`**${subject}**`.length) : bullet;
  return stripped.replace(/^ — /, '').replace(/^ /, '');
}

// ---------------------------------------------------------------- compositions

/**
 * What moved in one composition.
 *
 * A composition appearing or disappearing is stated in those words. `bulletFor`
 * would say "new component" for it, which is the one thing a composition is
 * not. A composition that merely changed is itemized by the same bullets a
 * component's changes get — the diff is read the same way; only the grading
 * differs.
 */
function compositionBullets(composition: CompositionChange): string[] {
  if (composition.presence === 'added') return ['added to the library.'];
  if (composition.presence === 'removed') return ['no longer in the library.'];
  return composition.entries.map(e => bulletFor(composition, e));
}

/** `1 composition added, 2 changed.` — appended to the impact sentence. */
function compositionTally(compositions: CompositionChange[]): string {
  if (compositions.length === 0) return '';
  const order: Array<CompositionChange['presence']> = ['added', 'changed', 'removed'];
  const parts = order
    .map(presence => ({ presence, n: compositions.filter(c => c.presence === presence).length }))
    .filter(({ n }) => n > 0)
    .map(({ presence, n }, index) => index === 0
      ? `${n} ${n === 1 ? 'composition' : 'compositions'} ${presence}`
      : `${n} ${presence}`);
  return ` ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------- the report

type Grade = 'breaking' | 'minor' | 'patch' | 'examples' | 'reordered' | 'ignored' | 'review';

export function gradeOf(entry: DiffEntry): Grade {
  if (entry.impact === 'unclassified') return 'review';
  const category = concernCategory(entry.concernFile);
  if (entry.impact === 'ignore') {
    return entry.operation === 'reordered' && category === 'variants' ? 'reordered' : 'ignored';
  }
  if (entry.impact === 'major') return 'breaking';
  if (entry.impact === 'minor') return 'minor';
  return category === 'examples' ? 'examples' : 'patch';
}

interface Counts { breaking: number; minor: number; patch: number; examples: number; reordered: number; review: number }

function countsOf(entries: DiffEntry[]): Counts {
  const counts: Counts = { breaking: 0, minor: 0, patch: 0, examples: 0, reordered: 0, review: 0 };
  for (const e of entries) {
    const g = gradeOf(e);
    if (g !== 'ignored') counts[g]++;
  }
  return counts;
}

const cell = (n: number) => (n ? String(n) : '·');

/** Render the report per the format canon. */
export function renderReport(dataset: ChangeDataset): string {
  const lines: string[] = [];
  const all = [
    ...dataset.components.flatMap(c => c.entries),
    ...dataset.assetEntries,
    ...dataset.runEntries,
  ];
  const totals = countsOf(all);

  lines.push(`# ${dataset.title}`);
  lines.push('');
  const detail = (side: { label: string; detail?: string }) =>
    `${code(side.label)}${side.detail ? ` (${code(side.detail)})` : ''}`;
  lines.push(`${dataset.date} ${detail(dataset.target)} ← ${detail(dataset.source)}`
    + (dataset.author ? ` · ${dataset.author}` : ''));
  lines.push('');

  // Impact table first: totals row, one row per component, counts only.
  lines.push('## Impact');
  lines.push('');
  lines.push('| Component | Breaking | Minor | Patch | Examples |');
  lines.push('|---|---:|---:|---:|---:|');
  const withCounts = dataset.components
    .map(c => ({ c, counts: countsOf(c.entries) }))
    .filter(({ c, counts }) => c.entries.length > 0 && (counts.breaking || counts.minor || counts.patch || counts.examples || counts.reordered || counts.review));
  // With one component changed the totals row restates the row beneath it.
  if (withCounts.length > 1 || dataset.assetEntries.length > 0) {
    lines.push(`| **All components** | **${totals.breaking}** | **${totals.minor}** | **${totals.patch}** | **${totals.examples}** |`);
  }
  withCounts.sort((a, b) =>
    b.counts.breaking - a.counts.breaking
    || b.counts.minor - a.counts.minor
    || b.counts.patch - a.counts.patch
    || b.counts.examples - a.counts.examples
    || a.c.title.localeCompare(b.c.title));
  for (const { c, counts } of withCounts) {
    lines.push(`| ${c.title} | ${cell(counts.breaking)} | ${cell(counts.minor)} | ${cell(counts.patch)} | ${cell(counts.examples)} |`);
  }
  if (dataset.assetEntries.length > 0) {
    const a = countsOf(dataset.assetEntries);
    lines.push(`| *assets/* | ${cell(a.breaking)} | ${cell(a.minor)} | ${cell(a.patch)} | ${cell(a.examples)} |`);
  }
  lines.push('');
  lines.push(`${withCounts.length} of ${dataset.components.length} components changed.`
    + compositionTally(dataset.compositions)
    + (totals.reordered ? ` ${totals.reordered} variant ${totals.reordered === 1 ? 'set' : 'sets'} moved position.` : '')
    + (totals.review ? ` ${totals.review} changes need review.` : ''));
  lines.push('');

  // Graded sections: one factual sentence per change, values not just paths.
  const sections: Array<{ heading: string; grade: Grade }> = [
    { heading: 'Breaking', grade: 'breaking' },
    { heading: 'Minor', grade: 'minor' },
    { heading: 'Patch', grade: 'patch' },
    { heading: 'Examples', grade: 'examples' },
  ];
  for (const { heading, grade: g } of sections) {
    lines.push(`## ${heading}`);
    lines.push('');
    const groups: Array<{ subject: string; bullets: string[] }> = [];
    for (const component of dataset.components) {
      if (g === 'examples') {
        const n = component.entries.filter(e => gradeOf(e) === 'examples').length;
        if (n > 0) {
          groups.push({ subject: component.title, bullets: [`${n} documented ${n === 1 ? 'example' : 'examples'} changed.`] });
        }
        continue;
      }
      const graded = component.entries.filter(e => gradeOf(e) === g);
      if (graded.length === 0) continue;
      groups.push({
        subject: component.title,
        bullets: g === 'patch' ? groupedVariantBullets(component, graded) : graded.map(e => bulletFor(component, e)),
      });
    }
    const assets = dataset.assetEntries.filter(e => gradeOf(e) === g).map(entry =>
      entry.operation === 'added' ? `added ${code(entry.path)}.`
        : entry.operation === 'removed' ? `removed ${code(entry.path)}${entry.flags?.includes('referenced') ? ' — still referenced by a spec; this is a broken reference' : ''}.`
        : `${code(entry.path)} content changed (same name).`);
    if (assets.length > 0) groups.push({ subject: 'assets/', bullets: assets });
    const run = dataset.runEntries.filter(e => gradeOf(e) === g).map(entry =>
      `${code(entry.path)}: ${code(entry.oldValue)} → ${code(entry.newValue)}.${entry.flags?.includes('schemaMajor') ? ' The spec now speaks a different schema dialect.' : ''}`);
    if (run.length > 0) groups.push({ subject: 'run', bullets: run });
    lines.push(...sectionBody(groups));
  }

  // Compositions, when any moved. Their own section rather than rows in the
  // impact table: that table grades a contract by severity, and a composition
  // has no contract to grade — every change to one is patch-class for the
  // library, so counting them by severity would say nothing.
  if (dataset.compositions.length > 0) {
    lines.push('## Compositions');
    lines.push('');
    lines.push('A composition carries no version of its own. Any change to one is patch-class for the library.');
    lines.push('');
    lines.push(...sectionBody(dataset.compositions.map(c => ({
      subject: c.title,
      bullets: compositionBullets(c),
    }))));
  }

  // Conditional sections: only when they have something in them.
  const conditional = (grade: Grade) => dataset.components
    .map(component => ({
      subject: component.title,
      bullets: component.entries.filter(e => gradeOf(e) === grade).map(e => bulletFor(component, e)),
    }))
    .filter(g => g.bullets.length > 0);

  const reordered = conditional('reordered');
  if (reordered.length > 0) {
    lines.push('## Reordered');
    lines.push('');
    lines.push(...sectionBody(reordered));
  }
  const review = conditional('review');
  if (review.length > 0) {
    lines.push('## Needs review');
    lines.push('');
    lines.push('No rule in the severity rules covers these paths yet, so they are ungraded and need a human read.');
    lines.push('');
    lines.push(...sectionBody(review));
  }

  // Warnings that are not entries (likely renames, orphans, untracked titles).
  const warnings = dataset.components
    .map(c => ({ subject: c.title, bullets: c.warnings }))
    .filter(g => g.bullets.length > 0);
  if (warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    lines.push(...sectionBody(warnings));
  }

  // Renames with provenance: recorded (renames.yaml) or inferred, with confidence.
  const renameNote = dataset.renames.length
    ? dataset.renames.map(r =>
        `${r.from} → ${r.to} (${r.provenance}${r.confidence !== undefined ? `, confidence ${r.confidence}` : ''})`).join('; ')
    : 'none';

  lines.push('## How this was produced');
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  for (const [k, v] of dataset.provenance) lines.push(`| ${k} | ${v} |`);
  lines.push(`| Renames | ${renameNote} |`);
  lines.push('| Excluded | `metadata:` blocks — they record when and by what each spec was generated |');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------- changelog

export interface ChangelogRelease {
  libraryVersion: string;
  components: ComponentChange[];
  compositions: CompositionChange[];
  assetEntries: DiffEntry[];
  runEntries: DiffEntry[];
}

/**
 * The itemized layer: per release, per component, Breaking / Added / Changed,
 * with `from → to` migration lines for tracked renames. Same data as the report;
 * they cannot disagree.
 */
export function renderChangelog(releases: ChangelogRelease[]): string {
  const lines: string[] = [];
  lines.push('# Changelog');
  lines.push('');
  for (const release of releases) {
    lines.push(`## ${release.libraryVersion}`);
    lines.push('');
    for (const component of release.components) {
      if (component.entries.length === 0) continue;
      const counts = countsOf(component.entries);
      const movement = component.from && component.to && component.from !== component.to
        ? ` (${component.from} → ${component.to})`
        : component.to ? ` (${component.to})` : '';
      lines.push(`### ${component.title}${movement}${counts.breaking ? ' — BREAKING' : ''}`);
      lines.push('');

      const breaking = component.entries.filter(e => gradeOf(e) === 'breaking');
      const added = component.entries.filter(e => gradeOf(e) === 'minor');
      const changed = component.entries.filter(e => ['patch', 'examples'].includes(gradeOf(e)));

      const emit = (heading: string, entries: DiffEntry[]) => {
        if (entries.length === 0) return;
        lines.push(`#### ${heading}`);
        lines.push('');
        const bullets = heading === 'Changed'
          ? groupedVariantBullets(component, entries)
          : entries.map(e => bulletFor(component, e));
        for (const b of bullets) lines.push(`- ${b.replace(`**${component.title}** — `, '')}`);
        lines.push('');
      };
      emit('Breaking', breaking);
      emit('Added', added);
      emit('Changed', changed);

      const migrations = component.entries.filter(e => e.operation === 'renamed');
      if (migrations.length > 0) {
        lines.push('#### Migration');
        lines.push('');
        for (const m of migrations) {
          if (/(^|\.)title$/.test(m.path)) { lines.push(`- ${code(m.oldValue)} → ${code(m.newValue)}`); continue; }
          if (/\.enum$/.test(m.path)) { lines.push(`- ${code(`${m.path}: ${m.oldValue}`)} → ${code(`${m.path.replace(/[^.]+$/, 'enum')}: ${m.newValue}`)}`); continue; }
          lines.push(`- ${code(m.path)} → ${code(m.path.replace(/[^.]+$/, String(m.newValue)))}`);
        }
        lines.push('');
      }
    }
    // No `from → to` on the heading and no severity sub-headings: a composition
    // is not versioned and every change to one is patch-class, so the itemized
    // lines are the whole of what there is to say about it.
    for (const composition of release.compositions) {
      lines.push(`### ${composition.title}`);
      lines.push('');
      for (const b of compositionBullets(composition)) {
        lines.push(`- ${unprefix(b, composition.title)}`);
      }
      lines.push('');
    }
    for (const entry of release.assetEntries) {
      lines.push(`- assets: ${entry.operation} ${code(entry.path)}`);
    }
    if (release.assetEntries.length > 0) lines.push('');
    for (const entry of release.runEntries) {
      lines.push(`- run: ${code(entry.path)} ${code(entry.oldValue)} → ${code(entry.newValue)}`);
    }
    if (release.runEntries.length > 0) lines.push('');
  }
  return lines.join('\n');
}
