# ADR: Promoting a Container, and a Platform-Level `stylesProp`

**Branch**: `adr/spec-time-promotion`
**Created**: 2026-08-30
**Status**: ACCEPTED
**Summary**: A container promotes on `layoutMode` with its children as slot content, and `stylesProp` names each platform's styling prop.
**Decides**: styles.layoutMode
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

A container differs from a text or glyph layer in two ways that matter to ADR-074's
promotion.

**It is selected by direction.** Design systems commonly ship a `Row`/`Column`/`Box` trio
rather than one layout component with a direction prop. `Styles.layoutMode` is
`'NONE' | 'HORIZONTAL' | 'VERTICAL'` — a closed, three-value, structural enum — and it decides
which of the three a frame corresponds to.

**It is not a leaf.** A promoted text layer becomes an instance and is done. A promoted frame
has children — the layers the designer put inside it — and those have to go somewhere. Every
other promotion replaces an element; this one replaces an element that owns a subtree.

Separately, and shared across all three kinds: everything a promotion does not map has to
reach the output. A generator needs to know which prop carries passed styling — `sx` in one
React library, `style` in another, an attribute in Web Components. That is a fact about a
platform's authoring style rather than about the design system, and it is the same for every
primitive on that platform.

---

## Decision Drivers

- **One construct where one will do.** A container's direction is a lookup like any other
  source; it should not need a bespoke shape
- **A promotion must not orphan content.** A frame's children are design intent
- **Layout styling that is not direction stays styling.** Spacing, padding and alignment are
  continuous and have no enum to map onto
- **Platform facts belong to the platform; design-system facts do not**
- **Absence means one thing (ADR-071)**, and **no logic in this package** (Constitution II)

---

## Options Considered

Two decisions: how a container selects its component, and where its children go.

---

## Decision 1 — selecting the component

### Option 1A: `layoutMode` is an ordinary source; the trio is three entries *(Selected)*

Each component claims one `layoutMode` value in its own `values` table. A row with an empty
props object promotes without writing anything — the component *is* the answer — and ADR-075's
scoring picks between them exactly as it picks between several text components.

```yaml
conventions:
  primitives:
    dsRow:    { kind: container, map: [{ source: layoutMode, values: { HORIZONTAL: {} } }] }
    dsColumn: { kind: container, map: [{ source: layoutMode, values: { VERTICAL:   {} } }] }
    dsBox:    { kind: container, map: [{ source: layoutMode, values: { NONE:       {} } }] }
```

A system taking direction as a prop instead writes the same source with a populated object:
`values: { VERTICAL: { direction: vertical } }`.

**Pros**:

- No container-specific construct. The trio and the single-component idiom are the same
  mechanism, and a system with a fourth layout kind needs no schema change
- Selection reuses ADR-075's scoring rather than a second rule for containers
- `Styles.layoutMode` is `LayoutMode | null` and may be absent; absent or null matches the
  `NONE` key, which is what a frame with no auto-layout is

**Cons / Trade-offs**:

- A trio is three entries rather than one, so the component names are not adjacent in the
  file. They are adjacent in the design system's own documentation, which is where the
  grouping is meaningful

---

### Option 1B: A `LayoutMode`-keyed `component` map on a container binding *(Rejected)*

The prior draft: `component: string | Partial<Record<LayoutMode, string>>`.

**Rejected because**: it exists to let one binding name three components, which is only
necessary when conventions name the component at emit time. Once a promotion picks among
entries, three components are three entries, and the union is a second selection mechanism
doing what scoring already does.

---

## Decision 2 — where a promoted container's children go

### Option 2A: The children fill the target's slot, hoisted into `slotContentExamples` *(Selected)*

A layout component takes its content through a slot. The layers inside the promoted frame are
what fills it, expressed the way every other slot fill already is: a `SlotContentRef` in
`propConfigurations`, pointing at a `slotContentExamples` entry holding the subtree.

```yaml
# Before
anatomy:
  wrapper: { type: container }
  icon:    { type: glyph }
  label:   { type: text }
elements:
  wrapper: { styles: { layoutMode: HORIZONTAL, itemSpacing: ... } }
layout:
  - wrapper: [icon, label]

# After
anatomy:
  wrapper: { type: instance, instanceOf: dsRow }
elements:
  wrapper:
    instanceOf: dsRow
    propConfigurations:
      children: { $slotContent: "#/components/dsCard/slotContentExamples/dsCard__wrapper__content" }
    styles: { itemSpacing: ... }        # unmapped layout styling stays
    $extensions:
      com.figma: { promotedPrimitive: true, styles: { layoutMode: HORIZONTAL } }
```

