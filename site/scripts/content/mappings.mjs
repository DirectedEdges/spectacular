/**
 * Every content chunk the mappings generator emits — page copy, section
 * intros, legends, lead-ins — separated from the build script so prose is
 * edited here and structure there. `build-mappings.mjs` holds only structure:
 * headings, column headers, field labels, and the assembly.
 *
 * Chunks that interpolate are arrow functions; everything else is a string.
 * The split rule: a sentence lives here, a label lives in the script.
 */

// ── Cluster pages ────────────────────────────────────────────────────────────

export const CLUSTER = {
  defaultLead: (title, platform) => `A cluster of the [${title} binding](../${platform}.md). These keys resolve jointly — no
one of them determines any single output, so the rule below *is* the mapping.`,
  operandsIntro: 'Every fact the cluster reads. Nothing outside this set participates.',
  caseTableIntro: 'Ordered — first match wins.',
  stageLine: (stage) => `**Stage.** \`${stage}\` — produced by a later pass, not read directly.`,
  proseDebt: '> Stated as prose. Not yet converted to a case table, so it cannot be mechanically checked.',
  otherwiseNothing: '*Nothing is emitted.*',
};

export const CLUSTER_INDEX = {
  none: '*None declared.*',
  caseTable: (rows) => `${rows}-row case table`,
  prose: 'prose — not yet a case table',
};

// ── The unit surfaces (props, anatomy, values & references) ─────────────────

export const SURFACES = {
  props: {
    intro: `A prop is declared once in the spec and realised differently by kind on each platform.
Unlike a style key, a kind may carry its own row *and* participate in a cluster — a kind
is a population of props, and different populations of it resolve differently.`,
    clusterLead: (title, platform) =>
      `A prop cluster of the [${title} binding](../${platform}.md). The kinds named below resolve jointly here — which kind a prop even is, or what platform shape it takes, is decided by this rule rather than per kind.`,
  },
  references: {
    intro: `What a platform does with each form a VALUE may take — the scalar forms (a
literal, the \`mixed\` sentinel) and the pointer grammar (SPECIFICATION §5.1's six
reserved-marker forms plus the \`$nested\` paths; DSPEC-42 for the style-value half).
The set is closed: the safe key grammar admits no authored \`$\`-prefixed key, so no
document can mint a new marker. Notes stay inline — the forms' reference pages are
hand-written and carry no generated binding section yet.`,
    clusterLead: (title, platform) =>
      `A reference cluster of the [${title} binding](../${platform}.md).`,
  },
  anatomy: {
    intro: `An anatomy element's names are the library's; its TYPE is the contract's, and the type is
what each platform realises. A type may carry its own row *and* participate in a cluster —
a type is a population of elements, and which type a node even becomes is itself a joint rule.`,
    clusterLead: (title, platform) =>
      `An anatomy cluster of the [${title} binding](../${platform}.md). The element types named below resolve jointly here — which type a node becomes, or what tag and semantics an element takes, is decided by this rule rather than per type.`,
  },
};

// ── Platform pages ───────────────────────────────────────────────────────────

export const PLATFORM = {
  draftBanner: '**Platform binding for the Specs document format — draft.**',
  baseFrame: (title, platform) => `Normative frame: [\`SPECIFICATION.md\`](../SPECIFICATION.md) §11. This document states how
the ${title} binding realises the schema; it does not restate what the members mean —
that is the reference at \`/schema\`.

Generated from \`mappings/bindings/${platform}.json\` by \`scripts/build-mappings.mjs\`.
Edit the binding file, never this page.`,
  clustersIntro: `The rules that resolve jointly — where no single key or kind determines any single
output, the cluster's ordered case table IS the mapping, on its own page. Keys and
kinds in the surface tables below link back here through their *cluster* column.`,
  stylesIntro: (tally, total) => `${tally}, of ${total} style keys.

A key whose row says *cluster* does not map on its own — its rule is a case table on the
cluster's own page. Writing a per-key mapping for it would be false, not merely incomplete.`,
  dispositionMeaning: {
    bound: 'Realised, and confirmed against the implementation',
    approximated: 'Realised with loss, and the loss is stated',
    unsupported: 'Declared as not realised, with the resulting behaviour stated',
    unverified: 'Coverage detected, mapping not yet confirmed by a human — **work, not a claim**',
  },
  relianceWithUnverified: 'Every row below is a claim a reader may rely on, except `unverified`, which asserts nothing.',
  reliance: 'Every row below is a claim a reader may rely on.',
  defaultsSection: `What an absent style key **means** is spec-level, not per-platform: two platforms that
answer differently disagree about what the same document says. It is declared once in the
schema — each style key's page marks its own default — and the ambiguity absence carries
is stated on [the Overview](/schema/mappings/#absent-keys).

What this platform **does** on absence is its own fact, and is recorded per key below.
A key whose behaviour is not \`declaredDefault\` disagrees with the contract — visibly,
and as a decision rather than an accident.`,
  seededOnAbsent: '> Seeded from the transform’s documented policy and **not yet confirmed per key**. A seeded value is a starting point, not a finding.',
  lossesIntro: (flaggedCount, total, themeCount, openCount) => `What this platform does is settled and stated above. Where a loss is real, its *acceptability* is a product question rather than a specification's to settle alone. ${flaggedCount} of ${total} keys raise one of ${themeCount} such questions${
    openCount ? `, of which ${openCount} ${openCount === 1 ? 'remains' : 'remain'} open` : ' — all decided'
  }.`,
};

