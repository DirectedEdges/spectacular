# ADR: Custom Color Format Configuration

**Branch**: `043-custom-color-format-config`
**Created**: 2026-05-01
**Status**: ACCEPTED
**Summary**: A `format.color` option with a `ColorFormat` type emits color as hex, RGB, HSL, OKLCH or object.
**Decides**: styles.backgroundColor, styles.fillColor, styles.strokes, styles.textColor
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

ADR-009 replaced bare hex strings with the structured `ColorObject` object across all color-bearing properties (`backgroundColor`, `fillColor`, `textColor`, `strokes`, gradient stops, shadows). `ColorObject` carries `colorSpace`, `components`, `alpha`, and an optional `hex` fallback — a rich, DTCG-aligned representation.

However, many consumers prefer a **flat string** representation of color values rather than the full object. Common use cases include:

- Code generation pipelines that need `#FF6600` or `hsla(24, 100%, 50%, 1)` directly
- Documentation tools that display human-readable color values
- Integration with tools that expect a specific color notation

The previous version of Specs (v1) supported a format toggle between hex and HSLA. Specs v2 has not yet shipped a release with the `ColorObject` object — users have received hex strings by default to date. Changing the default away from hex would disrupt existing workflows for no user-requested reason.

This ADR addresses two sub-decisions:

1. **Where does the setting live?** — placement within `Config`
2. **Which color formats are supported?** — the enum values and default

---

## Decision Drivers

- **Additive change**: Must be a new optional field to avoid a MAJOR bump
- **Type ↔ schema symmetry**: The new field must appear in both `Config` / `ResolvedConfig` types and `component.schema.json`
- **No runtime logic**: The type/schema package defines the enum values only. Formatting logic belongs in `specs-from-figma`
- **Enum casing convention**: String literal unions in config use `SCREAMING_CASE` per the constitution
- **Figma parity**: The enum values should cover all formats available in Figma's colour picker UI
- **Least surprise default**: The default should match what users have historically received (hex strings), not introduce a new output shape
- **Extensibility**: The enum should accommodate future colour formats as MINOR additions

---

## Options Considered

### Option A: Add `format.color` under existing `format` section *(Selected)*

Add an optional `color` field to `Config.format` alongside the existing `output`, `keys`, `layout`, and `tokens` fields.

**Pros**:
- All output-shaping options are co-located under `format`
- Follows the established pattern: string enum, optional with default, `SCREAMING_CASE` values
- Consistent with how `format.tokens` controls token serialization shape

**Cons / Trade-offs**:
- When a non-`OBJECT` format is selected, the output type for colour positions changes from `ColorObject` to `string` — consumers must check `Config.format.color` to know the runtime shape

---

### Option B: Add a top-level `colorFormat` field outside `format` *(Rejected)*

Place the field at `Config.colorFormat` rather than `Config.format.color`.

**Rejected because**: All other output-shaping format options live under `Config.format`. Placing this outside breaks the organisational convention and makes the config harder to reason about.

---

### Option C: Boolean `flattenColors` toggle with a separate `colorNotation` field *(Rejected)*

A boolean to opt into string output plus a separate notation selector.

**Rejected because**: Requires two fields where one suffices. The `OBJECT` enum value already serves as the "don't flatten" mode, making a boolean redundant.

---

## Supported Formats

The enum values fall into three tiers based on origin and priority:

### Tier 1 — Figma UI formats

These match the colour format options in Figma's colour picker, ensuring parity with the design tool:

| Value | Output example | Notes |
|-------|---------------|-------|
| `HEX` | `#FF6600` | 6-digit sRGB, no alpha. **Default** — matches v1 behaviour and maximises human readability |
| `HEXA` | `#FF6600FF` | 8-digit sRGB with alpha channel |
| `RGB` | `rgb(255, 102, 0)` | CSS `rgb()` functional notation (0–255 integer components) |
| `RGBA` | `rgba(255, 102, 0, 1)` | CSS `rgba()` functional notation with alpha. This is what Figma labels "CSS" in its UI — despite the name, it uses legacy CSS Color Level 3 `rgba()` syntax, not the Level 4 `color()` function |
| `HSLA` | `hsla(24, 100%, 50%, 1)` | CSS `hsla()` functional notation |
| `HSB` | `hsb(24, 100%, 100%)` | Figma's native colour model (also known as HSV). Not a CSS function — consumers targeting CSS should use `HSLA` instead |

