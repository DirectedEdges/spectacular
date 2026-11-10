# ADR: Overrides on Instance Elements

**Branch**: `119-instance-overrides`
**Created**: 2026-11-09
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Decides**: `Element.overrides`; the `overridable` annotation on `Styles` properties (the annotation and its semantics here, the per-property values at implementation)
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*
**Depends on**: [ADR-049 — PropConfigurations Bindings](049-prop-configurations-bindings), [ADR-052 — Slotting Content into Nested Instances](052-slotting-nested-instances), [ADR-042 — Composition Type](042-composition-type), [ADR-048 — Component Instance Examples](048-component-instance-examples), [ADR-113 — Style defaults belong to the schema](113-style-defaults-in-the-schema)

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

### What Figma reports

The capture side is not a style diff. A placed instance reports its overrides as a list of node ids with the names of the fields that were overridden on each — no values:

```json
[
  { "id": "7889:4332",
    "overriddenFields": ["bottomLeftRadius", "bottomRightRadius", "cornerRadius",
                         "fills", "topLeftRadius", "topRightRadius"] },
  { "id": "I7889:4332;7889:4327",
    "overriddenFields": ["fills"] },
  { "id": "I7889:4332;7889:4330;4225:29405",
    "overriddenFields": ["fills", "strokes"] }
]
```

Four facts about that payload shape the decisions below.

- **The ids are node ids, not element names.** They resolve against the placed instance to its layers, whose names map to spec element keys. In this sample an id carries one or more segments, and the first entry's id is the instance node itself.
- **The field names are Figma's node-property namespace, not spec style keys.** Every name in the sample appears in Figma's `NodeChangeProperty` union, which the Plugin API documents as "different properties that can be reported by a `PropertyChange`" and whose members include presentation fields (`fills`, `strokes`, `cornerRadius`), layout fields (`layoutMode`, `itemSpacing`, `paddingLeft`, `layoutPositioning`), identity and structure fields (`name`, `parent`, `visible`, `locked`), style-binding fields (`fillStyleId`, `textStyleId`), and configuration fields (`componentProperties`, `componentPropertyReferences`). The documentation page read for this ADR describes the type in the context of document-change events; whether an instance's `overriddenFields` is formally that same type is to be confirmed against the Plugin API at implementation.
- **The fields name what was touched, not what it became.** A field can be listed while its current value equals the component's default — set, then set back. Reading the list alone therefore produces no-op entries.
- **Both aggregate and part are reported together.** `cornerRadius` arrives alongside all four per-corner fields. Taking the list at face value emits the same adjustment twice, in two vocabularies.

### What the emitted components are expected to accept

The emitted React and Web Components surface is expected to carry a runtime `overrides` prop, so an application author can do from code what a composition does in the spec — pass a per-element patch keyed by the same element names. The prop is not this ADR's contract to fix, but its existence is why the shape below matters: the spec's object and the prop's object should be the same object, not two dialects.

This ADR adds `overrides` to `Element` and an `overridable` annotation to the `Styles` properties that bounds what an override may set.

---

## Decision Drivers

