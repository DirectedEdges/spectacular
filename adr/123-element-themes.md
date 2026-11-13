# ADR: Element themes — the variable modes an element pins

**Branch**: `123-element-themes`
**Created**: 2026-11-13
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

A spec records *which token* a style uses. It never records *which mode that token resolves in*.

`TokenReference` is the whole of what the contract carries about a token-bound value:

```yaml
backgroundColor:
  $token: DS Color.Surface.Default
  $type: color
  $extensions:
    com.figma:
      id: 'VariableID:1:23'
      collectionName: DS Color
      rawValue: '#1B1B1BFF'
```

The collection is named. The mode is not. `rawValue` is the value Figma resolved at extraction time, so it was resolved *under some mode* — and the spec keeps the answer while discarding the question.

In Figma, a mode is a fact of a layer, not of a value. A node may pin one mode per variable collection, and every descendant resolves token references against that pin unless it pins its own. The Plugin API exposes the two halves separately: `explicitVariableModes` is "the modes explicitly set on the node", a `{ [collectionId: string]: string }` map, and `resolvedVariableModes` is the same shape widened to include "the explicitly set modes on ancestors of the node". A collection's modes are `{ modeId, name }` pairs with one `defaultModeId`.

The schema has nowhere to put either. `Element` is closed (`additionalProperties: false`) and carries `children`, `parent`, `styles`, `contentStyles`, `propConfigurations`, `instanceOf`, `content`, `$extensions`. `Styles` is closed as well. So a designer who pins a dark surface on a card's root produces a spec byte-identical to one with no pin, and that is true at the contract level, not as an implementation gap: no consumer can carry a fact the contract cannot express.

Three things follow from the absence.

- **The pin cannot round-trip.** A spec rendered back to the canvas has no mode to re-apply, so the subtree falls back to the ambient mode of wherever it lands.
- **Emitted code has nothing to scope a theme with.** The values are correct for one mode and silently wrong in any other, because the spec does not say which one it described.
- **A re-generation under a different ambient mode produces a different `rawValue` with no recorded reason.** The diff looks like a design change.

One thing is deliberately *not* in scope: the schema has no token-definition document, so it has no place to classify a collection as design-time or environment-resolved. This ADR records the selection a designer made and nothing about the nature of the axis it was made on.

---

## Decision Drivers

- **Capture what the contract drops** — a mode pinned on a layer must survive generation and be re-applicable.
- **Faithful to the source model** — a mode is a layer-level fact that cascades to descendants, not a per-element rendered value.
- **One shared `Element`** — `Elements` is the same type under `Variant.elements`, `Composition.elements`, `SlotContent.elements` and every subcomponent variant, so the right placement reaches all of them with one edit.
- **Stable across serialization profiles** — `spec.tokens` reshapes token *values* (`TOKEN`, `FIGMA_NAME`, `FIGMA_SYNTAX_*`) and `spec.keys` re-cases anatomy and prop keys. Neither should change how a pinned mode is spelled.
- **Additive only** — `Element` and `Styles` are both closed objects; no previously valid spec may become invalid (constitution VI, semver policy).
- **Type ↔ schema parity** — a new named definition obliges a named type and vice versa (constitution I).
- **No logic** — the schema declares the field; computing an effective mode belongs to consumers (constitution II).
- **Naming — code platforms first** — the identifier follows the code-platform term, not Figma's (constitution VI).
- **Minimal public API** — one new optional field and one new exported type, no more (constitution III).

---

## Options Considered

Six independent decisions: **where** the pin lives, **what shape** it takes, **what it is called**, **how its keys are spelled**, **which pins are written**, and **whether Figma ids travel with it**.

### Decision 1 — Placement

#### Option A: `Element.themes`, a sibling of `styles` *(Selected)*

```yaml
default:
  elements:
    root:
      themes:
        DS Color: Dark
      styles:
        backgroundColor:
          $token: DS Color.Surface.Default
          $type: color
```

