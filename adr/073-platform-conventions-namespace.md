# ADR: `conventions.platforms`, with Figma as One Platform Among Them

**Branch**: `073-platform-conventions-namespace`
**Created**: 2026-08-30
**Status**: ACCEPTED
**Summary**: A platform-keyed `conventions.platforms` map replaces `conventions.figma`, with a `conventions.specs` sibling for the conventions that describe the spec rather than any platform.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

ADR-071 split configuration by the substitution rule: values a different team pointing this tool at the same Figma file would **have to keep** are `Conventions`; values they may freely change are `Settings`. Every member that landed in `Conventions` described Figma authoring, so the block was namespaced `conventions.figma`, and ADR-071 Decision 3 recorded the reason explicitly:

> Nothing prevents code-side conventions from arriving later — how generated names are cased, what a platform calls its props.

That later has arrived. A spec emitted from a slot's default content looks like this (`removablePill/examples.yaml`):

```yaml
slotContentExamples:
  removablePill__children__true:
    anatomy:
      label:
        type: text
    elements:
      label:
        styles:
          textColor:
            $token: Color/On surface
            $type: color
          typography:
            $token: Typography/font__200__regular
            $type: typography
          maxLines: 1
        content: Label
```

`label` is a bare Figma text layer, faithfully captured. Every generator consuming it emits a host text node — a `<span>`, a `Text`, a `TextView` — carrying inline styles or classes. The design system's actual answer is a designated primitive:

```jsx
<DsText color="on-surface" typography="font__200__regular" maxLines={1}>Label</DsText>
```

Nothing in the spec, and nothing in `Conventions`, says that a text primitive is `DsText`. The same gap exists for glyph layers (a designated icon component), container layers (a designated layout component, or a row/column pair), and images (a designated image component). Compositions — slot default content, `slotContentExamples`, `instanceExamples`, and ordinary anatomy — are built almost entirely out of these primitives, so the gap is not marginal: it is most of what a composition *is*.

**The answer differs per implementation.** A text primitive is `DsText` in React, `<ds-text>` in Web Components, `Text` in SwiftUI, and `Text` in Compose — with different prop names and different styling escape hatches in each. One Figma library feeds many implementations. That is why the mapping is not a Figma fact, and why it needs a namespace keyed by implementation.

**And Figma is one of those implementations.** This ecosystem does not only read Figma; `figma-from-specs` renders a spec back onto the canvas. Figma is a source *and* a target, and a rendering of a text primitive into Figma has the same open question every other target has — a bare `TEXT` node, or an instance of a designated Figma text component? Treating Figma as a peculiar exception outside the platform map would encode a one-directional view of a pipeline that already runs both ways.

This ADR decides *where these conventions live and how they are keyed*. What they contain is ADR-074 through ADR-077.

---

## Decision Drivers

- **The substitution rule still governs (ADR-071).** A member must be classified as a convention or a setting by the same test, and the test must give the same answer for every member
- **Absence means one thing (ADR-071).** A missing block means no such convention is declared; there is no separate on-switch
- **One spec, many implementations.** The spec must not be committed to a platform. A single spec must resolve differently per target — the reason the mapping is not a Figma fact
- **No privileged platform.** The pipeline runs in both directions. A structure that makes Figma a special case outside the platform axis will be wrong the moment a Figma-side binding is wanted, which ADR-077 shows is already true
- **Symmetry between siblings.** Two namespaces that sit at the same level should be the same kind of thing
- **Minimal, stable, intentional public API (Constitution III)**: one new namespace, not four
- **Type ↔ schema symmetry (Constitution I)** and **no logic in the schema package (Constitution II)**
- **`Conventions` is unreleased.** It is `@since 0.31.0`; npm's latest is `0.30.0`. Reshaping it now costs nothing, and this is the last moment that is true

---

## Options Considered

Three decisions, taken separately: whether these values are conventions at all, the namespace shape, and how the platform keys are named and structured.

---

## Decision 1 — Are spec→code bindings `Conventions` or `Settings`?

ADR-071's test: *if a different team pointed this tool at the same Figma file, which values would they have to keep?*

### Option 1A: They are conventions, and the substitution rule widens to "the same libraries" *(Selected)*

