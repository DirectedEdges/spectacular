# ADR: Slotting Content into Nested Instances

**Branch**: `examples-slots-instances`
**Created**: 2026-05-22
**Status**: ACCEPTED — supersedes the deferred `Element.overrides` design (retained below as Option C, *rejected*)
**Summary**: A reserved `$nested` key in `PropConfigurations` carries path-addressed configurations that reach into nested instances.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Depends on**: [ADR-046 — Slots & Slot References](046-slots-and-slot-references), [ADR-047 — Component Slot Examples](047-component-slot-examples), [ADR-048 — Component Instance Examples](048-component-instance-examples), [ADR-049 — PropConfigurations Bindings](049-prop-configurations-bindings), [ADR-050 — Examples Config](050-examples-config)

---

## Context

The slot-content reference model fills a slot with a **single-hop** reference. The fill is a `SlotContent` triplet stored once in `Component.slotContentExamples` and pointed at by a `SlotContentRef` (`{ $slotContent: "#/components/.../slotContentExamples/<key>" }`). The *anchor* — where that ref sits — carries the addressing:

- A component's own default slot fill: `SlotBinding.examples[0]` on the slot prop's `Children`.
- A fill one instance-boundary deep: `Element.propConfigurations[<slotKey>]` of the instance that sits **directly** in the parent slot's `elements` (`PropConfigurations` accepts `SlotContentRef`, ADR-049).

Every anchor assumes the filled slot is reachable as a **slot property on a leaf `instanceOf` element** in the block being authored. That breaks when authored slot content lives **several instance boundaries down** through instances that expose **no slot** for it:

```text
DS Page (component)
  └─ children (SLOT)              ← composed content lives here (a slotContentExamples entry)
       └─ FilterGrid (INSTANCE)   ← exposes NO slot for what's filled below
            ├─ FilterHeader (INSTANCE)   ← non-slot boundary
            │    └─ DS Row (INSTANCE)    ← HAS a slot + composition (FILLED)
            └─ FilterContent (INSTANCE)  ← non-slot boundary
                 └─ DS Row (INSTANCE)    ← HAS a slot + composition (FILLED)
```

`FilterGrid` is a leaf `instanceOf` reference inside DS Page's slot fill — its internals are not expanded (an instance is a leaf reference, by design). So there is no slot property anywhere in DS Page's output to anchor a `SlotContentRef` on for DS Row's filled slot. The fill can be captured as a `slotContentExamples` entry; the model cannot say **where it belongs**.

### This is *configuration*, not *override*

An earlier iteration of this ADR (Option C, below) framed the problem as a generalized **override**: a path-addressed reach-in to a nested descendant, sharing one mechanism with deep `styles`/`content` mutations. Review reframed it:

- **Filling a slot is using a component's public API, not breaking its wall.** A slot exists *precisely so* content can be put in it. Setting it — at any depth — is sanctioned configuration, the same category as setting any other prop. And **slot is just one kind of prop**: configuring a nested instance's slot is the same act as configuring its scalar props or bindings. The general primitive is therefore *configuration of a nested instance's props*, of which a deep slot fill is one case.
- **Overrides break the encapsulated wall.** Restyling a deep descendant, retyping its `content` to a literal, poking a prop the component never surfaced — those reach *past* the public API into internals. That is a genuinely different surface and is **out of scope** here (see below).

A documentation tool records what a design *did*, it does not enforce what a component *should allow*. So this ADR makes one deliberate assumption rather than modeling Figma's unreliable, inconsistently-used "Expose nested properties" flag: **nested instances are open/configurable by default.** Designers configure deep instances regardless of the expose flag (commonly via the layers panel); modeling the flag would make specs *less* accurate. Open-by-default applies to `PropConfigurations` (slots, scalars, bindings).

### Ownership and placement (settled in review)

- **Composed content lives in `slotContentExamples`.** The configuration that fills a deep slot anchors on an element *inside* a `slotContentExamples` entry (the boundary instance, e.g. `filterGrid`) — the place where the composition is already expressed.
- **`instanceExamples` is reserved for instances of *this* component.** It must not absorb nested-instance configuration. A whole-component `instanceExample` selects *which* composed fill to use by referencing a `slotContentExamples` entry; it carries no deep configuration itself (and `InstanceExample.propConfigurations` does **not** gain `$nested`).

