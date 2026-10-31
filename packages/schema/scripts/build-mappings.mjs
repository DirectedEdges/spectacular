/**
 * Generates mappings/<PLATFORM>.md from mappings/bindings/<platform>.json plus the
 * JSON Schema itself.
 *
 * No dependency on any sibling checkout: the binding files are checked in and are
 * the source of truth, so this runs in the open repo alone. That is deliberate —
 * the mapping specification is published from `spectacular`, while the transforms
 * that implement it may live elsewhere.
 *
 * Completeness is enforced, not reported. Every property of `Styles` must appear in
 * every binding file; a key in the schema and absent from a binding file fails the
 * build. This mirrors the AssertNoMissingKeys guard in figma-from-specs/src/Styles/keys.ts,
 * which exists because a new StyleKey once landed in the schema, the reader began
 * emitting it, and the renderer silently dropped it (specs#689). A mapping document
 * without this guard is how code/style-mapping.md came to describe three mechanisms
 * the transformer had stopped using (specs#691).
 *
 * Usage:  node scripts/build-mappings.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const bindingsDir = join(pkg, 'mappings/bindings');

const schema = JSON.parse(readFileSync(join(pkg, 'schema/styles.schema.json'), 'utf8'));
const styleProps = Object.keys(schema.definitions.Styles.properties);
const styleDescription = (key) =>
  schema.definitions.Styles.properties[key]?.description ?? '';

const TITLES = { figma: 'Figma', css: 'CSS', react: 'React', webcomponents: 'Web Components' };
const DISPOSITION_ORDER = ['bound', 'approximated', 'unsupported', 'unverified'];

const badge = (d) =>
  ({ bound: 'bound', approximated: 'approximated', unsupported: 'unsupported', unverified: '**unverified**' }[d] ?? d);

const failures = [];

/**
 * The capture engine is commercial and stays private. A mapping specification
 * may state the rule it implements — that is the contract — but must never name
 * its package or modules, because these pages are published.
 *
 * The `*-from-specs` packages are deliberately exempt: they are candidates for
 * open-sourcing, and citing them costs nothing.
 */
const FORBIDDEN_IN_PUBLISHED = [
  /specs-from-figma/,
  /StylesProcessor/,
  /TypographyProcessor/,
];

/**
 * An emitted output is either a literal — a CSS declaration, a node property —
 * which wants code formatting, or a phrase describing what the document records,
 * which already carries its own backticks. Wrapping the second kind again
 * produces broken markdown.
 */
const emitCell = (e) => (e.includes('`') ? e : `\`${e}\``);

const checkNoLeaks = (label, page) => {
  for (const re of FORBIDDEN_IN_PUBLISHED) {
    const hit = page.match(re);
    if (hit) failures.push(`${label}: published page names the private capture engine — "${hit[0]}". State the rule, not the module.`);
  }
};

/**
 * Render a predicate as compact, scannable text. The stored form reuses the
 * schema's ConditionExpression vocabulary — `operation` plus `args` — and
 * `operation` is a deliberately open string (DSPEC-28), so `all`, `any` and
 * `not` join the built-in `equals`, `notEquals`, `isNull` and `isNotNull`.
 *
 * The operand space differs from a spec Conditional's: there, `args.value` is a
 * PropBinding into `#/props/*`; here it is a style fact on `self`, `parent`, a
 * named `derived` predicate, or the emitting `context`.
 */
const fmt = (p) => {
  if (p == null) return '';
  const lit = (v) => (typeof v === 'string' ? `\`${v}\`` : `\`${JSON.stringify(v)}\``);
  switch (p.operation) {
    case 'all': return p.args.map(fmt).join(' **and** ');
    case 'any': return `(${p.args.map(fmt).join(' **or** ')})`;
    case 'not': return `**not** ${fmt(p.args[0])}`;
    case 'equals': return `\`${p.args.value}\` = ${lit(p.args.compareTo)}`;
    case 'notEquals': return `\`${p.args.value}\` ≠ ${lit(p.args.compareTo)}`;
    case 'isNull': return `\`${p.args.value}\` absent`;
    case 'isNotNull': return `\`${p.args.value}\` present`;
    default: return `\`${p.operation}\`(${JSON.stringify(p.args)})`;
  }
};

/**
 * A binding that inherits its style surface from another. It states only
 * overrides plus the platform-shaped concerns the base binding cannot carry —
 * how props become parameters, slots become children, variants become
 * selection, and how styles attach.
 */