- **The deferred surface is specific.** ADR-052 deferred *deep `styles` and literal `content`* and nothing else. Reaching a prop the instanced component never surfaced is not in scope, and deep *configuration* is already solved by `$nested` — this ADR must not offer a second way to do it.
- **An override is a patch, not a re-resolution.** It layers on top of whatever variant and state the instanced component already resolved. It does not select a variant and it does not restructure — `layout` is not part of the surface.
- **Elements are a flat map.** `Anatomy` and `Elements` are `Record<string, …>`; structural nesting lives in `Layout`. An override surface keyed by element name should be flat for the same reason the element map is.
- **Depth is real and composed.** A composition places instances that themselves place instances. ADR-052's `$nested` already recurses through instance boundaries for configuration; an override surface that stops at one boundary leaves the composed case half-expressed.
- **Two consumers want different amounts of it.** The spec ↔ Figma transform round-trips a per-node delta that has no state dimension at all. The spec ↔ code transforms emit stylesheets and accept a runtime prop, where per-state selectors are the native idiom. The contract must be shaped for the wider of the two and is free to leave the narrower one a subset — not shaped for whichever one is implemented first.
- **The override surface belongs in the contract.** Which style properties may be overridden is a fact about the schema, not about any one transform. Four consumers would otherwise each keep their own allowlist, and ADR-113 already settled that this class of fact — what a `Styles` property means when it is absent — is declared per property in the schema rather than held in a transform.
- **A static flag cannot express contextual relevance.** Whether `itemSpacing` matters depends on the resolved layout of the element it sits on: under absolute positioning it changes nothing. That is a resolution-time question, and the contract must not pretend to answer it.
- **One node, one property.** The instance node *is* the root of the instanced component. If both `Element.styles` and an `overrides` entry for the root could describe it, every reader and every transform would need a precedence rule for a situation that need not exist.
- **Values are static in the spec.** An override on a documented instance is not a live data flow, the same rule `InstanceExample` already carries: no `PropBinding`.
- **Existing specs must keep validating.** The property is optional and additive — MINOR class (Constitution: Versioning).
- **Minimal, stable API** (Constitution III). New exported types must name genuine shared concepts, and no consumer's internals may drive the shape.

---

## Options Considered

Six independent decisions: the **shape** of the override surface, its **depth reach**, the **type of its matcher**, the treatment of the **root element**, where the **overridable surface is declared**, and whether **contextually inert properties** are filtered at generation. Each is resolved on its own below; the Decision section records only what these resolve.

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
- An unscoped entry's `elements` map is exactly the object the runtime prop takes, so the composition emitter forwards it rather than translating it.
- Additive and optional — existing specs are unaffected.

**Cons / Trade-offs**:
- The common case — one unscoped patch — pays for a list wrapper it does not need.
- The matched form has no Figma path in either direction. Figma's delta carries no state dimension, so a matched entry is authored or code-emitted only, and a round trip through Figma drops it.

---

#### Option B: A flat map keyed by element name *(Rejected)*

`Element.overrides` is `Record<string, ElementOverride>` — the element names directly, no matcher.

**Rejected because**: it cannot say what happens at hover, and the two consumers would answer that differently. A stylesheet emitter has to choose between emitting the patch at base specificity — where the instanced component's own `:hover` rule beats it and the override visibly reverts under the pointer — and emitting it at every state, which is right for the common case but gives an author no way to ask for anything else. The driver says shape the contract for the wider consumer; this shape forecloses it, and reopening it later means either a second property or a breaking change to this one.

---

#### Option C: A recursive `{ styles, elements }` tree *(Rejected)*

Shape the patch as a tree that descends the instanced component's structure, `{ styles, elements: { child: … } }`.

**Rejected because**: it descends a hierarchy the element map does not have. `Elements` is flat and `Layout` holds the nesting, so a tree keyed by element name would have to duplicate the layout tree to be writable, and would drift from it. It also mismatches the per-node delta Figma reports. Depth in this contract is instance depth, not layout depth — which is what Decision 2 settles.

---

#### Option D: Extend `propConfigurations` *(Rejected)*

Carry style patches through the existing `$nested` path mechanism rather than adding a property.

**Rejected because**: ADR-052 settled the category boundary and rejected exactly this merge, in the other direction. Configuration uses the public API; an override breaks it. Filing both under `propConfigurations` would put a prop name and an anatomy element name in the same keyspace, where a component with a prop and an element of the same name becomes ambiguous. Figma reinforces the boundary rather than blurring it: `componentProperties` arrives through the same `overriddenFields` channel as `fills`, which is precisely why the transform must route by field into two different spec properties.

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
- Matches how composition actually nests, and matches what Figma reports: the sample's three-segment id is an override two instance boundaries deep, so a one-hop surface could not record that entry at all.
- Consistent with the recursion the contract already has. ADR-052 recursed through instance boundaries for configuration; this recurses through the same boundaries for presentation, so a reader learns one depth rule.
- Each hop is local. An override sits on the instance it patches rather than being concentrated in one path array on the outermost element — the concentration that forced ADR-052 to reject its own path-addressed option.
- The runtime prop recurses the same way, by forwarding a child's sub-object into that child's own `overrides` prop.

