# ADR: Layout Grid — `layoutMode: GRID` and a Single Templated Axis

**Branch**: `122-layout-grid`
**Created**: 2026-11-13
**Status**: DRAFT
**Summary**: `gridColumns` and `gridRows` template one axis of a `GRID` container, joining `layoutMode` and `itemSpacing`.
**Decides**: styles.layout, anatomy.slot
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — amends ADR-083)*

---

## Context

### What the contract holds today

`Styles.layoutMode` admits `NONE`, `HORIZONTAL`, and `VERTICAL` (ADR-038). Every layout the schema can express is therefore one-dimensional: a row or a column, optionally wrapping (`wrap`, ADR-039), with one gap model (`itemSpacing`, ADR-037) and container alignment on two axes (ADR-040).

Two collapse rules act on containers. ADR-058 strips a plain wrapper around a single text or glyph child. ADR-083 extends that to a root wrapping one slot, merging both boxes and distributing their styles by what each style acts on — a group of *parent-layout* keys (`layoutMode`, `itemSpacing`, `padding`, the two alignments, `wrap`, `wrapAlignment`) goes to both boxes on expansion, on the stated premise that those keys are near no-ops on a wrapper holding exactly one child.

### What Figma's grid expresses

Figma's Plugin API carries a fourth `layoutMode` value, `'GRID'`, with a property set the schema has no home for. The facts that bear on this decision:

| Figma surface | What it does | Contract-relevant limit |
|---|---|---|
| `gridColumnCount`, `gridRowCount` | Track counts on both axes | Both are always present; a grid is never templated on one axis alone |
| `gridAutoTracks` | `'NONE'` or `'ROWS'` | Rows may be generated as children need them. There is no equivalent for columns |
| `gridItemsPositioning` | `'MANUAL'` or `'ROW_AUTO_FLOW'` | Automatic placement is row-major only; the API documents no column-major flow |
| `gridColumnSizes`, `gridRowSizes` | Per-track sizes, read-only | Tracks may be individually fixed or weighted, so tracks need not be equal |
| `gridColumnGap`, `gridRowGap` | The two gaps | Held separately, never as one value |
| `gridColumnSpan`, `gridRowSpan` | Child spans | Available on both axes at once |
| `gridChildHorizontalAlign`, `gridChildVerticalAlign` | `'MIN'`, `'CENTER'`, `'MAX'`, `'AUTO'` | Per-child alignment inside its cell; no container-level alignment exists in a grid |
| `gridColumnAnchorIndex`, `gridRowAnchorIndex` | Child placement, read-only | Explicit cell coordinates under `MANUAL` positioning |
| *(no property)* | — | Figma has no count derived from the container's size |
| *(disallowed)* | — | Grid layout cannot be applied to a slot frame |

A designer can build a grid today. Capture reads a frame whose `layoutMode` is a value the schema's `LayoutMode` union does not contain, and every property above is data with no key to land in.

### The forcing condition

This is a data-faithfulness problem before it is a feature request. The schema cannot currently say *that* a container is a grid, so a captured grid is indistinguishable from a container with no auto-layout, and its intent is lost silently.

The opportunity is narrower than Figma's surface. A grid with per-track sizing, two-axis spanning, and manual placement is a large vocabulary with no confirmed use case in an authored spec, and Constitution III forbids speculative public API. What *is* confirmed, and what every target expresses natively, is the equal-track grid: a container that templates one axis into equal tracks and flows its children into cells in source order.

This ADR decides that subset, how it survives the round trip through Figma in both directions, and the two collapse rules a grid changes.

**Out of scope, named here so they are not resolved in passing:**

- **Spans.** `gridColumnSpan` and `gridRowSpan` on a child need their own ADR.
- **Per-track sizing.** Mixed fixed and weighted tracks need their own ADR.
- **Manual placement.** Explicit row and column anchors need their own ADR.
- **Child alignment within a cell.** A child-alignment property would apply to `HORIZONTAL` and `VERTICAL` equally, so it is not a grid decision.
- **Scrolling.** No `layoutMode` value carries it, and adding it under `GRID` alone would make `GRID` the only mode that can declare it.

---

## Decision Drivers

