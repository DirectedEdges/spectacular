# ADR: Replace `effectStyleId` with `effects` — Add `Shadow`, `Blur`, and `Effects` Types

**Branch**: `v0.11.0`
**Created**: 2026-02-24
**Status**: ACCEPTED
**Summary**: An `effects` property with `Shadow`, `Blur` and `Effects` types replaces `effectStyleId` to describe shadows and blurs.
**Decides**: effects, effects.backgroundBlur, effects.backgroundBlur.visible, effects.layerBlur, effects.layerBlur.visible, effects.shadows, effects.shadows.blur, effects.shadows.offsetX, effects.shadows.offsetY, effects.shadows.spread, effects.shadows.visible, visible
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`@directededges/anova` currently exposes `effectStyleId?: Style` in the `Styles` type and the `StyleKey` union. In serialised output this key carries either a raw Figma style ID string or a `FigmaStyle` reference object. It provides no structure for the shadow values themselves — downstream consumers who need shadow geometry must look up the referenced style out-of-band.

`@directededges/anova-transformer` intends to enrich effect output. When a node's effects come from a *named Figma style*, emit the existing `FigmaStyle` reference under the key `effects`. When effects are inline, emit resolved geometry under `effects`.

`effectStyleId` is removed entirely — no deprecation shim. This is a breaking change that requires a MAJOR bump.

However, Figma's effects model is **mixed-type and order-dependent**: a single node can carry drop shadows, inner shadows, a layer blur, and a background blur simultaneously, in any order. A flat array forces downstream consumers to filter by type and understand Figma render-order semantics before they can use any value. This is a poor contract for web, iOS, and Android, where each effect type maps to a **distinct platform property** with no overlap:

| Effect type | Web | iOS | Android |
|---|---|---|---|
| Drop shadow | `box-shadow` | `.shadow()` | `elevation` / custom |
| Inner shadow | `box-shadow inset` | No native equivalent | No native equivalent |
| Layer blur | `filter: blur()` | `.blur()` | `RenderEffect` (API 31+) |
| Background blur | `backdrop-filter: blur()` | `.ultraThinMaterial` | Limited support |

Because each effect type maps to a wholly independent platform property, **cross-type render order is never meaningful to consumers**:

- On Web, `box-shadow`, `filter: blur()`, and `backdrop-filter: blur()` are separate CSS properties. Their relative order in Figma's effect stack has no bearing on how they composite.
- CSS itself re-sorts shadow values: all non-inset (`drop`) values are rendered before `inset` values regardless of declaration order, so inter-type ordering within shadow groups is also irrelevant at the CSS layer.
- On iOS and Android, each effect binds to an independent modifier or render property. There is no shared stack.

**Within a type, order does matter**: multiple shadows stack in the order they are declared (`box-shadow: A, B` differs visually from `box-shadow: B, A`). This ordering is preserved in `Effects.shadows[]`. The `inset` field on each `Shadow` distinguishes drop from inner; no separate arrays are needed.

The shape of `effects` must be decided with cross-platform translation in mind, not only Figma fidelity.

Current `Styles` shape (abbreviated):

```yaml
# types/Styles.ts
Styles:
  effectStyleId?: Style          # carries string | FigmaStyle | null
  # ...all other style keys...
  # effects — ABSENT
```

Note that Figma's `noise`, `textures`, and `glass` effects are considered out of scope. Because `Effects` routes by `effect.type` into named keys, unknown effect types are silently skipped during evaluation with no positional side effects on the output. If any of these effect types are formalised in a future release, they can be introduced as new optional keys on `Effects` without a breaking change.

---

## Decision Drivers

- **Type–schema sync**: Every type change must have a corresponding schema change in the same release. No drift between `types/` and `schema/` is permitted.
- **No runtime logic**: This package declares shapes only. No processing, evaluation, or conditional logic may be added.
- **Stable public API / MAJOR for breaking changes**: Removing `effectStyleId` from `Styles`, `StyleKey`, and schema breaks any consumer reading that key. A MAJOR version bump and migration note are required.
- **Minimal new surface**: New exports must serve a genuine consumer need. `Shadow`, `Blur`, and `Effects` are required so downstream consumers can type-check `effects` output values; no other new types are exported.
- **Platform-unbiased output**: The `effects` contract must not require consumers to understand Figma render-order semantics to extract values. Each effect role must be accessible via a predictable, named key.

