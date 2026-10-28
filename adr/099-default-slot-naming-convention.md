# ADR: `slots.default.match` — Naming the Default Slot, and Flattened Instance Nesting

**Branch**: `adr/children-slot-convention`
**Created**: 2026-10-02
**Status**: ACCEPTED
**Summary**: A `specs.slots.default.match` convention and `SlotProp.defaultSlot` marker name a component's one always-composed slot, enabling flattened child nesting.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

A composition nests components inside components. Today, every nested slot —
including a purely structural "layout" component whose entire job is to hold
one stream of children — is represented through the same mechanism as a
genuine multi-slot composition: an explicit slot-content-reference binding at
that level, pointing at the next composed instance.

A typical composition hierarchy:

```yaml
dePage:
  dePageRow:
    deSection:
      deBlock:
        deContainer:
          - deCard
          - deCard
          - deCard
```

Every node above `deCard` exposes a single `SlotProp` that is always composed
and typically contains nothing else — a pattern `specs-from-figma` already
recognizes well enough to collapse the Figma slot primitive and its root into
one anatomy element (ADR-083, ADR-090). But in example/composition data, that
recognition stops at anatomy: each layout level still carries its own
explicit binding to the next, producing a verbose, one-level-deep binding
chain that is hard to author and hard to scan for the multi-slot composition
it is not.

`Conventions` already states this class of fact for other naming-driven
behaviors. They divide along one line, drawn by ADR-073 Decision 4: a
convention that names something in a **platform's artifacts** is a
`PlatformConventions` member, loaded from
`config/conventions/<platform>.yaml` — `glyphs.match` names Figma assets,
`codeOnlyProps.match` a Figma layer, `subcomponents.match` Figma layer names.
A convention that names something the **spec itself declares** is a
`SpecsConventions` member, loaded from `config/conventions/specs.yaml` —
`states` names a variant prop and an enum value that exist in `api.yaml`,
`accessibility.label` and `value` name props
(`packages/schema/types/Conventions.ts`). No member of either shape currently
identifies which slot prop on a component is the one "default" slot a layout
component composes through.

This ADR adds that fact — `slots.default.match` — **and** decides the
composition-side mechanism that fact enables: when a slot prop matches it, an
authored example may nest the filling instance as a plain child element
rather than through an explicit slot binding at every level. Both the
convention and the flattened-nesting rule are decided here, in this ADR; only
the engine work to produce and consume that shape in `specs-from-figma` and
`figma-from-specs` remains follow-up implementation (see Downstream Impact).

---

## Decision Drivers

- **Constitution I (types ↔ schema parity)**: any new field in
  `types/Conventions.ts` requires a mirrored, symmetric change in
  `schema/conventions.schema.json`.
- **Constitution II (no logic)**: this package states that the convention
  exists, its shape, and the composition rule it enables — not the
  tree-walking algorithm a consumer uses to apply it. That implementation
  belongs to `specs-from-figma` / `figma-from-specs`.
- **Constitution III (minimal, intentional API)**: the new field must
  represent a genuine, shared convention-surface concept, not an
  implementation detail of one downstream package's tree-walking algorithm.
- **ADR-073 Decision 4 (what is a platform fact and what is a spec fact)**: a
  convention belongs to `PlatformConventions` when what it names lives in that
  platform's artifacts, and to `SpecsConventions` when what it names is
  declared by the spec. `states` was relocated for exactly this reason: filing
  it under `figma` said it described the design tool, which it did not.
- **Shape consistency with existing naming conventions**: a naming
  convention is an object wrapper (`{ match }`), never a bare string —
  `glyphs`, `codeOnlyProps`, and `subcomponents` all take this form. The new
  field follows the same shape rather than introducing a one-off bare-string
  exception.
- **Field name and grouping**: the convention reads as `slots.default.match`
  — a new `slots` object (consistent with the existing noun-keyed vocabulary
  `glyphs` / `codeOnlyProps` / `subcomponents` / `images`) with a `default`
  sub-key naming *which* slot is the default one. This also leaves room for
  a future non-default slot convention to live under the same `slots` object
  without a new top-level key, though no such convention is designed here.
- **Backward compatibility**: the field must be additive and optional —
  absence must mean exactly what every other `PlatformConventions` block's
  absence means: the library declares no such convention, and the capability
  it enables does not apply. No existing conventions file should need to
  change to remain valid.