- **Data faithfulness before feature surface.** A captured Figma grid must be representable as a grid. Anything the schema cannot hold must be reported, never dropped quietly — the failure mode this ADR is most concerned with is a grid that reads back as `layoutMode: NONE`.
- **Types ↔ schema parity (Constitution I).** Every new type has a named schema definition and the reverse. The pairing pattern already used for `ItemSpacing` / `ItemSpacingStyleValue` is the model.
- **Minimal, stable, intentional public API (Constitution III).** New keys must represent a shared concept, not an anticipated one. A key with no spec that uses it is surface the contract has to keep forever.
- **Naming — code platforms first (Constitution VI).** CSS Grid, SwiftUI's grid types, and Jetpack Compose's grid types are the naming authority for these keys. Figma supplies the data, not the vocabulary.
- **Structural enums and narrow types, not `Style` (Constitution, Typing rule).** A track count is computed layout structure, not a design value a token carries. It belongs in a named narrow type alongside `LayoutMode`, `Position`, and `PositionOffset` — never in `Style`.
- **Defaults belong to the schema (ADR-113, ADR-116).** Every new property declares a `default`, and every optional member of a new composite declares its own.
- **Enum options document themselves (ADR-114).** A new `LayoutMode` value is a `oneOf` branch of `const` with its own description, never an entry appended to a bare `enum` array.
- **Additive only.** No existing `NONE`/`HORIZONTAL`/`VERTICAL` spec changes meaning, and no existing key is renamed or reshaped.
- **Round-trip fidelity is a stated cost, not a silent one.** Where the contract can express something Figma cannot, or Figma can express something the contract cannot, the ADR says so and says which direction loses.
- **Absence is not ambiguity, and no heuristic recovers an unrecorded fact.** Two of Figma's limits above — no derived count, no column-major flow — mean the data does not merely under-determine the answer, it carries no signal at all. Where a value could be guessed from a nearby one that already means something else, the guess is refused and the loss is reported. A plausible reconstruction that is wrong is worse than an acknowledged gap, because nothing downstream can tell the two apart.
- **Figma's authoring limits do not bound the contract.** Where Figma cannot express something every code platform expresses natively, the contract follows the code platforms and the mapping absorbs the cost as a documented one-way direction. This is Constitution VI rule 3 read in the direction it was written: defer to Figma's model only when deviating would be substantially costly, and a documented one-way mapping is not that cost.
- **A collapse carries a mode with everything that mode needs.** A rule that moves `layoutMode` between boxes must move whatever makes that mode complete, or it produces a container declaring a layout it cannot perform. Any premise a collapse rule rests on — including ADR-083's "near no-op on a wrapper holding one child" — has to be re-tested against each new mode rather than inherited.

---

## Options Considered

### Decision 1 — How much grid vocabulary the schema adopts

#### Option 1A: Equal tracks on one axis, fixed or adaptive count *(Selected)*

The schema templates exactly one axis into equal tracks. The other axis is implicit, sized by content. Children occupy one cell each, in source order. The count is a fixed integer or an adaptive rule derived from a minimum track size.

```yaml
elements:
  root:
    styles:
      layoutMode: GRID
      gridColumns: 3
      itemSpacing: 16
```

**Pros**:

- Every member of the vocabulary has a direct form in CSS Grid, in SwiftUI's and Compose's grid types, and in Figma's grid data — so the naming driver resolves by consensus rather than by preference.
- It is the smallest addition that makes a captured grid representable *as a grid*, which is the data-faithfulness driver.
- Three new names (`GRID`, `gridColumns`, `gridRows`) and two new types. Constitution III is satisfied without argument.
- Widening later is additive: spans and per-track sizing are new optional keys, not reshapes of these.

**Cons / Trade-offs**:

- A featured card spanning two columns has no form until a spans ADR lands. The workaround — a sibling container above the grid — covers the common full-width-heading case but not a span inside the flow.
- Figma can author strictly more than this subset holds, so an extractor must report unsupported grid features rather than render them.

---

#### Option 1B: Full CSS Grid fidelity now *(Rejected)*

Adopt heterogeneous track lists with fractional units, two-axis counts, and two-axis spanning in one change.

```yaml
styles:
  layoutMode: GRID
  gridColumnSizes: ['300px', '1fr']
  gridRowSizes: ['auto', 'auto']
```

**Rejected because**: no authored spec needs fractional track lists or simultaneous two-axis spanning today, which makes the surface speculative under Constitution III. It also commits the contract to a track-size value type — a union of a length, a fraction, and a content-fit keyword — whose naming has no code-platform consensus to settle it, and settling that badly is expensive to undo.

---

#### Option 1C: Fixed integer counts only, no adaptive form *(Rejected)*

`gridColumns` and `gridRows` as plain integers. No adaptive rule.

**Rejected because**: it lets Figma's authoring limits bound the contract, which inverts Constitution VI. Figma has no adaptive count; CSS, SwiftUI, and Compose all do, and all three model it as a second form of the same parameter. Omitting it would be the one case where the schema's vocabulary is narrower than every code platform's because the data source is narrower — the exact inversion rule 3 of the naming governance exists to prevent.

---

### Decision 2 — Where `GRID` lives

#### Option 2A: A fourth value on `LayoutMode` *(Selected)*

```yaml
# types/Styles.ts
LayoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID'
```

**Pros**:

- `layoutMode` already answers "how does this container place its children", and grid is an answer to that question, not a different question.
- CSS (`display: grid` alongside `display: flex`) and Figma (`layoutMode: 'GRID'`) both model it as one more value of one setting.
- No new key, no new mutual-exclusion relationship between `layoutMode` and something else.

**Cons / Trade-offs**:

- Consumers that exhaustively switch on `LayoutMode` see a compile error on upgrade. See Semver Decision.

---

#### Option 2B: Split the axis into the enum — `GRID_COLUMNS` and `GRID_ROWS` *(Rejected)*

Two new `LayoutMode` values, each naming the templated axis, removing the need for a separate axis-exclusivity rule.

**Rejected because**: the existing values name the axis children *flow along*, and these would name the axis that is *templated* — the same enum would carry two different meanings of "axis". It also has no Figma counterpart, so a value the extractor must synthesize and the renderer must collapse, for a rule that is cheaper to state than to encode.

---

#### Option 2C: A separate `display`-style key *(Rejected)*

Leave `layoutMode` alone; add a key declaring the container's layout model, with `layoutMode` meaningful only under the stacking model.

