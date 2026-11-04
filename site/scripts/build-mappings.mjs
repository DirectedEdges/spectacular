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

/**
 * The prop kinds, read off `AnyProp`'s own union so a kind added to the schema
 * fails every binding file that has not declared it — the same guard the style
 * keys get. `BooleanProp` → `boolean`: the definition name minus the suffix is
 * the discriminator each definition's `type` member carries (except `enum`,
 * which shares `type: string` with StringProp and is discriminated by `enum`'s
 * presence — the kind id still reads off the definition name).
 */
const componentSchema = JSON.parse(readFileSync(join(pkg, 'schema/component.schema.json'), 'utf8'));
const propKinds = componentSchema.definitions.AnyProp.oneOf.map((b) =>
  b.$ref.replace(/^.*#\/definitions\//, '').replace(/Prop$/, '').toLowerCase()
);

/**
 * The element types, read off `ElementType`'s own union — the anatomy surface's
 * unit, guarded exactly as the prop kinds are: a type added to the schema fails
 * every binding file that has not answered for it.
 */
const elementTypes = componentSchema.definitions.ElementType.oneOf.map((b) => b.const);

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
  tagCases: 'Tag cases',
  ariaCases: 'ARIA cases',
  handlerCases: 'Handler cases',
  routingCases: 'Instance routing',
};

/**
 * Every case row a cluster declares, across all of its tables. The index line
 * used to read `c.cases.length`, which crashes on a multi-table cluster whose
 * decision has no unqualified `cases` — three outputs, three named tables.
 */
const caseRowCount = (c) =>
  Object.entries(c)
    .filter(([k, v]) => (/Cases$/.test(k) || k === 'cases') && Array.isArray(v))
    .reduce((n, [, v]) => n + v.length, 0);

/**
 * One Clusters table for the whole page — styles, props and anatomy clusters
 * together, each tagged with its surface. The rules are the most consequential
 * thing a binding declares, so they index once, near the top, instead of three
 * sub-tables buried under their surfaces.
 */
const clustersSection = (metas, platform) => {
  if (!metas.length) return '*None declared.*';
  return `| Cluster | Surface | Disposition | Keys | Resolution |\n|---|---|---|---|---|\n${metas
    .slice()
    .sort((a, b) => a.surface.localeCompare(b.surface) || a.name.localeCompare(b.name))
    .map(({ name, surface, c }) =>
      `| [${name}](clusters/${platform}/${kebab(name)}.md) | ${surface} | ${badge(c.disposition)} | ${c.keys.map((k) => `\`${k}\``).join(', ')} | ${
        c.form === 'cases' ? `${caseRowCount(c)}-row case table` : 'prose — not yet a case table'
      } |`
    )
    .join('\n')}`;
};

/**
 * One cluster, as its own page.
 *
 * A cluster is the unit a reader arrives at: they have a key whose row says
 * *cluster*, and they want the rule. Inlining nine of these under one heading
 * meant the rule for `textTruncation` sat four case tables below the rule for
 * `autoLayout`, with no URL of its own to link or cite.
 */
