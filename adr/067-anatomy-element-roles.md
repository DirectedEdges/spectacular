# ADR 067: Element Behavior Roles via `anatomy.role`

**Branch**: `feat/react-from-figma`
**Created**: 2026-08-08
**Status**: ACCEPTED
**Deciders**: Nathan Curtis (author)
**Summary**: A `role` field on an anatomy element records the interaction semantic that element carries, read from Figma Dev Mode annotations, so transforms emit each platform's native control instead of a styled container.
**Supersedes**: *(none; companion to ADR 055)*

---

## Amendment (2026-09-11): `settings.spec.roles` is the feature's on-switch

The Decision below declares `roleValidation` "beside `roles`" without ever
declaring `roles` itself. The implementation needed it: reading Dev Mode
annotations is work the generator must be told to do, and a spec whose roles
came from annotations nobody asked for would carry behavior the workspace never
opted into.

`Settings.spec.roles` gates the whole feature — annotation reading and
`role`/`actions` emission both. It is a run choice, not a library fact, which
is why it is a setting rather than a convention.

| Surface | Change | Semver |
|---|---|---|
| `types/Settings.ts` | Add optional field `roles?: boolean` to `Settings.spec` (default `false`), required on `ResolvedSettings.spec`, `false` in `DEFAULT_SETTINGS` | MINOR |
| `schema/settings.schema.json` | Add `roles` to the `spec` block (`boolean`, `default: false`) | MINOR |

Absence preserves pre-role behavior: nothing is read, nothing is emitted.

---

## Context

ADR 055 (state classification, now `states` in `conventions/specs.yaml`) lets a library deterministically classify variant props as semantic state concepts (`disabled`, `checked`, `expanded`). Downstream transforms consume that classification — but only at the *prop* level. Nothing in the spec identifies *which element carries the platform behavior*, so the `react` transform has no basis for emitting a `<button>`, injecting a native `<input>`, or wiring a `<label htmlFor>`. Every interactive component scaffolds as `div` + ARIA veneer:

- A button renders `<div aria-disabled>` — no `<button>`, no native `disabled`, no `onClick`, no focus or keyboard behavior
- A checkbox renders no `<input>` at all, bridges its selected state to `aria-selected` (a listbox-option attribute, incorrect for a checkbox), and leaves its label and error-message subcomponents unassociated

Figma has no first-class concept of interactive semantics — a checkbox control and a decorative square are the same node type. The library must supply the signal through convention, the way `glyphNamePattern` and subcomponent `match` patterns already engrain library conventions into the generated spec.

This ADR defines the **mechanism** for the whole feature: the spec field the signal lands in, the Dev Mode annotation that generates it, the variant rules that resolve it, and the prop-level bindings that role emission depends on. **Concept vocabularies are out of scope** and are defined by ADR 086 (interactive roots and announcements — non-structural, sequence first) and ADR 068 (form controls and field plumbing — structural).

### The signal is not inferable

Three components in the validation library share the same core anatomy — `root`, a `children` container, a leading glyph, and a `label` text element — differing only in decorative additions (one adds a trailing glyph; one splits its label into a label/description pair). They require three different root semantics: a plain pill (no interaction), a selection pill (a checkbox), and a toggle button (`aria-pressed`).

No structural analysis separates them, and no name heuristic does either: three components in this library whose names all end in the same suffix split across two different roles, while the components that *do* share a role share no naming pattern. The role is an **authored fact** that must be carried in the spec.

---

## Decision Drivers

- **Additive only**: MINOR bump; no existing configs or specs break
- **Types and schema in sync**: every new type field has a schema counterpart
- **No runtime logic in this package**: type declarations and schema only
- **Deterministic, not heuristic**: transforms read spec fields and config classifications; they never re-interpret raw Figma layer names, guess from component names, or match prop names by convention
- **Generated output stays generated**: `api.yaml` is never hand-edited. Facts Figma can express arrive through generation; facts it cannot express arrive through a separate authored surface, merged when transforms read the spec
- **Platform-neutral semantics**: role tokens name interaction concepts, not web markup — each platform transformer binds a concept to its own idiom
- **Code-only-props boundary**: the code-only-props hidden frame is a surface for literal props only — it is not an authoring surface for roles or other annotations
- **Convention precedent**: the Figma channel reuses the existing configurable-pattern machinery (`glyphNamePattern`, `codeOnlyPropsPattern` style), not a new mechanism
- **BEM stability**: applying a role must not change the element's name, class, or `data-element` identity
- **Transform modularity**: the signal's shape must let per-concept behavior live in declarative rows, not in branches threaded through the emitters (see Consequences)

---

## Options Considered

Four independent decisions are in scope. Each is evaluated separately below.

## Decision 1 — Where the element role signal lives in the schema

### Option 1A: `role` field on `AnatomyElement` *(Selected)*

Add `role?: string` alongside `type`, `detectedIn`, and `instanceOf`.

**Pros**:

- The role is a per-element structural fact of one component — it belongs on the element it describes
- Transforms read one path (`anatomy.<element>.role`) regardless of which authoring channel supplied the value
- Additive optional field — MINOR, no existing spec breaks

**Cons / Trade-offs**:

- Anatomy gains a field that generation cannot always populate (roots), so transforms must merge a second source (Decision 3)

---

### Option 1B: Workspace-config role map for elements, mirroring the state classification *(Rejected)*

A `roles` block in workspace config mapping component/element paths to element roles.

**Rejected because**: `states` works as workspace config because prop names (`disabled`, `state`) are library-wide conventions — one declaration covers every component. **Element** roles are per-component, per-element facts (a checkbox's `control` is a checkbox; an alert's `control` would not be). A workspace map would grow one entry per component element, duplicate the anatomy structure outside the spec, and strand the fact away from the artifact that transforms consume.

Note that this reasoning applies specifically to *element* roles. Genuinely library-wide **prop-level** conventions are a different matter and are taken up in Decision 4, where config is the right home for exactly the reason `states` is.

---

### Option 1C: A parallel top-level `roles` block inside `api.yaml` *(Rejected)*

A component-level `roles: { control: checkbox }` map beside `anatomy` and `props`, **inside the generated spec**.

**Rejected because**: within a single generated file, a second structure keyed by anatomy's element keys can drift out of sync with anatomy itself and gives transforms two places to look for one element's facts. Nothing about a role justifies separating it from the element it describes *in the same document*.

This objection is scoped to the generated file. Roles arrive during generation from Dev Mode annotations (Decision 2), so there is no separate authoring channel and no merge — transforms read one path, `anatomy.<element>.role`, populated the same way every other generated field is.

---

## Decision 2 — How a role reaches the spec

Every role — on a component root and on an inner layer alike — has to travel from the Figma
file into `api.yaml` through a surface both runtimes can read. The CLI generates from the
REST API and the plugin generates from the Plugin API, so any surface only one of them can
see splits the pipeline.

### Option 2A: Dev Mode annotations *(Selected)*

`specs generate` reads `node.annotations` and parses recognized `key:value` lines out of
each annotation's `label`.

Verified against a real library file — a component annotated in Dev Mode, then fetched
through both runtimes:

| Field | Plugin API | REST API |
|---|---|---|
| `label` | present | **present** |
| `labelMarkdown` | present | absent |
| `categoryId` | present | **absent** |
| multiple annotations per node | yes | **yes, in order** |
| `\n` inside a label | yes | **yes** |

**Pros**:

- **It is the only surface that reaches a component node.** `ComponentNode` extends
  `DefaultFrameMixin` → `BaseFrameMixin` → `AnnotationsMixin`, so roots and inner layers use
  one mechanism. This is what removes the need for a separate authored surface entirely
- **Layer names are untouched.** No delimiter to reserve, no stripping step, no risk to BEM
  classes, `data-element` values, or CSS selector continuity — the whole class of collision
  and key-formatting problems the layer-name form created simply does not arise
- **Nothing leaks into the published library.** A role is invisible in the assets panel,
  unlike a name suffix