**Pros**:
- Mirrors the source model: one element, one set of pins, cascading to its subtree.
- Reaches `Variant.elements`, `Composition.elements`, `SlotContent.elements` and the subcomponent element maps through the single `Element` type — no enumeration, no per-document special case.
- Per-variant by construction, which is what Figma reports: each variant is its own node and may pin differently.

**Cons / Trade-offs**:
- Consumers must walk ancestors to compute an element's effective modes rather than reading them locally.

---

#### Option B: `Styles.themes` *(Rejected)*

A pinned mode nested inside the element's style object.

**Rejected because**: `Styles` is the bag of *values* an element renders with, and every one of its members is a value — token-bindable, prop-bindable, or structural. A mode pin is not a value; it is the context the values in that bag resolve in, and it governs descendants, which nothing else in `Styles` does. `Styles` is also where `visible` already sits, so the boundary that keeps the type coherent is "a property of this element's own rendering", and a cascading selection is not that.

---

#### Option C: On the anatomy element *(Rejected)*

`anatomy.<element>.themes`, beside `role` and `type`.

**Rejected because**: anatomy is variant-invariant — it describes the element across every variant. A pin is per-node, so two variants of one component may pin different modes. Anatomy cannot hold a value that varies by variant without either losing information or growing a variant axis it does not have.

---

#### Option D: On the variant *(Rejected)*

`Variant.themes`, beside `elements` and `layout`.

**Rejected because**: it records that a variant pins a mode but not *where*, which loses the subtree scope entirely. A component whose root pins one collection and whose nested panel pins another cannot be expressed, and re-applying a variant-level pin on render has no node to apply it to but the root.

---

### Decision 2 — Shape

#### Option A: Collection-keyed map of mode names *(Selected)*

```yaml
themes:
  DS Color: Dark
  Density: Compact
```

**Pros**:
- Structurally enforces one mode per collection, which is true of the source and of every target.
- Matches the source shape — `{ [collection]: mode }` is what the Plugin API returns — without borrowing its vocabulary for property names.
- Matches the house pattern for open-keyed maps: `Elements`, `PropConfigurations` and `Images` are all `Record<string, …>`, declared as `additionalProperties` rather than `patternProperties`.
- A value can widen later from `string` to `string | PropBinding` without reshaping anything, the way `Element.content` and `Styles.visible` already admit a `PropBinding`.

**Cons / Trade-offs**:
- Open keys cannot be validated against a known set, so a misspelled collection name validates clean (see Decision 4).

---

#### Option B: Array of `{ collection, mode }` objects *(Rejected)*

```yaml
themes:
  - collection: DS Color
    mode: Dark
```

**Rejected because**: it admits the same collection twice, so one-mode-per-collection becomes a rule prose has to state and validation cannot enforce. It is also more verbose for the common single-pin case, and it promotes `collection` and `mode` — the two words constitution VI puts last — into property names a consumer programs against.

---

#### Option C: A single `theme` string *(Rejected)*

One pinned mode per element, unqualified by collection.

**Rejected because**: a node may pin several collections at once, and nothing in the value says which collection a bare mode name belongs to. Two collections with a mode each would need two elements, which the canvas does not have.

---

### Decision 3 — Property name

#### Option A: `themes` *(Selected)*

```yaml
themes:
  DS Color: Dark
```

**Pros**:
- Constitution VI rule 1 — two code platforms agree on the term. React scopes an inherited design context with a theme provider, and CSS scopes one with `data-theme` plus `color-scheme`. Both call the thing a theme.
- It names what the value *means* to a consumer, where `mode` names how the design tool stores it. Constitution VI puts Figma's vocabulary last, reachable only when no code platform has an opinion.
- It leaves "mode" free for the environment-resolved sense every platform already uses it in — OS light/dark — which this property is not.

**Cons / Trade-offs**:
- Not every collection reads as a theme; a `Density` collection is a theme only under a generalized sense of the word.
- Plural keyed by collection means `themes` holds one theme per axis, not a list of themes — accurate but worth one sentence in the description.