const clusterPage = ({ name, c, platform, title, lead }) => {
  // Labeled fields, not a bare value run — three unlabeled words read as a
  // phrase, and a reader should not need the FORMAT doc to parse the header.
  const headerFields = [
    ['disposition', c.disposition === 'unverified' ? '**`unverified`**' : `\`${c.disposition}\``],
    ['direction', c.direction ? `\`${c.direction}\`` : null],
    ['basis', c.basis ? `\`${c.basis}\`` : null],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  const head = `# ${name}

${headerFields}

${lead ?? `A cluster of the [${title} binding](../${platform}.md). These keys resolve jointly — no
one of them determines any single output, so the rule below *is* the mapping.`}

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
 * The props surface of one binding: a per-kind table plus the clusters whose
 * rules span kinds. Unlike styles, props are NOT inherited by a dependent
 * binding — how a prop becomes a parameter is each platform's own fact — so
 * every binding file declares all kinds and this renders for all four.
 *
 * Completeness mirrors the style guard: a prop kind in `AnyProp` with no row
 * in a binding file fails the build. The kind list is read off the schema's
 * own union, so adding an eighth kind breaks every binding that has not
 * answered for it.
 */
/**
 * One unit-keyed concept surface: a per-unit table plus the clusters whose
 * rules span units. Props and anatomy share this shape — the unit is a closed,
 * schema-derived population (prop kinds off `AnyProp`, element types off
 * `ElementType`) while the instances' names stay the library's. Unlike a style
 * key, a unit may carry its own row AND participate in a cluster: a unit is a
 * population, and different populations of it resolve differently.
 */
const renderUnitSurface = ({ platform, title, b, file }, cfg) => {
  const entries = b.concepts?.[cfg.conceptKey] ?? {};
  const clusters = b.concepts?.[cfg.clustersKey] ?? {};

  const extra = Object.keys(entries).filter((k) => !cfg.units.includes(k));
  if (extra.length) failures.push(`${file}: ${cfg.unitNoun}s not in the schema's ${cfg.unitSource} — ${extra.join(', ')}`);
  const missing = cfg.units.filter((k) => !(k in entries));
  if (missing.length) failures.push(`${file}: missing ${cfg.unitNoun}s — ${missing.join(', ')}`);

  for (const [name, c] of Object.entries(clusters)) {
    for (const k of c.keys ?? []) {
      if (!(k in entries)) failures.push(`${file}: ${cfg.unitNoun} cluster "${name}" names \`${k}\`, absent from concepts.${cfg.conceptKey}`);
    }
    if (c.form === 'cases') {
      if (!c.inputs?.length) failures.push(`${file}: ${cfg.unitNoun} cluster "${name}" declares cases but no inputs — the operand set must be finite and visible`);
      if (caseRowCount(c) === 0) failures.push(`${file}: ${cfg.unitNoun} cluster "${name}" is form cases with no case table at all`);
      for (const [tableName, table] of Object.entries(c).filter(([k, v]) => (/Cases$/.test(k) || k === 'cases') && Array.isArray(v))) {
        for (const [i, cs] of table.entries()) {
          if (!cs.when) failures.push(`${file}: ${cfg.unitNoun} cluster "${name}" ${tableName}[${i}] has no predicate`);
          if (!Array.isArray(cs.emit)) failures.push(`${file}: ${cfg.unitNoun} cluster "${name}" ${tableName}[${i}] has no emit list — an empty array is a claim, a missing one is an omission`);
        }
      }
    } else {
      if (!c.resolution) failures.push(`${file}: ${cfg.unitNoun} cluster "${name}" has no resolution rule — the rule IS the mapping`);
      if (!c.partial) failures.push(`${file}: ${cfg.unitNoun} cluster "${name}" does not say what a partially present cluster does`);
    }
  }
  for (const [k, v] of Object.entries(entries)) {
    if (v.cluster && !(v.cluster in clusters)) failures.push(`${file}: ${cfg.unitNoun} \`${k}\` names cluster "${v.cluster}", which is not declared`);
  }

  const realiseCell = (v) =>
    v.target ? `\`${v.target}\`` : v.module ? (v.module.length ? v.module.map((m) => `\`${m}\``).join(', ') : '—') : (v.realises ?? '—');

  const rows = cfg.units.map((k) => {
    const v = entries[k] ?? { disposition: 'unverified' };
    const clusterLink = v.cluster ? ` · cluster [${v.cluster}](clusters/${platform}/${kebab(v.cluster)}.md)` : '';
    return `| [\`${k}\`](${cfg.pageBase}${k}/) | ${badge(v.disposition)} | ${realiseCell(v)}${clusterLink} | ${v.notes ?? ''} |`;
  });

  const section = `## ${cfg.heading}

${cfg.intro}

| ${cfg.unitColumn} | Disposition | Realised by | Notes |
|---|---|---|---|
${rows.join('\n')}
`;

  const clusterPages = Object.entries(clusters).map(([name, c]) => ({
    name,
    slug: kebab(name),
    body: clusterPage({ name, c, platform, title, lead: cfg.clusterLead(title, platform) }),
  }));

  // For the page-level Clusters table — every surface's clusters in one index.
  const clusterMeta = Object.entries(clusters).map(([name, c]) => ({
    name, surface: cfg.heading, c,
  }));

  return { section, clusterPages, clusterMeta };
};

const renderProps = (ctx) =>
  renderUnitSurface(ctx, {
    conceptKey: 'props',
    clustersKey: 'propClusters',
    units: propKinds,
    unitNoun: 'prop kind',
    unitSource: 'AnyProp',
    unitColumn: 'Prop kind',
    pageBase: '/schema/props/',
    heading: 'Props',
    intro: `A prop is declared once in the spec and realised differently by kind on each platform.
Unlike a style key, a kind may carry its own row *and* participate in a cluster — a kind
is a population of props, and different populations of it resolve differently.`,
    clustersHeading: 'Prop clusters',
    clustersIntro: 'Rules that span kinds — where which kind a prop even IS, or where its platform shape, is resolved jointly rather than per kind.',
    clusterLead: (title, platform) =>
      `A prop cluster of the [${title} binding](../${platform}.md). The kinds named below resolve jointly here — which kind a prop even is, or what platform shape it takes, is decided by this rule rather than per kind.`,
  });

const renderAnatomy = (ctx) =>
  renderUnitSurface(ctx, {
    conceptKey: 'anatomy',
    clustersKey: 'anatomyClusters',
    units: elementTypes,
    unitNoun: 'element type',
    unitSource: 'ElementType',
    unitColumn: 'Element type',
    pageBase: '/schema/anatomy/',
    heading: 'Anatomy',
    intro: `An anatomy element's names are the library's; its TYPE is the contract's, and the type is
what each platform realises. A type may carry its own row *and* participate in a cluster —
a type is a population of elements, and which type a node even becomes is itself a joint rule.`,
    clustersHeading: 'Anatomy clusters',
    clustersIntro: 'Rules that span element types — detection, collapse, promotion, and the semantics that decide a tag.',
    clusterLead: (title, platform) =>
      `An anatomy cluster of the [${title} binding](../${platform}.md). The element types named below resolve jointly here — which type a node becomes, or what tag and semantics an element takes, is decided by this rule rather than per type.`,
  });

/**
 * A binding that inherits its style surface from another. It states only
 * overrides plus the platform-shaped concerns the base binding cannot carry —
 * how props become parameters, slots become children, variants become
 * selection, and how styles attach.
 */
const renderDependent = ({ platform, title, b, styles, dependsOn, file, propsSection, clustersIdx }) => {
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

## Clusters

The rules that resolve jointly on this platform's own surfaces — props and anatomy are
never inherited, so these are this binding's own. Each cluster's ordered case table is
its own page.

${clustersIdx}

## Style overrides

${overrides.length
  ? `| Style key | Disposition | Realised by | Why it differs |\n|---|---|---|---|\n${overrides
      .map(([k, v]) => `| \`${k}\` | ${badge(v.disposition)} | ${v.target ?? v.module?.join(', ') ?? '—'} | ${v.why ?? ''} |`)
      .join('\n')}`
  : '**None.** Every style key is inherited unchanged.'}

${propsSection ?? ''}
## Platform surfaces

${surfaces.note ?? ''}

${surfaceRows ? `| Surface | Disposition |\n|---|---|\n${surfaceRows}` : '*None declared.*'}

## Absent keys

Inherited. See [Absent keys on the Overview](/schema/mappings/#absent-keys).
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

  // The props and anatomy surfaces render on every binding, base and dependent
  // alike — a unit's platform shape is never inherited.
  const propsOut = renderProps({ platform, title, b, file });
  const anatomyOut = renderAnatomy({ platform, title, b, file });

  // A dependent binding declares only what it changes, so completeness is the
  // base binding's obligation, not its. What it must not do is silently restate
  // a key identically — that recreates the second source the dependency removed.
  if (dependsOn.length) {
    return {
      page: renderDependent({
        platform, title, b, styles, dependsOn, file,
        propsSection: `${propsOut.section}\n${anatomyOut.section}`,
        clustersIdx: clustersSection([...propsOut.clusterMeta, ...anatomyOut.clusterMeta], platform),
      }),
      clusterPages: [...propsOut.clusterPages, ...anatomyOut.clusterPages],
    };
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
  const allClusterMeta = [
    ...Object.entries(clusters).map(([name, c]) => ({ name, surface: 'Styles', c })),
    ...propsOut.clusterMeta,
    ...anatomyOut.clusterMeta,
  ];
  const clusterIndex = clustersSection(allClusterMeta, platform);

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

  return { clusterPages: [...clusterPages, ...propsOut.clusterPages, ...anatomyOut.clusterPages], page: `# ${title} binding

**Platform binding for the Specs document format — draft.**

Normative frame: [\`SPECIFICATION.md\`](../SPECIFICATION.md) §11. This document states how
the ${title} binding realises the schema; it does not restate what the members mean —
that is the reference at \`/schema\`.

Generated from \`mappings/bindings/${platform}.json\` by \`scripts/build-mappings.mjs\`.
Edit the binding file, never this page.

## Clusters

The rules that resolve jointly — where no single key or kind determines any single
output, the cluster's ordered case table IS the mapping, on its own page. Keys and
kinds in the surface tables below link back here through their *cluster* column.

${clusterIndex}

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

${propsOut.section}
${anatomyOut.section}
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
schema — each style key's page marks its own default — and the ambiguity absence carries
is stated on [the Overview](/schema/mappings/#absent-keys).

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

${losses}` };
};


