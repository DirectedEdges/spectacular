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

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '..');
const repo = resolve(site, '..');
const pkg = join(repo, 'packages/schema');
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

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, '');

/**
 * What each declared case table is called on the page. A cluster may qualify
 * its main table with further ones — per axis, per member, per relation — and
 * each needs a heading that says which.
 */
const CASE_TABLE_LABELS = {
  cases: 'Cases',
  insetCases: 'Offset cases',
  memberCases: 'Member cases',
  relationCases: 'Related keys',
  axisCases: 'Per-axis cases',
};

/**
 * One cluster, as its own page.
 *
 * A cluster is the unit a reader arrives at: they have a key whose row says
 * *cluster*, and they want the rule. Inlining nine of these under one heading
 * meant the rule for `textTruncation` sat four case tables below the rule for
 * `autoLayout`, with no URL of its own to link or cite.
 */
const clusterPage = ({ name, c, platform, title }) => {
  const basisMark =
    c.basis === 'intent'
      ? ' · **asserted**, not mechanically checked'
      : c.basis === 'implementation'
        ? ' · verified against an implementation'
        : '';

  const head = `# ${name}

${badge(c.disposition)}${c.direction ? ` · ${c.direction}` : ''}${basisMark}

A cluster of the [${title} binding](../${platform}.md). These keys resolve jointly — no
one of them determines any single output, so the rule below *is* the mapping.

**Keys.** ${c.keys.map((k) => `\`${k}\``).join(', ')}
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
    ? `\n## Derived predicates\n\n| Name | Expression | Source |\n|---|---|---|\n${Object.entries(c.derived)
        .map(([n, d]) => `| \`derived.${n}\` | ${fmt(d.expression)} | ${d.source ?? ''} |`)
        .join('\n')}\n`
    : '';

  const caseTable = (label, list) =>
    `\n## ${label}\n\nOrdered — first match wins.\n\n| # | When | Emits | Why |\n|---|---|---|---|\n${list
      .map((cs, i) => `| ${i + 1} | ${fmt(cs.when)} | ${cs.emit.length ? cs.emit.map(emitCell).join('<br>') : '*nothing*'} | ${cs.why ?? ''} |`)
      .join('\n')}\n`;

  /**
   * Every case table the cluster declares, discovered rather than listed.
   *
   * A hardcoded allowlist of three names silently dropped this cluster's
   * `relationCases` — three declared cases that appeared on no page, which is
   * the exact failure these generated pages exist to prevent. An unrecognised
   * table now fails the build instead of vanishing.
   */
  const tables = Object.keys(c)
    .filter((k) => /Cases$/.test(k) || k === 'cases')
    .map((k) => {
      const label = CASE_TABLE_LABELS[k];
      if (!label) failures.push(`${platform}.json: cluster "${name}" declares "${k}", which has no label — add one to CASE_TABLE_LABELS or the table renders nowhere`);
      return { key: k, label: label ?? k, list: c[k] };
    })
    .filter((t) => Array.isArray(t.list) && t.list.length)
    // `cases` first; the rest in declared order, since they qualify it.
    .sort((a, b) => (a.key === 'cases' ? -1 : b.key === 'cases' ? 1 : 0));

  return `${head}
## Operands

Every fact the cluster reads. Nothing outside this set participates.