---

#### Option B: `modes` *(Rejected)*

**Rejected because**: it is the design tool's own label, which constitution VI admits only when no code platform expresses an opinion — and two do. It is also the overloaded word: OS light/dark is a mode, a device state is a mode, and a design-time pin is not either of those.

---

#### Option C: `variableModes` *(Rejected)*

**Rejected because**: it names the Figma API property, which makes the schema's public surface a mirror of one tool's model, and it carries "variable" — a Figma term with no standing on any code platform. Constitution VI exists to keep translation inside `specs-from-figma` rather than at every consumer's boundary.

---

### Decision 4 — How keys are spelled

#### Option A: The collection name verbatim *(Selected)*

The key is the collection's `name` as the source file spells it, unmodified by `spec.keys`.

```yaml
themes:
  DS Color: Dark
```

**Pros**:
- Joinable to the references it governs. `TokenReference.$extensions['com.figma'].collectionName` is already the verbatim collection name, and under the default `TOKEN` profile the `$token` path leads with it (`DS Color.Surface.Default`). A matching key is what lets a consumer tell which references a pin applies to.
- Stable across both serialization settings. `spec.keys` governs "anatomy keys, prop keys, and every reference to them" — a collection is neither — and `spec.tokens` reshapes values, not this.
- Mode names are likewise verbatim, because the mode vocabulary is owned by the token source and not by this schema.

**Cons / Trade-offs**:
- A key may contain spaces, which is awkward as an object key in emitted code. Emitters already carry `$token` paths with spaces, so the problem is not new.

---

#### Option B: Keyed per `spec.keys`, Figma name in `$extensions` *(Rejected)*

`DS Color` becomes `dsColor` under the default `CAMEL`, with the original preserved as provenance.

**Rejected because**: it breaks the join. The pin would be spelled one way and every token reference it governs another, so matching them requires a lossy projection to be inverted — and `spec.keys` is documented as lossy. It also makes the spelling of a pin depend on a setting, so two specs of the same library disagree about the name of the same collection.

---

#### Option C: A declared collection vocabulary in `Conventions` *(Rejected)*

Declare the library's collections once, and have `themes` keys reference that declaration.

**Rejected because**: it buys validation at the cost of a second contract to keep in sync, and it makes a pin unreadable without its conventions file. The collection set is a fact of the token source, which is already the authority for mode names; re-declaring it here invites the two to disagree. Worth reopening if misspelled collection names prove to be a real failure in practice.

---

### Decision 5 — Which pins are written

#### Option A: Explicit pins only, inherited by consumers *(Selected)*

A `themes` key appears on exactly the elements whose Figma node pinned that collection — the `explicitVariableModes` half. Consumers inherit down the element tree, including across nested instance boundaries, and a descendant that pins the same collection overrides it for its own subtree.

**Pros**:
- Keeps the spec faithful: the written facts are the authored facts, and nothing is synthesized.
- Keeps files small — an inherited pin is not copied onto every descendant.
- Correct for a reusable component. Modes pinned *above* the component on the canvas are part of the node's resolved modes but not of the component's own definition, so a component that recorded them would ship its capture context as though it were its own design.

**Cons / Trade-offs**:
- Computing the effective modes for one element means walking its ancestors; a consumer cannot read it locally.
- Modes pinned above the captured subtree are not recorded at all, by design. A consumer resolves those from its own context.

---

#### Option B: Resolved modes on every element *(Rejected)*

Write the full effective map — the `resolvedVariableModes` half — on every element.

**Rejected because**: it duplicates an inherited fact onto every element, inflating every spec that uses any collection at all, and it cannot distinguish a pin the designer set from one it inherited. On a component that is the worse failure: the ambient mode of the page it was captured on would be written into the component's own definition, and every consumer would then resolve against the capture context instead of its own.

---

