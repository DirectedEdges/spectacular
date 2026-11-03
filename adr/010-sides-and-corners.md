# ADR: Sides and Corners Composite Types

**Branch**: `010-sides-and-corners`
**Created**: 2026-03-05
**Status**: ACCEPTED
**Summary**: Composite `Sides` and `Corners` types replace flat padding, stroke weight and corner radius properties.
**Decides**: cornerRadius, cornerSmoothing, padding, strokeWeight
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

The `Styles` type currently represents per-side and per-corner values as flat properties directly on the `Styles` object:

- **Padding**: `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` (4 separate `MixedNumberStyleValue` properties)
- **Stroke weight**: `strokeWeight` (uniform), `strokeTopWeight`, `strokeBottomWeight`, `strokeLeftWeight`, `strokeRightWeight` (5 separate `StrokeStyleValue` properties)
- **Corner radius**: `cornerRadius` (uniform), `topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius` (5 separate `CornerStyleValue` properties)

This creates several problems:

- **No collapsed representation**: When all sides or corners share the same value, the output still emits up to 4–5 separate properties instead of a single scalar. Consumers must detect uniformity themselves.
- **Physical direction names**: Properties use physical directions (`left`, `right`) rather than logical directions (`start`, `end`), which limits cross-platform portability for RTL layouts.
- **Variant merge complexity**: Comparing and merging side/corner values across variants requires checking each flat property individually with no structural grouping to guide the merge.

---

## Decision Drivers

- **Type–schema symmetry**: Every type change must have a corresponding schema change (Constitution I)
- **No runtime logic**: The new types must remain pure data shapes — merge semantics are described but not implemented in this package (Constitution II)
- **Stable, intentional API**: Removing or renaming fields is a breaking change requiring MAJOR bump (Constitution III)
- **Additive composites pattern**: Follow the precedent set by `Typography` and `Effects` — group related scalar properties into a composite object on `Styles`
- **Logical direction model**: Use `start`/`end` instead of `left`/`right` to support RTL-aware platform output
- **Collapsed vs. expanded**: A single value when uniform; an object when sides/corners differ — reducing output size and simplifying consumer logic

---

## Options Considered

### Option A: Sides/Corners composite types with logical directions *(Selected)*

Replace flat per-side/per-corner properties with composite types that use a collapsed scalar / expanded object union:

- `padding: number | Sides` — collapsed when uniform, expanded when sides differ
- `strokeWeight: number | Sides` — collapsed when uniform, expanded when sides differ
- `cornerRadius: number | Corners` — collapsed when uniform, expanded when corners differ

Where:
```yaml
Sides:
  top: number | TokenReference | null
  end: number | TokenReference | null
  bottom: number | TokenReference | null
  start: number | TokenReference | null

Corners:
  topStart: number | TokenReference | null
  topEnd: number | TokenReference | null
  bottomEnd: number | TokenReference | null
  bottomStart: number | TokenReference | null
```

**Pros**:
- Matches the `Typography`/`Effects` composite pattern already in the codebase
- Collapsed form eliminates redundant data when all sides/corners are equal
- Logical directions (`start`/`end`) support RTL without consumer-side mapping
- Structural grouping makes variant merge rules explicit: compare the single key, expand only when values differ

**Cons / Trade-offs**:
- MAJOR breaking change — removes 13 flat properties from `Styles`
- Every consumer must update to handle the `number | Sides` / `number | Corners` union
- `"mixed"` support from `MixedNumberStyleValue`, `StrokeStyleValue`, and `CornerStyleValue` is replaced by the expanded object form — `"mixed"` as a string literal is no longer needed for these properties

---

### Option B: Keep flat properties, add logical aliases *(Rejected)*

Keep existing flat properties and add `paddingStart`, `paddingEnd`, `strokeStartWeight`, `strokeEndWeight`, etc. as aliases.

**Rejected because**: Doubles the property count without solving the collapsed-value problem. Violates the stable-API driver by adding redundant fields that must be kept in sync with the originals. Does not address variant merge complexity.

---

### Option C: Nested object without collapsed form *(Rejected)*

Always use the object form (`padding: { top, end, bottom, start }`) even when all values are equal.

**Rejected because**: Increases output verbosity for the common uniform case. Consumers lose the simple `padding: 8` check for uniformity. Does not match the scalar-or-composite pattern used by `effects` and `typography` on `Styles`.

---

## Inline-axis naming: `start`/`end` vs `leading`/`trailing` vs `left`/`right`

This ADR adopts `start`/`end` for the inline axis (replacing `left`/`right`) and logical corner names (`topStart`, `topEnd`, `bottomStart`, `bottomEnd`). Three naming models were evaluated:

### `left` / `right` (physical)

The current Figma API and the existing flat properties use physical directions: `paddingLeft`, `strokeRightWeight`, `topLeftRadius`.

**Pros**:
- Direct 1:1 mapping to Figma API property names — no translation layer needed during extraction
- Familiar to web developers accustomed to CSS physical properties