**Cons / Trade-offs**:
- Transform-resolved elements are not recursion targets. A glyph element inside an instance is produced by the glyph convention rather than placed as an authored instance, so there is no stable authored key to address it by. Those are excluded by the transforms, not by the schema — see Notes.
- No structural bound on depth. A deeply nested block is legal and expensive to resolve; nothing in the schema stops it.

---

#### Option B: One hop only *(Rejected)*

Keys name the instanced component's own anatomy elements and nothing deeper. Depth is expressed by putting an `overrides` block on each instance in the tree.

**Rejected because**: the depth it offers only exists when the intermediate instances are authored in the same spec. A composition that places `filterBar` holds no element entry for `filterBar`'s internal `selectedPill`, because an instance is a leaf reference — so there is nowhere to hang the second hop, and the composed case is unreachable rather than merely verbose. Figma's own payload settles it: it reports overrides at arbitrary instance depth on a single placed instance.

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

### Decision 4 — The instanced component's root

#### Option A: The root is not an override key *(Selected)*

An `elements` map may key any element of the instanced component **except its root**. Everything about the instance node itself — its box, its fill, its corners — is `Element.styles` on the instance, as it is today.

```yaml
navigation:
  instanceOf:
    $ref: '#/subcomponents/action'
  styles:                  # the instance node = the instanced component's root
    width: 48
    cornerRadius: 8
    backgroundColor:
      $token: 'color/surface'
  overrides:
    - elements:
        icon:              # inner elements only
          styles:
            fillColor:
              $token: 'color/onSurface'
```

**Pros**:
- The instance node and the instanced component's root are one node. Giving them one property removes a precedence question instead of answering it.
- It matches what Figma reports. The first entry in the sample payload is the instance node's own id, with no instance prefix — the transform sends those fields to `styles`, and only prefixed ids to `overrides`, so routing is structural rather than a lookup.
- Nothing becomes inexpressible. `Element.styles` is the full `Styles` type, so any adjustment the root needs is already sayable there.
- It keeps `width` and `height` in one place. Those are read as the instance's own layout today; a root override entry would make them readable from two.

**Cons / Trade-offs**:
- The exclusion is not structural in JSON Schema. `ElementOverrides` is keyed by `additionalProperties`, and which key is the root comes from the instanced component's anatomy — so a root entry validates and is rejected at resolution, with the element-name check that is already happening there.
- An author moving a block of adjustments between an instance and its component has to split them across two properties.

---

#### Option B: The root is a key, with the overlapping properties excluded *(Rejected)*

Allow a `root` entry but forbid it the properties `Element.styles` already carries for an instance — sizing and layout.

**Rejected because**: it needs a second allowlist whose only job is to name the overlap, and that list is a worse version of the `overridable` annotation Decision 5 introduces, scoped to one key. It also leaves the same node described by two properties, so a reader still has to merge them to know what the instance looks like.

---

#### Option C: Both allowed, with declared precedence *(Rejected)*

Permit a root entry and declare that `overrides` wins over `styles`.

**Rejected because**: precedence is only worth paying for when both forms carry information the other cannot. Here they are the same node and the same `Styles` type, so the rule buys nothing and costs every consumer a merge step — and every author a reason to wonder which one to write.

---

### Decision 5 — Where the overridable surface is declared

#### Option A: An `overridable` annotation on each `Styles` property *(Selected)*

Each of the 46 `Styles` properties gains an `overridable` boolean in `styles.schema.json`, alongside the `description`, `default` and `examples` it already carries. Nested members of the composite style types inherit their parent property's value.

```yaml
# schema/styles.schema.json — #/definitions/Styles/properties
fillColor:
  $ref: '#/definitions/ColorStyleValue'
  description: The fill of a glyph or vector shape.
  default: null
  overridable: true

layoutMode:
  $ref: '#/definitions/LayoutModeStyleValue'
  description: Whether the element stacks its children, and along which axis.
  default: 'NONE'
  overridable: false
```