---

## Options Considered

### Option A — Flat union `FigmaStyle | Shadow[]` *(rejected)*

`effects` carries either a `FigmaStyle` reference or a homogeneous array of `Shadow` objects.

```yaml
# Option A
Styles:
  effects?: FigmaStyle | Shadow[]   # shadows only; blurs excluded
```

**Pros:**
- Minimal surface area for the shadow-only case
- Simple to implement in the first iteration

**Cons:**
- Cannot represent blurs — the type must be revisited as soon as blur effects are added, incurring another MAJOR bump
- Forces a second breaking change when the scope inevitably expands
- Does not satisfy the **platform-unbiased output** driver; consumers reading the array must still infer type from geometry context

---

### Option B — Discriminated union array `FigmaStyle | Effect[]` *(rejected)*

Define an `Effect` type with a `type` discriminant field. `effects` carries a flat mixed array.

```yaml
# Option B — Effect union member
Effect:
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR'
  # ...type-specific fields via discriminated union
```

**Pros:**
- Matches Figma's internal data model exactly
- Preserves Figma render order

**Cons:**
- Mirrors Figma's bias rather than eliminating it — every consumer must `.filter(e => e.type === 'DROP_SHADOW')` before use
- Discriminated union with optional fields per variant is verbose in both TypeScript and JSON Schema
- Render order is irrelevant to web/iOS/Android since each platform has independent stacking rules
- Violates the **platform-unbiased output** driver

---

### Option C — Grouped object `Effects` *(selected)*

Inline effects are emitted as an `Effects` object with a named key per effect role. A `FigmaStyle` reference is the alternative when a named style is present.

```yaml
# Option C
Styles:
  effects?: FigmaStyle | Effects

Effects:
  shadows?: Shadow[]         # ordered list; Shadow.inset distinguishes drop vs inner
  layerBlur?: Blur           # singular; maps to filter: blur()
  backgroundBlur?: Blur      # singular; maps to backdrop-filter: blur()
```

**Pros:**
- Aligns with the DTCG Format Module shadow token shape (`offsetX`, `offsetY`, `inset`)
- A single `shadows[]` with `inset?: boolean` unifies drop and inner shadows — no consumer needs to merge two arrays to reconstruct `box-shadow` output
- Blurs are singular by platform convention — stacking blurs has no meaningful cross-platform equivalent
- Extensible without breaking changes: adding a new effect role adds an optional key to `Effects`
- Satisfies all Decision Drivers, particularly **platform-unbiased output** and **minimal new surface**

**Cons:**
- Slightly more surface area than Option A (`Blur` and `Effects` are new exports)
- Departs from Figma's array-order model — acceptable because render order is Figma-internal

**Selected.** This shape is stable across the full range of Figma effect types without requiring a future breaking change.

---

### Option D — Flat keys on `Styles` *(rejected)*

Expose `dropShadows?`, `innerShadows?`, `layerBlur?`, and `backgroundBlur?` as top-level `Styles` keys, bypassing a wrapper type entirely.

```yaml
# Option D
Styles:
  shadows?: Shadow[]
  layerBlur?: Blur
  backgroundBlur?: Blur
  # effectStyleRef? — needed separately for named style reference
```

**Pros:**
- No intermediate wrapper type; effect keys are immediately visible alongside all other style properties
- Consumers read `styles.dropShadows` directly without destructuring a nested object

**Cons:**
- No single key to attach a `FigmaStyle` named-style reference to — requires a fourth key (`effectStyleRef?`) solely to carry that case; consumers must check two locations instead of one
- Adds 3–4 members to `StyleKey` and `schema/styles.schema.json` instead of 1, expanding public API surface across a wide and shallow plane
- The mutual exclusion between named style and inline geometry is unenforceable at the type level — a consumer could populate both `dropShadows` and a hypothetical `effectStyleRef` simultaneously with no type error

