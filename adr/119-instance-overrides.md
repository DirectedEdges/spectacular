# ADR: Overrides on Instance Elements

**Branch**: `119-instance-overrides`
**Created**: 2026-11-09
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*
**Depends on**: [ADR-049 — PropConfigurations Bindings](049-prop-configurations-bindings), [ADR-052 — Slotting Content into Nested Instances](052-slotting-nested-instances), [ADR-042 — Composition Type](042-composition-type), [ADR-048 — Component Instance Examples](048-component-instance-examples)

---

## Context

An element with `instanceOf` is a **leaf reference**: the spec names the component it renders and configures that component through its public surface, but says nothing about the component's internals. Two properties do the configuring today, both of them sanctioned uses of the instanced component's API:

- `propConfigurations` sets the instanced component's own props, including slot fills (ADR-049).
- `propConfigurations.$nested` sets the props of instances further down, addressed by a path of `instanceOf` keys (ADR-052).

Neither reaches a style. An author placing an instance in a composition or a slot-content example can repaint nothing inside it, because the one property that carries styles — `Element.styles` — describes the instance node itself, not the elements the instanced component owns.

ADR-052 named this gap and deferred it by name:

> **Deep `styles` / literal `content` overrides** — the genuine wall-breaking surface (restyling a deep descendant, retyping its text to a literal, reaching an unexposed prop). A separate future ADR if ever warranted.

That ADR also fixed the vocabulary this one inherits. Filling a slot or setting a prop is **configuration** — using the component's public API — and belongs on the prop surface. Repainting an element the instanced component owns is an **override** — reaching past the public API into internals — and is a different surface with different semantics. ADR-052 shipped the first and declined the second.

Compositions (ADR-042) are what make the second one load-bearing. A composition places real components and routinely needs one of them to look different in that one place: a toolbar's action painted onto a dark surface, a pill's label recolored inside a filter bar. Today the composition can only say which component it placed and how it configured it, so the appearance it actually documents is not recoverable from the spec.

This ADR adds `overrides` to `Element`: a list of style patches over the instanced component's own anatomy elements, applied after the instanced component has resolved its own variants and state.

---

## Decision Drivers

- **The deferred surface is specific.** ADR-052 deferred *deep `styles` and literal `content`* and nothing else. Reaching a prop the instanced component never surfaced is not in scope, and deep *configuration* is already solved by `$nested` — this ADR must not offer a second way to do it.
- **An override is a patch, not a re-resolution.** It layers on top of whatever variant and state the instanced component already resolved. It does not select a variant and it does not restructure — `layout` is not part of the surface.
- **Elements are a flat map.** `Anatomy` and `Elements` are `Record<string, …>`; structural nesting lives in `Layout`. An override surface keyed by element name should be flat for the same reason the element map is.
- **Depth is real and composed.** A composition places instances that themselves place instances. ADR-052's `$nested` already recurses through instance boundaries for configuration; an override surface that stops at one boundary leaves the composed case half-expressed.
- **Two consumers want different amounts of it.** The spec ↔ Figma transform round-trips a per-node delta that has no state dimension at all. The spec ↔ code transforms emit stylesheets where per-state selectors are the native idiom. The contract must be shaped for the wider of the two and is free to leave the narrower one a subset — not shaped for whichever one is implemented first.
- **Values are static.** An override on a documented instance is not a live data flow, the same rule `InstanceExample` already carries: no `PropBinding`.
- **Existing specs must keep validating.** The property is optional and additive — MINOR class (Constitution: Versioning).
- **Minimal, stable API** (Constitution III). New exported types must name genuine shared concepts, and no consumer's internals may drive the shape.

---

## Options Considered

Three independent decisions: the **shape** of the override surface, its **depth reach**, and the **type of its matcher**. Each is resolved on its own below; the Decision section records only what these resolve.

### Decision 1 — Shape

#### Option A: A matched list, mirroring `Variants` *(Selected)*