**Pros**:
- Exactly the precedent ADR-113 set. That ADR moved "what an absent style key means" out of a transform and into a per-property schema annotation, for the same reason: a fact about the contract held in one consumer is drift waiting to happen. `overridable` is the same class of fact about the same properties.
- One source of truth for four consumers. Both Figma directions, both code emitters and the shared resolution core read one flag instead of each keeping a list.
- It upgrades the weakest part of this ADR. Without it, *neither* half of an override's validity is checkable from the contract; with it, the property half is declared and only the element name stays a resolution-time lookup against the instanced component's anatomy.
- Annotation only — no type change, and no document's validity changes.

**Cons / Trade-offs**:
- It declares the static half of the question and not the contextual half. `itemSpacing` can be overridable in principle and inert in a given place, which is Decision 6's problem and stays there.
- 46 values to assign, and each is a judgment. The annotation and its meaning are decided here; the values are settled at implementation against the principle in Notes, because inventing an allowlist is a separate act from establishing where the allowlist lives.
- A custom annotation keyword is inert to validators, so nothing mechanically enforces it. The same is true of `default` today.

---

#### Option B: Each transform keeps its own allowlist *(Rejected)*

Leave the schema silent and let each consumer decide which properties it honors.

**Rejected because**: it is the arrangement ADR-113 ended for `default`, and the failure mode is identical. Four consumers would hold four lists that agree only while someone keeps them agreeing, and the published contract could not answer "may I override this?" at all — a question an author asks before writing the override, not after a transform drops it.

---

#### Option C: Declare it as a JSON Schema constraint rather than an annotation *(Rejected)*

Express the override surface structurally — a separate `OverridableStyles` definition listing only the permitted properties, referenced by `ElementOverride.styles`.

**Rejected because**: it duplicates the `Styles` property list into a second definition that has to be kept in step with the first, which is the drift Constitution I exists to prevent, and it does so to gain validation of the less important half of the check. It would also fix the surface at schema-publish time for every consumer equally, where the annotation lets a platform that genuinely cannot honor a property say so without the contract forbidding it to the others.

---

### Decision 6 — Contextually inert properties

#### Option A: Filter at generation *(Selected)*

An override entry carries only properties that survive the same relevance filtering the element's own `styles` already pass through. An `itemSpacing` override on an element the resolved layout positions absolutely changes nothing, so it is not emitted.

**Pros**:
- `Styles` already means post-processed values. `specs generate` drops a style whose value equals its default (ADR-113), so a spec's style map is already a statement about what matters rather than a transcript of the file. An override map that worked differently would be the odd one out.
- It is the only reading under which an override is checkable. A consumer cannot tell an inert override from a meaningful one without re-deriving the layout, so leaving them in moves that work to every consumer.
- Deterministic output is preserved: the same instance yields the same entries.

**Cons / Trade-offs**:
- A round trip to Figma will not restore an inert override. That is correct by design — the override had no effect — but it is a visible difference between the file and the spec, and it needs to be a documented property of the transform rather than a surprise.

---

#### Option B: Record verbatim and let consumers filter *(Rejected)*

Emit every overridden field the file reports and leave relevance to whoever renders it.

**Rejected because**: it hands the same derivation to four consumers and guarantees they will disagree on the edge cases. It also makes `overrides` the only style-bearing map in the contract that carries values known to do nothing, so a reader could no longer take an entry's presence as a statement that it matters.

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
| `styles.schema.json` | Added `overridable` annotation to each of the 46 `Styles` properties | PATCH |

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

**The root element is not a key** (Decision 4). The instance node is the instanced component's root, and its own appearance is `Element.styles`. A root entry validates structurally and is rejected at resolution.

**What an entry may not set.** `layout`, because an override patches presentation and does not restructure. `propConfigurations`, because configuring a nested instance is `$nested` (ADR-052) and this ADR must not offer a second route to it. `instanceOf`, because swapping the component is a structural change, not a patch. `contentStyles`, because how primitive content filling a slot is formatted is a property of the component that owns the slot (ADR-102), not of a caller patching its appearance.