**Rejected because**: it creates two keys that cannot both be authoritative, and every existing spec would have to be read through a key it does not carry. It is a breaking reinterpretation dressed as an addition.

---

### Decision 3 — How the track count is typed

#### Option 3A: One key per axis, each a union of a count and an adaptive rule *(Selected)*

```yaml
# fixed
gridColumns: 3

# adaptive
gridColumns:
  minSize: 200
```

Typed as a named narrow type, per the constitution's rule for structural values:

```ts
export type GridTracks = number | AdaptiveGridTracks | null;
```

**Pros**:

- Matches how all three code platforms model it: CSS `grid-template-columns` takes `repeat(3, 1fr)` or `repeat(auto-fill, minmax(…))`, SwiftUI's `GridItem` takes `.flexible` or `.adaptive`, Compose's `GridCells` takes `Fixed` or `Adaptive`. Constitution VI rule 1 — two or more code platforms agree — resolves here with no residue.
- One key per axis keeps `gridColumns` readable as "the columns of this grid", whatever form its value takes.
- The union mirrors `itemSpacing: Style | ItemSpacing` and `cornerRadius: Style | Corners`, both of which already carry a scalar-or-object shape in `Styles`.

**Cons / Trade-offs**:

- A consumer that surfaces `gridColumns` as a typed component configuration takes a union rather than a number.

---

#### Option 3B: A third key for the adaptive form *(Rejected)*

`gridColumns` and `gridRows` stay integers; a separate key carries the adaptive rule.

**Rejected because**: it produces three keys of which at most one may be set, replacing one two-form value with a three-way exclusivity rule, and it contradicts every code platform's model of the same concept. The only thing it buys is a scalar type for consumers, which Option 3A's `Cons` already prices as small.

---

#### Option 3C: A single `grid` object carrying axis and count *(Rejected)*

```yaml
grid:
  axis: COLUMNS
  count: 3
```

**Rejected because**: it nests layout values one level deeper than any other `Styles` property that is not a composite of per-side or per-corner values, and it makes the axis a value rather than a key — so a variant that changes only the count has to restate the axis. No code platform models it this way.

---

### Decision 4 — Naming the adaptive minimum

#### Option 4A: `minSize`, one shared member on one shared type *(Selected)*

```yaml
gridColumns:
  minSize: 200   # the smallest width a column may take
gridRows:
  minSize: 120   # the smallest height a row may take
```

**Pros**:

- Compose names this parameter `minSize`; SwiftUI names it `minimum`. Neither names it by axis, because the owning parameter already fixes the axis. Constitution VI rule 1 applies, with Compose supplying the exact spelling.
- One member name means one type and one schema definition serving both keys, which is the cheapest thing to keep in parity under Constitution I.
- The key names the measured axis: a minimum under `gridColumns` can only be a width.

**Cons / Trade-offs**:

- A reader scanning raw YAML sees `minSize` without an axis word. The owning key is one line above it.

---

#### Option 4B: `minWidth` and `minHeight`, two types *(Rejected)*

`gridColumns: { minWidth }` and `gridRows: { minHeight }`, as two separate composite types.

**Rejected because**: it doubles the type and schema definitions for one concept, and it reuses the exact spellings of two existing `Styles` keys — `minWidth` and `minHeight` already constrain the *element*, and would now also constrain a *track* on the same element. Two meanings for one word on one object is a reading hazard the axis-neutral name does not have.

---

### Decision 5 — What happens when a row has fewer items than tracks

#### Option 5A: `collapseUnusedTracks`, an optional boolean inside the adaptive form *(Selected)*

```yaml
gridColumns:
  minSize: 200
  collapseUnusedTracks: true
```

`false` (the default) keeps empty tracks, so a short row holds its track widths. `true` drops unused tracks and lets the remaining items fill the row.

**Pros**:

- It names the rendered outcome, so it reads the same regardless of which platform renders it.
- It is scoped to the adaptive form, where it is the only place the question arises — a fixed count always produces the same tracks.
- The noun is `Tracks` because tracks are what disappear. At a width that fits four tracks with two children, `true` drops two whole columns from every row; it does not empty two cells in one row. `Cells` would name a per-row effect the property does not have, and would introduce a second noun for what the rest of the type calls a track.
- A boolean with a declared default satisfies ADR-116 without introducing a value set that needs its own option descriptions.

**Cons / Trade-offs**:

- It is the one member in this ADR without code-platform consensus behind its name. CSS distinguishes the two behaviors; SwiftUI and Compose expose only the keep-tracks behavior.

---

#### Option 5B: A closed value set named for CSS's keywords *(Rejected)*

A `GridTrackFill` union of `AUTO_FILL` and `AUTO_FIT`.

**Rejected because**: `auto-fill` and `auto-fit` are CSS spellings that describe the mechanism, not the outcome, and they are meaningless vocabulary outside CSS. Constitution VI's rule 2 permits leaning on one code platform when no consensus exists, but it does not require importing that platform's keyword when a plain description of the behavior is available.

---

#### Option 5C: Omit it *(Rejected)*

Always keep unused tracks.

**Rejected because**: the two behaviors are visibly different at the same container width with the same items, and a spec with no way to say which it means has to be read by looking at a rendering. It is one optional boolean on a composite this ADR is already adding.

