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
// All page copy lives in content/ — this script holds structure only:
// headings, column headers, field labels, guards, and assembly.
import {
  CLUSTER, CLUSTER_INDEX, SURFACES, PLATFORM, DEPENDENT, OVERVIEW, BANNER,
  PAGE_DESCRIPTIONS, clusterPageDescription, fallbackPageDescription,
} from './content/mappings.mjs';

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

/**
 * The reference forms — SPECIFICATION §5.1's pointer grammar plus the
 * `$nested` path grammar. No single schema union declares this set, so §5.1's
 * own table is the declaration and this list mirrors it; the guard still runs
 * both ways (a binding declaring an unknown form fails, a form missing from a
 * binding fails). The set is closed by the safe-key grammar: no authored key
 * may begin with `$`, so no document can mint an eighth marker.
 */
const referenceForms = [
  'literal', 'mixed', 'token', 'binding', 'conditional',
  'slotContent', 'subcomponent', 'elementType', 'image', 'nested',
];

/** Each form's documentation home — hand pages at the schema root, not a generated tree. */
const REFERENCE_PAGES = {
  literal: '/schema/styles/',
  mixed: '/schema/specification/',
  token: '/schema/token-reference/',
  binding: '/schema/prop-binding/',
  conditional: '/schema/conditional/',
  slotContent: '/schema/slot-content-ref/',
  subcomponent: '/schema/subcomponents/',
  elementType: '/schema/anatomy/#elementtyperef',
  image: '/schema/styles/background-image/',
  nested: '/schema/prop-configurations/',
};

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
  if (!metas.length) return CLUSTER_INDEX.none;
  return `| Cluster | Surface | Disposition | Keys | Resolution |\n|---|---|---|---|---|\n${metas
    .slice()
    .sort((a, b) => a.surface.localeCompare(b.surface) || a.name.localeCompare(b.name))
    .map(({ name, surface, c }) =>
      `| [${name}](clusters/${platform}/${kebab(name)}.md) | ${surface} | ${badge(c.disposition)} | ${c.keys.map((k) => `\`${k}\``).join(', ')} | ${
        c.form === 'cases' ? CLUSTER_INDEX.caseTable(caseRowCount(c)) : CLUSTER_INDEX.prose
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

${lead ?? CLUSTER.defaultLead(title, platform)}

**Keys.** ${c.keys.map((k) => `\`${k}\``).join(', ')}
`;

  if (c.form !== 'cases') {
    return `${head}
**Outputs.** ${c.outputs.map((o) => `\`${o}\``).join(', ')}

**Resolution.** ${c.resolution}

**Partially present.** ${c.partial}
${c.stage ? `\n${CLUSTER.stageLine(c.stage)}\n` : ''}${c.notes ? `\n*${c.notes}*\n` : ''}
${CLUSTER.proseDebt}
`;
  }

  const inputs = `| Operand | From |\n|---|---|\n${c.inputs.map((i) => `| \`${i.ref}\` | ${i.from} |`).join('\n')}`;

  const derived = Object.keys(c.derived ?? {}).length
    ? `\n## Derived predicates\n\n| Name | Expression | Source |\n|---|---|---|\n${Object.entries(c.derived)
        .map(([n, d]) => `| \`derived.${n}\` | ${fmt(d.expression)} | ${d.source ?? ''} |`)
        .join('\n')}\n`
    : '';

  const caseTable = (label, list) =>
    `\n## ${label}\n\n${CLUSTER.caseTableIntro}\n\n| # | When | Emits | Why |\n|---|---|---|---|\n${list
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

${CLUSTER.operandsIntro}