- Designers annotate in Dev Mode, which is already where component behavior is documented
  for engineers
- Several annotations per node, and several lines per annotation, so one node can carry a
  role and its prop bindings without a second convention

**Cons / Trade-offs**:

- **The category cannot carry meaning.** REST omits `categoryId` entirely, so a custom
  category such as `Specs.role` is invisible to the CLI. A label reading only `button` is
  indistinguishable from a designer's prose. The label must therefore be self-describing —
  `role:button`, not `button` — and the category stays useful for authoring ergonomics
  (grouping and colour in Dev Mode) while being ignored by the pipeline
- **`labelMarkdown` must not be read.** It exists in the plugin and not in REST, so code
  reading it would work in one runtime and silently find nothing in the other
- Annotations are a Dev Mode surface, so a file without Dev Mode access cannot author roles
- Parsing prose is inherent: annotations are free text, and the grammar has to ignore
  everything it does not recognize

---

### Option 2B: Configurable layer-name annotation *(Rejected)*

`specs generate` populates `role` from a layer-name annotation matching a configurable
pattern (`processing.roleNamePattern`, e.g. `{name}#{role}`): layer `control#checkbox` →
element `control`, `role: checkbox`, with the annotation stripped before key formatting.
**This option was selected in an earlier revision of this ADR and is superseded.**

- Mirrors `glyphNamePattern` / `codeOnlyPropsPattern`, and needs no Dev Mode access
- **But it cannot reach a component root.** A component set's variant names encode prop
  values, and suffixing the set's own name publishes the suffix into the library assets
  panel. This is what forced the sidecar in the first place, and it is the whole reason the
  earlier design needed two authoring surfaces instead of one
- The delimiter must be reserved library-wide, and a library already using it must
  reconfigure
- Renaming to annotate makes element keys a function of role authoring, which collides with
  the key-stability problems recorded below
- Requires library write access to rename layers, which locked libraries do not have

---

### Option 2C: Hard-reserved bare layer names (`input`, `label`, `button`) *(Rejected)*

Designers rename layers to exact reserved words; the generator recognizes them.

**Rejected because**: collides with innocent existing layer names (`label`, `background`,
`children` are ubiquitous), so regeneration changes behavior silently. The layer name *is*
the element name, so adopting a role renames the element and breaks BEM, `data-element`, and
CSS selector continuity. The reserved set is undiscoverable and unconfigurable, and a bare
token carries no marker separating element naming from role assignment.

---

### Option 2D: Role annotations inside the code-only-props hidden frame *(Rejected)*

A hidden layer such as `root#button` in the frame named by `codeOnlyPropsPattern` assigns
roles to named anatomy elements — including roots.

**Rejected because**: the code-only-props frame is a surface for **literal props** — layers
there become props on the contract. Overloading it gives one convention two unrelated
meanings, and the validation library shows the hazard concretely: its pipeline machinery
keys (`codeOnlyProps`, `childrenMinitems`) appear in anatomy and are emitted as real DOM.

---

### Option 2E: Figma component description or plugin data *(Rejected)*

Encode roles in the component's description field or in plugin-private node data.

**Rejected because**: descriptions are prose surfaces libraries publish to consumers, so
structured data there is visible to consumers and easily broken by editing. Plugin data is
unavailable to the REST runtime entirely, which would make role detection runtime-dependent
— the same parity failure that rules out `labelMarkdown` and `categoryId` within Option 2A.

---

## Decision 3 — Which node carries a role, and how variants resolve

A component set is a matrix of variants, each a separate `COMPONENT` node with its own
layer tree. A role describes a layer, and layers belong to variants, so the ADR has to say
which variant an author annotates and what happens when several disagree.

An earlier revision answered a different question here — it introduced a per-component
authored sidecar file, because layer-name annotation could not reach a component root.
Dev Mode annotations reach the root directly, so **the sidecar is deleted** and this
decision covers placement instead.

### Option 3A: Annotate on the component node or below, default variant first *(Selected)*

Roles are annotated on a `COMPONENT` node or any layer inside it. Authors annotate the
**default variant**; where a layer does not exist in the default variant, they annotate a
variant where it does appear. **Annotate once.** Where the same element is annotated on two
or more variants, the **first variant wins** in component-set child order.

**Pros**:

- **One surface for every role**, root and part alike, with no authored file and no merge
  step in the read path
- **Matches how a component set is actually structured.** A set carries no layer tree of its
  own, so it has nothing layer-specific to annotate; the variants hold the layers
- "Annotate once" keeps authoring proportional to the component rather than to its variant
  count — a set with forty variants still takes one annotation per role
- First-variant-wins is deterministic and needs no tie-breaking heuristic. Component-set
  child order is stable in both runtimes, and the default variant is the first child, so the
  rule and the recommended practice agree by construction
- The fallback rule handles conditional layers honestly: an error message that appears only
  in the invalid variant is annotated there, and nothing forces the author to manufacture a
  default-variant instance of it

**Cons / Trade-offs**:

- A duplicate annotation on a later variant is silently ignored rather than reported. This
  is a deliberate consequence of first-wins: the alternative is an error on a file state
  that is easy to reach by copy-pasting a variant, and the surviving value is the one the
  author most likely intended
- Reading roles means walking every variant rather than one, since a role may legitimately
  live on any of them

---

### Option 3B: Per-component authored sidecar file *(Rejected)*

A small authored file beside the component's generated output (e.g. `roles.yaml`), merged
over the generated spec at read time. **This option was selected in an earlier revision and
is superseded.**

- Kept `api.yaml` purely generated, and colocated authored signal with its component
- **But its entire justification was that layer names cannot reach a component root.** Dev
  Mode annotations can, so the sidecar now buys nothing and costs a file per interactive
  component, a merge step in every transform, and a second place to look when a role is
  wrong
- Splitting one concept across two surfaces means an author has to know which signals are
  "Figma-expressible" before knowing where to write them

---

### Option 3C: Annotate the component set *(Rejected)*

Put roles on the `COMPONENT_SET` node, so there is exactly one place per component.

**Rejected because**: a component set has no layer tree of its own. It could carry a root
role, but not a single part role — and parts are most of the vocabulary. Supporting it would
mean roots resolve from one node and parts from another, which is the two-surface split this
decision exists to remove. A set-level annotation is therefore ignored, and the transform
warns naming the set.

---

### Option 3D: Require annotation on every variant *(Rejected)*

Treat each variant independently, with no inheritance.

**Rejected because**: authoring cost scales with the variant matrix, which is routinely
dozens of variants for one component. It also makes partial annotation — the overwhelmingly
likely file state — mean something specific and wrong, where a role would apply to some
variants and not others for reasons no one intended.

---

## Decision 4 — Prop-level bindings that role emission requires

Part roles answer every *element*-shaped question — which element is the value, which is the placeholder. They cannot answer questions about props that no element carries:

- **Which prop supplies the accessible name?** Nearly every interactive component in the validation library carries an accessibility-label code-only prop, and several components have no other name source at all — a favorite-button whose entire body is two stacked glyphs, and a toggle button whose "custom content" variant erases its label subtree. There is no element to annotate; the name exists only as a prop
- **Which prop forces an indeterminate presentation?** The validation library's progress bar declares a boolean of exactly this kind and no value prop at all — again, a prop with no element

Without these, transforms fall back to matching prop names — the exact heuristic guessing ADR 055 exists to eliminate, and the vocabulary's output becomes a library of correctly-roled, **unnamed** controls, which is worse than today's honest `div`s.

- **Which prop supplies a value that no element represents?** A progress bar draws its progress as a filled bar, not as a text element — there is no element to annotate as the `value` part, and the number exists only as a prop

**Scope discipline**: a prop convention covers facts that live in props and nowhere else. Anything an element can carry is a part role. An earlier draft put `placeholder` here; part roles supersede it entirely, because a placeholder is always a text element in components that have one.