---

### Decision 6 — The gap between tracks

#### Option 6A: Reuse `itemSpacing` *(Selected)*

A number sets both gaps. The existing `ItemSpacing` object form sets them separately — `horizontal` is the gap between columns, `vertical` the gap between rows.

```yaml
styles:
  layoutMode: GRID
  gridColumns: 3
  itemSpacing:
    horizontal: 16
    vertical: 24
```

**Pros**:

- `itemSpacing` already means "the gap held between stacked children" and already admits a two-axis object (ADR-037). A grid's gap is the same concept measured on two axes, which is what that object exists for.
- One gap model across all four `layoutMode` values. A consumer reading spacing does not branch on layout mode.
- Figma's `gridColumnGap` and `gridRowGap` map onto `horizontal` and `vertical` with no reshaping, and `itemSpacing` already admits a `TokenReference`, which the Figma gaps can carry.

**Cons / Trade-offs**:

- The object's members are named for visual axes, not for tracks, so `horizontal` means "between columns" and must be read that way. It already means exactly this under `wrap`.

---

#### Option 6B: New `gridColumnGap` and `gridRowGap` keys mirroring Figma *(Rejected)*

**Rejected because**: it is Figma's vocabulary imported into the contract for a concept the contract already names, which Constitution VI rule 3 permits only when deviating from Figma would be substantially costly. Here it costs nothing — the mapping is a rename at the transform boundary. It would also produce two keys that are meaningless under three of the four `layoutMode` values.

---

### Decision 7 — Enforcing one templated axis

#### Option 7A: State the rules in the contract; do not encode them in JSON Schema *(Selected)*

At most one of `gridColumns` and `gridRows` carries a non-null value. Two rules make that hold, and both are normative — neither is a trade-off note.

- **Precedence, within one resolved `styles` block.** When both keys are non-null, `gridColumns` is the templated axis and `gridRows` is reported as unsupported. `gridColumns` wins because it is the axis with a Figma round trip, so the resolution agrees with what a capture of the same container would produce.
- **Axis clearing, across variant layers.** A layer that sets one axis clears the other. A variant setting `gridRows: 2` over a base carrying `gridColumns: 3` resolves to a row-templated grid, exactly as if it had also set `gridColumns: null`.

The second rule is what makes the first one rare rather than routine. Without it, every variant that switches axis produces the both-set state, and the precedence rule would then resolve against the variant's own intent — a base's `gridColumns` would outrank a variant's `gridRows` on every switch. With it, the precedence rule covers only a spec that sets both in one block, which is an authoring error.

Both rules are stated in the property descriptions and the type documentation. `styles.schema.json` validates each key independently.

**Pros**:

- It matches how `Styles` already handles every conditional-meaning relationship it carries: `wrapAlignment` is meaningful only when `wrap` is true, the positional offsets are meaningful only alongside `position`, and the axis alignments are meaningful only under a stacking `layoutMode`. None of those is encoded as a cross-property constraint.
- `styles.schema.json` carries no cross-property `allOf`/`not` construct today. Introducing one for this relationship and not for the four that precede it would be an asymmetry nothing in the contract justifies.
- A `null` value is a deliberate form in `Styles` — it is how a variant clears an inherited value. A `required`-based exclusion treats a present `null` as a set value, so the construct would reject specs the contract considers correct.

**Cons / Trade-offs**:

- A spec that sets both axes validates. It is a contract violation that validation does not catch, and the precedence rule above is what a consumer reading it falls back on.
- The axis-clearing rule has to hold through variant differencing, which decides whether a cleared axis is written as an explicit `null` or omitted. An omitted key inherits, which is the opposite of clearing it. Confirming that behaviour is an implementation gate, not a schema one.

---

#### Option 7B: Encode the exclusion in `styles.schema.json` *(Rejected)*

An `allOf` of two `not`/`required` branches on the `Styles` definition.

**Rejected because**: it fails on the `null` case above — `required` tests presence, and a `null` written to clear an inherited value is present. Getting it right needs a construct that tests presence *and* non-nullness on both keys, which is more schema machinery than the rule is worth, for the first cross-property constraint `Styles` would ever carry.

---

### Decision 8 — Where the grid keys go when ADR-083 collapses a slot-only wrapper

ADR-083 merges a root wrapper and the slot box it holds into one element, and rebuilds both on expansion by splitting styles into groups. Its parent-layout group carries `layoutMode`, `itemSpacing`, `padding`, the two axis alignments, `wrap`, and `wrapAlignment` to **both** boxes. `gridColumns` and `gridRows` are not in any group, so a merged grid host expands with `layoutMode: GRID` on both boxes and its track count on neither.

#### Option 8A: Add both keys to the parent-layout group, and make that group's distribution depend on the mode *(Selected)*

The two keys join the parent-layout group, so they are never separated from the `layoutMode` they complete. The group's distribution rule gains one condition: parent-layout keys go to both boxes when the mode is `NONE`, `HORIZONTAL`, or `VERTICAL`, and to the **slot box alone** when the mode is `GRID`. The wrapper keeps the non-layout styles it already keeps.

**Pros**:

- It fixes the defect at its source. A track count travels with the mode it belongs to, so no expansion can produce a grid with no columns.
- It re-tests ADR-083's own premise rather than inheriting it. "Near no-op on a wrapper holding one child" is true of a stacking axis — a lone child lays out the same in a row as in a column — and false of a templated one: a lone child in a three-track grid occupies one track and renders at a third of the width. The condition is where that premise stops holding, stated as a rule.
- The slot box is the box that holds the items, so it is the box the tracks are for.

**Cons / Trade-offs**:

- ADR-083's distribution rule stops being a flat table and acquires a branch, which is a cost to every future reader of that rule.

---

#### Option 8B: Add both keys to the parent-layout group, carried to both boxes *(Rejected)*

The minimal change — two names appended to an existing list, no new condition.

**Rejected because**: it silently breaks the rendered result. A wrapper that becomes a three-track grid holding one child squeezes the slot box into the first track, so the collapse-and-expand round trip changes what the component looks like. It is the smaller edit and the wrong one, and it fails the collapse driver by carrying a mode to a box that cannot perform it meaningfully.

---

#### Option 8C: Declare a `GRID` host ineligible for the wrapper collapse *(Rejected)*

Leave the groups alone; skip the collapse when the merged mode would be `GRID`.

**Rejected because**: Decision 9 produces a grid slot host as the normal capture result for the ordinary way a designer authors a grid in a slot. Making that shape ineligible means the wrapper Decision 9 removes is re-introduced by the very next pass, and a spec's shape would then depend on a style value rather than on its anatomy. It also turns an opt-in setting off on the user's behalf without telling them.

---

### Decision 9 — How a grid inside a slot reaches the contract

Figma disallows grid layout on a slot frame, so a designer who wants a slot whose items lay out as a grid places a grid frame inside the slot. The contract has no such restriction — a slot host is a `GRID` container the moment a spec says so. The two forms differ by one layer, and something has to reconcile them.

#### Option 9A: Collapse on structure — a slot whose only child is a grid frame *(Selected)*

Capture collapses the pair: the slot host takes `layoutMode: GRID` and the track keys, the grid frame's children become the slot's items, and the grid frame is dropped. Render reverses it, emitting a slot frame containing one grid frame. The flatten runs **before** the ADR-083 wrapper collapse, so that collapse sees a grid host and applies Decision 8 rather than meeting a shape it has no rule for.

```yaml
# Figma: slot frame > grid frame > cards
# Spec, after the flatten:
elements:
  content:
    slot: true
    styles:
      layoutMode: GRID
      gridColumns: 3
      itemSpacing: 16
```

**Pros**:

- The trigger is a declared fact. `layoutMode: 'GRID'` on the sole child is read from the data, not inferred from how a layer was named, so no library has to adopt a convention and no rename can break it.
- It makes the rule recorded rather than applied at render time, which is what lets the component asset carry it and instances inherit it — an instance of the component composes items into the slot and they become cells, with no per-instance fixup.
- It matches what the designer sees. The slot renders as a grid in Figma, and the spec says the slot is a grid.

**Cons / Trade-offs**:

- A designer who deliberately wants a grid *element* inside a slot, rather than a grid *slot*, has no way to say so. That shape is indistinguishable from this one, and this reading wins.
- The flatten must run ahead of the wrapper collapse. An ordering dependency between two passes is a thing that can be got wrong silently.

---

#### Option 9B: Collapse on a layer-name convention, such as `Slot grid` *(Rejected)*

Trigger the flatten on a named layer rather than on the child's layout mode.

**Rejected because**: the structure already carries the fact unambiguously, and name matching exists in this contract for cases where it does not — `primitives.match` (ADR-100) and `slots.default.match` (ADR-099) name a layer because nothing in the data says which layer is meant. Here `layoutMode: 'GRID'` on an only child says it. Adding a convention would make every library adopt and maintain a name to get behaviour the data already specifies, and a typo would fail silently as a non-collapse. It is the right mechanism for the Cons above, if that case ever turns out to be real.

---

#### Option 9C: No collapse — keep the grid frame as an element inside the slot *(Rejected)*

**Rejected because**: the slot host then has a child that is not slot content, so a consumer passing items into the slot gets them as siblings of the grid rather than as its cells. The rendered result stops matching Figma, which is the outcome the flatten exists to preserve.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Added value `'GRID'` to `LayoutMode` | MINOR |
| `Styles.ts` | Added property `gridColumns: GridTracks` to `Styles` | MINOR |
| `Styles.ts` | Added property `gridRows: GridTracks` to `Styles` | MINOR |
| `Styles.ts` | Added exported type `GridTracks` | MINOR |
| `Styles.ts` | Added exported interface `AdaptiveGridTracks` | MINOR |
| `Styles.ts` | Added `'gridColumns'` and `'gridRows'` to `StyleKey` | MINOR |
| `index.ts` | Re-export `GridTracks` and `AdaptiveGridTracks` | MINOR |

**Example — new shape** (`types/Styles.ts`):

```yaml
# Before
LayoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL'

Styles:
  layoutMode: LayoutMode
  itemSpacing: Style | ItemSpacing

# After
LayoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID'

GridTracks: number | AdaptiveGridTracks | null

AdaptiveGridTracks:
  minSize: number              # required — the smallest size a track may take, in pixels
  collapseUnusedTracks?: boolean     # optional — default false

Styles:
  layoutMode: LayoutMode
  gridColumns: GridTracks      # optional — MINOR
  gridRows: GridTracks         # optional — MINOR
  itemSpacing: Style | ItemSpacing
```