const renderDependent = ({ platform, title, b, styles, dependsOn, file }) => {
  const base = dependsOn.map((d) => `[${TITLES[d] ?? d}](${d.toUpperCase()}.md)`).join(", ");
  const overrides = Object.entries(styles);

  for (const [k, v] of overrides) {
    if (!v.why) failures.push(`${file}: override \`${k}\` does not say why it differs from ${dependsOn.join(', ')} — an override without a reason is a restatement`);
  }

  const surfaces = b.surfaces ?? {};
  const surfaceRows = Object.entries(surfaces)
    .filter(([k]) => k !== 'note')
    .map(([k, v]) => `| \`${k}\` | ${v === 'unverified' ? '**unverified**' : v} |`)
    .join('\n');

  return `# ${title} binding

**Platform binding for the Specs document format — draft.**

Normative frame: [\`SPECIFICATION.md\`](../SPECIFICATION.md) §11.

## Inherits from ${base}

${b.realises ?? ''}

**Every style key is bound exactly as the ${base} binding states**, unless overridden below. This binding never restates an inherited mapping: a second copy of a rule is a second thing to keep true.

## Style overrides

${overrides.length
  ? `| Style key | Disposition | Realised by | Why it differs |\n|---|---|---|---|\n${overrides
      .map(([k, v]) => `| \`${k}\` | ${badge(v.disposition)} | ${v.target ?? v.module?.join(', ') ?? '—'} | ${v.why ?? ''} |`)
      .join('\n')}`
  : '**None.** Every style key is inherited unchanged.'}

## Platform surfaces

${surfaces.note ?? ''}

${surfaceRows ? `| Surface | Disposition |\n|---|---|\n${surfaceRows}` : '*None declared.*'}

## Absent keys

Inherited. See [Style defaults](DEFAULTS.md).
`;
};

const renderPlatform = (file) => {
  const platform = file.replace(/\.json$/, '');
  const b = JSON.parse(readFileSync(join(bindingsDir, file), 'utf8'));
  const styles = b.concepts?.styles ?? {};
  const title = TITLES[platform] ?? platform;
  const dependsOn = b.dependsOn ?? [];

  const extra = Object.keys(styles).filter((k) => !styleProps.includes(k));
  if (extra.length) failures.push(`${file}: style keys not in the schema — ${extra.join(', ')}`);

  // A dependent binding declares only what it changes, so completeness is the
  // base binding's obligation, not its. What it must not do is silently restate
  // a key identically — that recreates the second source the dependency removed.
  if (dependsOn.length) {
    return renderDependent({ platform, title, b, styles, dependsOn, file });
  }

  const missing = styleProps.filter((k) => !(k in styles));
  if (missing.length) failures.push(`${file}: missing style keys — ${missing.join(', ')}`);

  const counts = {};
  for (const v of Object.values(styles)) counts[v.disposition] = (counts[v.disposition] ?? 0) + 1;
  const tally = DISPOSITION_ORDER
    .filter((d) => counts[d])
    .map((d) => `${counts[d]} ${d}`)
    .join(', ');

  const isFigma = platform === 'figma';
  const col = isFigma ? 'Figma target' : 'CSS module';
  const cell = (v) =>
    isFigma
      ? v.target ? `\`${v.target}\`` : '—'
      : v.module?.length ? v.module.map((m) => `\`${m}\``).join(', ') : '—';

  const clusters = b.concepts?.styleClusters ?? {};

  // Cross-reference both ways. A key cannot quietly leave the table by being
  // "handled elsewhere", and a cluster cannot claim a key the table disowns.
  for (const [name, c] of Object.entries(clusters)) {
    for (const k of c.keys ?? []) {
      if (!(k in styles)) failures.push(`${file}: cluster "${name}" names \`${k}\`, absent from concepts.styles`);
      else if (styles[k].cluster !== name) failures.push(`${file}: \`${k}\` is in cluster "${name}" but declares cluster "${styles[k].cluster ?? 'none'}"`);
    }
    if (c.form === 'cases') {
      if (!c.inputs?.length) failures.push(`${file}: cluster "${name}" declares cases but no inputs — the operand set must be finite and visible`);
      for (const [i, cs] of (c.cases ?? []).entries()) {
        if (!cs.when) failures.push(`${file}: cluster "${name}" case ${i} has no predicate`);
        if (!Array.isArray(cs.emit)) failures.push(`${file}: cluster "${name}" case ${i} has no emit list — an empty array is a claim, a missing one is an omission`);
      }
    } else {
      if (!c.resolution) failures.push(`${file}: cluster "${name}" has no resolution rule — the rule IS the mapping`);
      if (!c.partial) failures.push(`${file}: cluster "${name}" does not say what a partially present cluster does`);
    }
  }
  for (const [k, v] of Object.entries(styles)) {
    if (v.cluster && !(v.cluster in clusters)) failures.push(`${file}: \`${k}\` names cluster "${v.cluster}", which is not declared`);
  }

  const rows = styleProps.map((k) => {
    const v = styles[k] ?? { disposition: 'unverified' };
    const scope = isFigma
      ? (v.elements?.length === 12 ? 'all' : (v.elements?.length ? v.elements.join(', ') : '—'))
      : '';
    const realises = v.cluster ? `cluster [${v.cluster}](#${v.cluster.toLowerCase()})` : cell(v);
    return `| \`${k}\` | ${badge(v.disposition)} | ${realises} | ${isFigma ? scope + ' | ' : ''}${v.notes ?? ''} |`;
  });

  const header = isFigma
    ? `| Style key | Disposition | ${col} | Element types | Notes |\n|---|---|---|---|---|`
    : `| Style key | Disposition | ${col} | Notes |\n|---|---|---|---|`;

  const clusterSections = Object.entries(clusters).map(([name, c]) => {
    const head = `### ${name}

${badge(c.disposition)} — keys: ${c.keys.map((k) => `\`${k}\``).join(', ')}
`;

    if (c.form !== 'cases') {
      return `${head}
**Outputs.** ${c.outputs.map((o) => `\`${o}\``).join(', ')}

**Resolution.** ${c.resolution}

**Partially present.** ${c.partial}
${c.stage ? `\n**Stage.** \`${c.stage}\` — produced by a later pass, not read directly.\n` : ''}${c.notes ? `\n*${c.notes}*\n` : ''}
> Stated as prose. Not yet converted to a case table, so it cannot be mechanically checked.
`;
    }

    const inputs = `| Operand | From |\n|---|---|\n${c.inputs.map((i) => `| \`${i.ref}\` | ${i.from} |`).join('\n')}`;

    const derived = Object.keys(c.derived ?? {}).length
      ? `\n**Derived predicates.**\n\n| Name | Expression | Source |\n|---|---|---|\n${Object.entries(c.derived).map(([n, d]) => `| \`derived.${n}\` | ${fmt(d.expression)} | ${d.source ?? ''} |`).join('\n')}\n`
      : '';

    const caseTable = (label, list) =>
      `\n**${label}** — ordered, first match wins.\n\n| # | When | Emits | Why |\n|---|---|---|---|\n${list
        .map((cs, i) => `| ${i + 1} | ${fmt(cs.when)} | ${cs.emit.length ? cs.emit.map(emitCell).join('<br>') : '*nothing*'} | ${cs.why ?? ''} |`)
        .join('\n')}\n`;

    return `${head}