The rule's subject becomes the pair of libraries a run sits between — the library it reads and the library it writes for. A different team generating React from the same Figma file, against the same component library, would have to keep `text → DsText`. Get it wrong and the output is **incorrect**: a `<span>` where the design system requires `DsText` is not a stylistic difference, it is an unimplemented component.

**Pros**:

- Preserves the incorrect-versus-different discriminant exactly. A wrong binding produces wrong code; a wrong `format.output` produces different code
- Preserves the sharing consequence, which is the reason `Conventions` exists: every consumer targeting the same library declares the same bindings, and drift between copies produces silently different output
- Preserves the meaning of absence: no binding declared means no designated primitive, and the generator's existing host-element behavior stands. Nothing else can supply that statement

**Cons / Trade-offs**:

- `Conventions` is no longer about one library. Its doc comment, which today reads "facts about the Figma library a spec was generated from," must widen to cover every library the pipeline touches
- Different platforms' conventions have different lifetimes: a Figma convention changes when the file is reorganized, a code binding when the library is versioned

---

### Option 1B: They are settings — a run chooses its target *(Rejected)*

**Rejected because**: it fails the discriminant. A setting cannot be wrong, only different; `text → DsButton` is wrong. It also fails the sharing consequence — `Settings` is explicitly the per-run side, so every workspace, CI job, and plugin would re-declare the bindings, which is the exact drift ADR-071 was written to end.

Which platform a *given run* targets is genuinely a setting. That is `Settings`/`Pipeline` selecting a key; it is not the binding table itself.

---

### Option 1C: A third top-level artifact — `bindings.yaml`, outside `Conventions` *(Rejected)*

**Rejected because**: it adds a fourth root concept to a contract ADR-071 just reduced to three, and it would need its own resolution, absence semantics, and workspace-layout rules — all identical to the ones `Conventions` already has.

---

## Decision 2 — The namespace shape

### Option 2A: `conventions.platforms.<id>`, with `figma` as one of the keys *(Selected)*

There is one namespace under `Conventions`, keyed by platform. Figma is a key like any other. The existing `conventions.figma` block moves to `conventions.platforms.figma` unchanged in content.

```yaml
# conventions.yaml
platforms:
  figma:
    naming: SENTENCE
    glyphs:
      match: "DS Icon Glyph / {i}"
    codeOnlyProps:
      match: "Code only props"
    subcomponents:
      scope: PAGE
      match: ["{C} / {S}"]
    images:
      backgroundImage: true
      match: "DS Image"
      sourceProps: [imageSource]
    slotConstraints: true
    inferNumberProps: true
    states:
      hover: {prop: state, value: hover}

  react:
    primitives:
      text:      {component: DsText}
      glyph:     {component: DsIcon}
      container: {component: DsBox}

  web-components:
    primitives:
      text:      {component: ds-text}
      glyph:     {component: ds-icon}

  swiftui:
    primitives:
      text:  {component: Text}
      glyph: {component: Image}
```

`PlatformConventions` is **one shape** with every member optional. Two groups of members exist within it:

- **Encoding members** — `naming`, `glyphs`, `codeOnlyProps`, `subcomponents`, `instanceExamples`, `images.backgroundImage`, `images.match`, `images.sourceProps`, `slotConstraints`, `inferNumberProps`, `states`. These say **how this platform expresses something the spec models explicitly**. A Figma library has no first-class notion of a subcomponent, so it encodes one in a layer-name pattern; no first-class notion of a state, so it encodes one in a variant prop
- **Vocabulary members** — `primitives`, `stylesProp`, `images.component` (ADR-074 – ADR-077). These say **which of this platform's components implements a spec primitive**

Both groups apply to any platform, and both apply whichever way a run travels: decoding a name pattern and applying one are the same fact used twice, and knowing that `DsText` is the text primitive is required to read React into a spec as much as to write React out of one. Today `figma` happens to populate the encoding members and code platforms the vocabulary members, but nothing in the type enforces it — ADR-071 already anticipated code-side naming conventions, and a designated Figma text component would be a Figma vocabulary member.

**Pros**:

- The siblings are gone, and with them the asymmetry. There is one axis — platform — and every platform sits on it
- Figma stops being a special case. `platforms.figma.primitives.text` is immediately meaningful and immediately useful: it is how `figma-from-specs` would learn to render a text primitive as an instance of a designated Figma text component rather than a bare `TEXT` node. Under a `figma`-versus-`platforms` split there is no place to put that
- The two groups explain themselves. A member is an encoding fact or a vocabulary fact by what it says, not by which platform holds it or which way a run is going
- Adding a platform is adding a key. Adding a direction to an existing platform is adding a member
- A generator's lookup is one indexed read: `conventions.platforms[myId]`. It never needs to see another platform's entry
- Absence composes at two levels with one meaning at each: no `platforms` block = no conventions at all; no `platforms.swiftui` = nothing declared for SwiftUI
- Free. `Conventions` is unreleased, so the move breaks no published contract

**Cons / Trade-offs**:

- `PlatformConventions` is a permissive bag: nothing stops `swiftui.states` or `figma.stylesProp`, both of which are meaningless. Discriminating the two shapes by key would type `figma` differently from every other key, which is the special-casing this option exists to remove — and it would be wrong the moment Figma takes a vocabulary member, or a code platform an encoding one. **Permissiveness is the deliberate price of the symmetry**
- Every path in ADR-071's documentation, and every conventions file in every workspace, gains one level. Mechanical, but it touches every consumer that reads conventions
- One more level of nesting to reach `naming` or `states`

---

### Option 2B: `conventions.figma` and `conventions.platforms.<id>` as siblings *(Rejected)*

The original selection: leave the Figma block where it is, add a platform-keyed map beside it.

**Rejected because**: it asserts that Figma is not a platform, and this ecosystem's own tooling contradicts that — `figma-from-specs` renders to Figma exactly as `react-from-specs` renders to React. The asymmetry also shows in the shapes: one sibling is a scope and the other a map, which reads as an accident rather than a decision. And it has nowhere to put a Figma-side primitive binding, which ADR-077 needs.

The argument that saved it in the first draft was that moving `conventions.figma` is a MAJOR break. That argument is void: `Conventions` is `@since 0.31.0` and unpublished.

---

### Option 2C: Primitive-first, platform-second — `conventions.primitives.text.<platform>` *(Rejected)*

```yaml
primitives:
  text:
    react: {component: DsText}
    swiftui: {component: Text}
```

**Rejected because**: it is the wrong inversion. You define all the primitive types for a platform, not all the platforms for a type. The comparison a human wants — "how is text handled everywhere?" — is made once, when authoring; the comparison a generator makes on every element is "what is my platform's whole vocabulary?", and this shape scatters one platform's answers across every primitive key, so a generator can neither read nor validate its own configuration as a unit. It also has no place for platform-wide members that are not per-primitive (ADR-076 Decision 2 needs one), and no place at all for Figma's encoding members.

---

### Option 2D: `conventions.code` — singular, one target per conventions file *(Rejected)*

**Rejected because**: the platform axis is the one thing this ADR exists to express, and this deletes it from the contract in favour of file layout. Three files triplicate the Figma block — the shared, must-not-drift half — to vary the small half, inverting ADR-071's sharing argument.

---

## Decision 3 — How platform keys are named and structured

Both web generators in this ecosystem — the React transformer and the Web Components transformer — target the web, and they need **different** identifiers: `DsText` and `<ds-text>`. They may also differ on prop names, on the styling escape hatch, and on which primitives are bound at all.

### Option 3A: Flat, free-form keys at one level — implementations, not platform families *(Selected)*

The key names an **implementation**: `react`, `web-components`, `swiftui`, `compose`, `figma`. Not a platform family — `web` is not a key when React and Web Components are both in play. The schema does not enumerate the set; a generator declares which id it reads.

**Pros**:

- React and Web Components are genuinely different implementations with genuinely different mappings, and this is the shape that lets them say so
- Flat means one lookup and one place to read a platform's whole vocabulary. No inheritance, no merge, no specificity
- Does not force a taxonomy the schema cannot police. A closed enum would be wrong the first time someone adds React Native, Flutter, or a second in-house library
- Coarse ids stay legal. A team with one web implementation can key it `web` and nothing objects — the key is whatever the generator declares it reads
- Makes `platforms` an honest name, since the keys now name implementations that are peers rather than a mix of families and members