`value` is the one entry that lives in both worlds, and the precedence is explicit: **a `value` part wins where one exists; `value.prop` is the fallback for controls whose value has no element.** Text controls use the part; progress bars use the prop. Both are declarations, neither is a guess.

This also makes **code-only props a first-class semantic surface** without changing what the code-only-props frame means. The frame keeps its single meaning — literal props — while the spec conventions classify which of those props carries the accessible name or the value. A library can therefore author real semantic payload with one hidden layer in a frame it already has, rather than restructuring its components.

### Option 4A: Spec conventions for the library, annotations for exceptions *(Selected)*

A `props` block in `conventions/specs.yaml` declares the library-wide prop conventions,
beside `states` which answers the same shape of question. A component that deviates
overrides it with an annotation on its component node, using the same `key:value` grammar as
roles.

These are conventions about the **spec**, not about a platform: they name a prop that exists
in `api.yaml`, and a transform reading only the spec can apply them. See ADR 073 for why they
sit beside `platforms` rather than inside it.

```yaml
# conventions/specs.yaml
accessibility:
  label:
    prop: a11yLabel
```

```
# annotation on the component node, for a component that deviates
role:progressbar
indeterminate:isLooping
```

**Pros**:

- Library-wide prop-name conventions genuinely are library-wide — one declaration covers
  every component, which is the same argument that puts `states` in config
- Exceptions land on the component they describe, in the surface that already carries its
  role, so there is no third place to look and no authored file to merge
- The precedence model is the one the workspace already understands: config default,
  per-component override
- Removes prop-name matching from every vocabulary ADR at once

**Cons / Trade-offs**:

- Two surfaces for one concept, so an author reading only the config can be surprised by a
  component that overrides it. The diagnostic for an unmet obligation names the resolved
  binding to make this visible
- The library-wide and per-component halves of one concept live in two files, split by
  scope. The precedence rule (annotation wins) is what keeps that legible

---

### Option 4B: Annotations only, no config block *(Rejected)*

Every prop binding is annotated on the component node it applies to.

**Rejected because**: it discards the fact that these *are* conventions. A library that
names its accessibility-label prop `a11yLabel` on two hundred components would annotate the
same binding two hundred times, and a convention change becomes a two-hundred-component
edit. It also puts the highest-frequency, least-varying signal in the surface with the
highest authoring cost.

---

### Option 4C: Config only, no per-component override *(Rejected)*

Declare bindings library-wide and require components to conform.

**Rejected because**: the components that most need these bindings are the irregular ones.
The validation library's progress bar declares a boolean forcing indeterminate presentation
and no value prop at all — a shape no library-wide convention describes. Without an
override, such a component either goes unbound or the convention is bent around a single
case.

---

### Option 4D: A `role` on props, mirroring `role` on anatomy elements *(Rejected)*

Add `role?: string` to prop definitions in `api.yaml`.

**Rejected because**: `api.yaml`'s `props` block is generated from Figma variant and
code-only-prop data, so the value would still have to come from an annotation or an authored
file — this option adds a schema field without answering where the signal originates. It
also puts prop bindings in a different place from element roles, when both now arrive
through one mechanism.

---

## Decision 5 — How a role reports that something it depends on is missing

Several concepts only work when something else is also present. A `disclosure` needs a
region to control. A `checkbox` needs a source for its accessible name. A `togglebutton`
that flips its own state needs a binding telling it which prop holds that state.

All three ADRs already say so, in four scattered prose sentences with no shared mechanism.
Nothing declares the full set, nothing gives the diagnostics a common shape, and an author
has no way to learn what a concept expects short of reading three documents. This section
decides how that is modeled.

### Option 5A: Each concept declares named obligations, each satisfiable several ways *(Selected)*

A concept declares a set of **obligations** — named questions that must be answerable
before the concept emits correctly, such as "how does this control get its name?" Each
obligation carries a **level** and a list of **satisfiers**: anything that counts as an
answer. Any one satisfier discharges the obligation.

Satisfiers are deliberately heterogeneous, because the answers genuinely come from
different places:

| Satisfier kind | Example |
|---|---|
| A part role resolved to this control | a `label` element |
| A prop convention | `accessibility.label` in `conventions/specs.yaml` |
| A state classification from `states` | the `checked` entry |
| An existing variant prop | a `value` prop the library already declares |

- **It matches how the requirements actually work.** The most important obligation — that a
  control has a name — has three satisfiers, and only one of them is an annotation. The
  other two are config entries in a different file
- **Adding a new way to satisfy a requirement is a one-line change** to one satisfier list,
  rather than an edit to every rule that mentions the requirement
- **It gives diagnostics a common shape.** A message names the obligation, the control, and
  every way to discharge it — which is the actual payoff, and what four prose sentences
  cannot provide
- **It composes with the MUST / SHOULD / COULD levels already used for contract handlers**,
  so the vocabulary has one severity spectrum rather than two
- The cost is a table per concept rather than a sentence per special case, which is more
  specification to write and to keep current

### Option 5B: A dependency graph over role annotations *(Rejected)*

Declare edges between concepts — `checkbox` requires `label`, `disclosure` requires
`panel` — and validate the annotation set against the graph.

- Simple to state, simple to implement, and easy to visualize
- **But it can only see annotations, and the requirements are not all annotations.** An
  icon-only button names itself through `accessibility.label`, which is a convention
  in a different file. A graph over annotations would report that correctly-named control
  as broken, and the false positive would land on exactly the components this feature exists
  to improve
- The obvious repair — adding config entries as graph nodes — turns the graph into an
  obligation list with extra steps, and loses the "any one of these" semantics that makes
  the list readable
- Edges also cannot express level. `panel` missing from a `disclosure` and a name missing
  from a `checkbox` are not the same severity, and a graph has no natural place to say so

### Option 5C: Keep per-concept prose in each vocabulary ADR *(Rejected)*

The status quo: each concept describes its own warnings where it is defined.

- No new mechanism, and each rule sits next to the concept it constrains, which reads well
- But the rules are unenumerable — an author cannot get the list without reading every
  vocabulary ADR, and neither can a reviewer checking whether a component is fully annotated
- Diagnostics drift in wording and severity because nothing holds them to a shape
- It scales badly: every future vocabulary adds more scattered sentences, and the pattern
  is already hard to see at four

### Option 5D: Fail the build on any unmet obligation *(Rejected)*

Treat every unmet obligation as an error rather than deciding severity per obligation.

- Unambiguous, and guarantees no half-annotated component reaches a consumer
- **But the transform frequently cannot distinguish a mistake from a composition.** ADR 067
  rule 3 explicitly permits a part and its control to live in different components, so a
  `disclosure` whose panel arrives from a consuming component is correct and unfixable from
  where the error would be raised
- A hard failure on one component blocks a whole-catalog run, and the safe degradation —
  behaving as the pipeline does today — is always available
- Teams adopting roles incrementally would be unable to run the transform at all until every
  component was fully annotated

**Severity is therefore configurable rather than fixed.** `settings.spec.roleValidation`
accepts `'warn'` (the default) or `'error'`, letting a team escalate once its library is
fully annotated and its CI should hold the line. Conflicts remain errors regardless of the
setting, because they are unambiguous: two elements claiming one part, or two value-bearing
controls in one component.

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `types/Anatomy.ts` | Add exported type alias `RoleConceptName` (open string; documents the naming scheme) | MINOR |
| `types/Anatomy.ts` | Add optional field `role?: RoleConceptName \| RoleConceptName[]` to `AnatomyElement` (rule 5: several concepts may share an element) | MINOR |
| `types/Conventions.ts` | Add `SpecsConventions` (`states`, `accessibility.label`, `value` — no grouping wrapper; ADR 073 Option 4A), and `Conventions.specs` beside `platforms` and `primitives` | MINOR |
| `types/Conventions.ts` | Add `PropReference` (`{ prop: string }`) and `ValueConvention` (`{ prop, indeterminate? }`), so a prop convention can grow fields | MINOR |
| `types/Conventions.ts` | Move `states` off `PlatformConventions` — it names a spec prop, not a Figma fact | MINOR |
| `types/Settings.ts` | Add optional field `roleValidation?: 'warn' \| 'error'` to `Settings.spec` (default `'warn'`), beside `roles` | MINOR |
| `types/index.ts` | Export `RoleConceptName`, `SpecsConventions`, `PropReference`, `ValueConvention` | MINOR |