`Element.overrides` is a list of entries, each with an optional `configuration` matcher and a required `elements` map of per-element patches. An entry with no `configuration` applies at **every** resolved configuration of the instanced component; an entry with one applies only where the instanced component's resolved props match it.

```yaml
# a composition element that instances the action subcomponent
navigation:
  instanceOf:
    $ref: '#/subcomponents/action'
  propConfigurations:           # the instance's public API — unchanged
    appearance: text
    displayedContent: icon
    state: rest
  styles:                       # the instance node's own box — unchanged
    width: 48
    height: 48
  overrides:                    # NEW — patches inside the action subcomponent
    - elements:                 # no `configuration` — applies at every state
        background:
          styles:
            backgroundColor:
              $token: 'color/surface'
        icon:
          styles:
            fillColor:
              $token: 'color/onSurface'
    - configuration:            # applies only where the instance resolves to hover
        state: hover
      elements:
        icon:
          styles:
            fillColor:
              $token: 'color/onSurfaceHover'
```

The shape is `Variant`'s, minus what an override may not do. `Variant` is `{ configuration?, invalid?, layout?, elements? }`; `Override` is `{ configuration?, elements }` — no `layout`, because an override does not restructure, and no `invalid`, because an override does not describe a variant's existence.

**Pros**:
- One shape covers both consumers. The Figma delta is the unscoped entry; the per-state patch a stylesheet can express is the matched entry. Neither needs a second property.
- The matcher semantics already exist in the contract. An author who has read `Variants` can read `Overrides` without learning a new matching rule, and a transform that layers variants layers overrides the same way.
- Unscoped means *every* configuration, stated rather than implied. A flat map would leave "does this survive hover?" unanswered, which is the question the two consumers answer differently.
- Additive and optional — existing specs are unaffected.

**Cons / Trade-offs**:
- The common case — one unscoped patch — pays for a list wrapper it does not need.
- The matched form has no generator path. `specs generate` reads a Figma instance delta, which carries no state dimension, so a matched entry is authored-only until something emits one. The contract is shaped for the authoring surface and the code emitters; the Figma transform handles the unscoped subset.

---

#### Option B: A flat map keyed by element name *(Rejected)*

`Element.overrides` is `Record<string, ElementOverride>` — the element names directly, no matcher.

```yaml
overrides:
  icon:
    styles:
      fillColor:
        $token: 'color/onSurface'
```

**Rejected because**: it cannot say what happens at hover, and the two consumers would answer that differently. A stylesheet emitter has to choose between emitting the patch at base specificity — where the instanced component's own `:hover` rule beats it and the override visibly reverts under the pointer — and emitting it at every state, which is right for the common case but gives an author no way to ask for anything else. The driver says shape the contract for the wider consumer; this shape forecloses it, and reopening it later means either a second property or a breaking change to this one.

---

#### Option C: A recursive `{ styles, elements }` tree *(Rejected)*

Shape the patch as a tree that descends the instanced component's structure, `{ styles, elements: { child: … } }`.

**Rejected because**: it descends a hierarchy the element map does not have. `Elements` is flat and `Layout` holds the nesting, so a tree keyed by element name would have to duplicate the layout tree to be writable, and would drift from it. It also mismatches the per-node delta the Figma transform reads and writes in both directions. Depth in this contract is instance depth, not layout depth — which is what Decision 2 settles.

---

#### Option D: Extend `propConfigurations` *(Rejected)*

Carry style patches through the existing `$nested` path mechanism rather than adding a property.

**Rejected because**: ADR-052 settled the category boundary and rejected exactly this merge, in the other direction. Configuration uses the public API; an override breaks it. Filing both under `propConfigurations` would put a prop name and an anatomy element name in the same keyspace, where a component with a prop and an element of the same name becomes ambiguous.

---

### Decision 2 — Depth reach

#### Option A: Recursive through composed instances *(Selected)*

An entry in an `elements` map whose target element is itself an instance may carry its own `overrides`, so one block reaches through a chain of composed instances.