**Which element names are valid is resolved by tooling.** `ElementOverrides` is keyed by `additionalProperties`, so any name validates; whether the name exists, and whether it is the root, comes from the instanced component's own `anatomy`, which the schema has no way to reach. This is the same boundary `$nested` paths already sit on. The property half of the check is no longer in that position — `overridable` declares it.

**The principle behind an `overridable` value.** A property is overridable when a caller changing it on a placed instance adjusts that instance's presentation without restating the instanced component's own structure. Fills, strokes, corners, typography, colors and the sizing of inner elements qualify. The declarations that constitute the component's layout — whether it stacks its children and along which axis, how it sizes itself against its parent, whether an element exists at all — do not: a caller changing those is redesigning the component, and the answer is a variant in that component or a different component. The per-property values are assigned against this principle at implementation.

**Nested style members inherit.** `overridable` is declared on the 46 top-level `Styles` properties only. A member of a composite value — `cornerRadius.topStart`, `typography.fontSize` — takes its parent property's value, so ADR-116's nested members need no annotation of their own.

**Transform-resolved elements are excluded by the transforms.** A glyph inside an instance is produced by the glyph convention rather than authored, so it has no stable authored key to address. Declaring that exclusion in the schema would mean encoding a convention's output in the contract; it belongs with the transform that produces it.

**Naming** (Constitution VI, rule 1). `overrides` is the term at least two code platforms use for a caller-supplied presentation patch on a component it does not own, and Figma uses the same word for the per-node delta it records — no translation at any boundary. `overridable` is the adjective of the same stem, so the annotation and the property it bounds read as one concept.

**No depth bound.** Recursion through composed instances is unbounded in the schema. A resolution limit, if one is needed, is a transform concern.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes for the type changes; the `styles.schema.json` annotation is a stated exception.
- **Parity check**:

| Type (`types/Override.ts`) | Schema (`component.schema.json`) |
|---|---|
| `Overrides` | `#/definitions/Overrides` |
| `Override` | `#/definitions/Override` |
| `ElementOverrides` | `#/definitions/ElementOverrides` |
| `ElementOverride` | `#/definitions/ElementOverride` |
| `Element.overrides` | `#/definitions/Element/properties/overrides` |

Four named definitions, four named exported types — Constitution I parity in both directions. `Styles` and `PropConfigurations` are referenced, not redefined.

**Stated parity exception for `overridable`.** No type change accompanies it. A TypeScript type cannot express "a caller may patch this member from outside" — that is a fact about who may write a value, not about the value's shape. Parity (Constitution I) is satisfied because no named type is added or altered and the schema gains annotations only. This is the documented exception the parity gate allows, on the same grounds and over the same 46 properties as ADR-113's `default`.

---

## Generation and render — spec ↔ Figma

The capture side has four problems to solve that the shape above does not solve for it. Mechanism belongs to `specs-from-figma` and `figma-from-specs`; what follows is the contract-level behavior each direction owes, written here because the Context payload is what forced Decisions 4 and 6.

### Figma → spec

| Step | What it owes |
|---|---|
| Resolve the id to an element key | An id resolves against the placed instance to a layer, and the layer's name maps to a spec element key through the same naming convention the rest of generation uses. An unprefixed id is the instance node itself and routes to `Element.styles`, not to `overrides` (Decision 4) |
| Place the entry at the right depth | An id carrying more than one instance segment is an override below the first boundary, and nests under the entry for the instance it sits in (Decision 2) |
| Route the field, not just read it | `overriddenFields` mixes categories. Presentation fields become `styles`; `characters` becomes `content`; `componentProperties` and `componentPropertyReferences` are configuration and belong to `propConfigurations` / `$nested` (ADR-052), never to `overrides`; identity and structure fields — `name`, `parent`, `locked`, `expanded`, `autoRename`, `pluginData`, `exportSettings`, `reactions`, prototype and connector fields — are not presentation and are dropped |
| Diff, do not transcribe | A listed field may hold the component's default value. The field list is a candidate filter; the entry is emitted only where the resolved value differs from the instanced component's resolved default |
| Evaluate the value in its own kind | A field's value may be a raw value or a bound style, and the two produce different spec values — a literal, or a `$token` reference. Fields such as `fillStyleId` report the binding rather than the paint, so a field and its binding sibling describe one adjustment and must resolve to one spec value, taking the token form where one exists |
| Collapse aggregate and part | `cornerRadius` arriving with all four per-corner fields is one adjustment reported twice. The spec carries one — the form that matches the resolved values, per ADR-010's sides-and-corners model |
| Drop what the context makes inert | Relevance filtering runs as it does for the element's own styles (Decision 6) |
| Drop what is not overridable | A field mapping to a property annotated `overridable: false` is not emitted, whatever the file says (Decision 5) |