**Example — new shape** (`types/Anatomy.ts`):

```yaml
# Before
AnatomyElement:
  type: ElementType | ElementTypeRef
  detectedIn?: string
  instanceOf?: string | SubcomponentRef
  $extensions?: AnatomyElementExtensions

# After
AnatomyElement:
  type: ElementType | ElementTypeRef
  detectedIn?: string
  instanceOf?: string | SubcomponentRef
  $extensions?: AnatomyElementExtensions
  role?: RoleConceptName | RoleConceptName[]   # optional — MINOR
```

`RoleConceptName` is an open `string` alias (matching the ADR 055 approach for `StateConceptName` keys): the recognized vocabulary is documented on the alias and grown by vocabulary ADRs without schema version bumps. Unrecognized role values are ignored by transforms — safe fall-through to current behavior.

**Naming scheme** (documented on the alias):

- Concept names are single flat lowercase alphanumeric tokens — no hyphens, underscores, dots, or internal casing (`checkbox`, `errormessage`, `togglebutton`), following the WAI-ARIA token *spelling* (`tabpanel`, `menuitem`, `aria-errormessage`). The spelling is shared across the vocabulary; the origin of individual tokens is not, and matters less than it appears — see **Role provenance** below
- **Format-invariant by construction**: role values are field values, never keys, so `format.keys` does not rewrite them — and the token style contains no word separator that any key format (`CAMEL`, `KEBAB`, `SNAKE`, …) could express differently. A role reads identically in every workspace, and the `{role}` portion of a layer annotation is canonical regardless of how the `{name}` portion is key-formatted. (`StateConceptName` predates this rule and keeps its kebab keys, e.g. `focus-within` — those are config keys, never emitted into specs.)
- **Platform-neutral**: tokens name interaction semantics, not web markup. WAI-ARIA supplies the vocabulary because it is the most standardized taxonomy of interaction roles available; the same concepts bind to each platform's idiom (web `<input type="checkbox">`, SwiftUI `Toggle`, Compose `Checkbox` with `Role.Checkbox`). Per-platform bindings live in each transform, exactly as ADR 055's CSS selectors are the web binding of state concepts
- Concept names take the WAI-ARIA role token where one exists (`checkbox`, `slider`, `spinbutton`, `progressbar`), the HTML element name otherwise (`textarea`, `label`, `legend`), and a plain or smashed leaf term only as a last resort (`password`, `togglebutton`)
- The vocabulary is a closed, durable set of leaf terms with no hierarchy — it grows only by vocabulary ADR, and transforms ignore unrecognized values, so there is no partial-recognition fallback to design for
- **Part role names are bare and scoped by position, not prefixed.** A text element inside a text control is annotated `role:placeholder`, never `role:inputPlaceholder`. Prefixing would produce a cross-product of every control concept against every part; bare names keep the set small and closed, and the ancestor supplies the disambiguation

### Role provenance, and why it matters less than it appears

The vocabulary's tokens are borrowed from several places. It is tempting to organize the
whole feature around that fact, and doing so produces a web-centric reading of a
cross-platform mechanism. Two separate questions get conflated:

- **Where a name came from.** Trivia, with exactly one consequence, and that consequence
  is confined to the web transform.
- **Whether the concept exists on a platform.** The question that matters, and one whose
  answer is mostly "yes, on all three."

Origin does not predict reach. `password` is an HTML-derived name for a concept every
platform has. `switch` is an ARIA name for a concept every platform has. Each vocabulary
ADR carries a **Reach** column stating how far its concepts travel; that column, not this
one, is what a transform author plans against.

**Name origin:**

| Origin | Concepts |
|---|---|
| WAI-ARIA role tokens | `button`, `link`, `checkbox`, `radio`, `switch`, `textbox`, `searchbox`, `spinbutton`, `slider`, `group`, `alert`, `status`, `progressbar` |
| ARIA attributes | `errormessage`, `description` |
| ARIA Authoring Practices patterns | `togglebutton`, `disclosure` |
| HTML elements | `textarea`, `password`, `label` |
| Spectacular-native, no external counterpart | `value`, `placeholder`, `indicator`, `panel`, `increment`, `decrement` |

**The one consequence, and it is a web-transform rule.** Never emit `role="<concept>"` by
pattern. Only the first row contains legal ARIA role values — `role="disclosure"`,
`role="password"`, and `role="togglebutton"` are invalid, are discarded by assistive
technology, and leave the element with *no* semantics rather than approximate ones. This is
why every vocabulary ADR states each concept's web emission explicitly instead of deriving
it from the name.

**For the iOS and Android transforms this section is inert.** Neither platform has a notion
of a role string to emit, so neither can make the error the rule guards against. They bind
concepts to native types, and their reference is the Reach column.

The naming scheme itself is a spelling convention and nothing more: single flat lowercase
alphanumeric tokens, chosen because that style is already familiar from ARIA and reads
consistently regardless of which platform a transform targets.

### Control roles and part roles

A role does not have to describe a whole control. The vocabulary has two kinds of concept, distinguished by how they resolve rather than by how they are spelled:

- **Control roles** name a control, a landmark, or an announcement region (`checkbox`, `button`, `textbox`, `alert`). They resolve on their own.
- **Part roles** name a constituent of some control (`placeholder`, `value`, `trigger`, `panel`, `indicator`). They resolve **by component**, under the numbered rules below — not by tree position — and each vocabulary ADR declares which parts its control concepts accept.

This is what lets one control be described by several annotations rather than by one key that the transform must then reverse-engineer. A text control's value element says it is the value; its placeholder element says it is the placeholder. Nothing has to be inferred from prop names, bindings, or position.

**Resolution is by component, not by tree position.** An earlier draft resolved parts to the "nearest ancestor control role in the merged anatomy tree." That rule cannot be implemented as stated and would not work if it could:

- `anatomy` is a **flat map**. The parent/child tree exists only in `variants.yaml`, per variant, and those trees reorder, drop, and reparent elements between variants. There is no single merged tree to resolve against, and manufacturing one is ill-defined precisely where it matters
- It fails on the ordinary case. Where a control role sits on an inner element, that control's label and error message are typically **siblings** of it under a different wrapper, not descendants — so they would have no controlling ancestor at all
- It is fragile in the way libraries actually build: one extra wrapper level between a part and its control breaks resolution with no recourse

The rule instead leans on a guarantee the vocabulary already provides — that a component has **at most one value-bearing control** (ADR 068):

1. **A part accepted by a value-bearing control concept resolves to that component's single value-bearing control**, wherever either element sits in the layout. No tree walk, no ancestry, no per-variant ambiguity.
2. **A part accepted only by non-value-bearing concepts** (`button`, `togglebutton`, `link`, `disclosure`) resolves by proximity, because a component may have several of these: the candidate whose subtree contains the part, else the candidate that is its closest sibling-path ancestor's child. **Ambiguity is an error naming the part and every candidate** — never a silent pick.
3. **A part with no candidate control in its own component is valid and self-describing.** It declares that the component *provides* that part rather than consuming one — a label component carrying `label`, an error-message component carrying `errormessage`, a group-heading component carrying `legend`. These are among the most reusable primitives in a library, and an earlier rule that ignored them with a warning left them unable to say what they are.

   Such a component emits the part's own semantics — the element (`<label>`, `<legend>`), a generated id — but **no wiring**, because it has no control to wire to. Wiring arrives when it is composed.

   **A part role means two different things depending on the element type it lands on, and the difference is resolvable statically:**

   - On an element the component **owns** (`text`, `container`) it is an **emission** signal: this is where the part's semantic element is emitted
   - On an element of type **`instance`** it is a **routing** signal only: wire this control's id into that instance. It never changes the wrapper's tag. Several may be routed from one instance — see rule 5 — authored as one `role:` line per concept, the same way `action:` lines accumulate. Where a set is annotated across more than one variant, the **first variant wins for the whole set**; a later variant never adds to it, or annotate-once would stop meaning anything

   This dissolves the conflict rather than adjudicating it. **A consumer never emits a part's semantic element for content it does not own**, so two nested `<label>` elements are impossible by construction — there is no precedence rule to apply and no runtime question of who wins. The part element is emitted exactly once, by the component that owns the text.

   The consequence for degradation matters as much as the rule: a component authored before this feature simply ignores the routed id and renders as it does today. Every mixed-generation combination degrades to a *missing association*, never to invalid markup.