```yaml
# a composition instances `filterBar`; `filterBar` instances `pill`;
# the composition recolors the pill's label
filters:
  instanceOf: filterBar
  overrides:
    - elements:
        selectedPill:           # an instance element inside filterBar
          overrides:
            - elements:
                label:
                  styles:
                    textColor:
                      $token: 'color/onAccent'
```

Recursion follows **instance** boundaries only — the same rule ADR-052 fixed for `$nested` paths, and for the same reason: containers and groups vary across variants, while an instance element is located by direct key lookup in the flat `elements` map.

**Pros**:
- Matches how composition actually nests. A composition places components that place components, and the appearance it documents is the one after every one of those layers.
- Consistent with the recursion the contract already has. ADR-052 recursed through instance boundaries for configuration; this recurses through the same boundaries for presentation, so a reader learns one depth rule.
- Each hop is local. An override sits on the instance it patches rather than being concentrated in one path array on the outermost element — the concentration that forced ADR-052 to reject its own path-addressed option.

**Cons / Trade-offs**:
- Transform-resolved elements are not recursion targets. A glyph element inside an instance is produced by the glyph convention rather than placed as an authored instance, so there is no stable authored key to address it by. Those are excluded by the transforms, not by the schema — see Notes.
- No structural bound on depth. A deeply nested block is legal and expensive to resolve; nothing in the schema stops it.

---

#### Option B: One hop only *(Rejected)*

Keys name the instanced component's own anatomy elements and nothing deeper. Depth is expressed by putting an `overrides` block on each instance in the tree.

**Rejected because**: the depth it offers only exists when the intermediate instances are authored in the same spec. A composition that places `filterBar` holds no element entry for `filterBar`'s internal `selectedPill`, because an instance is a leaf reference — so there is nowhere to hang the second hop, and the composed case is unreachable rather than merely verbose. The driver is explicit that depth is real and composed.

---

### Decision 3 — Matcher type

#### Option A: Reuse `PropConfigurations` *(Selected)*

`Override.configuration` is typed `PropConfigurations`, the same type `Variant.configuration` carries.

**Pros**:
- Matching is matching. An override entry is matched against the instanced component's resolved prop values, which is exactly what a variant is matched against — one matcher type, one layering rule.
- No new value union to keep in parity across `types/` and `schema/`.

**Cons / Trade-offs**:
- The type admits members that are meaningless in a matcher — `PropBinding`, `SlotContentRef`, `$nested`. `Variant.configuration` already admits them, so this inherits an existing looseness rather than adding one, and a narrowed union would make the two matchers diverge for no behavioral gain.

---

#### Option B: A narrowed matcher union *(Rejected)*

Define `OverrideConfigurationValue` as scalars and `null` only, the way `InstanceExampleConfigurationValue` narrows `PropConfigurationValue` (ADR-080, ADR-111).

**Rejected because**: the precedent does not transfer. `InstanceExample` narrows because it is a different *kind* of thing — a documented configuration, not a live one — so admitting a binding there would be a category error. An override matcher is the same kind of thing as a variant matcher, matched against the same resolved values by the same rule. Narrowing one and not the other would leave two matcher types in the contract whose difference no consumer could act on.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Override.ts` | **New file** — adds `Overrides`, `Override`, `ElementOverrides`, `ElementOverride` | MINOR |
| `Element.ts` | Added optional field `overrides` | MINOR |
| `index.ts` | Export the four new types | MINOR |

**Example — new shape** (`types/Override.ts`):

```yaml
# New
Overrides: Override[]

Override:
  configuration?: PropConfigurations   # absent = applies at every configuration
  elements: ElementOverrides           # required — an entry with no elements says nothing

ElementOverrides: Record<string, ElementOverride>

ElementOverride:
  styles?: Styles
  content?: string                     # `string` only — no PropBinding
  overrides?: Overrides                # recursion, meaningful on an instance element