**Cons / Trade-offs**:

- Two implementations on one platform repeat whatever they share. Real, and Option 3B is the fix — rejected below on cost/benefit rather than on principle
- A typo'd key is silently a platform with no conventions. Mitigation is a consumer-side warning when a run's declared id matches no key — a consumer concern, not a schema one (Constitution II)

---

### Option 3B: Hierarchical — `web.react`, `web.svelte`, inheriting from `web` *(Rejected)*

Nest implementations under a platform family so shared web conventions are declared once.

**Rejected because**: it buys deduplication with inheritance, and inheritance costs a merge rule, an override rule, and a depth question at every level — the same complexity ADR-076 Decision 3 confines to a single, shallow, well-bounded merge. Almost no team ships more than one implementation per platform; optimizing the structure for the 5% case while every reader pays the indirection is the wrong trade. If shared web conventions become a real burden, ADR-076's platform-level `stylesProp` already absorbs the most-repeated part of it, and hierarchy remains available additively.

---

### Option 3C: A closed enum — `WEB | IOS | ANDROID` *(Rejected)*

**Rejected because**: it cannot express two web implementations, which already exist here, and it cannot express `figma`. A closed set of platform names is a taxonomy claim the schema has no standing to make, and every addition to it is a schema release.

---

### Option 3D: `targets` rather than `platforms` *(Rejected)*

Considered when the keys looked like a mix of platforms (`web`) and finer targets (`react`) — `targets` was the more literally accurate word for that mixture.

**Rejected because**: Decision 3A removes the mixture. Once every key names a peer implementation, they are platforms in the sense this ecosystem already uses the word, and `targets` becomes actively wrong for `figma`, which is a source at least as often as a target.

---

## Decision 4 — Where conventions that describe the spec itself live

`platforms.<id>` holds conventions about one implementation. Two members filed under
`figma` do not describe Figma:

- `states` names a **spec** prop and a **spec** enum value — `state`, `Hover`. A transform
  reading only `api.yaml` can apply the classification, and the CSS transform does exactly
  that without ever touching a Figma file.
- the prop conventions that name which prop carries an accessible name or a value are the
  same shape of fact.

Compare the members that genuinely are Figma facts: `glyphs.match` names a Figma layer
pattern, `codeOnlyProps.match` a Figma frame, `subcomponents.scope` a Figma page. Those are
about the design tool. `states` is not, and filing it under `figma` said it was.

### Option 4A: A `specs` sibling of `platforms` and `primitives` *(Selected)*

```yaml
# conventions/specs.yaml
states:
  disabled:
    prop: isDisabled
accessibility:
  label:
    prop: a11yLabel
value:
  prop: progress
  indeterminate: isLooping
```

No `props` wrapper. Everything the file holds today describes props, so the group
earns nothing and reads badly against the leaf it contains — `props.states.disabled.prop`
says "prop" twice. A grouping level is worth adding when a second kind arrives, not
before.

- **`primitives` is the precedent.** It already sits outside `platforms` for exactly this
  reason — a component's props are the same whichever platform renders it, so the table is
  stated once. Spec conventions are the same kind of exception, and reuse a shape the file
  set already has
- The spec is the hub, not a platform. Every convention edge has the spec on one side, so
  making `specs` a `platforms` key would name the hub as though it were a spoke
- It gives library-wide semantics a home. The per-component equivalent is an annotation and
  lands in the spec itself (`anatomy.<element>.role`, `.actions`); the split is now by
  **scope**, with a stated precedence — the annotation wins — rather than by accident
- It leaves room for the obvious next inhabitant: an element-key convention, so a library can
  declare "an element keyed `label` is the label part" once instead of annotating it on two
  hundred components

**Cons / Trade-offs**:

- A third top-level key in `Conventions`, so a reader must learn that not everything is
  platform-scoped. `primitives` already required that
- A library-wide element convention is a blunt instrument: it applies with no per-component
  opt-in, so a mistake has library-wide blast radius. That is a reason to design the escape
  hatch when the convention is added, not a reason to withhold the file

---

### Option 4B: Leave them under `platforms.figma` *(Rejected)*