4. **A part its resolved control's concept does not accept is ignored with a warning**, listing the parts that concept does accept.

5. **A composed component can contribute at most one routed part to its consumer.** This
   follows from two rules already stated — a part on an `instance` element is a routing
   signal, and an element carries at most one role — but the consequence is easy to miss
   and expensive to discover late.

   The instance element is the only thing the consumer can address. Whatever role it
   carries is the one part that gets wired. Any other part the composed component
   contains is **unwireable from outside**: it emits its own semantics and its own id
   within its own component, and no consumer can reference that id, because there is no
   element on which to say so.

   A label component providing both a `label` and a `description` is the case that
   surfaces this. The consumer annotates the instance `role:label` and wires it; the
   description's id never reaches the consumer's control, and no annotation can make it.

   **`role` therefore accepts an array on an `instance` element.** The consumer names
   every concept it is wiring, and each routes to whichever element of the composed
   component ascribes that concept:

   ```yaml
   # switch/api.yaml — the consumer declares what it wires
   formLabel:
     type: instance
     instanceOf: formLabel
     role: [label, description]
   ```

   ```yaml
   # formLabel/api.yaml — the provider declares what it is
   label:
     type: text
     role: label
   description:
     type: text
     role: description
   requiredAsterisk:
     type: text
     role: indicator
   ```

   Two declarations that must agree, which is what distinguishes this from the consumer
   reading its child's spec. The consumer asserts; the provider declares; a claim the
   provider does not ascribe is an **error naming the concept and the composed
   component**. Resolution needs no cross-spec read — the consumer has said everything —
   and the agreement check is a validation step, not a resolution input.

   The consumer never names the provider's element keys, only concepts, so renaming an
   element inside the provider breaks nothing. Where a provider ascribes one concept to
   two elements, rule 2's ambiguity error applies unchanged.

   `indicator` and other self-contained parts are not listed. They emit their own
   semantics inside the provider and need nothing routed; naming them would suggest the
   consumer wires them.
5. **At most one element per part role per control.** Two elements both claiming `value` for the same control is an error naming both.
6. Part roles obey the same one-role-per-element rule as everything else. An element that is both a part of one control and a control in its own right is two elements.

Rule 2 is the only rule that consults layout, and it consults it exactly where the flat map is insufficient — distinguishing which of several buttons a label belongs to. Everything else resolves from `api.yaml` alone.

Part roles are ordinary `RoleConceptName` values in the same open string field — no schema distinction, no second mechanism. The distinction lives entirely in the role table's rows.

The prop conventions take the opposite approach: **named fields** on `SpecsConventions` (`accessibility.label`, `value`) rather than an open concept string, because the set is small and each convention carries its own shape. They are config keys, never values emitted into a spec.

### What a part role actually contributes

Parts are read as though each one adds behavior to the element it lands on. Overwhelmingly
it does not. **Eight of the ten part concepts contribute no event handler at all**, and a
part's value is almost always *id generation on its own element plus an attribute on a
different element* — the control it resolved to.

| Part | Its own element gains | The control gains | Handler |
|---|---|---|---|
| `label` | `<label htmlFor>` | its accessible name | none |
| `value` | *(consumed by collapse)* | its `value` | none |
| `placeholder` | *(consumed by collapse)* | its `placeholder` | none |
| `description` | a generated `id` | `aria-describedby` | none |
| `errormessage` | a generated `id` | `aria-describedby` | none |
| `panel` | a generated `id` | `aria-controls` | none |
| `indicator` | `aria-hidden="true"` | nothing | none |
| `legend` | `<legend>` | its accessible name | none |
| `increment` | `<button>` | nothing | `stepUp()` on the control's ref |
| `decrement` | `<button>` | nothing | `stepDown()` on the control's ref |

Only `increment` and `decrement` carry handlers, and both delegate to the control rather
than owning state. The wiring — not the behavior — is what part roles are for, and stating
that plainly removes most of the ambiguity readers have reported about what a part does.

### Roles and the states config

`anatomy.role` and `states` are **independent authoring inputs**. Either may
exist without the other, neither supersedes the other, and the role feature must not gate
or disable existing states behavior.

They answer different questions, and neither answer is derivable from the other:

| Input | Answers |
|---|---|
| `states` | *Which variant prop carries this concept?* |
| `anatomy.role` | *What mechanism is available to express it?* |

A states classification with no role behaves exactly as it does today. A role with no
states classification still emits its own element, semantics, and contract additions. The
states config cannot know that an element will become a native control; the role cannot
know that a library spells its disabled state `isDisabled`.

**Precedence — emit once.** Where both apply to the same concept on the same element, the
concept is emitted a single time: the **role decides the mechanism** (native attribute,
ARIA attribute, or `data-*` fallback) and the **states config decides which prop drives
it**. Double emission — a native `disabled` attribute *and* a `data-is-disabled` attribute
for the same prop — is the failure mode to guard against, and it is the only interaction
the two mechanisms have.

**The dependency runs role → states.** A role's *wired* event handlers cannot be generated
without a resolved state binding. A `togglebutton` that flips its own pressed state must be
told which prop holds that state, and only `states` can tell it. Several
concepts are therefore **inert without a states classification**, degrading to a stub
handler and a warning rather than to generated state management. Roles depend on the states
config; they do not replace any part of it.

This also applies to the pointer and focus concepts, where it is easiest to get backwards.
A role makes `:hover` and `:focus-visible` *reachable*, because a container can never enter
those states and a native control always can. Only the states config makes them
*addressable*, by naming which Figma variant prop's styling belongs to each one. Both
inputs are required for those concepts to produce correct CSS, and an earlier draft of this
ADR wrongly claimed the role made the config redundant.

### Role obligations

An **obligation** is a named question a concept must be able to answer before it emits
correctly. Each obligation carries a level and a list of satisfiers; **any one satisfier
discharges it**.

**Levels** reuse the spectrum already applied to contract handlers:

| Level | Unmet behavior |
|---|---|
| **required** | Diagnostic at the configured severity. The concept still emits what it can — it never emits invalid markup and never blocks other elements |
| **expected** | Warning. The concept emits in a knowingly degraded form |
| **optional** | Silent. Recorded so the table is complete and so a future level change has somewhere to land |

**The obligation set**, across all three vocabularies:

| Obligation | Declared by | Level | Satisfied by any of |
|---|---|---|---|
| `name` | every control concept | required | a `label` part resolved to this control; `accessibility.label`; for `group`, a `label` part emitted as `<legend>` |
| `value` | value-bearing controls using `collapse` (`textbox`, `password`, `searchbox`, `textarea`, `spinbutton`, `slider`) | required | a `value` part; an existing variant prop bound as the value; `value.prop` |
| `checkedstate` | `checkbox`, `radio`, `switch` | expected | a `checked` classification in `states` |
| `pressedstate` | `togglebutton` | expected | a `pressed` classification in `states` |
| `expandedstate` | `disclosure` | expected | an `expanded` classification in `states` |
| `panel` | `disclosure` | expected | a `panel` part resolved to this control |
| `membership` | `group` | expected | a slot whose `anyOf` resolves to entries carrying control roles |
| `progressvalue` | `progressbar` | expected | `value.prop`; `value.indeterminate` |
| `steppers` | `spinbutton` | optional | `increment` and `decrement` parts |
| `statelabels` | `togglebutton`, `disclosure` | optional | a prop convention pairing a state concept to an alternate text prop |