---

### Option E — Explicit split: `effectStyleRef?` + `effects?: Effects` *(rejected)*

Separate concerns across two keys: `effectStyleRef?` carries the `FigmaStyle` named-style reference; `effects?` carries inline resolved geometry as an `Effects`. Both are optional; at runtime exactly one is present when effects exist.

```yaml
# Option E
Styles:
  effectStyleRef?: FigmaStyle    # named style reference path
  effects?: Effects         # inline geometry path
```

**Pros:**
- Eliminates the `FigmaStyle | Effects` union — consumers read the key they need without discriminating
- Each key has a single clear type

**Cons:**
- Mutual exclusion is a runtime constraint that cannot be expressed in the TypeScript type or JSON Schema; the type system permits both keys to be populated simultaneously, which is an invalid state
- Two `StyleKey` additions and two schema properties instead of one — wider surface for a distinction that can be encoded in the value
- Upstream tooling emitting output must know to write to one key or the other based on the source type, adding conditional logic that Option C avoids

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|---|---|---|
| `types/Styles.ts` | Remove `effectStyleId?: Style` from `Styles`; add `effects?: FigmaStyle \| Effects` | MAJOR (removal) |
| `types/Styles.ts` | Remove `'effectStyleId'` from `StyleKey` union; add `'effects'` | MAJOR (removal) |
| `types/Styles.ts` | Add `Shadow` interface (new export) | MINOR (additive) |
| `types/Styles.ts` | Add `Blur` interface (new export) | MINOR (additive) |
| `types/Styles.ts` | Add `Effects` interface (new export) | MINOR (additive) |
| `types/index.ts` | Export `Shadow`, `Blur`, `Effects` from `'./Styles.js'` | MINOR (additive) |

**`Shadow` interface** (`types/Styles.ts`):

```yaml
# New interface — used for all shadow entries (drop and inner)
Shadow:
  visible: boolean                   # whether this shadow is active
  inset?: boolean                    # true for inner shadow; absent/false for drop shadow (DTCG)
  offsetX: number | VariableStyle    # horizontal offset (px) — DTCG field name
  offsetY: number | VariableStyle    # vertical offset (px) — DTCG field name
  blur: number | VariableStyle       # blur radius (px)
  spread: number | VariableStyle     # spread radius (px)
  color: string | VariableStyle      # #RRGGBBAA hex string, or VariableStyle reference
```

**`Blur` interface** (`types/Styles.ts`):

```yaml
# New interface — used for layerBlur and backgroundBlur entries
Blur:
  visible: boolean                   # whether this blur is active
  radius: number | VariableStyle     # blur radius (px)
```

**`Effects` interface** (`types/Styles.ts`):

```yaml
# New interface — inline effects grouped by role
Effects:
  shadows?: Shadow[]                 # ordered list; Shadow.inset distinguishes drop vs inner
  layerBlur?: Blur                   # singular layer blur; filter: blur()
  backgroundBlur?: Blur              # singular background blur; backdrop-filter: blur()
```

**`Styles` field change** (`types/Styles.ts`):

```yaml
# Before
Styles:
  effectStyleId?: Style              # string | boolean | number | null | VariableStyle | FigmaStyle | ...

# After
Styles:
  effects?: FigmaStyle | Effects  # FigmaStyle when named style; Effects when inline
  # effectStyleId — REMOVED
```

**`StyleKey` change** (`types/Styles.ts`):

```yaml
# Before
StyleKey: '...' | 'effectStyleId' | '...'

# After
StyleKey: '...' | 'effects' | '...'
# 'effectStyleId' — REMOVED
```

### Schema changes (`schema/`)

| File | Change | Bump |
|---|---|---|
| `schema/styles.schema.json` | Remove `effectStyleId` from `#/definitions/Styles/properties` | MAJOR (removal) |
| `schema/styles.schema.json` | Add `effects` property to `#/definitions/Styles/properties` | MAJOR (see above) |
| `schema/styles.schema.json` | Add `Shadow` definition to `#/definitions` | MINOR (additive) |
| `schema/styles.schema.json` | Add `Blur` definition to `#/definitions` | MINOR (additive) |
| `schema/styles.schema.json` | Add `Effects` definition to `#/definitions` | MINOR (additive) |
| `schema/styles.schema.json` | Add `EffectsStyleValue` definition to `#/definitions` | MINOR (additive) |