**Rejected because**: it states something untrue. Nothing about `state: Hover` is a Figma
fact once the spec carries it, and a reader looking for "how does this library express
disabled" would not think to open a file named for the design tool. The misfiling is also
what made the naming go wrong downstream — the prop conventions were called `propRoles`,
borrowing a word that means something specific and unrelated on anatomy elements.

---

### Option 4C: A `specs` key inside `platforms` *(Rejected)*

**Rejected because**: it would make the hub one of its own spokes. `platforms.<id>` is
documented as an implementation id, and `specs` is what every implementation is converted to
or from. The type would still typecheck and the meaning would be wrong.

---

### Option 4D: A fourth artifact beside `conventions/`, `settings/`, `pipeline/` *(Rejected)*

**Rejected because**: these are conventions by the definition this ADR already settled —
declarations a library makes once about how it expresses itself. Splitting them into a new
artifact would separate `states` from the file set it belongs to, for a distinction the
`specs` key already draws.

---

## Decision 5 — Whether `primitives.yaml` should be `figma.primitives.yaml`

Decision 2 put `primitives` outside `platforms` on the grounds that it is
platform-neutral: a component's props are the same whichever platform renders it. That
is true of the **result** and not of the **inputs**, which the table is mostly made of:

```yaml
deIcon:
  map:
    - source: fillColor                       # a Figma style property
      values: { "DS Color/Icon/Primary": { color: Primary } }   # a Figma token name
    - source: width                           # a Figma style property
```

`source` names Figma style properties; the keys under `values` are Figma token names. A
SwiftUI capture would need a different table with different sources. So the file is
Figma-scoped in a way `specs.yaml` is not, and this is exactly the test Decision 4
applies — does it name facts about the design tool, or facts about the spec?

### Option 5A: Rename to `figma.primitives.yaml` *(Selected)*

- **It passes the Decision 4 test**, which is the test this ADR now applies to every
  conventions file. Leaving it unqualified says it is scope-free, and it is not
- Establishes `<scope>.<concern>.yaml` as the pattern for a scoped file that is not a
  whole platform block, leaving room for `figma.<other>.yaml` without another debate
- `specs.yaml` stays unqualified and correct — it *is* the whole of the spec's conventions

**Cons / Trade-offs**:

- Reverses the reading in Decision 2. That reasoning stands for the *output* of the
  table and was over-applied to the file as a whole
- A reserved basename changes, so `PRIMITIVES_FILE` and any workspace carrying the file
  must move together. Cheap now, less cheap later

### Option 5B: Leave it `primitives.yaml` *(Rejected)*

**Rejected because**: it makes the conventions directory two things at once — files named
for a platform, and one named for a concern — with nothing distinguishing which is which.
A reader has to know that `figma.yaml` is scoped and `primitives.yaml` is also scoped but
does not say so.

### Option 5C: Move it under `platforms.figma.primitives` *(Rejected)*

**Rejected because**: it would grow the platform block with a component-keyed table, and
the promotion result genuinely is platform-neutral — a captured layer becomes the same
component whichever target renders it later. The file is Figma-scoped; its contents are
not wholly so. A qualified filename says that; nesting it inside the platform block
overstates it.


## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Conventions.ts` | `Conventions.figma` replaced by `Conventions.platforms?: Record<string, PlatformConventions>` | MINOR (see Semver) |
| `Conventions.ts` | Added `PlatformConventions` — the former `figma` block's members, all optional, plus the vocabulary members of ADR-074 – ADR-077 | MINOR |
| `Conventions.ts` | Same change to `ResolvedConventions` | MINOR |
| `Conventions.ts` | `DEFAULT_CONVENTIONS` no longer carries a `figma` key; defaults move inside a declared platform entry | MINOR |
| `Conventions.ts` | Doc comment widened from "facts about the Figma library" to facts about every library the pipeline reads or writes | PATCH |
| `Conventions.ts` | Added `SpecsConventions` and `Conventions.specs?`, a sibling of `platforms` and `primitives` — conventions describing the spec rather than a platform (Decision 4) | MINOR |
| *(no type change)* | `conventions/primitives.yaml` is renamed `conventions/figma.primitives.yaml` — a reserved-basename change, not a type change (Decision 5) | PATCH |
| `Conventions.ts` | Added `PropReference` (`{ prop: string }`), so a prop convention can grow fields without a break | MINOR |
| `Conventions.ts` | Added `ValueConvention` (`{ prop, indeterminate? }`) — the indeterminate binding is a property of the value, not a state concept | MINOR |
| `Conventions.ts` | `states` moved from `PlatformConventions` to `Conventions.specs.states` — it names a spec prop and a spec enum value, not a Figma fact. Its concept vocabulary is unchanged | MINOR |