- **Self-contained consumption**: a generated spec is the contract consumers
  read — a downstream reader (the flattening rule itself, `figma-from-specs`
  at render time, any other tool) must be able to tell which `SlotProp` is
  the default slot by reading the spec alone. It must not need to fetch
  `Conventions` and re-run `slots.default.match` against prop names just to
  recover a fact the generation step already resolved once. Where a reader
  genuinely cannot resolve the fact from the spec it holds — a render choosing
  a slot inside a *nested instance*, whose own component spec is not in hand —
  the spec must still carry the convention rather than the reader fetching it
  from the workspace.

---

## Options Considered

### Decision 1 — Which conventions block houses the convention

#### Option A: `PlatformConventions`, loaded from `config/conventions/figma.yaml`

Treat the default slot as a Figma naming fact, beside `glyphs.match`,
`codeOnlyProps.match` and `subcomponents.match`, under ADR-073's
platform-keyed `Conventions.platforms` map.

**Rejected because**: those three precedents all name something that exists
only in a platform's artifacts — a Figma asset, a Figma layer, a Figma layer
name — and the thing being named here is a `SlotProp`, which the spec
declares and every platform reads identically. Filing it under `figma` makes
three claims that are all false: that a code platform could designate a
*different* default slot for the same component (it cannot — the prop is the
same prop), that a reader holding only the spec cannot apply the convention
(it can — the prop names are right there in `api.yaml`), and that the fact
belongs to the tool rather than to the library. This is the identical
mistake ADR-073 Decision 4 corrected for `states`, and correcting it here
costs one relocation now against a permanently miscategorised vocabulary.

#### Option B: `SpecsConventions`, loaded from `config/conventions/specs.yaml` *(Selected)*

Add `slots` to `SpecsConventions` — the sibling of `platforms` holding
conventions about the spec itself — alongside `states`,
`accessibility.label` and `value`.

**Selected because**: every member already in `SpecsConventions` names a prop
or an enum value the spec declares, which is exactly what
`slots.default.match` names. The test ADR-073 Decision 4 set — *can a
transform reading only the spec apply it?* — is satisfied: a reader matches
the patterns against the component's own slot prop names and needs no Figma
access at all. Stating it once, library-wide, is also the correct cardinality:
there is one answer per library, not one per platform, so a platform-keyed
home would invite two platforms to disagree about a fact that cannot differ.

---

### Decision 2 — Field shape: bare string vs. object wrapper

#### Option A: `slots.default` as a bare string

`slots?: { default?: string }` — a literal prop name or pattern, with no
further nesting.

**Rejected because**: every existing naming convention in
`PlatformConventions` that identifies something by pattern — `glyphs.match`,
`codeOnlyProps.match`, `subcomponents.match` — is an object wrapper, not a
bare string. `stylesProp` and `PropReference.prop` are the bare-string
precedent, but those name a prop *directly*, with no pattern matching
involved. A default-slot convention is a naming *pattern* exactly like
`codeOnlyProps`, not a direct prop name, so the object-wrapper precedent
governs, not the bare-string one. A bare string here would be the one naming
pattern in `PlatformConventions` with no `{ match }` wrapper, which is an
inconsistency the constitution's shape-consistency principle does not
support without a concrete reason this convention is different in kind.

#### Option B: `slots.default` as an object wrapper (`{ match: ... }`) *(Selected)*

Give the convention the same shape as `glyphs` and `codeOnlyProps` — a
nested object whose `match` member carries the pattern.

**Selected because**: consistency with the established shape of every other
naming-pattern convention in `PlatformConventions` outweighs the minimalism
a bare string would offer. `codeOnlyProps` already shows that an object
wrapper is used even for a convention with exactly one member today — the
wrapper is not conditioned on a second property existing yet, it is the
shape the vocabulary already uses for "a pattern that identifies something."
Introducing a bare string here would not reduce nesting so much as create a
second, inconsistent idiom for the same kind of fact.

---

### Decision 3 — `match` cardinality: single string vs. `string[]`

#### Option A: `match: string` (single pattern), mirroring `codeOnlyProps.match`

One pattern per platform entry, following `codeOnlyProps.match` exactly.