**Operands.** Every fact the cluster reads. Nothing outside this set participates.

${inputs}
${derived}${caseTable('Cases', c.cases)}${c.insetCases ? caseTable('Offset cases', c.insetCases) : ''}${c.memberCases ? caseTable('Member cases', c.memberCases) : ''}${
      c.otherwise ? `\n**Otherwise.** ${c.otherwise.emit?.length ? c.otherwise.emit.map((e) => `\`${e}\``).join(', ') : '*nothing*'}${c.otherwise.why ? ` — ${c.otherwise.why}` : ''}\n` : ''
    }${c.stage ? `\n**Stage.** \`${c.stage}\` — produced by a later pass, not read directly.\n` : ''}${c.notes ? `\n*${c.notes}*\n` : ''}`;
  }).join('\n');

  return `# ${title} binding

**Platform binding for the Specs document format — draft.**

Normative frame: [\`SPECIFICATION.md\`](../SPECIFICATION.md) §11. This document states how
the ${title} binding realises the schema; it does not restate what the members mean —
that is the reference at \`/schema\`.

Generated from \`mappings/bindings/${platform}.json\` by \`scripts/build-mappings.mjs\`.
Edit the binding file, never this page.

## Disposition

Every style key carries one of four dispositions:

| Disposition | Meaning |
|---|---|
| \`bound\` | Realised, and confirmed against the implementation |
| \`approximated\` | Realised with loss, and the loss is stated |
| \`unsupported\` | Declared as not realised, with the resulting behaviour stated |
| \`unverified\` | Coverage detected, mapping not yet confirmed by a human — **work, not a claim** |

A reader may rely on \`bound\`, \`approximated\` and \`unsupported\` rows. An \`unverified\`
row asserts nothing.

Current state: ${tally}, of ${styleProps.length} style keys.

## Value forms

${b.valueForms?.summary ?? ''}

| Form | Disposition |
|---|---|
| Literal | ${b.valueForms?.literal ?? 'unverified'} |
| \`TokenReference\` | ${b.valueForms?.tokenReference ?? 'unverified'} |
| \`PropBinding\` | ${b.valueForms?.propBinding ?? 'unverified'} |
| \`Conditional\` | ${b.valueForms?.conditional ?? 'unverified'} |

## Styles

A key whose row says *cluster* does not map on its own — see the cluster below. Writing a
per-key mapping for it would be false, not merely incomplete.

${header}
${rows.join('\n')}

## Clusters

Keys that resolve jointly. No single key in a cluster determines any single output, so the
resolution rule is the mapping rather than a row in the table above.

${clusterSections}
## Absent keys

What a consumer assumes when a style key is **absent** is spec-level, not per-platform:
two platforms that answer differently disagree about what the same document says. It is
declared once, in [\`bindings/_defaults.json\`](bindings/_defaults.json), and summarised in
[\`DEFAULTS.md\`](DEFAULTS.md).

## Concepts not yet bound

Props, anatomy and elements, and layout have no declared binding yet. They are named
here so their absence is visible rather than implied:

| Concept | State |
|---|---|
| Props | not declared |
| Anatomy and elements | not declared |
| Layout | not declared |
`;
};