```

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
  children?: Children
  parent?: string | null
  styles?: Styles
  contentStyles?: ContentStyles
  propConfigurations?: PropConfigurations
  instanceOf?: string | PropBinding | SubcomponentRef
  content?: string | PropBinding
  overrides?: Overrides          # NEW — optional, MINOR
  $extensions?: ElementExtensions
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Added definitions `Overrides`, `Override`, `ElementOverrides`, `ElementOverride` | MINOR |
| `component.schema.json` | Added property `overrides` to `#/definitions/Element/properties` | MINOR |

**Example — new definitions** (`schema/component.schema.json`):

```yaml
Overrides:
  type: array
  items:
    $ref: '#/definitions/Override'

Override:
  type: object
  properties:
    configuration:
      $ref: '#/definitions/PropConfigurations'
    elements:
      $ref: '#/definitions/ElementOverrides'
  required: [elements]
  additionalProperties: false

ElementOverrides:
  type: object
  additionalProperties:
    $ref: '#/definitions/ElementOverride'

ElementOverride:
  type: object
  properties:
    styles:
      $ref: '#/definitions/Styles'
    content:
      type: string
    overrides:
      $ref: '#/definitions/Overrides'
  additionalProperties: false

# New property under #/definitions/Element/properties
overrides:
  $ref: '#/definitions/Overrides'
  # not in required[] — optional field
```

`ElementOverride.content` is `type: string` with no `oneOf` branch for `PropBinding`, which is how the no-binding rule is carried — the same place the `InstanceExample` no-binding rule is carried.

### Notes

**Where `overrides` may appear.** On any `Element`, which reaches every surface that references the definition: component and subcomponent variant element trees, `slotContentExamples` entries, `Composition.elements` and `Composition.slotContent`, and the component and composition concern documents that mirror them (ADR-109, ADR-110). The concern documents inherit it by reference and need no change of their own.

**`overrides` is meaningful only on an instance element.** Only an element with `instanceOf` has internals to patch. The schema does not couple the two keys — the same stance ADR-052 took for `$nested` — because coupling them in JSON Schema buys a constraint tooling has to re-check anyway, against the instanced component's anatomy, which the schema cannot see.

**What an entry may not set.** `layout`, because an override patches presentation and does not restructure. `propConfigurations`, because configuring a nested instance is `$nested` (ADR-052) and this ADR must not offer a second route to it. `instanceOf`, because swapping the component is a structural change, not a patch. `contentStyles`, because how primitive content filling a slot is formatted is a property of the component that owns the slot (ADR-102), not of a caller patching its appearance.

**Validity of element names and style properties is resolved by tooling, not by the schema.** `ElementOverrides` is keyed by `additionalProperties`, so any name validates; whether the name exists comes from the instanced component's own `anatomy`, which the schema has no way to reach. This is the same boundary `$nested` paths already sit on.

**Transform-resolved elements are excluded by the transforms.** A glyph inside an instance is produced by the glyph convention rather than authored, so it has no stable authored key to address. Declaring that exclusion in the schema would mean encoding a convention's output in the contract; it belongs with the transform that produces it.

**Naming** (Constitution VI, rule 1). `overrides` is the term at least two code platforms use for a caller-supplied presentation patch on a component it does not own, and Figma uses the same word for the per-node delta it records — no translation at any boundary.

**No depth bound.** Recursion through composed instances is unbounded in the schema. A resolution limit, if one is needed, is a transform concern.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**:

| Type (`types/Override.ts`) | Schema (`component.schema.json`) |
|---|---|
| `Overrides` | `#/definitions/Overrides` |
| `Override` | `#/definitions/Override` |
| `ElementOverrides` | `#/definitions/ElementOverrides` |
| `ElementOverride` | `#/definitions/ElementOverride` |
| `Element.overrides` | `#/definitions/Element/properties/overrides` |