**`Shadow` schema definition** (`schema/styles.schema.json`):

```yaml
# New entry under #/definitions — shared by all shadow entries (drop and inner)
Shadow:
  type: object
  description: >
    A single evaluated shadow. inset distinguishes drop (absent/false) from inner (true).
    Field names align with the DTCG Format Module shadow token.
  properties:
    visible:
      type: boolean
      description: Whether this shadow is active
    inset:
      type: boolean
      description: true for inner shadow; absent or false for drop shadow
    offsetX:
      oneOf: [{ type: number }, { $ref: '#/definitions/VariableStyle' }]
      description: Horizontal offset in pixels (DTCG)
    offsetY:
      oneOf: [{ type: number }, { $ref: '#/definitions/VariableStyle' }]
      description: Vertical offset in pixels (DTCG)
    blur:
      oneOf: [{ type: number }, { $ref: '#/definitions/VariableStyle' }]
      description: Blur radius in pixels
    spread:
      oneOf: [{ type: number }, { $ref: '#/definitions/VariableStyle' }]
      description: Spread radius in pixels
    color:
      oneOf:
        - { type: string, description: '#RRGGBBAA hex string' }
        - { $ref: '#/definitions/VariableStyle' }
      description: Shadow color
  required: [visible, offsetX, offsetY, blur, spread, color]
  additionalProperties: false
```

**`Blur` schema definition** (`schema/styles.schema.json`):

```yaml
# New entry under #/definitions — shared by layerBlur and backgroundBlur
Blur:
  type: object
  description: >
    A single evaluated blur effect. Singular per type; the containing key
    (layerBlur vs backgroundBlur) determines render role.
  properties:
    visible:
      type: boolean
      description: Whether this blur is active
    radius:
      oneOf: [{ type: number }, { $ref: '#/definitions/VariableStyle' }]
      description: Blur radius in pixels
  required: [visible, radius]
  additionalProperties: false
```

**`Effects` schema definition** (`schema/styles.schema.json`):

```yaml
# New entry under #/definitions
Effects:
  type: object
  description: >
    Inline effects grouped by role. Each key is optional; a key is omitted when
    no effects of that type are present on the node.
  properties:
    shadows:
      type: array
      items: { $ref: '#/definitions/Shadow' }
      description: Ordered list of shadows; Shadow.inset distinguishes drop vs inner
    layerBlur:
      $ref: '#/definitions/Blur'
      description: Layer blur (filter effect on the node itself)
    backgroundBlur:
      $ref: '#/definitions/Blur'
      description: Background blur (backdrop filter)
  additionalProperties: false
```

**`EffectsStyleValue` schema definition** (`schema/styles.schema.json`):

```yaml
# New entry under #/definitions
EffectsStyleValue:
  description: >
    Effect value. FigmaStyle when the node references a named effects style;
    Effects when effects are defined inline.
  oneOf:
    - { $ref: '#/definitions/FigmaStyle', description: Named effects style reference }
    - { $ref: '#/definitions/Effects', description: Inline effects grouped by role }
    - { type: null }
```

**`effects` property entry** (under `#/definitions/Styles/properties`):

```yaml
# Added to Styles properties
effects:
  $ref: '#/definitions/EffectsStyleValue'
  description: >
    Effect output. FigmaStyle when the node references a named effects style;
    Effects when effects are defined inline. effectStyleId — REMOVED.

# Removed from Styles properties:
# effectStyleId: { $ref: '#/definitions/StyleIdValue', description: 'Effect style reference' }
```

### Notes

