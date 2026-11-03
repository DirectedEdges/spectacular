# ADR: Container Promotion Sources Opened to Closed-Value Layout Properties

**Branch**: `adr/layout-primitive-sources`
**Created**: 2026-09-17
**Status**: ACCEPTED
**Summary**: `FigmaElementExtension.children` records a promoted container's hoisted fill beside the consumed styles, and container promotion sources widen to all closed-value layout members.
**Decides**: crossAxisAlignment, itemSpacing, layoutMode, mainAxisAlignment, padding, wrap, wrapAlignment
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — amends the container decisions of ADR-076)*

---

## Context

ADR-076 decided that a container promotes on `layoutMode` with its children as slot
content, and closed the container's source set at that one member on the ground that
"spacing, padding and alignment are continuous and have no enum to map onto."

Building a real layout component against that decision showed the ground does not hold
where a library authors its spacing on a finite token scale. A `values` table matches
what a style carries **literally** — a token path or a raw scalar — so a frame whose
`itemSpacing` carries `Space/Item spacing/0_5x` enumerates exactly the way a text
layer's typography token does. The library's scale is the closed set; the table rows
are its members. Working sessions confirmed `itemSpacing` and `padding` mappings
produce a promoted layout instance whose spacing rides its own enum props, with
unmapped styling still reaching output as passed styling.

Two gaps in the record follow:

- The per-kind honoured source table (documentation on `PrimitiveRule`, deliberately
  not enforced by the schema) still names `layoutMode` as the container's only source.
  This ADR opens the set on a stated principle rather than appending members ad hoc.
- ADR-076's hoisted slot fill is referenced only from `propConfigurations`, under
  whichever prop the conventions table named. A promoted **leaf** records its consumed
  `content` in `$extensions.com.figma` precisely so restoration never consults the
  table; the promoted container's fill had no such table-independent record.

---

## Decision Drivers