**Explicit default pins are written.** A pin equal to the collection's `defaultModeId` is still a pin, and it is recorded. An absent key means the element set nothing and inherits; an explicit default means the element holds that mode even inside a differently-pinned ancestor. Only the unset case is omitted.

---

### Decision 6 — Figma ids as provenance

#### Option A: Names only *(Selected)*

No id travels with a pin.

**Pros**:
- A collection id and a mode id are file-local handles. They do not survive across files or branches, so an id recorded here is only resolvable against the one file that produced the spec.
- The name is what every target can map — a theme name on the web, a collection name in a token pipeline — and it is the same spelling the pin's own key already uses (Decision 4).
- Smallest surface that satisfies the driver. `$extensions` stays reserved for provenance that cannot be derived from the contract.

**Cons / Trade-offs**:
- A collection or mode renamed at the source silently invalidates every pin naming it. The same is already true of `$token` paths, so the exposure is not new.

---

#### Option B: Ids under `$extensions['com.figma']` *(Rejected)*

Record the `{ collectionId: modeId }` map alongside the named pins.

**Rejected because**: `TokenReference` records a variable `id` because a variable is *resolved* — the id is the only stable handle to a value whose name may be duplicated across collections. A mode is *selected*, and the selection is identified by the pair of names, which is unique by construction: one mode name per collection, one collection per key. Recording an unresolvable id to re-derive a name the spec already holds adds surface without adding information.

---

## Decision

A new optional `themes` map on `Element`. Keys are variable collection names as the source spells them; each value is the mode pinned on that collection. Written only where the pin was set; inherited by consumers down the element tree.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Element.ts` | Added optional field `themes?: Themes` on `Element` | MINOR |
| `Element.ts` | Added exported type `Themes` | MINOR |
| `index.ts` | Added `Themes` to the barrel export | MINOR |

**Example — new shape** (`types/Element.ts`):

```yaml
# Before
Element:
  children?: Children
  parent?: string | null
  styles?: Styles
  contentStyles?: ContentStyles
  propConfigurations?: PropConfigurations
  instanceOf?: string | PropBinding | SubcomponentRef
  content?: string | PropBinding
  $extensions?: ElementExtensions

# After — one added optional field
Element:
  # …unchanged…
  themes?: Themes          # optional — MINOR

# New exported type
Themes: Record<string, string>
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Added definition `Themes` | MINOR |
| `component.schema.json` | Added optional property `themes` on `#/definitions/Element`, `$ref` to `Themes` | MINOR |

**Example — new shape** (`schema/component.schema.json`):

```yaml
# New definition
Themes:
  type: object
  description: >-
    The mode this element pins for each variable collection, keyed by collection name.
    Pins cascade to descendants, so a key appears only on the element that sets it.
  additionalProperties:
    type: string
  examples:
    - { DS Color: Dark }

# New property under #/definitions/Element/properties
themes:
  $ref: '#/definitions/Themes'
  # not in required[] — optional field
```

`#/definitions/Element` stays `additionalProperties: false`; the change only widens its `properties`.

### Example — a component spec

```yaml
title: Card
anatomy:
  root:
    type: container
  panel:
    type: container
default:
  elements:
    root:
      themes:
        DS Color: Dark
      styles:
        backgroundColor:
          $token: DS Color.Surface.Default
          $type: color
    panel:
      styles:
        backgroundColor:
          $token: DS Color.Surface.Raised
          $type: color
variants:
  - configuration:
      emphasis: promotional
    elements:
      root:
        themes:
          DS Color: Bright
          Density: Compact
```

`panel` carries no `themes` key and resolves against `root`'s pin. Under the `promotional` variant, `root` pins two collections and `panel` inherits both.

### Notes