${inputs}
${derived}${tables.map((t) => caseTable(t.label, t.list)).join('')}${
    c.otherwise
      ? `\n## Otherwise\n\n${c.otherwise.emit?.length ? c.otherwise.emit.map((e) => `\`${e}\``).join(', ') : CLUSTER.otherwiseNothing}${
          c.otherwise.why ? ` — ${c.otherwise.why}` : ''
        }\n`
      : ''
  }${c.stage ? `\n${CLUSTER.stageLine(c.stage)}\n` : ''}${
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

  // No Notes column: a note is a fact about one unit on one platform, so it
  // renders on the unit's own page, where it is one paragraph under one
  // platform heading — not here, where 46 of them stack into a wall.
  // `withNotes`: the references table keeps its Notes column — its unit pages
  // are hand-written and carry no generated binding section for a note to
  // move to, and seven rows is a table, not a wall.
  const rows = cfg.units.map((k) => {
    const v = entries[k] ?? { disposition: 'unverified' };
    const clusterLink = v.cluster ? ` · cluster [${v.cluster}](clusters/${platform}/${kebab(v.cluster)}.md)` : '';
    const link = cfg.unitLink ? cfg.unitLink(k) : `${cfg.pageBase}${k}/`;
    return `| [\`${k}\`](${link}) | ${badge(v.disposition)} | ${realiseCell(v)}${clusterLink} |${cfg.withNotes ? ` ${v.notes ?? ''} |` : ''}`;
  });

  const section = `## ${cfg.heading}

${cfg.intro}

| ${cfg.unitColumn} | Disposition | Realised by |${cfg.withNotes ? ' Notes |' : ''}
|---|---|---|${cfg.withNotes ? '---|' : ''}
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
    intro: SURFACES.props.intro,
    clusterLead: SURFACES.props.clusterLead,
  });

const renderReferences = (ctx) =>
  renderUnitSurface(ctx, {
    conceptKey: 'references',
    clustersKey: 'referenceClusters',
    units: referenceForms,
    unitNoun: 'reference form',
    unitSource: 'SPECIFICATION §5.1 pointer grammar',
    unitColumn: 'Reference form',
    unitLink: (k) => REFERENCE_PAGES[k],
    withNotes: true,
    heading: 'Values and References',
    intro: SURFACES.references.intro,
    clusterLead: SURFACES.references.clusterLead,
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
    intro: SURFACES.anatomy.intro,
    clusterLead: SURFACES.anatomy.clusterLead,
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

${PLATFORM.draftBanner}

${DEPENDENT.frame}

## Inherits from ${base}

${b.realises ?? ''}

${DEPENDENT.inheritsRule(base)}

## Clusters

${DEPENDENT.clustersIntro}

${clustersIdx}

## Style overrides

${overrides.length
  ? `| Style key | Disposition | Realised by | Why it differs |\n|---|---|---|---|\n${overrides
      .map(([k, v]) => `| \`${k}\` | ${badge(v.disposition)} | ${v.target ?? v.module?.join(', ') ?? '—'} | ${v.why ?? ''} |`)
      .join('\n')}`
  : DEPENDENT.overridesNone}

${propsSection ?? ''}
## Platform surfaces

${surfaces.note ?? ''}

${surfaceRows ? `| Surface | Disposition |\n|---|---|\n${surfaceRows}` : DEPENDENT.surfacesNone}

## Absent keys

${DEPENDENT.absentKeys}
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

  // The props, anatomy and references surfaces render on every binding, base
  // and dependent alike — a unit's platform shape is never inherited.
  const propsOut = renderProps({ platform, title, b, file });
  const anatomyOut = renderAnatomy({ platform, title, b, file });
  const referencesOut = renderReferences({ platform, title, b, file });

  // A dependent binding declares only what it changes, so completeness is the
  // base binding's obligation, not its. What it must not do is silently restate
  // a key identically — that recreates the second source the dependency removed.
  if (dependsOn.length) {
    return {
      page: renderDependent({
        platform, title, b, styles, dependsOn, file,
        propsSection: `${propsOut.section}\n${anatomyOut.section}\n${referencesOut.section}`,
        clustersIdx: clustersSection([...propsOut.clusterMeta, ...anatomyOut.clusterMeta, ...referencesOut.clusterMeta], platform),
      }),
      clusterPages: [...propsOut.clusterPages, ...anatomyOut.clusterPages, ...referencesOut.clusterPages],
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
    // No Notes column — a note renders on the key's own page, under the
    // platform it belongs to, instead of 46 of them stacking into a wall here.
    return `| \`${k}\` | ${badge(v.disposition)} | ${realises} |${isFigma ? ` ${scope} |` : ''}`;
  });

  const header = isFigma
    ? `| Style key | Disposition | ${col} | Element types |\n|---|---|---|---|`
    : `| Style key | Disposition | ${col} |\n|---|---|---|`;

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
    ...referencesOut.clusterMeta,
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

${PLATFORM.lossesIntro(flagged.length, styleProps.length, entries.length, open.length)}

${[...open, ...decided].map(section).join('\n\n')}
`;
  })();

  return { clusterPages: [...clusterPages, ...propsOut.clusterPages, ...anatomyOut.clusterPages, ...referencesOut.clusterPages], page: `# ${title} binding