- `Shadow` field names `offsetX` and `offsetY` align with the DTCG Format Module shadow token; `x`/`y` are not used.
- `Shadow.inset` is optional and defaults to `false`/absent for drop shadows; `true` for inner shadows. It is always `boolean` (no `VariableStyle` variant).
- `Shadow` fields `offsetX`, `offsetY`, `blur`, `spread` allow `VariableStyle` in addition to `number` to support Figma variable bindings. In practice this is uncommon; the primary case is a raw number.
- `Shadow.color` allows `string` (`#RRGGBBAA`) or `VariableStyle`. The alpha channel is always present in the hex encoding.
- `Blur.radius` allows `VariableStyle` for the same reason.
- `visible` on both `Shadow` and `Blur` is always `boolean` (no `VariableStyle` variant) — Figma does not support variable binding on `visible` for individual effect items.
- `shadows` is an array even when only one shadow is present. A single-element array is valid and expected.
- `layerBlur` and `backgroundBlur` are singular objects, not arrays — Figma stacks multiple blurs of the same type as a single resolved value; emitting an array would be misleading.
- An `Effects` with all keys absent is not emitted — `effects` is omitted entirely when no effects are present.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `Shadow` interface in `types/Styles.ts` ↔ `Shadow` definition in `schema/styles.schema.json`
  - `Blur` interface in `types/Styles.ts` ↔ `Blur` definition in `schema/styles.schema.json`
  - `Effects` interface in `types/Styles.ts` ↔ `Effects` definition in `schema/styles.schema.json`
  - `Shadow.offsetX`/`offsetY`/`inset` in `types/Styles.ts` ↔ same in `schema/styles.schema.json`
  - `Effects.shadows?` in `types/Styles.ts` ↔ `shadows` array in `schema/styles.schema.json`
  - `Styles.effects?: FigmaStyle | Effects` ↔ `#/definitions/Styles/properties/effects` → `EffectsStyleValue`
  - `StyleKey` union member `'effects'` ↔ key present in `#/definitions/Styles/properties`
  - `effectStyleId` removed from `types/Styles.ts` ↔ `effectStyleId` removed from `#/definitions/Styles/properties`

---

## Downstream Impact

| Consumer | Impact | Action required |
|---|---|---|
| `anova-kit` (CLI / MCP) | Recompile required; `effectStyleId` removed, `effects` shape changed to `Effects` | Migrate `styles.effectStyleId` reads to `styles.effects`; destructure by role (`shadows`, `layerBlur`, etc.); use `shadow.inset` to distinguish drop vs inner |

---

## Semver Decision

**Version bump**: `0.10.x → 0.11.0` (`MAJOR`)

**Justification**:
- `effectStyleId` is removed from `Styles`, `StyleKey`, and the JSON schema with no deprecation period — a breaking change for any consumer reading that key. Per constitution Principle III: *"Any change to an existing export is a breaking change and MUST follow semantic versioning rules."*
- The addition of `Shadow` interface and `effects` key is additive (MINOR on its own) but the removal forces MAJOR.

---

## Consequences

- Consumers can represent all Figma effect types — drop shadows, inner shadows, layer blur, background blur — via predictable, role-named keys without filtering an array.
- Shadows map to `box-shadow` (drop) or `inset box-shadow` (inner, `Shadow.inset === true`); `layerBlur` → `filter: blur()`; `backgroundBlur` → `backdrop-filter: blur()`.
- `Shadow` field names (`offsetX`, `offsetY`, `inset`) align with the DTCG Format Module shadow token, reducing impedance for consumers building DTCG-compliant pipelines.
- Consumers reading `styles.effectStyleId` will receive `undefined` after upgrading; they must migrate to `styles.effects`.
- When `styles.effects` is a `FigmaStyle`, the named style `id` and resolved `name` are available — identical data to the former `effectStyleId` output, under a new key.
- When `styles.effects` is an `Effects`, each present key carries the resolved geometry for that effect role.
- New effect roles can be added to `Effects` as optional keys in future releases without a breaking change.
- Any JSON schema validation that previously passed `{ "effectStyleId": { "id": "..." } }` will fail after this change — consumers must revalidate against the new schema version.
- `Shadow`, `Blur`, and `Effects` are now first-class exported types: `import type { Shadow, Blur, Effects } from '@directededges/anova'`.