- **No logic in this package** — the source set stays documentation honoured by
  implementations; the schema's validation surface must not track the `Styles` key set
  (ADR-075's choice, reaffirmed by ADR-076)
- **Type ↔ schema parity** — an added extension member lands in both `types/` and
  `schema/`, or the asymmetry is justified
- **A promotion must reverse from the spec alone** — everything demotion needs is
  recorded on the element, never recovered by consulting the conventions table
  (the ADR-084 principle)
- **One mechanism** — a new source is a documentation row and table rows, never a new
  construct
- **Additive only** — nothing existing is renamed, removed, or retyped

---

## Options Considered

Two decisions, resolved separately.

---

## Decision 1 — what makes a `Styles` member an eligible container source

### Option 1A: Eligibility by closed value space *(Selected)*

A container source is any `Styles` member a frame carries whose **authored value space
is closed** — a structural enum, or a value drawn from a finite scale the library
authors with (a token collection, a fixed set of raw scalars). The honoured set under
this rule:

- `layoutMode` (structural enum; absent or `null` matches a `NONE` key)
- `itemSpacing` (token scale or fixed scalars)
- `padding` (token scale or fixed scalars)
- `mainAxisAlignment` (structural enum)
- `crossAxisAlignment` (structural enum)
- `wrap` (boolean)
- `wrapAlignment` (structural enum)

**Pros**:

- States *why* a member qualifies, so the next candidate is a documentation row
  measured against a principle rather than a fresh decision
- Matches how `values` already works — literal keys over a finite vocabulary — and how
  `glyph` already treats `width`/`height` (raw scalars from a closed size set)
- Keeps ADR-076's true claim intact: a value that is genuinely continuous in a library
  (a measured width, an arbitrary pixel gap) has no closed vocabulary, matches no key,
  and stays styling

**Cons / Trade-offs**:

- "Closed" is a fact about the library's authoring discipline, not about the member —
  the same `itemSpacing` is enumerable in one library and continuous in another. The
  table author owns that judgement, as they already do for every `values` key.

---

### Option 1B: Any `Styles` member is a source *(Rejected)*

Drop the per-kind table entirely; whatever resolves, resolves.

**Rejected because**: it invites tables keyed on incidental measured values —
`height: 148.88` — which turn a conventions file from a contract into a snapshot of
one capture. The honoured set is what keeps a table describing the design system
rather than the file.

---

### Option 1C: Append `itemSpacing` and `padding` only *(Rejected)*

Name exactly the two members the working session needed.

**Rejected because**: it repeats the shape of the mistake being corrected — a closed
list justified by the case at hand, reopened by ADR every time a library authors
another layout property on a scale. Alignment and wrap are already authored as closed
enums; excluding them has no principle.

---

## Decision 2 — where a promoted container's fill is recorded for demotion

*(Pre-decided in the working session that validated the container implementation;
recorded here with the alternative for the record.)*

### Option 2A: `children` on the element's `com.figma` extension *(Selected)*

The promoted element records the hoisted fill's `SlotContentRef` in
`$extensions.com.figma.children`, beside the consumed `styles` — the container
analogue of the promoted leaf's `content` member, and for the same reason: rendering
the layer back into Figma must find the subtree without consulting the table that
named the prop.

**Pros**:

- Completes the ADR-084 principle for containers: the extension block alone restores
  the layer — consumed styles say what it wore, `children` says what it held
- The member's name states the invariant: a collapsed root-as-slot target takes its
  fill as children

**Cons / Trade-offs**:

- The pointer is stored twice (under the table-named prop and in the extension), the
  same deliberate duplication `content` already carries

---

### Option 2B: Rely on `propConfigurations` alone *(Rejected)*

The pointer already sits under the prop the table named; demotion could read it there.

**Rejected because**: it makes restoration table-dependent — a renamed or removed
table row orphans the fill — and the leaf promotion already rejected exactly this
when it recorded `content` (ADR-084).

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Conventions.ts` | Amended `PrimitiveRule` documentation: container honoured sources are the closed-value layout members (`layoutMode`, `itemSpacing`, `padding`, `mainAxisAlignment`, `crossAxisAlignment`, `wrap`, `wrapAlignment`), with the eligibility principle stated | PATCH |
| `Element.ts` | Added `FigmaElementExtension.children?: SlotContentRef` | MINOR |

**Example — a promoted container element**:

```yaml
content:
  instanceOf: dsLayout
  propConfigurations:
    direction: VERTICAL
    itemSpacing: 0_5x
    padding: 1x
    children: { $slotContent: "#/components/dsCard/slotContentExamples/dsCard__content__children" }
  styles:
    layoutSizingHorizontal: FILL      # unmapped — still styling
  $extensions:
    com.figma:
      promotedPrimitive: true
      children: { $slotContent: "#/components/dsCard/slotContentExamples/dsCard__content__children" }
      styles:
        layoutMode: VERTICAL
        itemSpacing: { $token: "Space/Item spacing/0_5x", $type: dimension }
        padding: { $token: "Space/Padding/1x", $type: dimension }
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Added `children` (a `SlotContentRef`) to the element `com.figma` extension definition | MINOR |

### Notes

- The honoured source set remains documentation, exactly as ADR-075 decided: `source`
  stays a free string in both type and schema, so the validation surface never tracks
  the `Styles` key set and renaming a style member never invalidates a conventions
  file.
- A source outside the honoured set, or one the element does not carry, continues to
  resolve to nothing — its value stays in `styles` and reaches output as passed
  styling.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes for the `Element.ts` change — `FigmaElementExtension.children` ↔
  `children` on the element extension definition in `component.schema.json`. The
  `Conventions.ts` change is documentation-only by design and has no schema
  counterpart; the asymmetry is the standing ADR-075 decision that sources are
  honoured, not enforced.
- **Parity check**: `FigmaElementExtension.children` (a `SlotContentRef`) ↔
  `#/definitions/…com.figma…/properties/children`.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Honours the opened source set and records the extension `children` pointer at capture | Recompile (spacing sources and the pointer record are already implemented; alignment and wrap members follow the same mechanism) |
| `figma-from-specs` | Demotes a promoted container from the extension block alone — consumed styles back onto a frame, the `children` fill expanded as its subtree | Implement demotion against the new member |
| `specs-cli` | Emits whatever the engine captures | Recompile |
| `specs-plugin-2` | Same capture path via the plugin runtime | Recompile |

---

## Semver Decision

**Target version**: `0.33.0` — the version of the active `release/next` branch this
ADR merges into.

**Change class**: `MINOR` — one additive optional member on an extension interface;
the `Conventions.ts` amendment is documentation and PATCH-class on its own.

**Justification**: Additive optional field, nothing renamed or removed — MINOR-class
per the constitution's semver policy.

---

## Consequences

- A library that authors layout on closed scales promotes its composed frames into
  typed layout instances whose spacing, padding, direction, alignment and wrap ride
  the target's own props — passed styling shrinks to what is genuinely untyped
- The next closed-value layout member is a documentation row and table rows, not an
  ADR
- A promoted container reverses from its element alone: `$extensions.com.figma`
  carries the styles it wore and the fill it held
- A conventions table keyed on a value outside the library's closed vocabulary still
  matches nothing — the fail-safe is unchanged