**Rejected because**: a single pattern cannot express a library that names
its default/children slot differently across component families — e.g. one
component's default slot prop is `children`, another's is `items`, within
the *same* library. This is not a hypothetical: real libraries already do
this. `codeOnlyProps.match` is the wrong precedent here precisely because a
code-only-props container name is a single, platform-wide convention with
no observed per-family variation; a default-slot prop name does not share
that property. Restricting to one pattern would leave the convention unable
to state a fact that libraries actually exhibit.

#### Option B: `match: string[]` (array), mirroring `subcomponents.match` *(Selected)*

Allow multiple co-existing naming patterns for the default slot prop, the
same way `subcomponents.match` allows several subcomponent naming schemes to
coexist in one library.

**Selected because**: `subcomponents.match` is the closer precedent, not
`codeOnlyProps.match` — both state a fact about naming *variation across
component families in one library*, not a single platform-wide literal.
Different components may legitimately name their default-filling prop
`children` in one family and `items` in another, within the same platform
and the same library, and the convention must be able to say "either of
these names the default slot" rather than forcing a choice of one. `string[]`
is required to express this, not merely preferred stylistically — a
singular `match` would make the convention unable to recognize a default
slot under its second name.

---

### Decision 4 — Composition mechanism: a new type, or the existing `children: string[]` nesting

#### Option A: Introduce a new type to mark cross-instance nesting explicitly

Add a discriminated member (e.g. on `Element` or `Children`) that explicitly
flags "this plain child is a different component instance nested through its
default slot," distinct from an ordinary same-component anatomy child.