### Spec → Figma

- **Order of operations.** Prop configurations are applied before overrides. Figma discards nested overrides when a variant swap changes the instance's resolved structure, so applying the configuration first and the patch second is the only order that survives.
- **Unscoped entries only.** A matched entry has no counterpart in a Figma instance delta and is skipped with a warning rather than flattened into the unscoped case, which would silently apply a hover patch at rest.
- **Token references stay references** where the file has a matching variable or style, and become raw values only where it does not — the same degradation rule the rest of render follows.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-cli` | Recompile | Carries the new field through read, write and validation; no command surface changes |
| `specs-from-figma` | Update usage | Net-new: nothing reads an instance's overridden fields today. Owes the whole Figma → spec column above |
| `figma-from-specs` | Update usage | Applies each unscoped entry's patches as layer overrides on the placed instance, after prop configurations; warns and skips matched entries |
| `react-from-specs` | Update usage | Accepts an `overrides` prop and applies each element's patch to the part it names. An unscoped entry must hold at every state, so it has to outrank the component's own state rules. A composition instance passes the spec's `elements` object as that prop; matched entries are emitted as rules instead, because a value cannot carry a selector |
| `webcomponents-from-specs` | Update usage | The same, inside its own shadow root. Reaching a second boundary from outside needs part forwarding, which is what the recursive form will require of any CSS-side implementation |
| `from-specs` | Update usage | Shared resolution: layering entries in order, matching `configuration` against resolved props, descending the recursion, and reading `overridable` |
| `specs-plugin-2` | Recompile | Reads and writes the field through the shared engine |

### Non-normative: the runtime `overrides` prop

Nothing here decides anything — the emitted prop's contract is the transform packages' to fix. It is recorded because Decision 1 was shaped so that the spec object and the prop object can be one object.

An unscoped entry's `elements` map is the prop's value. The component applies each element's patch to the part that element names, inside its own render, which is why no `::part()` or descendant rule is needed for the unscoped case and why the patch beats the component's own state rules without a specificity contest — matching the "applies at every configuration" semantics exactly. Recursion is forwarding: a component hands a child instance the sub-object under that child's key.

Two things the prop cannot do, both of which follow from it being a value rather than a selector:

- **It cannot carry the matched form.** A component does not know it is hovered without tracking it, and CSS does. Matched entries are therefore generation-time only: available to a composition, not to a runtime caller. A prop that flowed into custom properties consumed by per-state rules would close the gap, at the cost of restating every overridable property as a variable in every emitted stylesheet.
- **It cannot be narrower than the schema says.** The properties it accepts are the ones annotated `overridable`, so the prop's type is derived from the contract rather than chosen per platform.

### Non-normative: how an entry lands on each platform

| Platform | Unscoped entry | Matched entry |
|---|---|---|
| Web (React) | The `overrides` prop, applied to the named part in the component's own render | A generated rule, narrowed by the selector the `states` convention gives the matched prop and value |
| Web Components | The same, inside the component's shadow root | The same, narrowed by a host-state selector |
| iOS (SwiftUI) · Android (Compose) | Applied to the element's resolved style after state resolution | Applied only in the matched state |
| Figma | A nested-layer property override on the placed instance | No counterpart |

**Why the matcher matters for the `states` convention.** The `states` convention classifies a library's variant props as state concepts, and the code transforms turn classified props into real pseudo-class and ARIA selectors rather than `data-*` attributes. An instance placed in a composition sets `state: rest` in its `propConfigurations`, but the component it instances still carries the `:hover` and `:active` rules its own variants declared — so an override's relationship to those rules has to be stated, not left to the emitter. The unscoped form states it one way: the patch holds at every state, so it outranks them. The matched form lets an author state the other case — a different patch at hover — naming the same prop and value the `states` convention classified, which is what gives the emitter a selector to write it into.

---

## Semver Decision

**Target version**: `0.40.0` — the version of `packages/schema` on the active `release/next` branch this ADR merges into.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: Four additive exported types and one new optional field on an existing type. No exported type or field is removed, renamed, or narrowed, and no schema file is added, removed or restructured. Constitution, Versioning: "`MINOR` for additive types or new optional fields." The `overridable` annotation is PATCH-class on its own — no document's validity changes — and is carried by the MINOR release it ships in, as ADR-113's `default` annotations were.

---

## Consequences

- A composition or a slot-content example can state the appearance it actually documents, instead of naming a component and losing every adjustment made to it in place.
- The surface ADR-052 deferred by name is supplied, and the boundary it drew holds: configuration stays on `propConfigurations` and `$nested`, presentation moves to `overrides`, and Figma's habit of reporting both through one channel is resolved by routing rather than by blurring them.
- The published contract answers "may I override this property?" for the first time. Four consumers read one annotation instead of keeping four allowlists, and an author gets the answer before writing the override rather than after a transform drops it.
- `Element.styles` keeps its meaning and gains a boundary. The instance node has exactly one property describing it, so "how the instance sits and looks in its parent" and "how its internals look" never contend for the same node.
- An override's relationship to interaction state is answered in the contract rather than per emitter: unscoped holds at every state, and a matched entry names the state it applies to.
- The emitted components can offer the same capability to application authors as a prop whose value is the spec's own object, so a composition's patch and a caller's patch are one mechanism rather than two.
- The Figma transform implements a subset. Unscoped entries round-trip; matched entries are authored or code-emitted only, and a spec carrying them loses them on a round trip through Figma. This is a declared asymmetry, not a defect to be closed.
- A spec is a statement about what matters, not a transcript. Inert and non-overridable fields the file reports do not reach it, which also means a round trip does not restore them.
- Element-name validity remains a resolution-time check. A name absent from the instanced component's anatomy, or naming its root, passes JSON Schema and is caught when tooling resolves the reference.
- Overrides inside component definitions are permitted and discouraged. A component that needs an instance of another component to look different should usually say so in that component's own variants; guidance steers this, not validation.

---

## Open Questions

- **The `overridable` values.** The annotation and the principle are decided here; assigning all 46 is an implementation step needing review, and a handful are genuinely arguable — `opacity`, `visible`, `rotation`, and the min/max sizing pairs.
- **`visible` has no override path.** Hiding an element inside an instance is a thing Figma records and a thing authors do, and `styles.visible` exists — but hiding an element the component declares is close to the structural line the principle draws. Whether it is overridable is the sharpest case the annotation pass has to settle.
- **The prop's node shape.** The spec's per-element node is `{ styles, content, overrides }`. A runtime caller would more likely want to write `{ icon: { fillColor: … } }` than `{ icon: { styles: { fillColor: … } } }`. Passing the spec object through unchanged argues for the node shape; hand-authoring argues for the flat one. A decision for the transform packages, noted here because it determines whether the composition emitter forwards or projects.
- **Whether `overriddenFields` is formally `NodeChangeProperty`.** The Plugin API page read for this ADR documents that type for property-change events. The observed field names are drawn from the same vocabulary; the formal typing is to be confirmed before the field-routing table is implemented.
- **Resolution depth limits.** Unbounded recursion is legal. Whether the transforms cap it, and what they do at the cap, is a transform decision taken when the recursive form is implemented.
- **Part forwarding on Web Components.** Any CSS-side implementation of the recursive form needs `exportparts` on intermediate components. Whether the emitter publishes parts transitively by default is a transform decision, not a contract one.