### Tier 2 — Modern CSS (CSS Color Level 4)

These provide perceptually uniform colour representations gaining adoption in modern CSS tooling:

| Value | Output example | Notes |
|-------|---------------|-------|
| `OKLCH` | `oklch(0.7 0.15 50 / 1)` | Perceptually uniform cylindrical model. Increasingly popular for design systems because lightness, chroma, and hue are independently adjustable without shifting perceived colour |
| `OKLAB` | `oklab(0.7 0.1 0.1 / 1)` | Perceptually uniform rectangular model. Sibling to OKLCH; better for programmatic colour manipulation (interpolation, mixing) |

### Tier 3 — Structured object

| Value | Output example | Notes |
|-------|---------------|-------|
| `OBJECT` | `{ colorSpace: "srgb", components: [1, 0.4, 0], alpha: 1, hex: "#FF6600" }` | Full `ColorObject` object per DTCG Color §4.1. Preserves colour space, component values, and alpha with no lossy conversion. Opt-in for consumers that need structured data |

### Formats deferred

- **CSS `color()` function** — `color(display-p3 0.5 0.2 0.8)` would be the only string format that preserves the exact `colorSpace` from the `ColorObject` object, covering wide-gamut spaces like Display P3 and Rec. 2020. Deferred because OKLCH/OKLAB already address the "modern CSS" need, and `OBJECT` preserves full colour-space fidelity for consumers that require it. Can be added as a MINOR enum extension if wide-gamut string output demand arises.

### Default rationale

`HEX` is the default because:

- **Historical continuity**: Specs v1 output hex by default; v2 has not yet shipped a release with `ColorObject` objects. Hex is what users expect.
- **Human readability**: `#FF6600` is universally recognised and compact. It appears in every design tool, every browser DevTools pane, and most design system documentation.
- **Lowest friction**: New users can start without configuring colour format and get usable output immediately.
- **`OBJECT` is opt-in**: Consumers that need structured colour data (colour-space-aware pipelines, DTCG tooling) can explicitly set `format.color: 'OBJECT'`. This is a power-user feature, not a default.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Config.ts` | Add `ColorFormat` named type | MINOR |
| `Config.ts` | Add optional `color?: ColorFormat` field to `Config.format` | MINOR |
| `Config.ts` | Add required `color: ColorFormat` field to `ResolvedConfig.format` | MINOR |
| `Config.ts` | Add `color: 'HEX'` to `DEFAULT_CONFIG.format` | MINOR |
| `index.ts` | Export `ColorFormat` type | MINOR |
| `Styles.ts` | Widen `ColorStyle` to include `string` arm | MINOR |
| `Effects.ts` | Widen `Shadow.color` to include `string` arm | MINOR |
| `Gradient.ts` | Widen `GradientStop.color` to include `string` arm | MINOR |

**New type** (`types/Config.ts`):
```yaml
# New named type
ColorFormat: "'HEX' | 'HEXA' | 'RGB' | 'RGBA' | 'HSLA' | 'HSB' | 'OKLCH' | 'OKLAB' | 'OBJECT'"

# Config.format — before
format:
  output?: 'JSON' | 'YAML'
  keys?: 'SAFE' | 'CAMEL' | 'SNAKE' | 'KEBAB' | 'PASCAL' | 'TRAIN'
  layout?: 'LAYOUT' | 'PARENT_CHILDREN' | 'BOTH'
  tokens?: 'TOKEN' | 'TOKEN_NAME' | 'TOKEN_FIGMA_EXTENSIONS' | 'FIGMA_NAME' | 'CUSTOM'

# Config.format — after
format:
  output?: 'JSON' | 'YAML'
  keys?: 'SAFE' | 'CAMEL' | 'SNAKE' | 'KEBAB' | 'PASCAL' | 'TRAIN'
  layout?: 'LAYOUT' | 'PARENT_CHILDREN' | 'BOTH'
  tokens?: 'TOKEN' | 'TOKEN_NAME' | 'TOKEN_FIGMA_EXTENSIONS' | 'FIGMA_NAME' | 'CUSTOM'
  color?: ColorFormat    # optional — MINOR