**Cons**:
- Assumes LTR layout — consumers targeting RTL platforms must flip `left` ↔ `right` themselves
- CSS itself is moving away from physical properties toward logical ones (`padding-inline-start` over `padding-left`)
- Locks the spec output to a single writing-direction model, limiting Anova's role as a platform-neutral contract

**Rejected because**: Anova's output is consumed by multiple platforms (web, iOS, Android). Embedding a physical-direction assumption forces every RTL-aware consumer to perform its own mapping, which contradicts the goal of a shared, platform-neutral contract.

### `leading` / `trailing` (typographic/Apple)

Apple's SwiftUI and UIKit use `leading`/`trailing` for inline-axis edges (e.g., `.padding(.leading, 16)`). Android Compose also supports `start`/`end` but some Apple-centric tools prefer `leading`/`trailing`.

**Pros**:
- Natural fit for Apple platform consumers
- Avoids ambiguity with CSS `start`/`end` which could be confused with flex `start`/`end` alignment values

**Cons**:
- `leading`/`trailing` are typographic terms that originate from text direction, not layout direction — they can be confusing when applied to non-text layout properties like padding or stroke weight
- Corner names become awkward: `topLeading` / `bottomTrailing` are longer and less intuitive than `topStart` / `bottomEnd`
- Not used by CSS, Android's XML layout system, or the W3C logical properties spec — limits portability to a narrower set of consumers
- Figma's own internal model does not use these terms

**Rejected because**: While valid for Apple-centric output, `leading`/`trailing` narrows portability. The terms are longer, less universal, and produce awkward corner-name compounds. A spec contract should use the most broadly adopted logical model.

### `start` / `end` (logical — W3C / CSS / Android) *(Selected)*

The W3C CSS Logical Properties spec, Android Compose, and Flutter all use `start`/`end` for the inline axis. Corners follow as `topStart`, `topEnd`, `bottomStart`, `bottomEnd`.

**Pros**:
- Aligns with CSS Logical Properties (`padding-inline-start`, `border-start-start-radius`) — the direction the web platform is heading
- Used by Android Compose (`PaddingValues.start`), Flutter (`EdgeInsetsDirectional.start`), and SwiftUI can trivially map `start` → `leading`
- Corner compounds are concise and readable: `topStart`, `bottomEnd`
- Writing-direction neutral — `start` resolves to `left` in LTR and `right` in RTL without the spec encoding that assumption
- Consistent with the `start`/`end` axis model already used in flexbox (`justify-content: flex-start`)

**Cons**:
- Requires a mapping step when extracting from Figma (which uses physical `left`/`right`) — but this mapping belongs in `anova-transformer`, not in the spec contract
- Apple consumers must map `start` → `leading`, though this is a trivial 1:1 substitution
- `start`/`end` can overlap with flex alignment terminology (`flex-start`), though context (side vs. alignment) disambiguates

**Selected because**: `start`/`end` is the most broadly adopted logical direction model across web (CSS), Android, and Flutter. It produces clean corner compounds, keeps the spec platform-neutral, and aligns with the industry direction away from physical properties. The extraction-time mapping from Figma's physical names is a one-time transformer concern, not a contract concern.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Remove `paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`; add `padding: Style \| Sides` | MAJOR |
| `Styles.ts` | Remove `strokeTopWeight`, `strokeBottomWeight`, `strokeLeftWeight`, `strokeRightWeight`; change `strokeWeight: Style \| Sides` | MAJOR |
| `Styles.ts` | Remove `topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius`; change `cornerRadius: Style \| Corners` | MAJOR |
| `Styles.ts` | Add `Sides` interface | MINOR |
| `Styles.ts` | Add `Corners` interface | MINOR |
| `Styles.ts` | Update `StyleKey` union to remove old keys, add `padding` | MAJOR |

**New types** (`types/Styles.ts`):
```yaml
# Sides — used for padding and strokeWeight
Sides:
  top?: Style
  end?: Style
  bottom?: Style
  start?: Style

# Corners — used for cornerRadius
Corners:
  topStart?: Style
  topEnd?: Style
  bottomEnd?: Style
  bottomStart?: Style
```

**Styles changes** (`types/Styles.ts`):
```yaml
# Before
Styles:
  paddingLeft?: Style
  paddingRight?: Style
  paddingTop?: Style
  paddingBottom?: Style
  strokeWeight?: Style
  strokeTopWeight?: Style
  strokeBottomWeight?: Style
  strokeLeftWeight?: Style
  strokeRightWeight?: Style
  cornerRadius?: Style
  topLeftRadius?: Style
  topRightRadius?: Style
  bottomLeftRadius?: Style
  bottomRightRadius?: Style

# After
Styles:
  padding?: Style | Sides          # number when uniform, Sides when per-side
  strokeWeight?: Style | Sides     # number when uniform, Sides when per-side
  cornerRadius?: Style | Corners   # number when uniform, Corners when per-corner
```