// ─── Site rendering ──────────────────────────────────────────────────────────
//
// These pages used to be written as markdown into `packages/schema/mappings/`
// and then re-read by a second script that wrapped them as Starlight pages.
// Nothing else ever read that intermediate, so it is gone: this script renders
// straight to the site (#837).

const outDir = resolve(site, 'src/content/docs/schema/mappings');

const PAGE_DESCRIPTIONS = {
  FIGMA: 'How the Figma binding realises the Specs schema — per-style-key disposition, value forms, and declared degradation',
  CSS: 'How the CSS binding realises the Specs schema — per-style-key disposition, ordered case tables for jointly resolved keys, and declared degradation',
  REACT: 'What the React binding adds to the CSS binding — platform surfaces and style overrides',
  WEBCOMPONENTS: 'What the Web Components binding adds to the CSS binding — platform surfaces and style overrides',
  INDEX: 'How each platform realises the Specs document format — the binding concept, the four platforms, and where the data lives',
};

const PAGE_TITLES = { CSS: 'CSS', WEBCOMPONENTS: 'Web Components', INDEX: 'Platform Mappings' };

/**
 * The section's front door: what a binding IS, who the platforms are, and
 * where the data lives. Everything countable is counted from the binding
 * files, so the page cannot drift from them.
 */