Two properties of this table are load-bearing:

**An obligation is not a required annotation.** `name` has three satisfiers and only one is
an annotation; the other two are config entries in a different file. This is why obligations
are modeled as questions with alternative answers rather than as edges between concepts —
an edge-based rule could only see annotations, and would report every correctly-named
icon-only control as broken.

**The state obligations are the same dependency recorded elsewhere in this ADR**, stated
once more in enforceable form. `checkedstate`, `pressedstate`, and `expandedstate` are
exactly the bindings a concept's *wired* contract handlers require. An unmet one is the
documented degradation — a stub handler instead of generated state management — and the
obligation is what makes that degradation reportable rather than silent.

### Diagnostic shape

Every obligation diagnostic names three things, in this order: the **obligation and the
control it belongs to**, the **component and element**, and **every way to discharge it**.
Listing the alternatives is the point of the mechanism — a message that says only "missing
label" sends an author to the wrong fix when the right one is a config entry.

```
warning  checkbox 'root' in components/checkbox has no name source
         satisfy with one of:
           - a `label` role on an element in this component
           - an `accessibility.label` convention
         emitting without an accessible name
```

### Severity

`settings.spec.roleValidation` selects the severity for **required** obligations:

- `'warn'` (default) — a diagnostic, and the transform continues. Absence of the setting
  preserves current behavior
- `'error'` — the transform fails, for teams whose library is fully annotated and whose CI
  should hold the line

**expected** and **optional** obligations are unaffected by this setting; they warn and stay
silent respectively in both modes. The setting exists because the transform frequently
cannot distinguish an author's omission from a legitimate composition — a part and its
control may live in different components — so it must not decide unilaterally that an
unanswered obligation is a mistake.

**Conflicts are errors regardless of the setting**, because they are unambiguous rather than
merely unanswered: two elements claiming one part role for one control, two value-bearing
controls in one component, or a part whose resolution is ambiguous between candidates.

Each vocabulary ADR marks its own parts against this table, and no obligation exists that is
not listed here.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `schema/component.schema.json` | Add `role` property to the anatomy element definition | MINOR |
| `schema/conventions.schema.json` | Add `SpecsConventions` and `PropReference`; add `specs` to `#/definitions/Conventions/properties`; remove `states` from `PlatformConventions` | MINOR |
| `schema/settings.schema.json` | Add `roleValidation` to the `spec` block | MINOR |

**Example — new property** (anatomy element definition):

```yaml
role:
  type: string
  description: "Semantic behavior role for this element (e.g. 'button', 'checkbox', 'label'), generated from a Dev Mode annotation on the component node or one of its layers, of the form role:<concept>. Recognized concept names are defined by role vocabulary ADRs; unrecognized values are ignored by transforms."
  # not in required[] — optional field
```

**Example — the spec conventions block** (`conventions.schema.json`):

```yaml
states:
  description: "Concept-keyed map classifying variant props as semantic states."
accessibility:
  type: object
  properties:
    label:
      $ref: "#/definitions/PropReference"
      description: "The prop supplying an accessible name for a control with no text of its own."
value:
  $ref: "#/definitions/ValueConvention"
  description: "The prop carrying a control's value, and the prop that says that value is unknown."
```

**Config example** (`specs.config.yaml`):

```yaml
# conventions/specs.yaml
accessibility:
  label:
    prop: a11yLabel
```

**Spec example** (`api.yaml` — all `role` values generated from Dev Mode annotations):

```yaml
anatomy:
  root:
    type: container            # from `role:button` on the component node
  control:
    type: container
    role: checkbox             # from `role:checkbox` on the control layer
  formLabel:
    type: instance
    role: label                # from `role:label` on the form-label layer
    instanceOf:
      $ref: "#/subcomponents/formLabel"
  errorMessage:
    type: instance
    role: errormessage         # from `role:errormessage` on the error layer
    instanceOf:
      $ref: "#/subcomponents/errorMessage"
```

### Annotation grammar

An annotation's `label` is free text a designer may also use for prose. The grammar is
therefore additive and ignores everything it does not recognize.

1. **Every annotation on the node is read, in array order.** A node may carry several, and
   order is preserved by both runtimes.
2. **Each `label` is split on newlines.** A single annotation may carry several signals.
3. **A line of the form `key:value` is a candidate signal.** Surrounding whitespace is
   trimmed from both sides; the first colon separates them, so a value may contain colons.
4. **Only recognized keys are consumed.** `role` is defined here; prop-convention keys are
   defined by Decision 4; vocabulary ADRs may define more. An unrecognized key is ignored
   silently, which is what keeps the grammar forward-compatible.
5. **Every other line is prose and is ignored.** This is the common case in an existing
   file and must never produce a diagnostic.
6. **`label` is the only field read.** `labelMarkdown` exists in the Plugin API and not in
   REST, so reading it would work in one runtime and silently fail in the other.
   `categoryId` is likewise plugin-only and carries no meaning — a custom annotation
   category is an authoring convenience, never a signal.
7. **First occurrence wins** where one key appears more than once on a node, across all of
   that node's annotations in order.

A real annotation, and what the grammar takes from it:

```
annotation 2 (no category)     ← prose, ignored
role:button                    ← consumed
propRequired:state             ← consumed if `propRequired` is a recognized key
blah:something else            ← unrecognized key, ignored
```

**A bare value is not a signal.** A label reading only `button` assigns nothing, even when
it sits in a category named for roles, because REST does not carry the category and the
label alone cannot be distinguished from prose.

### Variant resolution rules

Per Decision 3, roles are annotated on a `COMPONENT` node or a layer inside it, and a
component set is a matrix of such nodes.

1. **Annotate the default variant.** The default variant is the component set's first child
   in both runtimes.
2. **Where a layer does not exist in the default variant, annotate a variant where it
   does.** Conditional layers — an error message present only in an invalid state — are
   annotated where they appear.
3. **Annotate once.** One annotation per element per role is the authoring rule.
4. **First variant wins.** Where the same element is annotated on two or more variants, the
   annotation on the earliest variant in component-set child order is used and the others
   are ignored. This is silent rather than a diagnostic: duplicate annotations arise easily
   from copy-pasting a variant, and the surviving value is the one the author intended.
5. **A component set's own annotations are ignored, with a warning naming the set.** A set
   has no layer tree, so it can express a root role but no part role; accepting it would
   split role resolution across two node types.

### Element key stability rules

An annotation assigns a role to an element *key*, and the validation library shows keys are not always one-to-one with layers:

1. **Duplicate keys.** Where one key appears at multiple positions in a layout tree (a collapsed-wrapper artifact), the role applies to **every** occurrence. Authors who need one occurrence roled must disambiguate the layers first. The transform warns when a role lands on a key with multiple layout positions.
2. **Variant-dependent keys.** Where the same conceptual layer surfaces under two keys across variants, each key must be annotated separately, and a component in which only some occurrences carry the role emits a warning naming the un-roled keys. This is a real ergonomic cost of key-based annotation and is accepted rather than solved in v1.
3. **Machinery keys.** Keys produced by pipeline machinery rather than designed layers are never valid role targets; a role landing on one is ignored with a warning.

### Contract composition rules

A role's contract additions can collide with props the component already has. **This is the norm, not the exception**, because the state concepts a role bridges are usually already variant props. The generated scaffold merges component defaults over incoming props, which makes every `api.yaml`-derived prop permanently defined — so a naive `p.checked ?? internalState` uncontrolled pattern can never reach its internal state, and a naive `checked={…}` without a handler produces an inert, warning-emitting control.

The rules, which every vocabulary ADR inherits:

1. **An existing prop becomes the reset signal, not a controlled value.** Where a role's concept (`checked`, `expanded`, `pressed`, `value`) is already carried by a prop the spec declares — directly or via a `states` classification — that prop seeds the control's state and re-seeds it whenever the prop's value changes. **No `default*` companion prop is emitted.** The component is explicitly *not* controlled in the React sense, and the ADRs must not call it that.
2. **The role still contributes the change signal.** The handler prop (`onChange`, `onExpandedChange`, `onPressedChange`) is always added, and is always optional.
3. **Re-seeding happens during render, not in an effect.** The generated pattern is React's documented "adjust state when a prop changes" form — track the previous prop value in state and reset during render when it differs — **not** `useState` plus a `useEffect` sync. The effect form runs after paint, so it produces a visible frame of stale state and an extra committed render on every parent-driven change. The render-time form commits once, with no flicker.

   ```tsx
   const [selected, setSelected] = React.useState(p.selected);
   const [prevSelected, setPrevSelected] = React.useState(p.selected);
   if (p.selected !== prevSelected) {          // render-time reset, no effect
     setPrevSelected(p.selected);
     setSelected(p.selected);
   }
   ```

4. **The parent cannot veto an interaction, and that is a stated limitation.** Because the prop is a reset signal rather than a controlled value, a parent that receives a change and declines to update the prop leaves the component showing the new state — the prop's value did not change, so nothing re-seeds. This is inherent to seeding from a variant prop that the scaffold's defaults merge makes permanently defined, and it is the price of a scaffold that is interactive out of the box. A consumer needing true controlled semantics wraps the scaffold in its own authored component, which is what the authored `src/react/*` seam exists for.
5. **Only where no existing prop carries the concept** does the role emit the full controlled/uncontrolled pair (`value` + `defaultValue`), with standard controlled semantics.
6. **Role-added props are not variant props.** They carry no `examples` and must be excluded from generated story args rather than rendered as controls.

Rules 1, 3, and 4 together are what separate a component that looks correct in an accessibility scan from one that actually responds to interaction without lying about its contract. They are stated here, once, because all three ADRs depend on them.

### Notes