### Interim behavior

`specs-from-figma` already **detects and warns** when a filled slot sits more than one instance boundary below its containing slot, omitting that content rather than emitting it mis-attributed. That warning references the issue this ADR resolves; lifting it is part of implementing this decision.

---

## Decision Drivers

- **It is configuration — put it on the prop surface.** A deep slot fill is the existing `propConfigurations[<slotKey>] = { $slotContent: … }` (ADR-049) applied at a path. Reuse `PropConfigurations`; do not invent an override surface or a slot-only field (Constitution §III: minimal, stable API).
- **Open by default.** Treat every nested instance's props as configurable; do not model Figma's expose flag. This keeps the spec an accurate record of what was authored.
- **A reference graph, not a flat path.** Because each filled slot points to *another* `slotContentExamples` entry, compositions form a graph linked by `SlotContentRef`. Each path spans only the hops to the **next** composed slot, not the whole depth — so structure is shared by reference, paths are short, and locality is preserved.
- **Path is structural and untyped.** A path never descends through a slot fill mid-route (a filled slot is a reference, handled by recursion). Every segment is therefore an `instanceOf` element key; the path is a plain `string[]`, terminating at the instance whose slot/prop the configuration sets. No typed segments, no collision machinery — element keys and slot/prop names live in separate namespaces.
- **Composed content stays in `slotContentExamples`; `instanceExamples` untouched.**
- **Keep "instance = leaf reference."** Intermediate instances stay leaf `instanceOf` references; nothing is expanded into `elements`. Addressing is by path.
- **Additive, type ↔ schema symmetric, no `Element` change.** One reserved key on `PropConfigurations` plus one new type. `Element` is unchanged because it already carries `propConfigurations`.
- **Naming — code/Figma aligned** (Constitution §VI).

---

## Options Considered

### Option A: A reserved `$nested` key on `PropConfigurations` *(Selected)*

`PropConfigurations` gains one reserved key, `$nested`: a list of path-addressed configurations applied to nested descendant instances. Each entry pairs a `path` of `instanceOf` element keys with the same prop-configuration payload `PropConfigurations` already carries (scalars, `PropBinding`, and slot fills via `SlotContentRef`).

Here is DS Page's composed default content — regular `propConfigurations` and the new `$nested` entries side by side on one instance. The map stays a map; deep fills go under `$nested`, a *list* because the two terminal slots are both named `children` and would collide as keys:

```yaml
slotContentExamples:
  pageBody:                          # DS Page's composed `children` slot
    elements:
      filterGrid:
        instanceOf: FilterGrid
        propConfigurations:
          density: comfortable                                            # direct scalar prop
          toolbar: { $slotContent: "#/slotContentExamples/gridToolbar" }  # direct slot fill
          $nested:
            - path: [ filterHeader, row ]
              children: { $slotContent: "#/slotContentExamples/filterHeaderRow" }
            - path: [ filterContent, row ]
              children: { $slotContent: "#/slotContentExamples/filterContentRow" }
    layout: { ... }

  filterHeaderRow:  { anatomy: {...}, elements: {...}, layout: {...} }
  filterContentRow: { anatomy: {...}, elements: {...}, layout: {...} }
```

The type is one reserved key on the existing shape:

```ts
type PropConfigurationValue = string | number | boolean | PropBinding | SlotContentRef

type PropConfigurations = {
  [propKey: string]: PropConfigurationValue | NestedPropConfiguration[] | undefined
  $nested?: NestedPropConfiguration[]
}

type NestedPropConfiguration = {
  path: string[]
  [propKey: string]: PropConfigurationValue | string[]
}
```

Key properties:

- **The boundary element is the anchor.** `$nested` hangs on the instance element (`filterGrid`) that already exists in the composed `slotContentExamples` fill — a real, addressable element. No detached registry; no re-naming it in a path.
- **Path is `instanceOf` keys only, ending at the configured instance.** The final segment is the instance whose slot/prop the entry sets, and the slot/prop being filled is a *key inside the entry* (e.g. `children`) scoped to that terminal instance — so it never falsely implies a prop on the anchoring instance.
- **No mid-path slot descents.** When a path reaches a composed slot it *stops*; the fill is a `SlotContentRef` to another `slotContentExamples` entry, which recurses with its own `$nested`. There is never a `{ slot }` step inside a path, which is why segments need no type discriminant.
- **Slot fills are not special.** A deep slot fill is the ADR-049 single-hop fill reached by a path — not a new payload.

**The graph decomposes deep, interleaved chains into short hops.** Consider `Dashboard → panel → header → toolbar → actions *(slot)* → menu → items *(slot)* → menuItem *(slot, filled)*`, where `header` and `toolbar` expose no slot. A flat path would be a 7-step interleaving of instances and slot descents. Because each composed slot is a *reference boundary*, the route instead breaks into linked `slotContentExamples` entries, each with an instance-only path (or a plain direct fill):

```yaml
slotContentExamples:
  dashboardBody:
    elements:
      panel:
        instanceOf: PanelCard
        propConfigurations:
          $nested:
            - path: [ header, toolbar ]            # stops at toolbar's `actions` slot
              actions: { $slotContent: "#/slotContentExamples/toolbarActions" }

  toolbarActions:                                  # the fill, recursing
    elements:
      menu:
        instanceOf: Menu
        propConfigurations:
          items: { $slotContent: "#/slotContentExamples/menuItems" }   # menu's own slot — direct

  menuItems:
    elements:
      menuItem:
        instanceOf: MenuItem
        propConfigurations:
          children: { $slotContent: "#/slotContentExamples/menuItemBody" }
```

Every slot descent has vanished from the paths — the `{ slot }` segments the override design needed are now reference boundaries between `slotContentExamples` entries. Path length is the distance to the *next* composed slot, not the total depth.

**Default vs. per-instance content needs no extra mechanism.** Because the composition (with its `$nested`) **is** a `slotContentExamples` entry, a whole-component `instanceExample` that wants different deep content simply references a *different* `slotContentExamples` entry in its `propConfigurations[<slotKey>]`. No configuration data lands on `instanceExamples`.

**Pros**:

- It is configuration on the configuration surface — no override category, no slot-only field. Smaller public surface, and it already covers deep slot fills, scalar props, and bindings.
- Anchored on the real boundary element where the composition is expressed; the path is relative and short (omits the anchor).
- Reuses `PropConfigurations` / `SlotContentRef` — deep slot fills are not a new payload, just the existing mechanism at a path.
- **No `Element` change** — `Element.propConfigurations` already exists; this extends its value type only.
- The reference graph shares structure (content deduped in `slotContentExamples`), keeps paths short, and distributes configs across the tree with locality — dissolving the scale ceiling that deferred the override design (see *Scale*).
- Keeps "instance = leaf reference"; flat; `instanceExamples` clean.
- Purely additive — existing single-hop anchors and consumers are unchanged.

**Cons / Trade-offs**:

- `PropConfigurations` now has a reserved key (`$nested`) whose value type differs from regular prop entries. The `$` sentinel (matching `$slotContent`/`$binding`) keeps it out of the prop-name namespace; the TS index signature widens to admit it.
- Resolving a `path` requires walking referenced components in the `components` registry — heavier than a single pointer, though `SlotContentRef` resolution already follows pointers across components.

---

### Option B: A uniform `PropConfigurations` list *(Rejected)*

Same `$nested`-style payload, but make `PropConfigurations` itself a **uniform list** instead of a map — every entry an object, deep entries carrying an optional `path`:

```yaml
# (instance data)
filterGrid:
  instanceOf: FilterGrid
  propConfigurations:
    - density: comfortable                                   # direct (no path)
    - toolbar: { $slotContent: "#/slotContentExamples/gridToolbar" }
    - path: [ filterHeader, row ]
      children: { $slotContent: "#/slotContentExamples/filterHeaderRow" }
    - path: [ filterContent, row ]
      children: { $slotContent: "#/slotContentExamples/filterContentRow" }
```

