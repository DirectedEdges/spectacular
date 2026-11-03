# ADR: Replace Hex String with DTCG Color Object in `ColorStyleValue`

**Created**: 2026-03-02
**Status**: ACCEPTED
**Summary**: A DTCG `ColorValue` object replaces the hex string in `ColorStyle`, aligning color values with token standards.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`ColorStyle` (`types/Styles.ts`) and `ColorStyleValue` (`schema/styles.schema.json`) currently accept a bare hex string as one variant of their union:

```yaml
# Current ColorStyle / ColorStyleValue arms
- "#RRGGBB"        # e.g. "#ff007f"
- "#RRGGBBAA"      # e.g. "#ff007f80"  ← Anova compact form
- TokenReference   # { $token, $type: "color", ... }
- GradientValue    # { type: "LINEAR"|"RADIAL"|"ANGULAR", ... }
- null
```

The schema already carries the acknowledgement: *"Canonical form per DTCG Color Module §4.1 is the color object."*

The DTCG Color Module 2025.10 (Final Community Group Report, published 28 October 2025) defines the canonical `$value` object for all resolved color tokens:

```yaml
# DTCG Color §4.1 canonical form
colorSpace: srgb            # required — one of 14 supported spaces
components: [1, 0, 0.502]  # required — ordered number | "none" array
alpha: 0.87                 # optional; defaults to 1 when omitted
hex: "#ff007f"              # optional; 6-digit fallback only (no alpha in hex)
```

Two limitations of the current `string` arm motivate alignment:

- **Wide-gamut opacity**: `#RRGGBBAA` encodes alpha in the hex suffix — DTCG explicitly moves alpha to a separate `alpha` field and restricts `hex` to the 6-digit form.
- **Wide-gamut colors**: sRGB hex cannot represent Display P3, OKLCH, or other wide-gamut spaces that Figma increasingly supports. The `colorSpace` + `components` pair can express all 14 spaces in the DTCG spec, including any Figma may add in future.

v0.11.0 is the correct release boundary to close this alignment because multiple breaking changes are already bundled into this release and downstream consumers have not yet normalised against the hex string form.

---

## Decision Drivers

- **DTCG Color §4.1 parity**: Inline resolved color values should use the canonical DTCG `$value` object. Anova already adopted DTCG conventions for `Shadow` (DTCG shadows), `Typography` (DTCG typography), and `TokenReference` (DTCG aliases).
- **Wide-gamut correctness**: The output must not silently degrade wide-gamut Figma fills to sRGB hex. `colorSpace` + `components` preserves the source color space without lossy conversion.
- **`$`-prefix namespace discipline**: `$token`, `$type`, and `$binding` reserve `$`-prefixed keys for reference and metadata objects. Inline resolved values (e.g., `GradientValue`, `Effects`) use plain-key objects. A `{ $type: "color", $value: {...} }` wrapper would introduce a `$`-prefixed key into a resolved value, blurring the reference/value distinction and breaking the established pattern.
- **Type ↔ schema symmetry**: `types/Styles.ts` (`ColorStyle`) and `schema/styles.schema.json` (`ColorStyleValue`) must remain in sync — constitution principle I.
- **No runtime logic**: Only type declarations and schema definitions; no transformation code — constitution principle II.
- **Stable API discipline**: Removing the `string` arm is a breaking change per the constitution. This is deliberate and grouped with the existing breaking changes in v0.11.0.

---

## Options Considered

### Option A: Introduce `ColorValue` — replace hex string with DTCG `$value` object *(Selected)*

Add a new `ColorValue` type/schema definition shaped as `{ colorSpace, components, alpha?, hex? }` per DTCG Color §4.1. Replace the `string` arm in `ColorStyle` / `ColorStyleValue` with a reference to `ColorValue`.

```yaml
# New ColorStyleValue arms
- ColorValue       # { colorSpace, components, alpha?, hex? }
- TokenReference   # { $token, $type: "color", ... }
- GradientValue    # { type: "LINEAR"|"RADIAL"|"ANGULAR", ... }
- null
```