export const DEPENDENT = {
  frame: 'Normative frame: [`SPECIFICATION.md`](../SPECIFICATION.md) §11.',
  inheritsRule: (base) => `**Every style key is bound exactly as the ${base} binding states**, unless overridden below. This binding never restates an inherited mapping: a second copy of a rule is a second thing to keep true.`,
  clustersIntro: `The rules that resolve jointly on this platform's own surfaces — props and anatomy are
never inherited, so these are this binding's own. Each cluster's ordered case table is
its own page.`,
  overridesNone: '**None.** Every style key is inherited unchanged.',
  surfacesNone: '*None declared.*',
  absentKeys: 'Inherited. See [Absent keys on the Overview](/schema/mappings/#absent-keys).',
};

// ── The Overview (index) page ────────────────────────────────────────────────

export const OVERVIEW = {
  intro: `A platform mapping is a one page per platform declaration of how a platform implements
every part of the spec – styles, props, anatomy, slots and more – based on the schema.
Each declared unit carries one of four dispositions (\`bound\`, \`approximated\`,
\`unsupported\`, \`unverified\`), and completeness is enforced by the docs build: a unit
in the schema with no row in a binding fails it.

Some keys resolve jointly — no single key determines any single output. Those rules are
*clusters*: ordered case tables, each on its own page.`,
  inheritance: `React and Web Components inherit styles from CSS and declare only overrides. Props and
anatomy are never inherited: how a prop becomes a parameter or an element becomes a tag
is each platform's own fact.`,
  specsAndMappings: `The [specification](/schema/specification/) defines what a binding owes: a disposition
for every unit of every surface, declared handling of each value form, and case tables
rather than prose for jointly resolved rules. The mappings answer as data — one JSON
file per platform in the schema package, with the
[format documented beside it](https://github.com/DirectedEdges/spectacular/blob/main/packages/schema/mappings/bindings/FORMAT.md).
Every page in this section is generated from those files, and the same declarations
feed each style key's, prop kind's, and element type's own reference page. Edit the
data, never a page.`,
  absentKeys: `What an absent style key means is a property of the document, not a platform choice.
Every \`Styles\` property declares a default in the schema, each key's page marks it,
and a consumer applies it rather than substituting its own. A declared default answers
only one of three reasons a key can be absent:

| Reason | Recoverable by a consumer? |
|---|---|
| The value equalled the default and was dropped at generation | Yes — the schema's declared default is the value |
| A variant inherits it from \`default\` under layering | Partly — by reading \`default\`, if it knows the run used layered details |
| The element type cannot carry it | No — needs the per-type key tables, published on each [element type's page](/schema/anatomy/) |

Nothing in a document marks which applies. Each binding declares what it does on
absence in its own Defaults section, where anything other than the declared default is
visible as a decision rather than an accident.`,
};

/** The provenance banner at the top of every generated page. */
export const BANNER = `<!-- Generated by site/scripts/build-mappings.mjs from packages/schema/mappings/bindings/ —
     edit the binding JSON, not this file. -->`;

// ── Page frontmatter descriptions ────────────────────────────────────────────

export const PAGE_DESCRIPTIONS = {
  FIGMA: 'How the Figma binding realises the Specs schema — per-style-key disposition, value forms, and declared degradation',
  CSS: 'How the CSS binding realises the Specs schema — per-style-key disposition, ordered case tables for jointly resolved keys, and declared degradation',
  REACT: 'What the React binding adds to the CSS binding — platform surfaces and style overrides',
  WEBCOMPONENTS: 'What the Web Components binding adds to the CSS binding — platform surfaces and style overrides',
  INDEX: 'How each platform realises the Specs document format — the binding concept, the four platforms, and where the data lives',
};

export const clusterPageDescription = (platformTitle, clusterName) =>
  `How the ${platformTitle} binding resolves the ${clusterName} cluster — its operand set and ordered case table`;

export const fallbackPageDescription = (title) => `How the ${title} binding realises the Specs schema`;