const renderOverview = (files) => {
  const surfaceCell = (entries, units) => {
    const total = units.length;
    const counts = {};
    for (const u of units) {
      const d = entries?.[u]?.disposition ?? 'unverified';
      counts[d] = (counts[d] ?? 0) + 1;
    }
    const reliable = (counts.bound ?? 0) + (counts.approximated ?? 0) + (counts.unsupported ?? 0);
    return `${reliable}/${total} declared${counts.unverified ? `, ${counts.unverified} unverified` : ''}`;
  };

  const NAV_ORDER = ['figma', 'css', 'react', 'webcomponents'];
  const rows = files.slice().sort((a, b) => NAV_ORDER.indexOf(a.replace(/\.json$/, '')) - NAV_ORDER.indexOf(b.replace(/\.json$/, ''))).map((file) => {
    const platform = file.replace(/\.json$/, '');
    const b = JSON.parse(readFileSync(join(bindingsDir, file), 'utf8'));
    const styleCell = b.dependsOn?.length
      ? `inherits [${b.dependsOn.map((d) => TITLES[d] ?? d).join(', ')}](${b.dependsOn[0].toUpperCase()}.md)${Object.keys(b.concepts?.styles ?? {}).length ? `, ${Object.keys(b.concepts.styles).length} overrides` : ''}`
      : surfaceCell(b.concepts?.styles, styleProps);
    const clusterCount =
      Object.keys(b.concepts?.styleClusters ?? {}).length +
      Object.keys(b.concepts?.propClusters ?? {}).length +
      Object.keys(b.concepts?.anatomyClusters ?? {}).length;
    return `| [${TITLES[platform] ?? platform}](${platform.toUpperCase()}.md) | ${b.realises ?? ''} | ${styleCell} | ${surfaceCell(b.concepts?.props, propKinds)} | ${surfaceCell(b.concepts?.anatomy, elementTypes)} | ${clusterCount} |`;
  });

  return `# Platform Mappings

**How each platform realises the Specs document format.**

A Specs document says what a component *is*; it does not say what any platform must do
with one. A **platform binding** closes that gap: one page per platform, generated from a
checked-in declaration file, stating how that platform realises each surface of the
schema — every style key, every prop kind, every element type — with one of four
dispositions (\`bound\`, \`approximated\`, \`unsupported\`, \`unverified\`). Completeness is
enforced at build time: a unit in the schema with no row in a binding file fails the
build, so a mapping can be wrong but it cannot be silently missing.

Where several keys or kinds resolve **jointly** — no one of them determining any single
output — the rule is a *cluster*: an ordered case table over a declared operand set, on
its own page, linked from each binding's Clusters index.

## The platforms

| Binding | Role | Styles | Props | Anatomy | Clusters |
|---|---|---|---|---|---|
${rows.join('\n')}

React and Web Components inherit their style surface from CSS and declare only
overrides; props and anatomy are never inherited — how a prop becomes a parameter or an
element becomes a tag is each platform's own fact.

## The data

Every page in this section is generated. The declarations live in the schema package —
[\`packages/schema/mappings/bindings/\`](bindings/FORMAT.md) — one JSON file per platform,
with the format documented beside them. Edit the data, never a page.

## Absent keys

What an absent style key *means* is a property of the document, not a platform choice:
every \`Styles\` property declares a \`default\` in the schema, each key's reference page
marks it, and a consumer MUST use it rather than substituting a platform convention of
its own. Two platforms that answered differently would disagree about what the same
document says.

A declared default answers only one of the three reasons a key can be absent, and a
consumer reading one document cannot tell them apart:

| Reason | Recoverable by a consumer? |
|---|---|
| The value equalled the default and was dropped at generation | Yes — the schema's declared default is the value |
| A variant inherits it from \`default\` under layering | Partly — by reading \`default\`, if it knows the run used layered details |
| The element type cannot carry it | No — needs the per-type key tables, published on each [element type's page](/schema/anatomy/) |

Nothing in a serialized document marks which applies — no sentinel, no metadata member,
no \`$extensions\` marker. Each platform binding declares what it *does* on absence in
its own Defaults section, where anything other than applying the declared default is
visible as a decision rather than an accident.
`;
};