**`StyleKey` changes**:
```yaml
# Removed keys
- paddingLeft
- paddingRight
- paddingTop
- paddingBottom
- strokeTopWeight
- strokeBottomWeight
- strokeLeftWeight
- strokeRightWeight
- topLeftRadius
- topRightRadius
- bottomLeftRadius
- bottomRightRadius

# Added keys
- padding
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Remove `paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom` properties from `Styles` | MAJOR |
| `styles.schema.json` | Remove `strokeTopWeight`, `strokeBottomWeight`, `strokeLeftWeight`, `strokeRightWeight` properties from `Styles` | MAJOR |
| `styles.schema.json` | Remove `topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius` properties from `Styles` | MAJOR |
| `styles.schema.json` | Add `Sides` definition | MINOR |
| `styles.schema.json` | Add `Corners` definition | MINOR |
| `styles.schema.json` | Add `SidesStyleValue` definition (union: `Style \| Sides`) | MINOR |
| `styles.schema.json` | Add `CornersStyleValue` definition (union: `Style \| Corners`) | MINOR |
| `styles.schema.json` | Add `padding` property to `Styles` using `SidesStyleValue` | MINOR |
| `styles.schema.json` | Change `strokeWeight` property to use `SidesStyleValue` | MAJOR |
| `styles.schema.json` | Change `cornerRadius` property to use `CornersStyleValue` | MAJOR |

**New schema definitions** (`schema/styles.schema.json`):
```yaml
# Sides object — per-side values using logical directions
Sides:
  type: object
  properties:
    top:
      $ref: "#/definitions/NumberStyleValue"
    end:
      $ref: "#/definitions/NumberStyleValue"
    bottom:
      $ref: "#/definitions/NumberStyleValue"
    start:
      $ref: "#/definitions/NumberStyleValue"
  additionalProperties: false

# Corners object — per-corner values using logical directions
Corners:
  type: object
  properties:
    topStart:
      $ref: "#/definitions/NumberStyleValue"
    topEnd:
      $ref: "#/definitions/NumberStyleValue"
    bottomEnd:
      $ref: "#/definitions/NumberStyleValue"
    bottomStart:
      $ref: "#/definitions/NumberStyleValue"
  additionalProperties: false

# SidesStyleValue — scalar or per-side object
SidesStyleValue:
  oneOf:
    - type: number
    - $ref: "#/definitions/Sides"
    - $ref: "#/definitions/TokenReference"
    - type: "null"

# CornersStyleValue — scalar or per-corner object
CornersStyleValue:
  oneOf:
    - type: number
    - $ref: "#/definitions/Corners"
    - $ref: "#/definitions/TokenReference"
    - type: "null"
```

### Notes

- `cornerSmoothing` remains unchanged — it is a single scalar property unrelated to per-corner values.
- The `"mixed"` string literal is no longer needed for `padding`, `strokeWeight`, or `cornerRadius`. When sides/corners are mixed, the expanded object form is used instead. This removes `MixedNumberStyleValue`, `StrokeStyleValue`, and `CornerStyleValue` from the value types used by these three properties.
- `Sides` and `Corners` field values use `NumberStyleValue` (number | TokenReference | null) — each individual side/corner can independently reference a token.
- Variant merge semantics (how collapsed values are compared and expanded across variants) are the responsibility of `anova-transformer`, not this package.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `Sides` interface ↔ `#/definitions/Sides`
  - `Corners` interface ↔ `#/definitions/Corners`
  - `Style | Sides` on `padding` ↔ `SidesStyleValue`
  - `Style | Sides` on `strokeWeight` ↔ `SidesStyleValue`
  - `Style | Corners` on `cornerRadius` ↔ `CornersStyleValue`
  - 13 removed `Styles` properties ↔ 13 removed schema properties

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Breaking — output shape changes for `padding`, `strokeWeight`, `cornerRadius` | Update any code that reads flat `paddingLeft`/`paddingRight`/etc. to handle `number \| Sides` union. Update `cornerRadius`/`strokeWeight` handling for `number \| Corners`/`number \| Sides` unions. |

---

## Semver Decision

**Version bump**: `0.11.0 → 1.0.0` (`MAJOR`)

**Justification**: This change removes 13 existing fields from the `Styles` type and replaces them with restructured composite types. Removing or renaming exported type fields is a breaking change per Constitution III. All consumers must update to the new shape.

---

## Consequences

- Consumers can represent uniform padding/stroke/radius as a single scalar value (e.g., `padding: 8`) instead of 4 separate properties
- Per-side and per-corner differences are expressed as structured objects with logical direction names (`start`/`end`/`topStart`/`topEnd`/etc.), enabling RTL-aware platform output
- The `"mixed"` string literal is eliminated for these three property groups — mixed values are now represented structurally
- `anova-transformer` must implement collapse/expand logic and variant merge rules for the new composite types
- `anova-kit` must update its output parsing for the changed `Styles` shape
- All existing serialized output using the flat property names becomes invalid against the new schema