**Rejected because**: it churns the shipped `PropConfigurations` *map* shape (ADR-049) into a list, breaking every consumer that reads it as a record keyed by prop name, and turning the common direct-config case into single-key list items. It buys nothing Option A lacks — the same path-addressed entries are expressible under one additive reserved key — while forcing a migration on every existing reader. Option A keeps the map untouched and confines the new shape to the `$nested` list.

---

### Option C: A general `Element.overrides` array of path-addressed overrides *(Rejected — earlier selected design)*

An instance `Element` gains an optional `overrides`: a list of path-addressed overrides of nested descendants. Each `Override` addresses a descendant by a typed `path` (`{ instance } | { slot }` segments) and applies the overridable `Element` surface — shipping the `propConfigurations` arm, with `styles`/`content` arms to follow.

```ts
// types/Override.ts
type OverridePathSegment =
  | { instance: string }   // step into a nested instanceOf element's component
  | { slot: string }       // descend through a slot's fill content

type Override = {
  path?: OverridePathSegment[]
  propConfigurations?: PropConfigurations
  // styles?: Styles        // (was: future, additive)
  // content?: string | PropBinding
}

type Element = {
  /* ...existing... */
  overrides?: Override[]
}
```

```yaml
# (instance data) — overrides hung on the boundary instance
filterGrid:
  instanceOf: FilterGrid
  overrides:
    - path:
        - instance: filterHeader
        - instance: row
      propConfigurations:
        children: { $slotContent: "#/slotContentExamples/filterHeaderRow" }
    - path:
        - instance: filterContent
        - instance: row
      propConfigurations:
        children: { $slotContent: "#/slotContentExamples/filterContentRow" }
```

**Rejected because**: it files **configuration** under an **override** category. Filling a slot is using a nested instance's public API, not breaking its encapsulation — so it belongs on the prop surface (`PropConfigurations`), not an override surface. The override framing presupposes an exposed/encapsulated boundary this ADR explicitly declines to model (open-by-default). It is also internally backwards: the arm it *ships* (`propConfigurations`) is the configuration case, while the arms it *defers* (`styles`, literal `content`) are the genuine overrides. Finally, the typed `{ instance } | { slot }` path exists only to cram a full deep route into one flat array anchored on a single element — the source of the scale ceiling that forced its deferral (single-anchor concentration, prefix duplication, `O(W^D)` entries). Option A's reference graph removes both the type tax (paths are instance-only) and the scale tax (paths are short hops, content is shared) — and adds nothing to `Element`. The genuine override surface (deep `styles`, literal `content`) is left to a future ADR.

---

### Option D: A slot-specific field (`deepSlotContent`) *(Rejected)*

Add a slot-only field — e.g. `Component.deepSlotContent` keyed by host slot, each entry a `{ path, content: SlotContentRef }`. The data hangs off the *component*, not the boundary element:

```yaml
# (instance data) — a new top-level field on the DS Page component
deepSlotContent:
  children:                          # keyed by host slot
    - path:
        - instance: filterGrid       # re-names filterGrid, which already exists in slotContentExamples
        - instance: filterHeader
        - instance: row
        - slot: children
      content: { $slotContent: "#/slotContentExamples/filterHeaderRow" }
```

**Rejected because**: it is special-purpose where the prop surface already serves. It expresses only slot fills, detaches the data from the boundary element where the composition lives (forcing the path to re-name `filterGrid`), and keying it on `Component`/`InstanceExample` would push nested-instance data onto `instanceExamples`, which is reserved for instances of *this* component. Option A subsumes it: a deep slot fill is just `filterGrid.propConfigurations.$nested[].<slot> = { $slotContent }`, anchored on the element itself.

---

### Option E: Expand intermediate instances into `elements` *(Rejected)*

Materialise `FilterGrid` / `FilterHeader` internals as nested `elements` so each boundary instance exposes a real slot property at every level, letting the existing single-hop `SlotContentRef` anchor exist at every depth:

```yaml
# (instance data) — filterGrid's internals expanded inline instead of staying a leaf reference
filterGrid:
  instanceOf: FilterGrid
  elements:                          # ← NEW nesting: FilterGrid's whole internal tree, duplicated here
    headerStack:                     # a container layer — and these shift across variants
      elements:
        filterHeader:
          instanceOf: FilterHeader
          elements:
            row:
              instanceOf: DS Row
              propConfigurations:
                children: { $slotContent: "#/slotContentExamples/filterHeaderRow" }
    contentStack:
      elements:
        filterContent: { instanceOf: FilterContent, elements: { row: { ... } } }
```