/**
 * Style keys that have a generated reference page. Read from the page tree
 * rather than the schema, so a key whose page is missing is never linked.
 */
const STYLE_KEYS = (() => {
  const dir = resolve(site, 'src/content/docs/schema/styles');
  if (!existsSync(dir)) return [];
  const slugs = new Set(readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')));
  return styleProps
    .filter((k) => slugs.has(kebab(k)))
    // Longest first, so `maxWidth` is not shadowed by a prefix match on `max`.
    .sort((a, b) => b.length - a.length);
})();

/** One rendered body, wrapped as a Starlight page with its links rewritten. */
const sitePage = ({ label, body, platform, cluster }) => {
  // Starlight renders the frontmatter title as the H1; drop the body's own.
  let linked = body.replace(/^# .+\n/, '');

  // The rendered body links `../SPECIFICATION.md`, which is not a site route.
  linked = linked.replace(/\]\(\.\.\/SPECIFICATION\.md\)/g, '](/schema/specification/)');

  // A binding links its clusters as `clusters/<platform>/<name>.md`; a cluster
  // links back to its binding as `../<platform>.md`.
  linked = linked
    .replace(/\]\(clusters\/([a-z]+)\/([a-z-]+)\.md\)/g, (_, p, c) => `](/schema/mappings/${p}/clusters/${c}/)`)
    .replace(/\]\(\.\.\/([a-z]+)\.md\)/g, (_, p) => `](/schema/mappings/${p}/)`);

  // A dependent binding links its base as `CSS.md`.
  linked = linked.replace(/\]\(([A-Z]+)\.md\)/g, (_, p) => `](/schema/mappings/${p.toLowerCase()}/)`);

  // Binding data is published in the package but not served by the site.
  linked = linked.replace(
    /\]\(bindings\/([A-Za-z_.-]+)\)/g,
    (_, f) => `](https://github.com/DirectedEdges/spectacular/blob/main/packages/schema/mappings/bindings/${f})`
  );

  /**
   * A style key in backticks becomes a link to its reference page. These pages
   * name the same 46 keys dozens of times each and every one was dead text,
   * which made the mapping a dead end rather than a way into the reference.
   *
   * Only bare keys are rewritten. A key already carrying a link, or part of a
   * dotted path like `styles.padding`, is left alone.
   */
  linked = (() => {
    const keys = STYLE_KEYS.filter((k) => !linked.includes(`[\`${k}\``));
    if (!keys.length) return linked;
    const re = new RegExp(`(?<![\\[\`\\w.])\`(${keys.join('|')})\`(?![\\]\`.])`, 'g');
    return linked.replace(re, (_, k) => `[\`${k}\`](/schema/styles/${kebab(k)}/)`);
  })();

  // A cluster's own name is its title, taken from the H1 the body drops.
  const clusterName = cluster ? (body.match(/^# (.+)$/m)?.[1] ?? '').trim() : null;
  const title = clusterName ?? PAGE_TITLES[platform] ?? platform.charAt(0) + platform.slice(1).toLowerCase();
  const description = clusterName
    ? `How the ${PAGE_TITLES[platform] ?? platform} binding resolves the ${clusterName} cluster — its operand set and ordered case table`
    : (PAGE_DESCRIPTIONS[platform] ?? `How the ${title} binding realises the Specs schema`);

  const out = cluster
    ? join(outDir, platform.toLowerCase(), 'clusters', `${cluster}.md`)
    : join(outDir, `${label.replace(/\.md$/, '').toLowerCase()}.md`);

  return {
    out,
    contents: `---
title: "${title}"
description: "${description}"
---

<!-- Generated by site/scripts/build-mappings.mjs from packages/schema/mappings/bindings/ —
     edit the binding JSON, not this file. -->

${linked}`,
  };
};

const files = readdirSync(bindingsDir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));