The hoisted entry carries the `anatomy + elements + layout` triplet the subtree already was —
the same shape `slotContentExamples` entries have today.

**Pros**:

- A promoted container is a placed instance in every respect. Consumers that already fill
  slots need learn nothing new
- Uses `SlotContentRef` and `slotContentExamples` exactly as ADR-046 defines them
- Keeps `Element.children` meaning what it means: this element's own child layers. A promoted
  instance has none — its content belongs to the component it now is
- The subtree stays addressable and reusable, since it becomes a named entry

**Cons / Trade-offs**:

- Requires generating a name for the hoisted entry. A deterministic name from the component
  and element key keeps output stable
- Adds a `slotContentExamples` entry per promoted container, so the file grows

---

### Option 2B: Keep `children` in place on the promoted element *(Rejected)*

`Children` is already `string[] | SlotBinding`, so the subtree could stay where it is.

**Rejected because**: an element carrying both `instanceOf` and a list of child element names
is a shape nothing in the contract defines. A placed instance's content comes through its
props; child element names describe layers this element owns, which a promoted instance no
longer does. The two readings would have to be reconciled by every consumer.

---

### Option 2C: Do not promote containers *(Rejected)*

**Rejected because**: it leaves the most common composed element — an auto-layout frame — as a
styled box, which is where most of the inline styling in generated composed content comes
from. Text and glyph promotion improves the leaves while the structure stays untyped.

---

### Option 2D: Promote the container and drop its children *(Rejected)*

**Rejected because**: silent loss of design intent, and the worst possible failure for the
element that carries the composition.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Conventions.ts` | Added `PlatformConventions.stylesProp?: string` | MINOR |
| `Conventions.ts` | Added `ResolvedPlatformConventions.stylesProp` | MINOR |
| *(none)* | Container selection needs no type — `layoutMode` is an ADR-075 `source`, and the slot fill uses `PropConfigurations` and `SlotContentRef` as they stand | — |

**Example — new shape** (`types/Conventions.ts`):

```yaml
PlatformConventions:
  stylesProp?: string        # the prop that receives unmapped styling on this platform
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `conventions.schema.json` | Added `stylesProp` to the platform definition | MINOR |
| `conventions.schema.json` | Removed the `LayoutMode`-keyed `component` union from the container binding, with the binding definitions ADR-074 removes | MINOR |

### Notes

`stylesProp` is a name only. What is placed in it — an object, a class string, a modifier
chain — is generator logic (Constitution II). It sits on the platform rather than per
primitive because passed styling is a property of how a platform's components are authored,
and it is the same for every primitive on that platform.

A container's `backgroundColor`, `padding`, `cornerRadius` and `strokes` remain styling.
`layoutMode` is the container's only mappable source: it is a closed enum, where the rest of a
container's layout is continuous and has no set of accepted values to map onto.

The slot to fill is the target's own. A component with one slot is unambiguous; a target with
several would need the entry to name the slot prop, which no design system in evidence
requires and which is left for a later ADR rather than speculated on here.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: `PlatformConventions.stylesProp` ↔ `stylesProp` on the platform
  definition. Decision 1 and Decision 2 add no types, so there is nothing to mirror: both use
  members that already exist

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Promotes containers and hoists their subtrees during capture | Implement hoisting and naming |
| `specs-from-figma` | Same, in the shared processing path | Implement container promotion |
| `specs-plugin-2` | Same capture path via the plugin runtime | Recompile |
| `figma-from-specs` | A promoted container renders as a frame whose slot fill becomes its children | Expand the hoisted entry when restoring |

---

## Semver Decision

**Version**: `0.32.0` (release branch `release/schema-0.32.0+cli-0.29.0`) — **MINOR**

**Justification**: one additive optional member. The container binding union removed here was
added in the same unreleased version and never published.

---

## Consequences

- A container promotes through the same table and the same scoring as every other kind
- A `Row`/`Column`/`Box` trio is expressible without a container-specific construct, and so is
  a single layout component with a direction prop
- A promoted container is a placed instance in every respect, including how its content is
  carried, so nothing has to read an instance with child element names
- A promoted frame's subtree becomes a named, addressable `slotContentExamples` entry
- Layout styling that is not direction stays styling, which is what it is
- Every platform states once which prop carries unmapped styling
- Composed example content grows an entry per promoted container, and hoisted entry names must
  be deterministic for output to be stable