${PLATFORM.draftBanner}

${PLATFORM.baseFrame(title, platform)}

## Clusters

${PLATFORM.clustersIntro}

${clusterIndex}

## Styles

${PLATFORM.stylesIntro(tally, styleProps.length)}

${(() => {
  // The legend sits with the table it explains, and lists only the dispositions
  // this binding uses. As its own section it was either the first thing on the
  // page, ahead of the thing it annotates, or a footnote nobody reached.
  const used = DISPOSITION_ORDER.filter((d) => counts[d]);
  const rows = used.map((d) => `| \`${d}\` | ${counts[d]} | ${PLATFORM.dispositionMeaning[d]} |`).join('\n');
  const reliance = used.includes('unverified') ? PLATFORM.relianceWithUnverified : PLATFORM.reliance;
  return `| Disposition | Keys | Meaning |\n|---|---|---|\n${rows}\n\n${reliance}`;
})()}

${header}
${rows.join('\n')}

${propsOut.section}
${anatomyOut.section}
${referencesOut.section}
## Defaults

${PLATFORM.defaultsSection}

${(() => {
  const counts = {};
  for (const v of Object.values(styles)) counts[v.onAbsent] = (counts[v.onAbsent] ?? 0) + 1;
  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `| \`${k}\` | ${n} | ${b.onAbsentVocabulary?.[k] ?? ''} |`)
    .join('\n');
  return `| Behaviour | Keys | Meaning |\n|---|---|---|\n${rows}`;
})()}

${Object.values(styles).some((v) => v.onAbsentVerified === false) ? PLATFORM.seededOnAbsent : ''}

${losses}` };
};


// ─── Site rendering ──────────────────────────────────────────────────────────
//
// These pages used to be written as markdown into `packages/schema/mappings/`
// and then re-read by a second script that wrapped them as Starlight pages.
// Nothing else ever read that intermediate, so it is gone: this script renders
// straight to the site (#837).

const outDir = resolve(site, 'src/content/docs/schema/mappings');

const PAGE_TITLES = { CSS: 'CSS', WEBCOMPONENTS: 'Web Components', INDEX: 'Platform Mappings' };

/**
 * The section's front door: what a binding IS, who the platforms are, and
 * where the data lives. Everything countable is counted from the binding
 * files, so the page cannot drift from them.
 */
const renderOverview = (files) => {
  // No per-surface completeness columns: completeness is build-ENFORCED, so a
  // "46/46 declared" cell can never read anything else — a guard reported as a
  // score. The surfaces will also multiply, and a column per surface grows the
  // table sideways forever. Each platform page's own legends carry the detail.
  const NAV_ORDER = ['figma', 'css', 'react', 'webcomponents'];
  const rows = files.slice().sort((a, b) => NAV_ORDER.indexOf(a.replace(/\.json$/, '')) - NAV_ORDER.indexOf(b.replace(/\.json$/, ''))).map((file) => {
    const platform = file.replace(/\.json$/, '');
    const b = JSON.parse(readFileSync(join(bindingsDir, file), 'utf8'));
    const clusterCount =
      Object.keys(b.concepts?.styleClusters ?? {}).length +
      Object.keys(b.concepts?.propClusters ?? {}).length +
      Object.keys(b.concepts?.anatomyClusters ?? {}).length;
    return `| [${TITLES[platform] ?? platform}](${platform.toUpperCase()}.md) | ${b.role ?? b.realises ?? ''} | ${clusterCount} |`;
  });

  return `# Platform Mappings

${OVERVIEW.intro}

## Supported Platforms

| Binding | Role | Clusters |
|---|---|---|
${rows.join('\n')}

${OVERVIEW.inheritance}

## Specifications and Mappings

${OVERVIEW.specsAndMappings}

## Absent keys

${OVERVIEW.absentKeys}
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
    ? clusterPageDescription(PAGE_TITLES[platform] ?? platform, clusterName)
    : (PAGE_DESCRIPTIONS[platform] ?? fallbackPageDescription(title));

  const out = cluster
    ? join(outDir, platform.toLowerCase(), 'clusters', `${cluster}.md`)
    : join(outDir, `${label.replace(/\.md$/, '').toLowerCase()}.md`);

  return {
    out,
    contents: `---
title: "${title}"
description: "${description}"
---

${BANNER}

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