**Example — new shape** (`types/Conventions.ts`):

```yaml
# Before (unreleased)
Conventions:
  figma:
    naming?: NONE | SENTENCE | TITLE
    glyphs?: {...}
    states?: {...}

# After
Conventions:
  # conventions about the spec itself — not about any platform (Decision 4)
  specs?:
    states?: {...}
    accessibility?:
      label?: { prop: string }
    value?: { prop: string, indeterminate?: string }
  platforms?:
    <platformId>:
      # encoding — how this platform expresses what the spec models
      naming?: NONE | SENTENCE | TITLE
      glyphs?: {...}
      codeOnlyProps?: {...}
      subcomponents?: {...}
      instanceExamples?: {...}
      images?: {...}
      slotConstraints?: boolean
      inferNumberProps?: boolean
      states?: {...}
      # vocabulary — which of this platform's components is a spec primitive
      primitives?: {...}     # ADR-074 – ADR-076
      stylesProp?: string    # ADR-075, ADR-076
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `conventions.schema.json` | `figma` property replaced by `platforms`, an object with `additionalProperties: {$ref: PlatformConventions}` | MINOR |
| `conventions.schema.json` | Added `#/definitions/PlatformConventions`, carrying the former `figma` sub-schema's properties plus the vocabulary properties | MINOR |

### Notes

`platforms` is optional and has **no default**. Absence means no conventions are declared for any platform.

**The three defaultable members keep their defaults.** ADR-071 settled this: `naming: NONE`, `slotConstraints: false` and `inferNumberProps: false` are defaulted, and only convention *blocks* are not, because a block's absence is a statement nothing can supply. Nothing here reopens that.

What this ADR changes is where the guarantee comes from. Under ADR-071 `figma` was a **required** key, so an entry always existed and every consumer always read `naming`. A platform-keyed map makes every key optional, which would leave a consumer asking for an undeclared platform with no `naming` at all — a silently different value, not the same statement.

So the guarantee moves to resolution, where ADR-071 already put every other default: **whoever resolves a platform produces a complete entry, declared or not.** `ResolvedPlatformConventions` requires all three members, so a consumer asking for `figma` reads `NONE` whether or not a `figma.yaml` exists. `DEFAULT_CONVENTIONS` is `{}` because a map has no fixed key to populate — it is not the carrier of these defaults any more, and no new exported constant replaces it. Resolution is a consumer concern (Constitution II).

`PlatformConventions` deliberately does not discriminate encoding members from vocabulary members. Doing so would require typing the `figma` key differently from every other key, reinstating the special case this ADR removes, and would be wrong as soon as Figma takes a vocabulary member or a code platform takes an encoding one — both of which are foreseeable.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: `Conventions.platforms` ↔ `conventions.schema.json#/definitions/Conventions/properties/platforms`; `PlatformConventions` ↔ `#/definitions/PlatformConventions`. The free-form key is expressed as `additionalProperties`, matching how `states` already expresses its concept-keyed map

---

## Downstream Impact