**Rejected because**: it breaks "instance = leaf reference" (`filterGrid` is no longer a leaf), reintroduces the nested structure the flat-spec driver rejects, and **duplicates each referenced component's full internals into every consumer** of it (size blow-up, and drift when `FilterGrid` changes). The expansion also drags in container layers (`headerStack`, `contentStack`) whose nesting changes across variants, and it redefines what an existing `instanceOf` leaf element means, so it is not additive.

---

### Option F: Encode the descent inside `SlotContentRef` as a delimited path string *(Rejected)*

Overload the existing `SlotContentRef` with a key that encodes the whole descent, hung on the boundary element's `propConfigurations`:

```yaml
# (instance data)
filterGrid:
  instanceOf: FilterGrid
  propConfigurations:
    # one string crams the route + the fill into the existing single-hop ref shape
    "filterHeader/row/children":
      $slotContent: "#/slotContentExamples/filterHeaderRow"
    # …and is the second segment "row" an instance or a slot? a flat string can't say.
    # …what if an element key legitimately contains "/"? the delimiter is now ambiguous.
```

**Rejected because**: it overloads the single-hop `propConfigurations` key that depth-0/1 consumers parse as a *prop name* — a consumer would mis-handle a key that is secretly a path (forward-compatibility risk). A delimited string also can't distinguish slot from instance segments and reintroduces escaping ambiguity when keys contain `/`. Option A's typed `path: string[]` plus the slot-as-inner-key resolves both — and, unlike this option, never falsely implies a prop named after the path on the anchoring instance.

---

## Decision

Add a reserved `$nested` key to `PropConfigurations` carrying a list of path-addressed `NestedPropConfiguration` entries. Each entry's `path` is an array of `instanceOf` element keys to a nested descendant; its remaining keys are the prop configurations applied to that descendant — including deep slot fills as `SlotContentRef`, exactly as a direct fill (ADR-049). `Element` is unchanged. Composed content remains in `Component.slotContentExamples`, linked into a reference graph by `SlotContentRef`.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `PropConfigurations.ts` | Add `PropConfigurationValue` alias; add reserved `$nested?: NestedPropConfiguration[]`; add `NestedPropConfiguration` (`{ path: string[] }` + prop-config payload) | MINOR |
| `index.ts` | Export `NestedPropConfiguration` and `PropConfigurationValue` | MINOR |

**Example — new types** (`types/PropConfigurations.ts`):
```ts
export type PropConfigurationValue =
  | string | number | boolean
  | PropBinding
  | SlotContentRef;

export type PropConfigurations = {
  [propKey: string]: PropConfigurationValue | NestedPropConfiguration[] | undefined;
  /** Reserved: path-addressed configurations of nested descendant instances (ADR-052). */
  $nested?: NestedPropConfiguration[];
};

// A path-addressed configuration of a nested descendant instance. `path` is an
// ordered list of instanceOf element keys from the anchoring instance to the
// descendant; the terminal instance owns the configured slot/prop. Remaining
// keys are the configs applied there — scalars, PropBinding, or SlotContentRef.
export type NestedPropConfiguration = {
  path: string[];
  [propKey: string]: PropConfigurationValue | string[];
};
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Extract shared `PropConfigurationValue` definition (the value `oneOf`) | MINOR |
| `component.schema.json` | Add `$nested` property to the `PropConfigurations` definition | MINOR |
| `component.schema.json` | Add `NestedPropConfiguration` definition | MINOR |

A shared `PropConfigurationValue` definition holds the value `oneOf` once; both `PropConfigurations` and `NestedPropConfiguration` reference it for their `additionalProperties`, so the two stay structurally aligned without repeating the union.

**Example** (`schema/component.schema.json`):
```json
"PropConfigurationValue": {
  "oneOf": [
    { "type": "string" },
    { "type": "number" },
    { "type": "boolean" },
    { "$ref": "#/definitions/PropBinding" },
    { "$ref": "#/definitions/SlotContentRef" }
  ]
},