`StyleKey` gains `'gridColumns'` and `'gridRows'` in the layout block, positioned after `layoutMode` and before `wrap`, so the key order a serialized `styles` block takes keeps the grid keys adjacent to the mode that makes them meaningful.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Added `const: "GRID"` branch to `LayoutModeStyleValue` | MINOR |
| `styles.schema.json` | Added definition `AdaptiveGridTracks` | MINOR |
| `styles.schema.json` | Added definition `GridTracksStyleValue` | MINOR |
| `styles.schema.json` | Added properties `gridColumns`, `gridRows` to `Styles` | MINOR |

**Example — new shape** (`schema/styles.schema.json`):

```yaml
# New oneOf branch on #/definitions/LayoutModeStyleValue — ADR-114 form
- const: GRID
  title: Grid
  description: Children fill cells of equal tracks on the templated axis, in source order.

# New definition — mirrors the ItemSpacing / ItemSpacingStyleValue pairing
AdaptiveGridTracks:
  type: object
  description: >-
    A track count derived from the container, as many tracks as fit at the
    declared minimum.
  examples:
    - { minSize: 200 }
  properties:
    minSize:
      type: number
      exclusiveMinimum: 0
      description: The smallest size a track may take, in pixels.
    collapseUnusedTracks:
      type: boolean
      default: false
      description: Whether tracks that hold no child are dropped from the row.
  required: [minSize]
  additionalProperties: false

GridTracksStyleValue:
  description: >-
    Track count value. Integer when fixed; AdaptiveGridTracks when derived from
    the container; null when the axis is not templated.
  examples: [3]
  oneOf:
    - { type: integer, minimum: 1 }
    - { $ref: '#/definitions/AdaptiveGridTracks' }
    - { type: 'null' }

# New properties under #/definitions/Styles/properties
gridColumns:
  $ref: '#/definitions/GridTracksStyleValue'
  default: null
  description: >-
    The columns the grid templates, when `layoutMode` is `GRID` and the
    column axis is the templated one.
gridRows:
  $ref: '#/definitions/GridTracksStyleValue'
  default: null
  description: >-
    The rows the grid templates, when `layoutMode` is `GRID` and the row axis
    is the templated one.
```

### Notes

**One templated axis.** A `GRID` container templates exactly one axis. The other is implicit and sized by content. At most one of `gridColumns` and `gridRows` carries a non-null value, held by two normative rules:

1. **Precedence.** When both are non-null in one resolved `styles` block, `gridColumns` is the templated axis and `gridRows` is reported as unsupported.
2. **Axis clearing.** A layer that sets one axis clears the other. A variant setting `gridRows` over a base carrying `gridColumns` resolves to a row-templated grid, as if it had also set `gridColumns: null`.

Rule 2 is what keeps rule 1 from firing on a legitimate axis switch. Neither is encoded in JSON Schema — Decision 7 records why.

**Children occupy one cell.** No item-level grid property is added. A full-width heading above a grid is a sibling of the grid inside a `VERTICAL` container, not a spanning child.

**Existing layout keys under `GRID`.** `itemSpacing` applies as the gap between tracks on both axes. `mainAxisAlignment` and `crossAxisAlignment` have no meaning, because they are defined relative to a flow axis a grid does not have. `wrap` and `wrapAlignment` have no meaning, because a grid already breaks at its track count. `position: ABSOLUTE` applies and takes the child out of the grid flow, as it does under every other mode. `layoutSizingHorizontal` and `layoutSizingVertical` on a child are measured against its cell rather than against a stacking axis. None of these is a schema change; each is a statement of what the existing key means under a new `layoutMode` value, and each is documented on its own reference page.

**Why the counts are structural and the gap is not.** `gridColumns` and `gridRows` describe how a container divides itself, which is computed layout structure, so they take a named narrow type and are not token-bindable — the same reasoning that puts `layoutMode`, `position`, `wrap`, and the positional offsets outside `Style`. The gap between tracks is a spacing value a design system does express as a token, and it routes through `itemSpacing`, which already admits a `TokenReference`.

#### Figma ↔ spec mapping

The direction that loses information is named in every row.

| Schema | Figma | Spec → Figma | Figma → spec |
|---|---|---|---|
| `layoutMode: GRID` | `layoutMode: 'GRID'` | Direct | Direct |
| `gridColumns: n` | `gridColumnCount: n` with `gridAutoTracks: 'ROWS'` | Direct; Figma generates the rows | Direct, when the tracks are equal and children are auto-flowed |
| `gridColumns: { minSize }` | *(no counterpart — Figma has no derived count)* | Lossy: a concrete count is written for the frame's width | Not recoverable; the captured frame yields a fixed count |
| `gridRows: m` | `gridRowCount: m` with `gridAutoTracks: 'NONE'` | Column count is derived as `ceil(childCount / m)`; children are reordered row-major to preserve the rendered arrangement | Not recoverable; Figma has no column-major flow, so no captured frame carries the semantics |
| `itemSpacing: 16` | `gridColumnGap: 16`, `gridRowGap: 16` | Direct, both axes | A number when the two gaps match |
| `itemSpacing: { horizontal, vertical }` | `gridColumnGap`, `gridRowGap` | Direct | The object form when the two gaps differ |