- **Reach.** `Elements` is one type. Declaring `themes` on `Element` gives it to `Variant.elements`, `Composition.elements`, `SlotContent.elements` and the subcomponent element maps at once. The concern documents (`component-concern.schema.json`, `composition-concern.schema.json`) `$ref` into `component.schema.json` for `Variant`, `Variants` and `SlotContentMap`, so they inherit the property with no edit of their own.
- **Optional, and absence is not a default.** An absent `themes` means the element pinned nothing, not that it pinned a collection's default mode. The two are distinct and both are expressible.
- **No value validation.** Collection and mode names are open strings; the token source owns that vocabulary. A misspelled name validates clean. This is a known gap, named in Decision 4 Option C with the condition under which to revisit it.
- **Out of scope — configuration-bound pins.** A value is a mode name, never a `PropBinding`, so a pin cannot vary with a prop. The map shape admits that widening later without a reshape, exactly as `Element.content` and `Styles.visible` are shaped.
- **Out of scope — non-overridable pins.** This model lets any ancestor or descendant override a pin. A component that must hold its own mode against every ambient context needs a stronger semantic than inheritance, and it is not decided here.
- **Out of scope — classifying a collection.** Whether a collection is pinned at design time or resolved from the runtime environment is a fact of the collection, not of a pin. The schema has no token-definition document to classify it in; see Context.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**:
  - `Themes` (type, `types/Element.ts`) ↔ `#/definitions/Themes` (`component.schema.json`) — a named type for a named definition, in both directions, per constitution I.
  - `Element.themes` (type) ↔ `#/definitions/Element/properties/themes` (schema) — optional in both; absent from `required[]`.
  - `Record<string, string>` ↔ `type: object` with `additionalProperties: { type: string }` — the same open-keyed map the `Elements` and `Images` definitions already use.
- No type is renamed or removed and no schema file is added, removed, or restructured, so nothing in the `exports` contract changes.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-from-figma` | Populate | Read the explicitly pinned modes from each captured node and write `themes` on the matching element. The resolved-mode half is deliberately not written (Decision 5). |
| `figma-from-specs` | Apply | Re-apply a pin on render, by collection and mode name, so a rendered subtree resolves as authored instead of inheriting its destination's context. |
| `from-specs` (core) | Resolve | An element's effective modes are the merge of its own pin over its ancestors'. Belongs in the shared core so both emitters agree. |
| `react-from-specs` | Emit | A pinned subtree becomes a scoped theme boundary in emitted output; without it, token values are emitted as if one mode were universal. |
| `webcomponents-from-specs` | Emit | Same, at whatever scoping mechanism the emitted custom elements use. |
| `specs-cli` | Recompile | New optional field reaches `validate` and `generate` through the schema; no command surface changes. |
| `specs-plugin-2` | Recompile, then populate | Same capture responsibility as the REST path, so the two runtimes stay at parity. |

No consumer breaks by ignoring the field: a spec with no pins is byte-identical to one generated today.

---

## Semver Decision

**Target version**: `0.41.0` — the version of `packages/schema` on the active `release/next` branch this ADR merges into.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: One added optional field on an existing type and one added schema definition. No exported type or field is renamed or removed, and `#/definitions/Element` only gains a property — so every spec valid before this change is valid after it. Constitution III and the versioning policy grade additive types and new optional fields `MINOR`.

---

## Consequences

- A mode pinned on a layer survives generation, so a spec says which context its token values were described in.
- A pinned subtree can be rendered back to the canvas and resolve as authored, rather than inheriting whatever context it lands in.
- Emitted code gains the fact it needs to scope a theme boundary, instead of emitting one mode's values as though they were universal.
- Consumers must walk the element tree, through nested instance boundaries, to compute an element's effective modes. This is the cost of the faithful, small-file choice, and the merge belongs in the shared core rather than in each emitter.
- Collection and mode names are unvalidated strings. A rename at the token source invalidates every pin naming it, with no error until render.
- Modes pinned above a captured subtree are not recorded; a consumer supplies that context itself.
- Configuration-bound pins and non-overridable pins remain unexpressible. Both are additive extensions of this shape, not reversals of it.