# ResolvedConfig.format — after (required, with default)
format:
  output: 'JSON' | 'YAML'
  keys: 'SAFE' | 'CAMEL' | 'SNAKE' | 'KEBAB' | 'PASCAL' | 'TRAIN'
  layout: 'LAYOUT' | 'PARENT_CHILDREN' | 'BOTH'
  tokens: 'TOKEN' | 'TOKEN_NAME' | 'TOKEN_FIGMA_EXTENSIONS' | 'FIGMA_NAME' | 'CUSTOM'
  color: ColorFormat     # required in resolved config

# DEFAULT_CONFIG.format — after
format:
  output: 'JSON'
  keys: 'SAFE'
  layout: 'LAYOUT'
  tokens: 'TOKEN'
  color: 'HEX'          # matches historical v1 behaviour
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `color` property to `Config.format` | MINOR |
| `styles.schema.json` | Add `string` arm to `ColorStyleValue`, `Shadow.color`, and `GradientStop.color` | MINOR |

**New property** (`schema/component.schema.json` — under `#/definitions/Config/properties/format/properties`):
```yaml
color:
  type: string
  enum:
    - HEX
    - HEXA
    - RGB
    - RGBA
    - HSLA
    - HSB
    - OKLCH
    - OKLAB
    - OBJECT
  default: HEX
  description: >-
    Color value output format. HEX (default) emits a 6-digit hex string.
    OBJECT emits the full ColorObject object (colorSpace, components, alpha, hex).
    All other values emit a formatted color string in the named notation.
```

### Notes

- The `ColorFormat` named type follows the pattern established by other config enums. While most config values are inline literal unions, a named export is justified here because downstream consumers need to reference this type when implementing format-specific logic.
- When `format.color` is not `OBJECT`, every property currently typed as `ColorObject` in the output will instead contain a `string`. This affects `backgroundColor`, `fillColor`, `textColor`, `strokes`, gradient stop `color`, and shadow `color`. To ensure the schema validates both object and string colour values, `string` is added as an arm to `ColorStyle`, `Shadow.color`, `GradientStop.color`, and their schema counterparts (`ColorStyleValue`, `Shadow/properties/color`, `GradientStop/properties/color`).
- The Figma UI labels its `rgba()` output as "CSS". This ADR uses `RGBA` instead because: (a) `rgba()` is legacy CSS Color Level 3 syntax — calling it "CSS" is misleading now that CSS Color Level 4 exists; (b) `RGBA` precisely describes the output function.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — one new optional property `color` is added to `Config.format` in both TypeScript types and JSON schema.
- **Parity check**: `Config.format.color` (type) ↔ `#/definitions/Config/properties/format/properties/color` (schema). Same enum values, same default, same optionality.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Low — colour formatting targets the tail end of the processing pipeline where data is emitted, not the core transformation logic | Add a colour formatting step at output emission that reads `resolvedConfig.format.color` and converts `ColorObject` objects to the requested string notation (or passes through for `OBJECT`) |
| `specs-cli` | Config surface expands; initialization must include the new field; documentation must describe the new option | Update config initialization to include `format.color`; add to CLI config handling and help output; update documentation to describe available colour formats and their output |
| `specs-plugin` | Config UI expands; must also handle `OBJECT` format display in the plugin output viewer | Widen config shape to include `format.color`; add UI control adjacent to existing format options (output, keys, layout, tokens); handle rendering of `OBJECT` format in plugin output display |

---

## Semver Decision

**Version bump**: Included in `0.20.0` (no additional bump)

**Justification**: All changes are additive optional fields on existing types. No existing field is removed, renamed, or has its type signature altered. This qualifies as MINOR per constitution §Versioning, and `0.20.0` has not yet been published — this change ships as part of the current release.

---

## Consequences

- Consumers can configure `format.color` to receive colour values in their preferred notation, matching their downstream toolchain's expectations
- `HEX` default preserves historical Specs v1 behaviour — existing users see no change in output
- Consumers that need structured DTCG-aligned colour data explicitly opt in via `OBJECT`
- `specs-from-figma` gains responsibility for colour space conversion logic (e.g., sRGB → HSL, sRGB → OKLCH) when non-`OBJECT` formats are selected
- All Figma-native colour formats are supported, plus modern CSS perceptually uniform models (OKLCH, OKLAB)
- Future colour formats (e.g., CSS `color()` function for wide-gamut output) can be added to the enum as a MINOR change