**The subset a captured grid must stay inside.** `gridItemsPositioning` is `ROW_AUTO_FLOW`, `gridAutoTracks` is `ROWS`, and the track list is equal tracks. A frame outside that carries grid data this contract has no key for — per-track sizes, spans, manual placement, per-child cell alignment — each of which is reported as unsupported while the frame is still captured as a grid with the properties the contract does hold. Reading such a frame as `layoutMode: NONE`, or dropping the span and emitting the rest, are both the silent failure the data-faithfulness driver names.

**`gridRows` is write-only, and the obstacle is flow order rather than counts.** The contract's row-templated grid fills down each column before moving right. Figma's only automatic placement is row-major, so Figma cannot carry those semantics at all — which is why the render direction reorders children into row-major sequence to produce the same arrangement on the canvas. The column count Figma additionally requires is `ceil(childCount / m)`, derived from children the spec already carries, so nothing is invented; the only loss is that a derived count reads back indistinguishable from an authored one.

Per the absence driver, no heuristic is defined for the reverse. The candidate test — treating columns as derived when `gridColumnCount === ceil(childCount / gridRowCount)` — holds in both directions for any full rectangle, and for ragged cases too: six children in two rows and three columns satisfies it either way, as does seven children in two rows and four columns. It is ambiguous exactly where it would need to be decisive.

**The adaptive form is author-declared.** Decision 7's precedence ranks two keys that both carry values; this is not a ranking problem but an absent fact, so precedence does not reach it. Nor is it inferable: the nearest signal — equal tracks over children sharing a minimum width — cannot separate "these columns are adaptive" from "this card has a minimum width", and the second reading is already captured on the child as its own `minWidth`. Guessing wrong converts a fixed grid into an adaptive one, changing the rendering at every width except the captured one.

A declared minimum therefore survives a round trip only with an explicit carrier outside the grid data — the role the Dev Mode annotation already plays for facts Figma has no native field for. This ADR does not decide that carrier, and the schema does not depend on one existing: an authored spec may declare `minSize` whether or not Figma can express it.

#### Collapse rules

Both follow from the decisions above and neither changes `types/` or `schema/`.

**The grid-into-slot flatten (Decision 9).** A slot whose only child is a grid frame collapses: the slot host takes `layoutMode: GRID` and the track keys, the grid frame's children become the slot's items, and the frame is dropped. Render splits it back into a slot frame holding one grid frame. The flatten runs before the wrapper collapse below.

**ADR-083's parent-layout group (Decision 8).** `gridColumns` and `gridRows` join that group, so a track count is never separated from the `layoutMode` it completes. The group's distribution gains one condition: to both boxes for `NONE`, `HORIZONTAL`, and `VERTICAL`; to the slot box alone for `GRID`, because a lone child in a templated grid occupies one track rather than laying out as it would in a stack. This amends an ACCEPTED ADR, and ADR-083 should carry a pointer to it.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**:
  - `LayoutMode`'s new `'GRID'` member ↔ a new `oneOf` branch of `const` on `#/definitions/LayoutModeStyleValue`, carrying its own `title` and `description` per ADR-114.
  - `AdaptiveGridTracks` (interface) ↔ `#/definitions/AdaptiveGridTracks` (object, `additionalProperties: false`, `required: [minSize]`).
  - `GridTracks` (union) ↔ `#/definitions/GridTracksStyleValue` (`oneOf` of integer, `$ref`, and null).
  - `Styles.gridColumns` / `Styles.gridRows` ↔ `#/definitions/Styles/properties/gridColumns` / `gridRows`, each `$ref`-ing `GridTracksStyleValue` with `default: null`.
  - `StyleKey`'s two new members are a union over the same property names and carry no schema counterpart of their own, matching every existing `StyleKey` member.
- **Named-definition obligation (Constitution I)**: both new schema definitions have named exported types. `GridTracksStyleValue` follows the existing `*StyleValue` convention — a schema-side wrapper whose named type is the union it wraps, as `ItemSpacingStyleValue` is to `Style | ItemSpacing`.
- **Decisions 8 and 9 carry no type or schema change.** Both are rules over existing keys: Decision 8 amends how ADR-083 distributes a style group it already defines, and Decision 9 adds a capture and render rule over `layoutMode` and the two new keys. ADR-083's own type changes were likewise documentation-only, so this follows the pattern of the rule it amends. The parity obligation is unaffected — neither decision introduces a definition or a type.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-from-figma` | Update extraction, **four existing style rules**, and **two collapse rules** | Reads the frame-level grid properties and maps them to the new keys; reports per-track sizing, spans, manual placement, and child cell alignment as unsupported rather than dropping them. `gridRows` and the adaptive form have no capture path, per the mapping table. The grid-into-slot flatten (Decision 9) is new and runs ahead of the wrapper collapse, whose parent-layout distribution gains the `GRID` condition (Decision 8). The four existing style rules are detailed below this table. |
| `figma-from-specs` | Update rendering | Writes `layoutMode: 'GRID'` with a track count and the two gaps. A row-templated grid additionally derives a column count and reorders children into row-major sequence; an adaptive grid writes a concrete count for the frame's width. |
| `from-specs` (shared core) | Update layout handling | `GRID` becomes a fourth `layoutMode` its layout reasoning must account for, including the keys that carry no meaning under it. |
| `react-from-specs` | Recompile; consumes the CSS transform | Grid containers reach emitted components through the style layer; no new emitted-code surface of its own. |
| `webcomponents-from-specs` | Recompile; consumes the CSS transform | Same as React — the grid is a stylesheet concern. |
| `specs-cli` | Update the CSS transform and the docs | The CSS transform gains the grid declarations for both the fixed and adaptive forms on both axes. Reference pages: a new page per new style key, a new value on the `layoutMode` page, and the *Mapping Specs to CSS* table, per the stylesheet sync set in `ARCHITECTURE.md`. |
| `specs-plugin-2` | Recompile; capture parity | Plugin-runtime capture must produce the same grid keys the REST path produces, so a grid read in the plugin and a grid read by the CLI agree. |