${inputs}
${derived}${tables.map((t) => caseTable(t.label, t.list)).join('')}${
    c.otherwise
      ? `\n## Otherwise\n\n${c.otherwise.emit?.length ? c.otherwise.emit.map((e) => `\`${e}\``).join(', ') : '*Nothing is emitted.*'}${
          c.otherwise.why ? ` — ${c.otherwise.why}` : ''
        }\n`
      : ''
  }${c.stage ? `\n**Stage.** \`${c.stage}\` — produced by a later pass, not read directly.\n` : ''}${
    c.notes ? `\n*${c.notes}*\n` : ''
  }`;
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
    return { page: renderDependent({ platform, title, b, styles, dependsOn, file }), clusters: [] };
  }

  const missing = styleProps.filter((k) => !(k in styles));
  if (missing.length) failures.push(`${file}: missing style keys — ${missing.join(', ')}`);

  // Every row must say what the platform does when the key is absent. The
  // schema declares the meaning of absence once (§4.1a); a binding that is
  // silent on whether it honours that is the gap DSPEC-46 exists to close.
  const ONABSENT = ['declaredDefault', 'platformInitial', 'warns', 'nothing', 'unverified'];
  const noOnAbsent = Object.entries(styles).filter(([, v]) => !('onAbsent' in v)).map(([k]) => k);
  if (noOnAbsent.length) failures.push(`${file}: no onAbsent declared — ${noOnAbsent.join(', ')}`);
  const badOnAbsent = Object.entries(styles)
    .filter(([, v]) => 'onAbsent' in v && !ONABSENT.includes(v.onAbsent))
    .map(([k, v]) => `${k}=${v.onAbsent}`);
  if (badOnAbsent.length) failures.push(`${file}: onAbsent outside the vocabulary — ${badOnAbsent.join(', ')}`);

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

  // Alphabetical, not schema order: this table is looked up by key name.
  const rows = [...styleProps].sort().map((k) => {
    const v = styles[k] ?? { disposition: 'unverified' };
    const scope = isFigma
      ? (v.elements?.length === 12 ? 'all' : (v.elements?.length ? v.elements.join(', ') : '—'))
      : '';
    const realises = v.cluster ? `cluster [${v.cluster}](clusters/${platform}/${kebab(v.cluster)}.md)` : cell(v);
    return `| \`${k}\` | ${badge(v.disposition)} | ${realises} | ${isFigma ? scope + ' | ' : ''}${v.notes ?? ''} |`;
  });

  const header = isFigma
    ? `| Style key | Disposition | ${col} | Element types | Notes |\n|---|---|---|---|---|`
    : `| Style key | Disposition | ${col} | Notes |\n|---|---|---|---|`;

  const clusterPages = Object.entries(clusters).map(([name, c]) => ({
    name,
    slug: kebab(name),
    body: clusterPage({ name, c, platform, title }),
  }));

  /**
   * The clusters index. The resolution rule itself lives on the cluster's own
   * page: `autoLayoutSizing` alone is an eleven-row case table over its own
   * operand set, and six of those inlined made the binding page a document you
   * scroll past rather than read.
   */
  const clusterIndex = Object.entries(clusters).length
    ? `| Cluster | Disposition | Keys | Resolution |\n|---|---|---|---|\n${Object.entries(clusters)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, c]) =>
          `| [${name}](clusters/${platform}/${kebab(name)}.md) | ${badge(c.disposition)} | ${c.keys.length} | ${
            c.form === 'cases' ? `${c.cases.length}-row case table` : 'prose — not yet a case table'
          } |`
        )
        .join('\n')}`
    : '*None declared.*';

  /**
   * Losses, last. What the platform does is settled by everything above it;
   * this is the one section whose content is a question rather than a fact,
   * so it reads as a postscript rather than as part of the mapping.
   */
  const losses = (() => {
    const flagged = Object.entries(styles).filter(([, v]) => v.needsDecision);
    if (!flagged.length) return '';
    const themes = b.decisionThemes ?? {};
    const byTheme = {};
    for (const [k, v] of flagged) (byTheme[v.needsDecision] ??= []).push(k);
    const section = ([t, keys]) => {
      const theme = themes[t] ?? {};
      const status = theme.decided
        ? theme.decided.startsWith('Open')
          ? `**Open.** ${theme.decided.replace(/^Open\.?\s*/, '')}`
          : `**Decided.** ${theme.decided}`
        : '**Open.**';
      return `### ${theme.title ?? t}\n\nAffects ${keys.map((k) => `\`${k}\``).join(', ')}.\n\n${theme.note ?? ''}\n\n${status}`;
    };
    const entries = Object.entries(byTheme);
    const decided = entries.filter(([t]) => themes[t]?.decided && !themes[t].decided.startsWith('Open'));
    const open = entries.filter(([t]) => !themes[t]?.decided || themes[t].decided.startsWith('Open'));

    return `## Losses

What this platform does is settled and stated above. Where a loss is real, its *acceptability* is a product question rather than a specification's to settle alone. ${flagged.length} of ${styleProps.length} keys raise one of ${entries.length} such questions${
      open.length ? `, of which ${open.length} ${open.length === 1 ? 'remains' : 'remain'} open` : ' — all decided'
    }.

${[...open, ...decided].map(section).join('\n\n')}
`;
  })();

  return { clusterPages, page: `# ${title} binding

**Platform binding for the Specs document format — draft.**