/** The spec-level default table — one page, not per platform. */
const renderDefaults = () => {
  const b = JSON.parse(readFileSync(join(bindingsDir, '_defaults.json'), 'utf8'));
  const d = b.defaults ?? {};
  const missing = styleProps.filter((k) => !(k in d));
  if (missing.length) failures.push(`_defaults.json: missing style keys — ${missing.join(', ')}`);

  const undeclared = styleProps.filter((k) => d[k]?.declaredBy === 'none');
  const rows = styleProps.map((k) => {
    const v = d[k] ?? {};
    const assumed = v.assumed === null ? '*apply nothing*' : `\`${JSON.stringify(v.assumed)}\``;
    return `| \`${k}\` | ${assumed} | ${v.declaredBy === 'none' ? '**none**' : v.declaredBy} |`;
  });

  return `# Style defaults

**What a consumer assumes when a style key is absent from a document — draft.**

Normative frame: [\`SPECIFICATION.md\`](../SPECIFICATION.md) §11. Generated from
\`mappings/bindings/_defaults.json\`; edit that file, never this page.

This is **not** a per-platform concern. "An absent key means X" is a statement about the
document, and two platforms that answer differently disagree about what the same document
says.

## The problem

${b.homeProblem ?? ''}

## Absence is ambiguous

${b.caveat ?? ''}

A key can be absent for at least three reasons, and a consumer reading one document cannot
tell them apart:

| Reason | Recoverable by a consumer? |
|---|---|
| The value equalled a default and was dropped at generation | No — needs the table below |
| A variant inherits it from \`default\` under layering | Partly — by reading \`default\`, if it knows the run used layered details |
| The element type cannot carry it | No — needs the per-element-type key table, which ships in no published artefact |

Nothing in a serialized document marks which applies. There is no sentinel, no metadata
member, no \`$extensions\` marker.

## Defaults

${undeclared.length ? `${undeclared.length} of ${styleProps.length} keys have no declared default.` : `All ${styleProps.length} keys have a declared default.`}

| Style key | Assumed when absent | Declared by |
|---|---|---|
${rows.join('\n')}
`;
};

const files = readdirSync(bindingsDir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
const pages = [];
for (const file of files) {
  const platform = file.replace(/\.json$/, '');
  pages.push([join(pkg, `mappings/${platform.toUpperCase()}.md`), renderPlatform(file), `${platform.toUpperCase()}.md`]);
}
pages.push([join(pkg, 'mappings/DEFAULTS.md'), renderDefaults(), 'DEFAULTS.md']);

for (const [, page, label] of pages) checkNoLeaks(label, page);

if (!failures.length) {
  for (const [out, page, label] of pages) {
    writeFileSync(out, page);
    console.log(`mappings: wrote mappings/${label}`);
  }
}

if (failures.length) {
  console.error('\nBinding completeness check FAILED:\n');
  for (const f of failures) console.error(`  ${f}`);
  console.error('\nA style key in the schema with no row in a binding file is a mapping');
  console.error('nobody has decided. Add it to the binding file — as `unsupported` with a');
  console.error('stated behaviour if the platform cannot realise it.\n');
  process.exit(1);
}
