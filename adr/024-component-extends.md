# ADR: Component Extends Relationship

**Branch**: `024-component-extends`
**Created**: 2026-03-15
**Status**: DRAFT
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

## Table of Contents

- [Context](#context)
- [Decision Drivers](#decision-drivers)
- [Open Design Questions](#open-design-questions)
  - [Q1: What is the shape of the `extends` field?](#q1-what-is-the-shape-of-the-extends-field)
  - [Q2: How should the base component be referenced?](#q2-how-should-the-base-component-be-referenced)
  - [Q3: Where should prop relationship metadata live?](#q3-where-should-prop-relationship-metadata-live)
  - [Q4: How do extended component variants interact with base component variants?](#q4-how-do-extended-component-variants-interact-with-base-component-variants)
- [Options Considered](#options-considered)
  - [Q1: Shape of the `extends` field](#q1-shape-of-the-extends-field)
  - [Q2: How to reference the base component](#q2-how-to-reference-the-base-component)
  - [Q3: Where prop relationship metadata lives](#q3-where-prop-relationship-metadata-lives)
- [Variant Layering with Extended Components](#variant-layering-with-extended-components)
  - [Example: IconButton (base)](#example-iconbutton-base)
  - [Example: FavoriteButton (derived)](#example-favoritebutton-derived)
  - [How set vs. bypassed affects which base variants apply](#how-set-vs-bypassed-affects-which-base-variants-apply)
  - [Precedence model](#precedence-model)
- [Figma Implementation Patterns](#figma-implementation-patterns)
  - [Pattern 1: Duplicated variants](#pattern-1-duplicated-variants)
  - [Pattern 2: Wrapper instance](#pattern-2-wrapper-instance)
  - [Pattern 3: Use both patterns selectively](#pattern-3-use-both-patterns-selectively)
- [Decision](#decision)
- [Type ↔ Schema Impact](#type--schema-impact)
- [Downstream Impact](#downstream-impact)
- [Semver Decision](#semver-decision)
- [Consequences](#consequences)

---

## Context

The Anova schema currently models each `Component` as a standalone entity. There is no mechanism to express that one component is a specialization of another — for example, that `FavoriteButton` is a constrained, extended version of `IconButton`.

In real design systems, component extension is a common pattern. A derived component typically:
- **Fixes** certain props to specific values (e.g., `size` locked to `"medium"`)
- **Adds** new props not present on the base (e.g., a `favorited` boolean toggle)
- **Passes through** some base props unchanged (e.g., `state` remains configurable)
- **Overrides** defaults or element details (e.g., `color` fixed to a token reference, icon content bound to new props)

Without an `extends` mechanism in the schema, consumers cannot:
- Trace lineage between related components
- Understand which props are inherited vs. fixed vs. new
- Validate that a derived component's prop surface is compatible with its base

This ADR addresses how to represent that relationship in the `Component` type and schema, including how props are inherited, fixed, and extended.

---

## Decision Drivers

- **Additive-only change**: New optional fields avoid a MAJOR bump; existing component specs remain valid without modification
- **Types and schema must remain in sync**: Every type change must have a corresponding schema update (Constitution I)
- **No runtime logic**: The `extends` relationship is purely declarative data — the schema describes the relationship, consumers interpret it (Constitution II)
- **Minimal, stable public API**: New types must represent a genuine shared concept, not an implementation detail of one downstream package (Constitution III)
- **Figma-aware but schema-agnostic**: The schema should describe the semantic relationship without prescribing Figma implementation, while the ADR should discuss practical Figma patterns
- **Variant cascade compatibility**: The existing variant layering model must work cleanly with inherited and overridden props

---

## Open Design Questions

The following questions must be resolved before this ADR can be accepted. Each is explored in the Options sections below.

### Q1: What is the shape of the `extends` field?

Should `extends` be a simple string value or a structured object?

### Q2: How should the base component be referenced?

Should the base be a plain string name or a `$ref`-style URI?

### Q3: Where should prop relationship metadata live?

Should prop classifications (fixed, inherited, overridden, added) be nested inside `extends`, placed as sibling fields, or annotated directly on each prop definition?

### Q4: How do extended component variants interact with base component variants?

What is the precedence model when a derived component's variants overlap with base variants?

---

## Options Considered

### Q1: Shape of the `extends` field

#### Option Q1-A: Simple string value

```yaml
title: FavoriteButton
extends: IconButton
```

`extends` is a plain string — the name of the base component. Clean and minimal. If prop-level metadata is needed, it lives elsewhere (see Q3).

**Pros**:
- Maximally simple — one field, one value, clear intent
- No wrapper object to navigate
- Easy to scan in YAML/JSON output

**Cons**:
- Cannot carry additional metadata (e.g., version constraints, source URI) without a breaking change later
- If prop relationship data is placed inside `extends` (Q3 Option A), this shape cannot accommodate it

#### Option Q1-B: Object with `base` property

```yaml
title: FavoriteButton
extends:
  base: IconButton
```

`extends` is an object with a required `base` string and room for future properties.

**Pros**:
- Extensible — additional fields (prop overrides, version, etc.) can be added without restructuring
- Consistent with the pattern used elsewhere in the schema (e.g., `metadata.source`, `metadata.generator`)

**Cons**:
- More verbose for the common case where only the base name is needed
- Introduces a wrapper object that may not carry any other properties

---

### Q2: How to reference the base component

#### Option Q2-A: Plain string name

```yaml
extends: IconButton
# or
extends:
  base: IconButton
```

The base is identified by its `title` string. Consumers resolve the reference by looking up a component spec with a matching `title` in their own context (file system, API, registry).

**Pros**:
- Simple, human-readable
- No coupling to file paths, URLs, or schema structure
- Matches how designers and developers already refer to components by name

**Cons**:
- Implicit — no guaranteed resolution; consumer must know where to find `IconButton`
- Ambiguity risk if two components share the same title in different scopes

#### Option Q2-B: `$ref`-style URI

```yaml
extends:
  $ref: "IconButton#/component"
# or
extends:
  $ref: "./icon-button.component.json"
```

The base is a URI reference following JSON Schema `$ref` conventions, pointing to the base component spec.

**Pros**:
- Explicit and resolvable — tools can dereference the URI programmatically
- Eliminates ambiguity when multiple components share names across scopes

**Cons**:
- Couples the spec to a file layout or URL scheme that may not exist at authoring time
- Adds complexity: consumers must implement URI resolution
- Figma does not produce URI references — the transformer would need to synthesize them
- `$ref` has specific JSON Schema semantics that may conflict with the intended use (JSON Schema `$ref` replaces the containing object, not merely references it)

---

### Q3: Where prop relationship metadata lives

#### Option Q3-A: Props-only — `exposed` and `value` fields

```yaml
extends: IconButton
props:
  favorited:                       # added — new to this component
    type: boolean
    default: false
  size:                            # set — locked to a base enum value
    value: medium
    exposed: false
  color:                           # bypassed — ignored, derived controls elements
    exposed: false
```

Only props that are *different* from the base appear. Two new optional fields — `exposed` and `value` — compose to distinguish the relationships:

| Prop | Where it appears | `exposed` | `value` | `default` | Relationship |
|------|-----------------|-----------|---------|-----------|-------------|
| `state` | *(absent — flows through from base)* | — | — | — | **Inherited** — passed through unchanged, consumer configures |
| `favorited` | in `props` | *(absent = true)* | — | `false` | **Added** — new to this component, consumer configures |
| `size` | in `props` | `false` | `medium` | — | **Set** — locked to a valid base enum value, not exposed |
| `color` | in `props` | `false` | — | — | **Bypassed** — base prop ignored, derived controls elements directly |
| `size` *(override)* | in `props` | *(absent = true)* | — | `medium` | **Overridden** — changed default and/or narrowed enum, still exposed |

The key insight is that "not exposed" base props fall into two distinct categories:

- **Set** (`size`) — the base prop is locked to one of its valid enum values. The prop's machinery is still active: base variants keyed to that value still apply. But the consumer cannot change it. The `value` field declares the locked value. The prop's `type`, `enum`, and other definition fields are omitted — they're inherited from the base.

- **Bypassed** (`color`) — the base prop is ignored entirely. The derived component controls the affected elements directly, overriding whatever the base prop would have done. Base variants keyed to any value of this prop are irrelevant. No `value` is declared because there is no value — the prop is severed.

Both use `exposed: false`. The presence or absence of `value` distinguishes them.

Inherited props (like `state`) are absent from `props` entirely — they flow through from the base unchanged. Added props (like `favorited`) carry full definitions (`type`, `default`, `enum`, etc.) and omit `exposed` (default is `true`).

**Overridden props** also carry full definitions with `default` and are exposed, but they re-declare a base prop with changes — a new default, a narrowed enum, or both. The consumer can still configure them.

#### Override examples: narrowing and extending enums

A derived component may narrow, shift, or extend a base prop's enum while keeping it exposed:

**Narrowed enum** — base has `size: [small, medium, large]`, derived restricts to `[medium, large]`:

```yaml
extends: IconButton
props:
  size:
    type: string
    default: medium
    enum: [medium, large]          # narrowed — small removed
```

**Extended and narrowed enum** — base has `size: [small, medium, large]`, derived shifts the range to `[medium, large, extraLarge]`:

```yaml
extends: IconButton
props:
  size:
    type: string
    default: large
    enum: [medium, large, extraLarge]  # small removed, extraLarge added
```

**Changed default only** — same enum, different default:

```yaml
extends: IconButton
props:
  size:
    type: string
    default: small                 # base default was medium
    enum: [small, medium, large]
```

In all override cases, the prop has `default` (not `value`) and no `exposed: false` — it remains configurable. Consumers diff against the base to see what changed.

#### Set vs. bypassed: implications for variant layering

This distinction matters when considering how base variants interact with the derived component (see Variant Layering section below):

| Base prop | Relationship | Base variants keyed to this prop | Example |
|-----------|-------------|----------------------------------|---------|
| `size` | Set to `medium` | Only `{ size: medium }` variants apply | Container gets medium padding |
| `color` | Bypassed | No `color`-keyed variants apply | Derived component controls fill directly |
| `state` | Inherited | All `state` variants apply normally | Consumer controls hover/active |
| `size` *(overridden)* | Overridden (narrowed/shifted enum) | Variants for remaining enum values apply | `{ size: extraLarge }` may need new variants |

#### Edge case: `accessibilityLabel` — set but variant-dependent

Some set values are not simple constants. `accessibilityLabel` is not exposed to the consumer, but its value changes depending on `favorited`:

```yaml
props:
  accessibilityLabel:
    value: "Add to favorites"
    exposed: false

variants:
  - configuration: { favorited: true }
    elements:
      icon:
        content: HeartFilled
    propConfigurations:
      accessibilityLabel: "Remove from favorites"
```

The `value` field provides the base set value; variant-level `propConfigurations` can override it contextually. The prop remains unexposed — the consumer never configures it directly, but it varies internally based on other props.

#### Full taxonomy of prop relationships

| Relationship | `exposed` | `value` | `default` | `type`/`enum` | Example |
|-------------|-----------|---------|-----------|---------------|---------|
| **Inherited** | *(absent from `props`)* | — | — | — | `state` flows through |
| **Added** | *(absent = true)* | — | present | full definition | `favorited: { type: boolean, default: false }` |
| **Set** | `false` | present | — | omitted | `size: { value: medium, exposed: false }` |
| **Bypassed** | `false` | — | — | omitted | `color: { exposed: false }` |
| **Overridden** | *(absent = true)* | — | present | full definition | `size: { type: string, default: small, enum: [small, medium] }` |

**Pros**:
- All non-inherited prop relationships are visible in `props` — set and bypassed are explicit, not hidden
- The set vs. bypassed distinction is machine-readable (`exposed: false` + `value` vs. `exposed: false` alone)
- Overrides (narrowed enums, changed defaults) use the same prop shape as added props — no special mechanism
- Minimal schema change — adds `exposed` (boolean) and `value` (scalar) to prop types
- `props` serves as both the consumer API surface and the inheritance manifest
- Compatible with simple string `extends` (Q1-A)
- No separate top-level fields, wrapper types, or relationship enums needed
- `value` vs. `default` makes the semantic distinction clear: `default` = changeable, `value` = locked
- Set props with `value` feed directly into base variant resolution — consumers know exactly which base variants to activate

**Cons**:
- Requires the consumer to have access to the base component's spec to distinguish "inherited" (absent) from truly nonexistent, and "added" from "overridden" (both have `default`)
- Adds two new fields to prop types (`exposed`, `value`) — though both are optional
- Props with `exposed: false` look different from normal props (no `type`, no `default`) — consumers must handle this shape
- `value` and `default` mutual exclusivity must be enforced in the schema

---

#### Option Q3-B: Nested inside `extends`

```yaml
extends:
  base: IconButton
  props:
    size:
      relationship: fixed
      value: medium
    state:
      relationship: inherited
    favorited:
      relationship: added
```

Prop classifications are grouped under `extends.props`, creating a self-contained inheritance descriptor.

**Pros**:
- All inheritance information is co-located in one block
- Clear separation: `props` (the component's own prop definitions) vs. `extends.props` (how those props relate to the base)

**Cons**:
- Requires Q1-B (object shape) — incompatible with simple string `extends`
- Prop names appear in two places: `props` (definitions) and `extends.props` (relationships)
- `extends` becomes a large, complex object
- Does not distinguish set from bypassed without adding further fields

#### Option Q3-C: Sibling `propRelationships` field on `Component`

```yaml
extends: IconButton
props:
  favorited:
    type: boolean
    default: false
propRelationships:
  size:
    relationship: fixed
    value: medium
  state:
    relationship: inherited
  favorited:
    relationship: added
```

A separate top-level field `propRelationships` sits alongside `extends` and `props`. Props unchanged from the base (like `state`) are omitted from `props` — their definitions live on the base component. Only new or modified props appear in `props`.

**Pros**:
- Compatible with simple string `extends` (Q1-A)
- Keeps `extends` focused on lineage only
- `propRelationships` can exist independently if needed (e.g., for non-extends use cases)

**Cons**:
- Inheritance information is split across two fields (`extends` + `propRelationships`), requiring consumers to correlate them
- `propRelationships` without `extends` is semantically unclear
- Redundancy: `propRelationships` classifies props that are already inferrable from context (a prop in `props` but not on the base is obviously "added")

#### Option Q3-D: Annotations on each prop definition

```yaml
extends: IconButton
props:
  favorited:
    type: boolean
    default: false
    extends: added
fixedProps:
  size: medium
  color: "{color.action.favorite}"
```

Each prop in `props` carries an `extends` annotation. Props unchanged from the base are omitted from `props`. Fixed props are listed separately since they don't appear in `props` (they're not configurable).

**Pros**:
- Relationship is co-located with the prop it describes — no cross-referencing needed
- Minimal new top-level fields

**Cons**:
- Adds a field to every prop type (`BooleanProp`, `StringProp`, `EnumProp`, `SlotProp`) — a wider type change
- Fixed props still need a separate mechanism since they have no entry in `props`
- Mixes inheritance metadata with prop definitions, blurring the boundary between "what this prop is" and "where it came from"

---

## Variant Layering with Extended Components

The existing variant model uses a CSS-cascade-like layering: evaluate every variant whose `configuration` matches the current prop values, and layer their element styles from least specific to most specific (fewest non-default props to most).

When a component extends another, the question is how the derived component's variants interact with the base's variants.

### Example: IconButton (base)

```yaml
# IconButton props
props:
  size:
    type: string
    default: medium
    enum: [small, medium, large]
  state:
    type: string
    default: rest
    enum: [rest, hover, active]
  color:
    type: string
    default: "{color.action.primary}"

# IconButton variants (simplified)
variants:
  - configuration: { size: small }
    elements:
      icon: { styles: { width: 16, height: 16 } }
  - configuration: { size: large }
    elements:
      icon: { styles: { width: 32, height: 32 } }
  - configuration: { state: hover }
    elements:
      container: { styles: { fill: "{color.action.hover}" } }
  - configuration: { state: active }
    elements:
      container: { styles: { fill: "{color.action.active}" } }
  - configuration: { size: small, state: hover }
    elements:
      container: { styles: { borderRadius: 4 } }
```

### Example: FavoriteButton (derived)

```yaml
title: FavoriteButton
extends: IconButton    # or extends: { base: IconButton }

# Only the props FavoriteButton exposes:
props:
  state:
    type: string
    default: rest
    enum: [rest, hover, active]
  favorited:
    type: boolean
    default: false

# FavoriteButton's own variants:
default:
  elements:
    icon:
      content: Heart
      styles: { fill: "{color.action.favorite}" }

variants:
  - configuration: { favorited: true }
    elements:
      icon:
        content: HeartFilled
  - configuration: { state: hover }
    elements:
      container: { styles: { fill: "{color.favorite.hover}" } }
  - configuration: { favorited: true, state: hover }
    elements:
      icon: { styles: { fill: "{color.favorite.hover.filled}" } }
```

### How set vs. bypassed affects which base variants apply

Before addressing the precedence model, it's important to understand *which* base variants are even relevant to the derived component. The set vs. bypassed distinction determines this:

**`size` is set to `medium`**: The base's `{ size: medium }` variant (if one existed) would apply. The `{ size: small }` and `{ size: large }` variants do *not* apply — the derived component is locked to `medium`. The `{ size: small, state: hover }` compound variant also does not apply, because `size` is never `small`.

**`color` is bypassed**: None of the base's `color`-keyed variants apply. The derived component controls the affected element styles directly. If IconButton had a `{ color: danger }` variant that changed the fill, FavoriteButton would ignore it entirely.

**`state` is inherited**: All of the base's `state`-keyed variants (`{ state: hover }`, `{ state: active }`) are potentially relevant, because the consumer can set `state` to any value.

This filtering happens before any precedence model is applied.

### Precedence model

The key question: when resolving styles for `FavoriteButton` with `state: hover`, should the base's `hover` variant apply, the derived component's `hover` variant, or both?

#### Approach 1: Derived component is self-contained

The derived component's spec contains **all** the variants it needs. Base variants are not automatically inherited. The `extends` field is informational/documentary — it tells consumers *where this came from* but does not imply runtime variant merging.

The set/bypassed distinction is moot here — base variants are never consulted.

- **Pro**: Simple, predictable — the spec you see is the spec you get
- **Pro**: No cross-file resolution needed to render variants
- **Con**: Derived component must re-declare any base variants it wants to keep (duplication)

#### Approach 2: Base variants cascade, derived variants layer on top

Consumers first filter base variants (excluding those keyed to bypassed props, locking set props to their fixed values), then apply matching base variants, then layer matching derived variants on top. Derived variants at the same specificity (same number of configuration keys) override base variants for the same elements.

For FavoriteButton with `state: hover`:
1. **Filter base variants**: Discard `{ size: small }`, `{ size: large }`, `{ size: small, state: hover }` (size is set to medium, not small/large). Discard any `color`-keyed variants (color is bypassed).
2. **Apply matching base variants**: `{ state: hover }` matches → apply `container: { styles: { fill: "{color.action.hover}" } }`
3. **Apply matching derived variants**: `{ state: hover }` matches → apply `container: { styles: { fill: "{color.favorite.hover}" } }` — overrides the base's fill

- **Pro**: Derived component only declares what's different — DRY
- **Pro**: Set/bypassed filtering makes the cascade predictable — only relevant base variants participate
- **Con**: Requires cross-file resolution at render time
- **Con**: Precedence conflicts are subtle (does a 2-key base variant beat a 1-key derived variant?)
- **Con**: Consumer must determine which base props are set vs. bypassed to filter correctly

#### Approach 3: Schema declares the strategy

Add a field like `extends.variantStrategy: "self-contained" | "cascade"` so the spec author explicitly states which model applies.

- **Pro**: No ambiguity — the spec says what it means
- **Con**: Adds complexity; consumers must support both modes

---

## Figma Implementation Patterns

While the schema describes the extends relationship independent of Figma's component model, Figma's current architecture constrains how extension can be practically authored. This section discusses three approaches and their trade-offs.

### Pattern 1: Duplicated variants

Create `FavoriteButton` as a standalone component set with its own variants, duplicating the relevant subset of `IconButton`'s visual design. No Figma-level structural relationship to `IconButton`.

```
FavoriteButton (Component Set)
  ├─ favorited=false, state=rest
  │   ├─ container (Frame)
  │   └─ icon (Instance: Heart)
  ├─ favorited=true, state=rest
  │   ├─ container (Frame)
  │   └─ icon (Instance: HeartFilled)
  └─ ...
```

**Establishing the relationship**:
- Naming convention: `DS FavoriteButton` with a description or documentation noting "extends DS IconButton"
- A custom Figma plugin metadata field or shared page/section grouping
- The `extends` field in the generated spec captures the relationship explicitly regardless of Figma structure

**Pros**:
- Full control over every variant — no dependency on instance override behavior
- Simpler Figma structure (no nested instance layer)
- Easier for the transformer to process — looks like any other component
- No risk of Figma "expose" breakage on base component changes

**Cons**:
- Design drift risk: if `IconButton` updates its hover color, `FavoriteButton` must be manually updated
- Duplication of shared styles, tokens, and layout decisions
- The extends relationship exists only in the spec output / documentation — Figma itself has no knowledge of it

**Mitigating the maintenance burden**:

Duplication's primary risk is drift between the base and derived component. Several strategies can reduce this:

- **Spec diffing**: When both the base and derived component have specs with an `extends` relationship, tooling can diff the shared prop/style surface and flag discrepancies. For example: "FavoriteButton's `state: hover` container fill does not match IconButton's updated hover token."
- **Agentic validation**: A CI or local agent that, upon detecting a change to a base component spec, automatically identifies all components that `extends` it and runs a compatibility check — surfacing fixed props whose values no longer exist in the base's enum, inherited props that were removed, or style tokens that changed.
- **Automated scaffolding**: When creating a new extended component, an agent could generate the initial Figma variant set from the base component's spec — pre-populating the duplicated variants with current values, reducing manual setup and initial drift.
- **Periodic sync reports**: A scheduled process that compares all `extends` pairs across the design system and produces a report of stale derived components, prioritized by severity (breaking changes vs. cosmetic drift).
- **Figma plugin lint rule**: A plugin-side check that reads the `extends` metadata (from component description or plugin data) and compares the derived component's token usage against the base, warning when values diverge.

### Pattern 2: Wrapper instance

Create `FavoriteButton` as a new component that contains an instance of `IconButton` as its sole (or primary) child.

```
FavoriteButton (Component Set)
  ├─ favorited=false, state=rest
  │   └─ IconButton (Instance) — size=medium, color=favorite, icon=Heart
  ├─ favorited=true, state=rest
  │   └─ IconButton (Instance) — size=medium, color=favorite, icon=HeartFilled
  ├─ favorited=false, state=hover
  │   └─ IconButton (Instance) — size=medium, color=favorite, icon=Heart
  └─ ...
```

**Exposing vs. encapsulating props**:
- **Exposed** (`state`): Use Figma's "Expose properties from nested instances" feature to surface the `IconButton` `state` property through `FavoriteButton`. The `state` prop appears on `FavoriteButton` as if it were its own.
- **Encapsulated** (`size`, `color`): Do *not* expose these. Set them to fixed values on the nested `IconButton` instance. They become internal implementation details.
- **Added** (`favorited`): Define as a new variant property on the `FavoriteButton` component set.

**Pros**:
- Changes to `IconButton` automatically propagate to `FavoriteButton` (styles, new states, bug fixes)
- Figma's native "expose nested props" feature handles the exposed/encapsulated distinction
- Single source of truth for shared behavior

**Cons**:
- Figma's "expose" feature can be fragile — renames on the base component can break exposed props
- The wrapped structure adds a layer of nesting that the transformer must handle (recognizing the inner instance as the "real" component)
- Not all prop types can be cleanly exposed (e.g., complex instance swaps)
- Wrapping alone is rarely sufficient — most real-world cases still require the derived component to add its own elements or restructure anatomy, at which point wrapping becomes awkward

### Pattern 3: Use both patterns selectively

Allow teams to choose wrapper or duplication on a per-component basis, depending on the nature of the extension.

**Use duplication** when:
- The derived component has a significantly different anatomy or element structure
- The relationship is more "inspired by" than "is a constrained version of"
- Figma's expose-props feature cannot handle the desired prop surface

**Use wrapper** when:
- The base component is stable and well-established
- The derived component primarily fixes/constrains props rather than restructuring anatomy
- The exposed props map cleanly to Figma's "expose nested instance properties" feature

**Pros**:
- Each component gets the most appropriate implementation
- Pragmatic — avoids forcing a pattern where it doesn't fit

**Cons**:
- Inconsistency within a design system — some extended components wrap, others duplicate
- The transformer must handle both patterns, increasing processing complexity
- Team must establish and document guidelines for when to use which pattern

In all patterns, the generated spec populates the `extends` field identically — the schema representation is implementation-agnostic.

---

## Decision

*Pending resolution of the open design questions above. The Decision section will be finalized once Q1–Q4 are answered.*

### Preliminary type and schema inventory

Regardless of which options are selected, the change will involve:

| File | Change | Bump |
|------|--------|------|
| `Component.ts` | Add optional `extends` field (shape TBD per Q1) | MINOR |
| New type file (name TBD) | Types for the extends relationship and prop classifications | MINOR |
| `index.ts` | Export new types | MINOR |
| `component.schema.json` | Add `extends` property to `Component`; add supporting definitions | MINOR |

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — every new type will have a corresponding schema definition
- **Parity**: The `Component` type and schema definition will both gain the same optional `extends` field; all supporting types will have schema counterparts

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | New optional field on `Component` output | No immediate action required — field is optional. Future: may display lineage info in CLI output |

---

## Semver Decision

**Version bump**: `MINOR`

**Justification**: All changes are additive optional fields and new type definitions. No existing field is removed, renamed, or made required. Existing specs validate without modification. Per Constitution III: "MINOR for additive types or new optional fields."

---

## Consequences

- Components can declare an explicit extends relationship to a base component, making inheritance a first-class concept in the Anova spec
- Consumers can resolve the base reference to discover the parent component and reconstruct the full prop surface
- Prop classification (`fixed`, `inherited`, `overridden`, `added`) makes the designer's intent machine-readable, enabling downstream tools to generate accurate prop tables, documentation, and code
- Fixed props are excluded from the derived component's `props` block, reinforcing that they are not configurable
- The Figma implementation strategy (wrapping vs. duplicating) remains a design decision — both approaches can produce valid `extends` data
- Future ADRs may address multi-level inheritance chains or interfaces/mixins if the pattern proves useful