**Rejected because**: verified against `types/Children.ts`,
`types/Element.ts`, and `types/PropConfigurations.ts` — the type system
already permits this today with no ambiguity. `Element.children` as a plain
`string[]` is already just an ordered list of keys into the same `elements`
record (`Elements = Record<string, Element>`); nothing in `Element` ties the
meaning of being listed in `children` to being the *same component's*
anatomy rather than a different component's instance. `Element.instanceOf`
is already orthogonal to how an element is reached from its parent — an
element can carry `instanceOf: "deCard"` and simultaneously be a plain
member of its parent's `children: string[]`, all within one
`anatomy + elements + layout` triplet (a `Composition`, a `SlotContent`, or a
component's own definition). A new type would duplicate a distinction the
existing shape already draws for free, which Constitution III does not
support.

#### Option B: No new type — state the rule as documentation on the existing shape *(Selected)*

Use `Element.children: string[]` as it already exists: a child element whose
`instanceOf` names another component is placed as an ordinary member of its
parent's `children` array, in the same `elements` record, with no
`PropBinding`/`SlotContentRef` indirection for that hop. The only
schema-visible change is the new `slots.default.match` convention fact, plus
documentation on `Children`/`Element` clarifying that nested `children`
across instance boundaries is how a default-slot fill is authored when the
filled prop matches the platform's default-slot convention.

**Selected because**: no type change is required — see Decision, Type
changes. This keeps the fix at the level the fact actually lives at: a
naming convention plus a documented reading of a shape that already permits
it, rather than a new mechanism.

---

### Decision 5 — Where a generated spec records which slot is the default: re-derive from `Conventions`, or a durable marker on `SlotProp`

#### Option A: No spec-side marker — every reader re-runs `slots.default.match` against prop names

Leave `slots.default.match` as purely a `Conventions`-side fact. Any
downstream reader that needs to know which slot is eligible for flattened
nesting — the flattening rule itself, `figma-from-specs` reconstructing
nested structure on render, any other tool — fetches the `Conventions` the
spec was generated under (via `metadata.conventions.*`, ADR-071) and
re-evaluates the pattern against the component's prop names.

**Rejected because**: this turns a one-time, generation-time fact into a
repeated cross-package dependency on conventions that the spec should not
need. It also does not degrade gracefully — a reader with no access to the
originating `Conventions` (or a future reader never designed to need them)
cannot determine the default slot at all, even though the generated spec
itself already encodes which `SlotProp` it is. This violates the
self-contained-consumption driver above.

#### Option B: A durable `defaultSlot` marker on `SlotProp`, set once at generation time *(Selected)*

Add `defaultSlot?: boolean` to `SlotProp` (`types/Props.ts`). `specs-from-figma`
consults `Conventions.specs.slots.default.match` only at spec-generation time,
to decide which one `SlotProp` on a generated component gets
`defaultSlot: true` in the output `props` block. Every downstream consumer of
the generated spec then reads `props.<key>.defaultSlot === true` directly off
the spec — it needs no access to `Conventions` at all to know which slot
permits plain nested-children authoring instead of an explicit binding.

**Selected because**: this is the same shape every other provenance-style
fact in this schema already takes — a value resolved once, at generation
time, from a convention, and then recorded durably on the spec so later
readers do not have to re-derive it (`FigmaPropExtension.name`, ADR-066, is
the direct precedent: a convention-driven fact resolved once and carried on
the spec rather than re-computed by every reader). `slots.default.match`
remains exactly as decided above — a generation-time input, authored once
per library in `config/conventions/specs.yaml` — while `defaultSlot`
is the spec-time output of evaluating it. Neither fact is redundant: the
convention is still required to *produce* a correctly marked spec; the
marker is what lets every later stage consume one without the convention in
hand.

---

### Decision 6 — How a render recovers the patterns, which `defaultSlot` cannot give it

`defaultSlot` (Decision 5) answers "which slot prop on *this* component is
the default one". A render reconstructing a flattened tree asks a different
question: a host spec says element `deSection` is an instance of `deSection`
and carries children, and the render has to find the slot *inside that
instance* those children belong in. The instance's component is a different
component, its spec is not in hand, and so its `defaultSlot` marker is not
either. The patterns themselves are the only thing that answers this, so a
render needs them — the question is where it gets them.

#### Option A: The render's caller supplies them from the workspace config

`specs render` reads `conventions.specs.slots.default.match` from the
workspace and passes it in the render payload; `figma-from-specs` takes it as
a parameter rather than reading the spec.

**Rejected because**: it makes a spec non-self-contained in exactly the way
the self-contained-consumption driver forbids. A spec rendered from a
different workspace, or with no workspace in reach, loses the fact; worse, a
*wrong* workspace value renders the content into the wrong slot with nothing
to detect the mismatch, where the spec's own record cannot disagree with how
the spec was built. It also diverges from how every comparable fact already
reaches a render: `naming` and `spec.keys` are read off
`metadata.conventions` / `metadata.settings`, not passed alongside.

#### Option B: Record the spec conventions in the spec's metadata *(Selected)*

`MetadataConventions` gains an optional `specs?: SpecsConventions`, and
`Metadata.create()` records `conventions.specs` beside the one platform entry
it already records. `figma-from-specs` reads
`metadata.conventions.specs.slots.default.match`.

**Selected because**: this is the mechanism already in place for every other
convention a render has to read back, and ADR-079's reason for narrowing
`platforms` to one key does not apply to `specs` — there is no per-platform
vocabulary to leak and no unrelated platform whose change could make a drift
check fire, because there is exactly one spec-conventions block per library.
The field is optional, so a workspace declaring no spec conventions records
none and nothing about existing specs changes. `primitives` and `storybook`
stay out of metadata: the promotion table is spent by the time a spec exists,
and Storybook presentation bears on no reader of one.

---

## Decision

### The convention: `specs.slots.default.match`

`SpecsConventions` gains a `slots` object with one sub-key, `default`
(Decision 1), shaped as an object wrapper (Decision 2) carrying
`match: string[]` (Decision 3) — one or more patterns naming which `SlotProp`
on a component is the library's designated default slot: the one slot a layout
component composes through, and the one through which an instance may be
nested as a plain child rather than through an explicit binding. It is
authored in `config/conventions/specs.yaml`, stated once library-wide, and
read identically by every platform — what it names is a prop the spec
declares, not anything that exists only in Figma. The array form allows a
library to name this slot differently across component families (e.g.
`children` in one, `items` in another).

### The composition mechanism: flattened instance nesting through the default slot

`slots.default.match` is consulted **only at spec-generation time**, by
`specs-from-figma`, against a component's actual Figma prop names, to decide
which one `SlotProp` gets `defaultSlot: true` recorded on it in the
generated spec (see Decision 5 and the discriminant subsection below). From
that point on, every consumer of the generated spec — including the
flattening rule itself — keys off `props.<key>.defaultSlot === true`, not
off re-running `slots.default.match` against prop names. When a slot prop
carries `defaultSlot: true`, an authored example may nest the filling
instance **directly** as an ordinary `Element`, referenced through plain
`children: string[]` in the composing element's own `children` array — an
instance element whose `instanceOf` names the next component in the chain,
placed as a normal child, with no `PropBinding`/`SlotContentRef` hop required
for that nesting.

The consolidation this buys is clearest in `layout`, not in `elements`. A layout
component's whole job is to hold one stream of children, so a composition built from four
of them nests four times before reaching anything a reader came to see — and today each of
those four levels is its own `anatomy + elements + layout` triplet, stored as a separate
`slotContent` entry and reached by a `$slotContent` pointer:

```yaml
# Before — one slotContent entry per layout level, each a separate triplet
layout:
  - dePage:
      - dePageRow            # what fills its children slot is not in this tree

elements:
  dePageRow:
    instanceOf: dePageRow
    propConfigurations:
      children: { $slotContent: "#/compositions/dePage/slotContent/row" }

slotContent:
  row:                       # triplet 2 of 4
    layout:
      - deSection
    elements:
      deSection:
        instanceOf: deSection
        propConfigurations:
          children: { $slotContent: "#/compositions/dePage/slotContent/section" }
  section:                   # triplet 3 of 4
    layout:
      - deBlock
    elements:
      deBlock:
        instanceOf: deBlock
        propConfigurations:
          children: { $slotContent: "#/compositions/dePage/slotContent/block" }
  block:                     # triplet 4 of 4 — the cards, finally
    layout:
      - deContainer:
          - deCard1
          - deCard2
          - deCard3
```

Four layout levels produce four triplets and three pointer hops, and the three cards — the
only content in the composition — are in the last one. No `layout` tree in that document
shows more than one level of the hierarchy, so the nesting a designer sees in the frame is
reconstructable only by following pointers. Every hop exists because the binding mechanism
required one, not because a reader or a renderer needed a decision at that level.

Flattened, the same composition is one `layout` tree, in one triplet, with no
`slotContent` entries at all:

```yaml
# After — one tree. Each layout level is an ordinary parent, because every
# one of their children slots matches slots.default.match
layout:
  - dePage:
      - dePageRow:
          - deSection:
              - deBlock:
                  - deContainer:
                      - deCard1
                      - deCard2
                      - deCard3

elements:
  dePageRow:
    instanceOf: dePageRow
    children: [deSection]
  deSection:
    instanceOf: deSection
    children: [deBlock]
  deBlock:
    instanceOf: deBlock
    children: [deContainer]
  deContainer:
    instanceOf: deContainer
    children: [deCard1, deCard2, deCard3]
  deCard1:
    instanceOf: deCard
  deCard2:
    instanceOf: deCard
  deCard3:
    instanceOf: deCard
```

The hierarchy is unchanged — `deCard1` is still four layout levels below `dePage`. What
collapses is the *representation*: one `elements` record and one `layout` tree instead of
four of each, and a reader scans the nesting in one place rather than opening a document
per level. This is the shape a generated composition's `layout` already takes for its own
containers (`root → layout → section1 → block1 → …`); flattening makes a nested instance
read the same way as a nested container, which is how a designer sees the frame.

This is **verified against the current type system, not a new capability it
grants**: `Elements = Record<string, Element>`, and `Element.children` as a
plain `string[]` is already just an ordered list of sibling keys into that
same record, independent of whether a given child's `instanceOf` names the
same component or a different one. **No `Element`, `Layout`, or `Children`
type change is required.** The only schema-visible change is the new
`slots.default` convention fact (below), plus documentation clarifying the
reading above.

**The existing `SlotContentRef`/`SlotBinding`/`$nested` mechanism remains
required and unchanged for any slot that is *not* the designated default
slot** — true multi-slot composition, where a component exposes more than
one distinct slot prop, continues to require an explicit binding naming
*which* slot a nested instance fills. This ADR narrows *only* the
single-default-slot, always-composed case that `collapsePrimitiveWrapper`
(ADR-083) already recognizes at the anatomy level; it does not change how
any other slot prop is filled.

### The discriminant: `SlotProp.defaultSlot`

`SlotProp` (`types/Props.ts`) gains an optional boolean field,
`defaultSlot?: boolean`, mirrored into the `SlotProp` definition in
`schema/component.schema.json`. This is the durable, spec-side marker
Decision 5 selects — set once by `specs-from-figma` when it generates a
component whose matched slot prop satisfies
`Conventions.specs.slots.default.match`, and read thereafter by every consumer
with no dependency on `Conventions`:

```yaml
props:
  children:
    type: slot
    defaultSlot: true
```

Absence means exactly what absence means on every other optional `SlotProp`
member: this slot is not the designated default slot (or the library
declares no default-slot convention at all), and any instance filling it
must use an explicit `SlotContentRef`/`SlotBinding`, not plain nested
`children`.

**Invariant**: at most one `SlotProp` per component may have
`defaultSlot: true`. This is a cross-property constraint over sibling
entries in a component's `props` map, which JSON Schema cannot express
without `additionalProperties: false`-breaking contortions at a level this
schema does not otherwise reach into (validating one named prop's value
against the shape of its siblings). Consistent with how this schema treats
other cross-key invariants it states but does not mechanically validate
(e.g. `ResolvedPlatformConventions`'s resolved-vs-absent distinction, or
`subcomponents.match`/`exclude` precedence), the invariant is **documented
as an authoring/generator contract, not JSON-Schema-enforced**:
`specs-from-figma` is responsible for setting `defaultSlot: true` on at most
one `SlotProp` per generated component, and any hand-authored spec that
violates the invariant is malformed input a consumer may reject, not a
shape the schema itself rules out.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Conventions.ts` | Added `slots?: { default?: { match: string[] } }` to `SpecsConventions` | MINOR |
| `Conventions.ts` | Added `specs?: SpecsConventions` to `MetadataConventions` | MINOR |
| `Props.ts` | Added `defaultSlot?: boolean` to `SlotProp` | MINOR |
| `Children.ts` | Doc-only: clarified that a plain `children: string[]` entry may name an element that is an instance of a different component, nested through its default slot — no type shape change | PATCH |

`SpecsConventions` serves both the authored and the resolved shape — there is no
`ResolvedSpecsConventions`, because no member of it takes a default, so nothing
resolution could guarantee is missing from the authored form.

**Example — new shape** (`types/Conventions.ts`):
```yaml
# Before (SpecsConventions, excerpt)
SpecsConventions:
  states?: Record<string, VariantStateEntry>
  accessibility?: { label?: PropReference }
  value?: ValueConvention

# After
SpecsConventions:
  slots?:
    default?: { match: string[] }   # new — optional, MINOR
  states?: Record<string, VariantStateEntry>
  accessibility?: { label?: PropReference }
  value?: ValueConvention

# Before (MetadataConventions)
MetadataConventions:
  platforms: Record<string, ResolvedPlatformConventions>

# After
MetadataConventions:
  platforms: Record<string, ResolvedPlatformConventions>
  specs?: SpecsConventions          # new — optional, MINOR
```

Authored in `config/conventions/specs.yaml`:
```yaml
# config/conventions/specs.yaml
slots:
  default:
    match:
      - "children"
      - "items"
```

Recorded on a generated spec, so a render can read it back (Decision 6):
```yaml
# Generated component, metadata excerpt
metadata:
  conventions:
    platforms:
      figma: { naming: SENTENCE, ... }
    specs:
      slots:
        default:
          match: ["children", "items"]
```

**Example — new shape** (`types/Props.ts`):
```yaml
# Before (SlotProp, excerpt)
SlotProp:
  type: 'slot'
  default?: string | null
  nullable?: boolean
  minChildren?: number
  maxChildren?: number
  anyOf?: string[]

# After
SlotProp:
  type: 'slot'
  default?: string | null
  nullable?: boolean
  minChildren?: number
  maxChildren?: number
  anyOf?: string[]
  defaultSlot?: boolean   # new — optional, MINOR
```

Emitted on a generated spec:
```yaml
# Generated component, excerpt
props:
  children:
    type: slot
    defaultSlot: true
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `conventions.schema.json` | Added `slots` object property to the `SpecsConventions` definition, with a nested `default` object carrying `match` | MINOR |
| `conventions.schema.json` | Added `specs` property to the `MetadataConventions` definition, `$ref`-ing `SpecsConventions` | MINOR |
| `component.schema.json` | Added `defaultSlot` boolean property to the `SlotProp` definition | MINOR |

**Example — new shape** (`schema/conventions.schema.json`):
```yaml
# New property under #/definitions/SpecsConventions/properties
slots:
  type: object
  properties:
    default:
      type: object
      properties:
        match:
          type: array
          items:
            type: string
          description: >
            Naming patterns identifying a component's designated default
            slot — the SlotProp further content is always composed through.
            A library may name this slot differently across component
            families (e.g. `children` in one, `items` in another); any
            pattern in the array matches. When a slot prop matches,
            specs-from-figma records `defaultSlot: true` on that SlotProp in
            the generated spec, and a filling instance may then be nested as
            a plain child element rather than through an explicit slot
            binding. Absence means no default slot is designated and every
            slot binds explicitly.
      required: [match]
      additionalProperties: false
  additionalProperties: false

# New property under #/definitions/MetadataConventions/properties
specs:
  $ref: '#/definitions/SpecsConventions'
```

**Example — new shape** (`schema/component.schema.json`, `SlotProp` definition):
```yaml
# New property under #/definitions/SlotProp/properties
defaultSlot:
  type: boolean
  description: >
    Whether this is the component's designated default slot — set by
    specs-from-figma when the slot prop matched the library's
    specs.slots.default.match convention at generation time. When true, an
    authored example may nest a filling instance as a plain child element
    instead of through an explicit SlotContentRef/SlotBinding. Absent means
    false: this is not the default slot, or the library declared no
    default-slot convention. At most one SlotProp per component may be
    true — an authoring/generator invariant, not schema-enforced.
```

### Notes

- No `exclude` member is added alongside `match`, unlike `subcomponents`.
  `subcomponents.exclude` exists to carve out names that would otherwise
  false-positive-match a broad subcomponent pattern (e.g. a layer that looks
  like a subcomponent but isn't). A default-slot prop name has no analogous
  false-positive risk identified here — `match` is tested against a small,
  already-captured set of `SlotProp` names on one component, not against a
  broad layer-naming surface, so there is no concrete scenario requiring an
  exclusion list. Adding `exclude` now would be speculative; it can be added
  later, additively, if a real case emerges.
- `slots.default.match` is optional, with no default — absence states that
  this library declares no default-slot convention, matching how every other
  `SpecsConventions` member's absence is read: no default can supply a fact
  nobody declared.
- The field is a pattern against a `SlotProp`'s `prop` name (the slot's key
  on the component), not against a Figma layer name — it identifies a prop
  on the already-captured spec/component model, which is precisely why it is
  a spec convention and not a platform one (Decision 1).
- No placeholder syntax (`{i}`, `{C}`/`{S}`) is introduced: a default slot
  is identified by the prop name itself, not by a name that embeds a
  component or icon identity, so a literal/pattern string with no
  substitution token is sufficient.
- `slots` is deliberately a wrapper object, not `defaultSlot` as a flat
  `SpecsConventions` member, so a future non-default slot convention
  (not designed here) has a place to land without a new top-level key.
- `specs` on `MetadataConventions` is the first non-platform member of that
  shape. It carries the whole `SpecsConventions` block rather than just
  `slots`, because narrowing it would make the metadata shape track which
  members a current consumer happens to need, and the next spec convention a
  reader has to recover back would widen it again.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `SpecsConventions.slots.default.match` (type) maps to
  `#/definitions/SpecsConventions/properties/slots/properties/default/properties/match`
  (schema). There is no `Resolved` counterpart to mirror: `SpecsConventions`
  is both the authored and the resolved shape, since no member of it takes a
  default.
- **Parity check**: `MetadataConventions.specs` (type) maps to
  `#/definitions/MetadataConventions/properties/specs`, which `$ref`s
  `#/definitions/SpecsConventions` — the same definition the workspace form
  validates against, so a recorded block validates identically wherever it
  appears.
- **Parity check**: `SlotProp.defaultSlot` (type, `types/Props.ts`) maps to
  `#/definitions/SlotProp/properties/defaultSlot` (schema,
  `schema/component.schema.json`) — both optional boolean, both
  absent-means-false, no further resolution shape needed on either side.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Gains a new convention to read (`conventions.specs.slots.default.match`), consulted only at generation time, and a schema-decided rule to implement: match a component's slot props against any pattern in the array, record `defaultSlot: true` on the matched `SlotProp` in the generated spec, and where matched, emit a flattened, nested-children tree in generated example data instead of an explicit slot-content-reference binding at every layout level. `Metadata.create()` additionally records `conventions.specs` on the spec (Decision 6). | Engine implementation work to apply the rule this ADR defines — not a design decision, the rule itself is decided here. |
| `figma-from-specs` | Reads `props.<key>.defaultSlot === true` off the spec to recognize a flattened tree, and `metadata.conventions.specs.slots.default.match` to resolve which slot *inside a nested instance* the children belong in — the one case the marker cannot answer, since that instance's own component spec is not in hand (Decision 6). Must reconstruct the explicit nested slot-content-reference structure from a flattened children tree when rendering back to Figma. | Engine implementation work to recognize a flattened default-slot tree and reconstruct the corresponding instance/slot structure on the canvas. |
| `specs-cli` | Loads and validates `slots.default.match` from `config/conventions/specs.yaml` rather than `figma.yaml`, and names the new home when it meets the key on a platform file. The `init` template for `specs.yaml` documents it. No CLI logic reads the resolved value — it travels to the engine inside `Conventions`, and to the transformers inside the context's existing `specs` block. | Config loader + template work; no change to how either value is passed on. |
| `specs-plugin-2` | None at this ADR's scope. | Recompiles against the new optional fields; no behavioral change until the engine (`specs-from-figma`, bundled from source) consumes them. |

---

## Semver Decision

**Target version**: `0.35.0` — the version of `@directededges/specs-schema`
on the active release branch (`release/next`) this ADR merges into.

**Change class**: `MINOR`.

**Justification**: The change is three new optional fields (`slots` on
`SpecsConventions`, `specs` on `MetadataConventions`, and `defaultSlot` on
`SlotProp`) with no removal, rename, or narrowing of any existing field —
additive-only per Constitution Additional Constraints & Standards
("Versioning": MINOR for additive types or new optional fields). The
`Children.ts` doc clarification carries no type shape change and is PATCH.

`slots` never shipped on `PlatformConventions`: the relocation this ADR
records (Decision 1) lands in the same `0.35.0` release as its introduction,
so no published version ever carried the platform-keyed form and the move is
additive rather than breaking.

---

## Consequences

- A library can declare which `SlotProp` on its layout components is the
  designated default slot, via `config/conventions/specs.yaml`
  (`slots.default.match`) — once, library-wide, for every platform.
- A generated spec carries that fact durably, on the spec itself:
  `specs-from-figma` sets `defaultSlot: true` on the matched `SlotProp`
  once, at generation time, and no downstream consumer needs `Conventions`
  to rediscover it.
- This ADR **decides** the flattened-nesting rule as the effective behavior
  of the schema it amends: when a slot prop carries `defaultSlot: true`,
  the filling instance may be authored as a plain nested child
  (`children: string[]`, `instanceOf` on the child element) rather than
  through an explicit `PropBinding`/`SlotContentRef` at that level. The rule
  is schema-decided now; only the engine work to produce and consume it is
  follow-up.
- At most one `SlotProp` per component may have `defaultSlot: true` — an
  authoring/generator invariant this ADR states but does not encode in
  `schema/`, consistent with how other cross-property invariants in this
  schema are handled.
- Where a slot is *not* the designated default slot, the existing
  `SlotContentRef`/`SlotBinding`/`$nested` binding mechanism remains
  required and unchanged — genuine multi-slot composition is unaffected.
- A spec also records the spec conventions it was generated under
  (`metadata.conventions.specs`), so a render can resolve a slot belonging to
  a nested instance whose own component spec it does not hold.
- **Follow-up implementation work in `specs-from-figma`**: identify, for a
  given component, whether a slot prop matches `specs.slots.default.match`;
  where it does, record `defaultSlot: true` on that `SlotProp`, and where the
  composed content is itself a layout component repeating the pattern, emit
  the flat, nested tree this ADR defines in example data, rather than a
  chain of explicit slot-content-reference bindings.
- **Follow-up implementation work in `figma-from-specs`**: when rendering a
  spec back onto the Figma canvas, read `defaultSlot` off the spec to
  identify a flattened default-slot tree and reconstruct the explicit
  nested structure from it, resolving each nested instance's own default slot
  from `metadata.conventions.specs.slots.default.match`.
- Both follow-ups are engine implementation work against a rule this ADR
  has already decided — they are not deferred design decisions and do not
  require a separate ADR unless they surface a schema-visible concept this
  ADR did not anticipate.