"PropConfigurations": {
  "type": "object",
  "properties": {
    "$nested": {
      "type": "array",
      "items": { "$ref": "#/definitions/NestedPropConfiguration" }
    }
  },
  "additionalProperties": { "$ref": "#/definitions/PropConfigurationValue" }
},

"NestedPropConfiguration": {
  "type": "object",
  "required": ["path"],
  "properties": {
    "path": {
      "type": "array",
      "minItems": 1,
      "items": { "type": "string" }
    }
  },
  "additionalProperties": { "$ref": "#/definitions/PropConfigurationValue" }
}
```

`NestedPropConfiguration` differs from `PropConfigurations` only by requiring `path` and omitting `$nested` — both reuse `PropConfigurationValue` for every other key, so there is no duplicated value union.

### Out of scope for this ADR

- **Deep `styles` / literal `content` overrides** — the genuine wall-breaking surface (restyling a deep descendant, retyping its text to a literal, reaching an unexposed prop). A separate future ADR if ever warranted; a documentation tool may not need a primitive for it at all.
- **Naming patterns for pathed slot-content reference keys** — any convention for how the slot/prop reference keys inside a `$nested` entry (or the `slotContentExamples` entries they point at) are named or generated. This ADR fixes only the *shape*; key-naming patterns are deferred.
- **Transformer detection and path construction** — discovering deep descendants and computing each `path` lives in `specs-from-figma`.
- **Removing the interim warning** — lifting the "more than one boundary deep" warn-and-omit is a `specs-from-figma` task tracked with this change.
- **Pro-license gating** — like the other example registries (ADR-050), composed output is gated at emission in `specs-from-figma`.

### Notes

- **`$nested` is meaningful on instance elements.** Only an element with `instanceOf` has nested descendants to configure. The schema does not couple the keys; emitters write `$nested` only on instance elements.
- **The terminal slot/prop is an entry key, not a path segment.** `path` ends at the `{ instance }` being configured; the slot/prop it fills is a key inside the entry, scoped to that instance.
- **Paths are `instanceOf` keys only.** No `{ slot }` segments (slot descents are reference boundaries between `slotContentExamples` entries) and no container/group/layout layers (they vary across variants); instances are located by direct key lookup in the flat `elements` record.
- **Deep slot fills reuse `SlotContentRef`.** They are not a new payload — `$nested[i][<slotKey>] = { $slotContent: … }` applied at a path, consistent with ADR-049.
- **`InstanceExample.propConfigurations` does not gain `$nested`.** It selects composed fills by reference; deep configuration data stays in `slotContentExamples`.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `PropConfigurationValue` ↔ `#/definitions/PropConfigurationValue` (`oneOf`: scalar / `PropBinding` / `SlotContentRef`), referenced by both objects' `additionalProperties`
  - `PropConfigurations.$nested?: NestedPropConfiguration[]` ↔ `PropConfigurations` definition `$nested` (array of `$ref: NestedPropConfiguration`; not required; regular keys are `additionalProperties: $ref PropConfigurationValue`)
  - `NestedPropConfiguration { path: string[]; [k]: PropConfigurationValue | string[] }` ↔ `#/definitions/NestedPropConfiguration` (`path` required `array<string>`; `additionalProperties: $ref PropConfigurationValue`)
  - `Element` unchanged — already references `PropConfigurations`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Emits `propConfigurations.$nested` (with computed `path` + payload) on boundary instances inside composed `slotContentExamples` fills; contributes deep fills to `slotContentExamples` (deduplicated), linking them into the reference graph; removes the interim warn-and-omit. No `instanceExamples` change | Implement detection, path construction, and `$nested` emission; lift the warning |
| `specs-cli` | Recompile against the new type/schema; passes the new optional field through unchanged | Recompile |
| `specs-plugin-2` | Recompile; the plugin runtime emits `$nested` via the same engine path | Recompile |
| Schema validators | New optional definition and key; existing documents remain valid | Adopt the new schema version |

---

## Semver Decision

**Version bump**: folds into `0.21.0` (`MINOR`, unreleased)