**Pros**:
- Full DTCG parity for inline resolved color values
- Preserves wide-gamut color space information without lossy hex conversion
- `colorSpace` discriminant enables consumer tooling to branch per space
- Consistent with the established plain-key object pattern for resolved values
- Keeps `$`-prefix exclusively for reference/metadata objects

**Cons / Trade-offs**:
- Breaking change: all existing consumers emitting or consuming `string` hex values must migrate to the object form
- `GradientStop.color` currently also accepts `string | TokenReference` — this ADR does not address that field; it remains a follow-up gap (see Notes)

---

### Option B: Add `ColorValue` as an additional arm, deprecate hex string *(Rejected)*

Keep the `string` arm alongside the new `ColorValue` arm for one release cycle, then remove it in a future MAJOR.

**Rejected because**: v0.11.0 already accumulates breaking changes across multiple ADRs. Adding a deprecated parallel arm increases schema complexity for consumers with no benefit — the plugin emitting the hex string and the consumers reading it are all under active development. A clean cut is lower total cost than a two-phase deprecation.

---

### Option C: Wrap with `{ $type: "color", $value: {...} }` per DTCG token structure *(Rejected)*

Adopt the full DTCG token wrapper — not just the `$value` object but the outer `{ $type, $value }` envelope — to make the inline value structurally parallel to `TokenReference`.

**Rejected because**: This violates `$`-prefix namespace discipline. `TokenReference` uses `$token` + `$type` to signal *"this is an alias, not a resolved value."* A `{ $type: "color", $value: {} }` shape in the same union would use `$`-prefixed keys for a resolved value, making the reference/value distinction ambiguous. All other resolved value types in Anova (`GradientValue`, `Effects`, `Typography`) use plain-key objects. The `$value` object shape alone (Option A) achieves DTCG format alignment without the namespace collision.

---

## Decision

### New type (`types/Styles.ts`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Add `ColorValue` interface | MAJOR |
| `Styles.ts` | Change `ColorStyle`: remove `string`, add `ColorValue` | MAJOR |

**Example — before / after** (`types/Styles.ts`):

```yaml
# Before
ColorStyle: string | TokenReference | GradientValue | null

# After
ColorValue:
  colorSpace: string          # required — e.g. "srgb", "oklch", "display-p3"
  components: (number | "none")[]   # required — ordered per colorSpace
  alpha?: number              # optional; 0–1; defaults to 1 if omitted
  hex?: string                # optional; 6-digit #RRGGBB fallback only

ColorStyle: ColorValue | TokenReference | GradientValue | null
```

### Schema changes (`schema/styles.schema.json`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Add `ColorValue` definition | MAJOR |
| `styles.schema.json` | Replace hex `string` pattern arm in `ColorStyleValue` with `$ref: "#/definitions/ColorValue"` | MAJOR |

**Example — new `ColorValue` definition** (`schema/styles.schema.json`):

```yaml
# New definition: #/definitions/ColorValue
ColorValue:
  type: object
  description: >
    Inline resolved color value per DTCG Color Module §4.1.
    colorSpace and components are required; alpha defaults to 1 when omitted;
    hex is an optional 6-digit sRGB fallback (no alpha channel in hex).
  properties:
    colorSpace:
      type: string
      enum:
        - srgb
        - srgb-linear
        - hsl
        - hwb
        - lab
        - lch
        - oklab
        - oklch
        - display-p3
        - a98-rgb
        - prophoto-rgb
        - rec2020
        - xyz-d65
        - xyz-d50
      description: Color space identifier per DTCG Color §4.2.
    components:
      type: array
      items:
        oneOf:
          - type: number
          - type: string
            const: "none"
      minItems: 3
      description: Ordered component values (number or "none") for the given colorSpace.
    alpha:
      type: number
      minimum: 0
      maximum: 1
      description: Alpha channel 0–1. Defaults to 1 (fully opaque) when omitted.
    hex:
      type: string
      pattern: "^#[0-9A-Fa-f]{6}$"
      description: >
        Optional 6-digit sRGB fallback (#RRGGBB). Alpha is excluded per DTCG §4.1.
        Consumers SHOULD prefer colorSpace + components for rendering.
  required:
    - colorSpace
    - components
  additionalProperties: false
```