Counts below were measured against `specs` on `release/schema-0.31.0+cli-0.28.0`, `specs-from-figma` on `feat/react-from-specs`, and `specs-plugin-2` on `release/1.18.0`. They will drift as those branches move; they are given to size the work, not as a checklist.

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-schema` | `conventions.schema.json` lists `figma` in `required`. Replacing it with an optional `platforms` is a change *within* the file, not an addition beside it | Rewrite the `Conventions` definition; add `PlatformConventions` |
| `specs-from-figma` | **13 source files, 42 call sites** read `conventions.figma.*` — `Component`, `Variant(s)`, `Props`, `CodeOnlyProps`, `Subcomponents`, `Images`, `Anatomy`, `SlotContent`/`SlotDetector`/`SlotItem`, `InstanceExamples`, `Elements`. Every one reads a `ResolvedConventions` handed to `Component`, so the change is mechanical, not structural | Repoint each access; no signature changes |
| `specs-from-figma` (tests) | **~44 test files** construct conventions fixtures with a `figma` root | Mechanical fixture update |
| `figma-from-specs` | **2 source files** (`Elements`, `KeyReversal`, `CodeOnlyProps`) read the same shape | Repoint |
| `specs-cli` | **24 sites across 11 files.** `ConfigLoader` resolves the block and emits **7 validation warnings whose message text names `conventions.figma.…` paths**; eight commands read it (`Generate`, `Transform`, `Analyze`, `Render`, `Fetch`, `Cache`, `Scan`, `ApplyCustomTokens`); `bridge/server.ts` reads `glyphs.match` | Repoint accesses; rewrite the warning strings, which are user-facing |
| `specs-cli` (`analyzers/Keys.ts`) | Reads **`metadata.conventions.figma.naming`** — a spec-reading path, not a config-reading one, and already carrying a branch for older specs | Add the new path; see ADR-079, which changes what metadata carries |
| `specs-cli` (`Config/migrations/configV1.ts`) | Builds `{ figma }` when migrating a pre-split `specs.config.yaml` | Emit under `platforms` |
| `specs-plugin-2` | **One site.** `settingsToSpecConfig` in `src/SpecsController.ts` is the plugin's single translation point from panel fields to `SpecConfig`, and it builds one `conventions: { figma: {…} }` literal. Plus one stale doc comment in `UI/Types/Settings.ts` | One-line change |
| `specs-plugin-2` (bridge) | `MessageManager` passes `ResolvedConventions` through opaquely and never indexes it | None |
| Docs site (`specs/site`) | **45 pages mention conventions; ~35 lines** write a `conventions.figma.…` path or a `figma:` root in a YAML example | Rewrite examples and paths |
| `react-from-specs` / `webcomponents-from-specs` | Gain the block they need; behavior change is ADR-074 | Declare which platform id each reads |

The distribution is the useful finding: the change is **wide but shallow in `specs-from-figma`** (many call sites, all the same edit, all reading one object passed down from `Component`), **narrow and deep in the CLI** (fewer sites, but they include user-facing warning text and a spec-reading path), and **a single line in the plugin**, because the plugin funnels every panel field through one translation function.

---

## Semver Decision

**Version**: `0.32.0` (release branch `release/schema-0.32.0+cli-0.29.0`) — **MINOR**

**Justification**: `Conventions`, `ResolvedConventions`, and `DEFAULT_CONVENTIONS` are all `@since 0.31.0` and have never been published — npm's latest is `0.30.0`. Reshaping a type within the release that introduces it is not a break of any published contract, so the release stays MINOR against `0.30.0`. This reasoning holds only until `0.31.0` ships; after that, the same change is MAJOR.

---

## Consequences

- There is one axis, platform, and no privileged member of it. Figma is a key, and the pipeline's bidirectionality is visible in the structure rather than contradicted by it
- `Conventions` describes every library the pipeline touches. Members are still classified by the substitution rule; the subject of the rule is now each platform's library
- Encoding and vocabulary is a property of a **member**, not of a platform and not of a direction. Both groups are used in both directions: a name pattern is decoded when reading and applied when writing be
- `PlatformConventions` permits meaningless combinations (`swiftui.states`). Accepted as the price of removing the special case; a consumer-side warning is the mitigation
- Every conventions file and every conventions read path gains one level. Free now, MAJOR after `0.31.0` ships — **this change must land in this release or not at all**
- Adding a platform is adding a key; adding a direction is adding a member
- **The one-time cost is concentrated where it is cheapest to pay.** `specs-from-figma` takes the most edits (42 call sites) but every one is the same mechanical repoint of an object already passed down from `Component`; the plugin takes a single line, because `settingsToSpecConfig` is its only translation point. The CLI is the awkward one: its 24 sites include seven user-facing validation messages that quote `conventions.figma.…` paths, and `analyzers/Keys.ts` reads the path out of a *spec's* metadata rather than out of configuration — a case ADR-079 changes again