Normative frame: [\`SPECIFICATION.md\`](../SPECIFICATION.md) §11. This document states how
the ${title} binding realises the schema; it does not restate what the members mean —
that is the reference at \`/schema\`.

Generated from \`mappings/bindings/${platform}.json\` by \`scripts/build-mappings.mjs\`.
Edit the binding file, never this page.

## Styles

${tally}, of ${styleProps.length} style keys.

A key whose row says *cluster* does not map on its own — its rule is a case table on the
cluster's own page. Writing a per-key mapping for it would be false, not merely incomplete.

${(() => {
  // The legend sits with the table it explains, and lists only the dispositions
  // this binding uses. As its own section it was either the first thing on the
  // page, ahead of the thing it annotates, or a footnote nobody reached.
  const meaning = {
    bound: 'Realised, and confirmed against the implementation',
    approximated: 'Realised with loss, and the loss is stated',
    unsupported: 'Declared as not realised, with the resulting behaviour stated',
    unverified: 'Coverage detected, mapping not yet confirmed by a human — **work, not a claim**',
  };
  const used = DISPOSITION_ORDER.filter((d) => counts[d]);
  const rows = used.map((d) => `| \`${d}\` | ${counts[d]} | ${meaning[d]} |`).join('\n');
  const reliance = used.includes('unverified')
    ? 'Every row below is a claim a reader may rely on, except `unverified`, which asserts nothing.'
    : 'Every row below is a claim a reader may rely on.';
  return `| Disposition | Keys | Meaning |\n|---|---|---|\n${rows}\n\n${reliance}`;
})()}

${header}
${rows.join('\n')}

## Values

${b.valueForms?.summary ?? ''}

${(() => {
  const vf = b.valueForms ?? {};
  /**
   * `mixedValue` is a fifth form rather than a kind of literal: the document is
   * stating that the property varies, not giving a value. A binding that treats
   * it as a literal emits the string "mixed" into output.
   */
  const forms = [
    ['literal', 'Literal'],
    ['mixedValue', '`mixed`'],
    ['tokenReference', '`TokenReference`'],
    ['propBinding', '`PropBinding`'],
    ['conditional', '`Conditional`'],
  ];
  const rows = forms.map(([k, label]) => {
    const d = vf[k] ?? 'unverified';
    const flag = vf[`${k}Verified`] === false ? ' *(not confirmed per key)*' : '';
    return `| ${label} | ${badge(d)}${flag} | ${vf[`${k}Note`] ?? ''} |`;
  }).join('\n');
  const decisions = forms
    .filter(([k]) => vf[`${k}NeedsDecision`])
    .map(([k, label]) => `**${label}.** ${vf[`${k}DecisionNote`] ?? ''}`);
  return `| Form | Disposition | Behaviour |\n|---|---|---|\n${rows}${
    decisions.length
      ? `\n\n### Needs a decision\n\nThese are not open questions about what the platform does — that is settled above. They are open questions about what it *should* do, which is not a specification's call to make alone.\n\n${decisions.join('\n\n')}`
      : ''
  }`;
})()}

## Defaults

What an absent style key **means** is spec-level, not per-platform: two platforms that
answer differently disagree about what the same document says. It is declared once in the
schema and summarised in [\`DEFAULTS.md\`](DEFAULTS.md).

What this platform **does** on absence is its own fact, and is recorded per key below.
A key whose behaviour is not \`declaredDefault\` disagrees with the contract — visibly,
and as a decision rather than an accident.

${(() => {
  const counts = {};
  for (const v of Object.values(styles)) counts[v.onAbsent] = (counts[v.onAbsent] ?? 0) + 1;
  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `| \`${k}\` | ${n} | ${b.onAbsentVocabulary?.[k] ?? ''} |`)
    .join('\n');
  return `| Behaviour | Keys | Meaning |\n|---|---|---|\n${rows}`;
})()}

${Object.values(styles).some((v) => v.onAbsentVerified === false)
  ? '> Seeded from the transform’s documented policy and **not yet confirmed per key**. A seeded value is a starting point, not a finding.'
  : ''}

## Clusters

Keys that resolve jointly. No single key in a cluster determines any single output, so the
resolution rule is the mapping rather than a row in the Styles table. Each cluster's rule
is its own page.

${clusterIndex}

${losses}` };
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
const clusterDirs = new Set();
for (const file of files) {
  const platform = file.replace(/\.json$/, '');
  const { page, clusterPages = [] } = renderPlatform(file);
  pages.push([join(pkg, `mappings/${platform.toUpperCase()}.md`), page, `${platform.toUpperCase()}.md`]);
  for (const cl of clusterPages) {
    const dir = join(pkg, `mappings/clusters/${platform}`);
    clusterDirs.add(dir);
    pages.push([join(dir, `${cl.slug}.md`), cl.body, `clusters/${platform}/${cl.slug}.md`]);
  }
}
pages.push([join(pkg, 'mappings/DEFAULTS.md'), renderDefaults(), 'DEFAULTS.md']);

// Stale cluster files would otherwise outlive a renamed or deleted cluster.
for (const dir of clusterDirs) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

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