Four named definitions, four named exported types — Constitution I parity in both directions. `Styles` and `PropConfigurations` are referenced, not redefined.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-cli` | Recompile | Carries the new field through read, write and validation; no command surface changes |
| `specs-from-figma` | Update usage | Reads a placed instance's nested-layer delta and emits unscoped entries, keyed by anatomy element name, diffed against the instanced component's resolved default. Produces no matched entries — a Figma delta has no configuration dimension |
| `figma-from-specs` | Update usage | Applies each entry's patches as layer overrides on the placed instance. Unscoped entries map directly; a matched entry has no Figma counterpart and is skipped with a warning |
| `react-from-specs` | Update usage | Emits each patch as a rule scoped to the instance, targeting the instanced component's published part classes. An unscoped entry must hold at every state, so it has to outrank the instanced component's own state rules rather than sit at base specificity |
| `webcomponents-from-specs` | Update usage | Same, through `::part()` — every element is already published as a part, so an override key is a part name. Reaching a second shadow boundary needs part forwarding, which is what the recursive form will require |
| `from-specs` | Update usage | Shared resolution: layering entries in order, matching `configuration` against resolved props, and descending the recursion |
| `specs-plugin-2` | Recompile | Reads and writes the field through the shared engine |

### Non-normative: how the property lands on each platform

Nothing here decides anything. It records the mapping, because the shape in Decision 1 was chosen for it.

| Platform | Unscoped entry | Matched entry |
|---|---|---|
| Web (React) | A rule on the instance's own class reaching the instanced component's part classes, outranking that component's state rules | The same rule, narrowed by the selector the `states` convention gives the matched prop and value |
| Web Components | A `::part()` rule, keyed by the same element name the override uses | The same rule, narrowed by a host-state selector |
| iOS (SwiftUI) · Android (Compose) | Applied to the element's resolved style after state resolution | Applied only in the matched state |
| Figma | A nested-layer property override on the placed instance | No counterpart — Figma's delta has no state dimension |

**Why the matcher matters for the `states` convention.** The `states` convention classifies a library's variant props as state concepts, and the code transforms turn classified props into real pseudo-class and ARIA selectors rather than `data-*` attributes. An instance placed in a composition sets `state: rest` in its `propConfigurations`, but the component it instances still carries the `:hover` and `:active` rules its own variants declared — so an override's relationship to those rules has to be stated, not left to the emitter. The unscoped form states it one way: the patch holds at every state, so it outranks them. The matched form lets an author state the other case — a different patch at hover — naming the same prop and value the `states` convention classified, which is what gives the emitter a selector to write it into.

---

## Semver Decision

**Target version**: `0.40.0` — the version of `packages/schema` on the active `release/next` branch this ADR merges into.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: Four additive exported types and one new optional field on an existing type. No exported type or field is removed, renamed, or narrowed, and no schema file is added, removed or restructured. Constitution, Versioning: "`MINOR` for additive types or new optional fields."

---

## Consequences

- A composition or a slot-content example can state the appearance it actually documents, instead of naming a component and losing every adjustment made to it in place.
- The surface ADR-052 deferred by name is supplied, and the boundary it drew holds: configuration stays on `propConfigurations` and `$nested`, presentation moves to `overrides`, and neither offers a second route to the other's job.
- `Element.styles` keeps its meaning. "How the instance sits in its parent" and "how its internals look" are separate properties, so neither has to be read as the other.
- An override's relationship to interaction state is answered in the contract rather than per emitter: unscoped holds at every state, and a matched entry names the state it applies to.
- The Figma transform implements a subset. Unscoped entries round-trip; matched entries are authored-only, and a spec carrying them loses them on a round trip through Figma. This is a declared asymmetry, not a defect to be closed.
- The schema validates shape only. An element name that does not exist in the instanced component's anatomy, or a style property that component cannot accept, passes validation and is caught when tooling resolves the reference.
- Overrides inside component definitions are permitted and discouraged. A component that needs an instance of another component to look different should usually say so in that component's own variants; guidance steers this, not validation.

---

## Open Questions

- **Resolution depth limits.** Unbounded recursion is legal. Whether the transforms cap it, and what they do at the cap, is a transform decision taken when the recursive form is implemented.
- **Part forwarding on Web Components.** The recursive form needs `exportparts` on intermediate components to reach a second shadow boundary. Whether the emitter publishes parts transitively by default is a transform decision, not a contract one.