Any consumer that exhaustively switches on `LayoutMode` will see a compile error on upgrade until it handles `GRID`. That is the intended signal — a layout mode handled by omission is the silent-drop failure this ADR exists to prevent.

**Four existing style rules in `specs-from-figma` test for `NONE` and will treat `GRID` as a stacking layout.** None of them raises an error; each produces a plausible wrong value, which is why they are listed rather than left for compilation to find.

| Rule | Current condition | Result under `GRID` |
|---|---|---|
| `mainAxisAlignment`, `crossAxisAlignment`, `wrapAlignment` | `null` when `layoutMode` is `NONE`, otherwise a mapped Figma value | All three emit `START` — ordinary-looking values for keys this ADR says carry no meaning under `GRID`. The condition must exclude `GRID` as well. |
| `wrap` | `false` when `layoutMode` is `NONE`, otherwise read from the Figma wrap property | Emits `false`. Correct by accident, since a grid frame has no wrap value; worth making deliberate. |
| `itemSpacing` | Two-axis only when the mode is `HORIZONTAL` or `VERTICAL` **and** wrap is on, otherwise a single value from the stacking spacing properties | A grid holds its two gaps in different Figma properties, so a grid container reads its gap from a source that does not describe it. Needs a `GRID` branch producing the two-axis form. |
| `position` and the offsets | Branches on whether the parent's mode is other than `NONE` | Already correct. A grid child resolves to `position: AUTO` with null offsets, and an absolute child of a grid takes the constraint-offset path, matching what this ADR states for both. |

The axis-clearing rule in Decision 7 additionally depends on how variant differencing writes a cleared key — an explicit `null` clears, an omitted key inherits. That behaviour is an implementation gate for `/specs.adr.implement`, not a contract question.

---

## Semver Decision

**Target version**: `0.41.0` — the version of `packages/schema` on `release/next`, the branch this ADR merges into.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: every change is additive. Two new optional `Styles` properties, two new exported types, one new member on an existing string-literal union, and two new members on `StyleKey`. No type signature, field name, field presence, or schema structure is removed or reshaped, and no existing spec changes meaning. The constitution's versioning rule — "`MINOR` for additive types or new optional fields" — applies directly.

The `LayoutMode` widening is additive to the contract and still surfaces as a compile error in consumers whose switches are exhaustive. That is a property of exhaustive matching on an open-ended enum, not a breaking change to the contract, and the constitution classes it as additive.

---

## Consequences

- A captured Figma grid is representable as a grid. `layoutMode: GRID`, a track count on the templated axis, and the two gaps all have keys to land in, and a grid no longer reads back as a container with no auto-layout.
- Fixed and adaptive card grids, galleries, dashboards, and horizontal shelves become authorable, on either axis.
- One gap model holds across all four `layoutMode` values. Nothing that reads `itemSpacing` branches on layout mode.
- Four relationships in the contract are now stated and unenforced by validation: one templated axis at a time, the keys that carry no meaning under `GRID`, the precedence when both axes are set, and the axis clearing that keeps that precedence from firing on a variant switch. Decision 7 records why, and the pattern matches four relationships `Styles` already carries this way.
- `gridRows` and the adaptive form are one-way against Figma. A spec may declare either; a capture will produce neither. For `gridRows` the obstacle is flow order rather than counts, so no heuristic closes it — the ADR defines none and says why.
- Figma can author four grid features the contract does not hold. Until the deferred ADRs land, every one of them must be reported by the capture path. An unreported drop here is a contract violation, not a gap.
- Four existing style rules in the capture path read `GRID` as a stacking layout and must be amended with it. Three of them would otherwise write ordinary-looking alignment values onto keys that have no meaning under a grid, which no gate would catch.
- A grid authored inside a slot reaches the contract as a grid slot host, recorded on the component asset, so instances compose items straight into cells with no per-instance fixup.
- ADR-083 is amended. Its parent-layout group gains two keys and one condition, and its "near no-op on a wrapper holding one child" premise is now explicitly scoped to stacking modes. That premise should be re-tested by any future ADR adding a `layoutMode` value, not inherited.
- Two capture passes acquire a required order: the grid-into-slot flatten runs before the wrapper collapse. Getting it backwards produces a grid host the collapse has no rule for, and nothing fails loudly when it does.
- A spans ADR, a per-track-sizing ADR, a child-alignment ADR, and a scrolling ADR are each named and scoped. None reshapes what this ADR adds; each is a new optional key.