- **No read-time merge**: transforms consume `anatomy.<element>.role` from the generated spec directly. Roles arrive during generation, from Dev Mode annotations, so `api.yaml` stays purely generated and freely regenerable and there is no authored surface to merge.
- **Root-level roles never come from layers.** Component-set variant layer names encode prop values and cannot carry annotations; annotating the component-set name itself would pollute the published asset name in the library.
- **At most one role per element the component owns.** Composite semantics belong to distinct elements (a disclosure trigger and its region are two elements with two roles, and a control's parts are elements of their own). An element of type `instance` is the exception, and not really an exception: a role there is a *routing* signal, and a composed component may provide several parts, so `role` accepts an array. Routing several is not claiming several — the consumer emits none of them.
- **Roles may generate contract surface, but never rendered elements — and the surface is gated on the element existing.** A role that implies content (a description, a helper message) adds its prop and its wiring **only when the component has an element carrying the matching part role**. Where the library designed no such element, the prop is not emitted at all. An earlier draft added the prop unconditionally and rendered nothing; that is a dead prop in a public contract — it type-checks, does nothing, and the only signal is a build warning the consumer never sees. Whether the element exists is knowable per component from the anatomy union, so gating is deterministic. The transform never invents DOM for content the library did not design: generated markup with no design intent has no styling, no place in the anatomy, and no reviewer.
- **The role element is the control; its descendants become its children.** When a role lands on a container in a nested chain, that container is what becomes the emitted control, and everything beneath it renders inside. Validation surfaced a three-deep wrapper chain where the choice of link materially changes the output, so this rule is normative rather than incidental.
- **A role may name an element that some variants omit.** Anatomy is the union across variants, so `detectedIn`-conditional elements can carry roles. Transforms already gate such elements on a render condition; role emission composes with that condition rather than replacing it.
- **Emitted markup must satisfy the target platform's content model.** On the web this matters immediately: `<button>`, `<label>`, and `<legend>` accept phrasing content, while essentially every presentational descendant this pipeline generates is a `<div>`. A vocabulary concept that emits one of those elements must state how descendants are handled — the transform emits them as `<span>` with `display` preserved by the existing styling rather than nesting `<div>`s inside phrasing-content elements.
- **Two roles may coexist in one rendered tree only when they are on different elements in different specs.** An announcement region containing an instance whose own spec carries a `button` role is legitimate. Two specs both claiming the same DOM position — a label component with its own `label` role, wrapped by a consumer that also emits `<label>` — is not, and vocabularies must define which side wins.
- Absence of `role` everywhere is the safe default — transforms behave exactly as today.
- `Conventions.specs` has no default; absence means no prop conventions are declared. `settings.spec.roleValidation` defaults to `'warn'`, so absence preserves current behavior. Annotation reading needs no config — there is no pattern to declare.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `AnatomyElement.role` → `role` property on the anatomy element definition in `component.schema.json` (string, optional)
  - `Conventions.specs` → `#/definitions/Conventions/properties/specs` (`SpecsConventions`, optional)
  - `Settings.spec.roleValidation` → the `spec` block's `roleValidation` (string enum, optional)
  - `RoleConceptName` is documentation-only (an open string), matching the `StateConceptName` precedent — no schema enum. The prop conventions are named fields on `SpecsConventions`, so they need no name type at all

---

## What this changes in the React transform

The mechanism alone changes nothing in emitted code — vocabularies do that. What it changes is the *class of decision the transform can make*. Two illustrations, using concepts from the validation library with identifiers genericized.

### Illustration 1 — the signal separates components structure cannot

Three components share this core anatomy:

```yaml
anatomy:
  root: { type: container }
  children: { type: container }
  startIcon: { type: glyph }
  label: { type: text }
```

One adds a trailing glyph. One splits `label` into a `label` / `description` pair under a wrapper. Those are the *only* structural differences, and neither correlates with semantics. Today all three emit the same shape of scaffold — a `div` with `data-*` variant attributes and, at best, `aria-disabled`.

With one authored root role each, the same anatomy produces three genuinely different components: a static container, a form control that participates in submission, and a pressable toggle. **The role is the only input that could have produced that split** — which is the argument for putting it in the spec rather than deriving it, and the reason Decision 3D is rejected.

### Illustration 2 — the ARIA lands on the right element

Today the transform has exactly one place to put state-derived ARIA: the root, because the root is the only element with an attribute-assembly step. A checkbox therefore emits:

```tsx
<div className="checkbox" data-element="root"
  aria-disabled={p.disabled ? 'true' : undefined}
  aria-invalid={p.validation === "invalid" ? 'true' : undefined}
  aria-selected={p.selected ? 'true' : undefined}
  aria-checked={p.selected === "indeterminate" ? 'mixed' : undefined}>
  <div className="checkbox__control" data-element="control">
```

Two defects follow from the missing role. `aria-selected` is a listbox-option attribute and is simply wrong here. `aria-checked` and `aria-disabled` on a roleless `div` are inert — they describe nothing a browser or assistive technology acts on.

(A third defect is visible above and is **not** a role problem: the value comparisons are case-mismatched against the enum values used elsewhere in the same file, so those bridges are dead code today. That is a pre-existing bug worth fixing on its own, and role work should not be credited with fixing it.)

Once `control` carries `role: checkbox`, the state concepts have a *destination*: the states table's bridges attach to the element that is actually the control, and the root goes back to being a layout container. The states classification does not change at all — ADR 055 already got that right. What changes is that the classification finally has somewhere true to land. Roles are the missing half of that pair: **states classify the props, roles locate the behavior.**

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Populates roles during generation | Read `node.annotations` on component nodes and their layers in both runtimes; parse the annotation grammar; apply the variant resolution and key-stability rules. Layer names are not read or modified |
| `specs-cli` | Transforms gain a deterministic role signal and prop convention bindings | Read `anatomy.<element>.role`; resolve `Conventions.specs` with per-component annotation overrides; emission semantics per role are defined in the vocabulary ADRs. No merge step — roles arrive already generated |
| `specs-plugin-2` | Plugin-driven generation applies the same layer-name detection; may surface roles in UI | Recompile; apply the same detection; optionally display role classification per element |

---

## Semver Decision

**Version bump**: MINOR

**Justification**: The additions are optional fields — `role` on `AnatomyElement`, `Conventions.specs`, and `roleValidation` on `Settings.spec` — plus new exported types. `states` moves from `PlatformConventions` to `Conventions.specs.states`, which is a relocation within an unshipped surface rather than a break to a published one. `roleValidation` defaults to `'warn'`, so absence preserves current behavior. Per constitution III: "MINOR for additive types or new optional fields."

---

## Consequences

### Modularity: where role behavior isolates, and where it will not

The vocabulary ADRs describe emission; this section fixes the *shape* the implementation must take so that role behavior does not accrete as role × element-type × transform conditionals.

**The precedent to mirror.** ADR 055 is implemented as a single static `CONCEPT_TABLE` of declarative rows (one row per state concept), plus a config-driven lookup builder, plus per-consumer interpretation loops. No per-concept branches exist in any emitter. **Roles adopt the same shape**: a `ROLE_TABLE` of declarative rows keyed by concept name, one row per vocabulary entry, interpreted independently by each emitter.

**One wart not to repeat.** The states table stores a single CSS selector string, and the React transformer recovers structured data from it by regex — parsing `[aria-pressed="true"]` back into an attribute/value pair. A role table must carry **structured per-target fields** (emitted tag, composition strategy, attribute bridges, contract additions, wiring references) rather than one string that each consumer re-parses. This is the single most important implementation constraint in this ADR.

**The seams that isolate cleanly:**

1. **No merge point needed.** Roles arrive inside `api.yaml` from generation, so every transformer — including the closed react/stories package — reads them from the spec it already receives, with no interface change on either side and no hook anywhere. An earlier revision needed a merge at the central `api.yaml` read to fold in an authored sidecar; deleting the sidecar deletes that step. Roles deliberately land only in `api.yaml`.

   **One qualification, since an earlier draft overstated this**: part resolution rule 2 consults the layout tree, which lives in `variants.yaml`. That is a *read* inside the role index, not a merge, and it applies only to the non-value-bearing case. The rest of role resolution is `api.yaml` only. The role index is therefore a pure function of anatomy **plus the layout tree it is handed**, not of anatomy alone, and the index's signature should say so rather than pretending otherwise.
2. **Tag selection — one expression.** The React emitter's entire tag decision today is a single ternary: text elements become `span`, everything else becomes `div`. A role-to-tag lookup replaces exactly that expression, with the current ternary as the fallback when no role is present.
3. **Element attribute assembly — one enabling refactor.** Attribute assembly exists only for the root element; non-root elements inline their class and `data-element` into string templates at three separate emission sites. Generalizing the root's attribute assembler into a per-element one — and routing those three sites through it — is contained in one file and is the prerequisite for any per-element role attribute. **This refactor should land before any vocabulary, as its own change.**
4. **Contract augmentation — one merge site.** Role-implied props enter the contract as a pure function of anatomy, the role table, and the spec's prop conventions, merged at the single site where prop entries are assembled — structurally identical to how states already inject omitted-prop knowledge there.
5. **A role index pre-pass — one pure function.** Both vocabularies need to know, before rendering begins, which element carries which role, what generated id each has, and which elements pair with which. One pre-pass over merged anatomy serves disclosure pairing, label/control wiring, and the one-control validation.

**The places that will resist isolation** — named so implementation can plan against them:

- **Structural roles versus the element renderer's branch ordering.** The node renderer is a sequence of position-dependent guards (instance composition, then glyph, then the generic path) sharing closure state. A role that only *substitutes a tag and adds attributes* is a table lookup. A role that changes *structure* cannot be a row; it forces a new branch competing with the existing element-type guards. **This is the soup epicenter.** The mitigation is a stated boundary: rows declare tag, attributes, and contract additions, and structural roles select from an **explicitly enumerated set of composition strategies**, owned by the transform. The strategy set is not specified in any ADR — it is drafted in `projects/018-behavior-conventions/form-control-transform-behavior.md` and settled by the implementation. What matters here is that the set stays enumerated and closed at any given time, so a structural role is a selection rather than a new branch.
- **Role × element type.** The strategies interact with the existing element-type guards, and the interaction is real, not hypothetical: a role landing on a `glyph` element — which today emits a self-closing decorative `<span>` — must produce a different structure than the same role on a container. Every vocabulary must state which element types each of its concepts accepts, and the transform must warn rather than silently mis-emit on the others.
- **DOM position and positional CSS.** Any strategy that *inserts* or *removes* a DOM node shifts every `:nth-child`, adjacent-sibling, general-sibling, and flex/grid auto-placement position in the emitted subtree. Attribute-and-tag roles are genuinely restyle-free; structural ones are not, and no vocabulary may claim otherwise.
- **Cross-spec role coordination.** A label component may carry `label` on its own root while a consumer component wraps an instance of it in a `<label>`. Two specs, one DOM position, two claims. Vocabularies must define precedence; the mechanism cannot.
- **The scaffold's defaults merge.** Every `api.yaml`-derived prop is always defined in the generated component. The contract composition rules above exist to handle this, and every controlled/uncontrolled claim in every vocabulary must be checked against them.
- **Two-repo mirror discipline.** Several shared-vocabulary modules exist twice — once in the open CLI, once in the closed react/stories package — kept in sync only by convention. The role table joins that set the moment both the contract transformer (open) and the React transformer (closed) read it. The mirror *is* the seam, and it should be designed rather than tolerated: the three real options are a generated table, a shared published module, or hoisting the table into the schema package. That choice should be made before the first vocabulary lands.
- **The CSS ↔ ARIA selector coupling.** Because the React transformer derives ARIA from CSS selector strings, a role that changes *which* selector is truthful — a real `<input>` matching `:checked` where a `div` previously matched `[aria-checked]` — silently alters the CSS transformer's selector expansion. That shared string should become structured fields before any state-bridging concept lands.
- **The "contract props equal api.yaml props" equation.** Composition filters props against sets derived from `api.yaml`'s `props` block in several places. Role-implied props exist on the contract but *not* in `api.yaml` — the first props in the system to do so. Handler-typed props are also unprecedented, and the stories emitter enumerates props assuming serializable values.

**Net assessment.** Attribute-and-tag roles map onto seams 1–5 with no new branching and should be implemented first — which is why ADR 086's vocabulary is sequenced ahead of ADR 068's despite its higher number. Structural roles require the composition-strategy set to exist before they are attempted.

### Everything else

- Transforms read behavioral semantics from the spec (merged with the authored surface) — never from raw layer names or prop-name guessing — regardless of which channel authored them
- Designers opt in per element with one annotation; no layer is renamed and no generated file is ever hand-edited
- The generated/authored boundary stays crisp: `api.yaml` is reproducible from Figma data alone, and authored facts live on their own surface with its own diff history
- The code-only-props frame keeps a single meaning: literal props
- Vocabulary ADRs can grow the recognized concept set without schema bumps — unrecognized roles are inert
- `states`, `accessibility` / `value`, and `anatomy.role` compose: the state conventions classify the state props, the prop conventions classify the name and value props, and roles locate the platform behavior. All three are required for emission-quality transforms — and all three describe the spec, which is why the first two moved out of the platform block
- A future warning surface becomes possible: a `checked` state concept configured with no control role present, or a control role with no resolvable accessible name
- The annotation delimiter becomes a reserved character in layer names for libraries that opt in — resolvable per-library via the pattern, but a real constraint to communicate
- A per-component authored surface enters the workspace — the first of its kind for spec-level facts, and a forcing function for the authored-hub model's file conventions
- Prop-conditional root roles, duplicate-key elements, and variant-dependent element keys are known, named limitations rather than discovered ones