**Justification**: Adds one new type (`NestedPropConfiguration`), one helper alias (`PropConfigurationValue`), and one new **optional** reserved key (`PropConfigurations.$nested`) plus its schema counterpart. No existing type, field, or schema property is removed, renamed, or narrowed → MINOR per Constitution §III. The slot-content model it extends (ADRs 046–050) is still unreleased on the `0.21.0` line, so this folds into that same MINOR.

---

## Scale

The reference-graph form is tuned for the realistic authoring workload and removes the ceiling that deferred the override design:

- **No single-anchor concentration.** Each nested instance carries its *own* `$nested` for the hops to the next composed slot; configs are distributed across the tree with locality, not piled onto one top boundary element.
- **Structural sharing by reference.** Filled slots point to `slotContentExamples` entries (deduplicated by structural equality), so content is mentioned once and referenced many times — the graph, not a flat list.
- **Short paths.** A `path` spans only to the next composed slot, not the full depth, so common ancestor segments are not repeated across siblings.

Only *authored deviations* need entries (child components carry their own defaults), and content dedup means the remaining cost is in addresses, which are now short and local. This is why the override design's deferral is **lifted**: the structural reasons it degraded on dense/deep/wide compositions (single anchor, prefix duplication, `O(W^D)`) do not apply to a shared reference graph.

---

## Consequences

- An instance element can configure descendants reached only through nested, no-slot instance boundaries — including chains that interleave non-slot instances between slot-bearing ones — via the reserved `$nested` key on its existing `propConfigurations`, addressed by a flat `path` of `instanceOf` keys.
- Deep slot content is expressed with **no new payload** and **no `Element` change**: `propConfigurations.$nested[].<slot> = { $slotContent }`, reusing ADR-049.
- Composed content stays in `slotContentExamples`, linked into a reference graph; `instanceExamples` remains "instances of this component" and selects compositions by reference rather than carrying configuration data.
- The configuration anchors on the real boundary element, so each path is relative and short; intermediate instances stay leaf references and the spec stays flat.
- The address is collision-safe and variant-stable — element keys and slot/prop names are separate namespaces, and a variant swap or layout refactor that re-nests containers does not invalidate an `instanceOf`-key path.
- The DS Page → FilterGrid → FilterHeader/FilterContent → DS Row composition round-trips: both DS Rows' filled slots are captured in `slotContentExamples` and addressed from `filterGrid.propConfigurations.$nested`.
- `specs-from-figma` can replace the interim "deeper than one boundary" warning with real emission.
- Existing single-hop `SlotContentRef` output and its consumers are unaffected; the `$nested` key is opt-in and additive.
- The genuine override surface (deep `styles`, literal `content`) is explicitly deferred to a future ADR — slot filling is configuration and ships here without it.

---

## Revision History

- **2026-05-22** — Initial draft (from issue #115). Selected design was a general `Element.overrides` array with typed `{ instance } | { slot }` path segments; deferred because of the scale ceiling (single-anchor concentration, prefix duplication, `O(W^D)` entries on dense compositions).
- **2026-05-23** — Reopened. Reframed: filling a deep slot is *configuration*, not *override*. Selected design replaced with the reserved `$nested` key on `PropConfigurations`; the previous `Element.overrides` design retained as rejected **Option C**. The shape variant of `$nested` (a uniform list version of `PropConfigurations` itself) was promoted to standalone **Option B (rejected)**; later options renumbered (`deepSlotContent` → D, expand-into-`elements` → E, delimited-string ref → F). Schema refactored to share a `PropConfigurationValue` definition between `PropConfigurations` and `NestedPropConfiguration`. *Out of scope* expanded to include naming patterns for pathed slot-content reference keys.
- **2026-05-23** — ACCEPTED. PR #117 merged (commit `06581ff`); schema released in PR #122 as part of the `0.22.0` line.
- **2026-05-26** — Restored Options Considered, Decision, Type↔Schema Impact, Downstream Impact, Semver, Scale, Consequences, and Revision History sections from the May 22–23 brainstorm transcripts. The shipped ADR file had been truncated to Context only when merged in PR #117; this revision recovers the full content without changing the accepted decision.