/**
 * Every rendered page, as `{ label, body, platform, cluster }`.
 *
 * `label` is the name the page used to be written under in
 * `packages/schema/mappings/` — `CSS.md`, `clusters/css/auto-layout.md`. It is
 * kept because the bodies link each other by those names, and the rewriting
 * below turns them into site routes.
 */
const pages = [];
for (const file of files) {
  const platform = file.replace(/\.json$/, '');
  const { page, clusterPages = [] } = renderPlatform(file);
  pages.push({ label: `${platform.toUpperCase()}.md`, body: page, platform: platform.toUpperCase() });
  for (const cl of clusterPages) {
    pages.push({
      label: `clusters/${platform}/${cl.slug}.md`,
      body: cl.body,
      platform: platform.toUpperCase(),
      cluster: cl.slug,
    });
  }
}
pages.push({ label: 'INDEX.md', body: renderOverview(files), platform: 'INDEX' });

for (const { label, body } of pages) checkNoLeaks(label, body);

if (!failures.length) {
  // Replaced wholesale, so a renamed or deleted cluster cannot leave a page.
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const page of pages) {
    const { out, contents } = sitePage(page);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, contents);
    console.log(`mappings: wrote /schema/mappings/${out.slice(outDir.length + 1).replace(/\.md$/, '')}`);
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