**Example — updated `ColorStyleValue`** (`schema/styles.schema.json`):

```yaml
# Before
ColorStyleValue:
  oneOf:
    - type: string
      pattern: "^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$"   # ← removed
    - $ref: "#/definitions/TokenReference"
    - $ref: "#/definitions/GradientValue"
    - type: null

# After
ColorStyleValue:
  oneOf:
    - $ref: "#/definitions/ColorValue"                  # ← new
    - $ref: "#/definitions/TokenReference"
    - $ref: "#/definitions/GradientValue"
    - type: null
```

### Notes

- `GradientStop.color` (`Gradient.ts` / `styles.schema.json`) currently accepts `string | TokenReference`. Stop colors as `ColorValue` objects is a natural follow-up but is out of scope for this ADR. The stop `string` arm is a separate gap.
- `Shadow.color` in the schema (`styles.schema.json`) similarly uses a `#RRGGBBAA hex string` arm. Replacing it with `ColorValue` is a related but separate scope change not addressed here.
- The 14 `colorSpace` enum values correspond exactly to DTCG Color §4.2's supported spaces. Future spaces added to the DTCG spec will require a schema update but not a type signature change (as long as `colorSpace` remains `string` in the TypeScript type).
- The TypeScript `ColorValue.colorSpace` field is typed as `string` (not a string literal union) to avoid drift between the TS type and the schema enum — the schema enum provides the validation constraint; the TS type provides the structural shape.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `ColorValue` (TS interface in `types/Styles.ts`) ↔ `ColorValue` definition at `#/definitions/ColorValue` in `schema/styles.schema.json`
  - `ColorStyle` (TS union in `types/Styles.ts`) ↔ `ColorStyleValue` at `#/definitions/ColorStyleValue` in `schema/styles.schema.json`

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | `ColorStyle` type changes; any code typed against `string` for color values will fail compilation | Update to accept `ColorValue` object; use `colorSpace`, `components`, `alpha?, hex?` fields |

---

## Semver Decision

**Version bump**: `0.10.x → 0.11.0` (`MAJOR` classification, grouped into active v0.11.0 release)

**Justification**: Removing the `string` arm from `ColorStyle` and `ColorStyleValue` is a breaking change per constitution §III — any consumer holding a color value as `string` will fail. Per the constitution's versioning policy this warrants a MAJOR classification. In practice, this change is grouped with the other breaking changes already bundled into the v0.11.0 release boundary (ADR-005 through ADR-008), under the pre-1.0 convention that a MINOR release may carry breaking changes when all breaking changes across the release are intentional, documented, and accumulated within a single release boundary.

---

## Consequences

- `backgroundColor`, `textColor`, and `strokes` will carry `{ colorSpace, components, alpha?, hex? }` for all inline resolved colors instead of a bare hex string.
- Wide-gamut fills (Display P3, OKLCH, etc.) extracted from Figma are representable in the Anova output without lossy sRGB hex downsampling.
- Consumers that previously matched on `typeof value === 'string'` to detect a color must migrate to checking for the `colorSpace` key on an object.
- The `hex` field on `ColorValue` provides a backwards-compatible sRGB fallback path for consumers that cannot yet handle wide-gamut color spaces.
- The `$`-prefix namespace remains exclusive to reference and metadata objects (`TokenReference`, `PropBinding`, `$extensions`).
- `GradientStop.color` and `Shadow.color` retain their existing `string` arms — those are separate gaps not closed by this ADR.
