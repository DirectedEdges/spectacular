# ADR: Unified Token Reference Type — Replace `VariableStyle` and `FigmaStyle` with `TokenReference`

**Branch**: `v0.11.0/006-token-references`
**Created**: 2026-02-28
**Status**: ACCEPTED
**Summary**: A single `TokenReference` type replaces `VariableStyle` and `FigmaStyle` for variables, named styles and composite references.
**Decides**: styles.effects, styles.typography
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`@directededges/anova` currently represents references to Figma variables and Figma named styles as two separate types within the `Style` union:

- `VariableStyle` — a Figma variable reference carrying `id`, `rawValue`, `name`, `variableName`, `collectionName`, `collectionId`
- `FigmaStyle` — a Figma named style reference carrying `id` and `name`

Current `Style` shape:

```yaml
# types/Styles.ts
Style: string | boolean | number | null | VariableStyle | FigmaStyle | ReferenceValue

VariableStyle:
  id: string                  # Figma variable UUID
  rawValue?: string | number | boolean
  name?: string
  variableName?: string       # e.g. "DS Color/Text/Primary"
  collectionName?: string     # e.g. "DS Color"
  collectionId?: string

FigmaStyle:
  id: string                  # Figma style UUID
  name?: string               # e.g. "Body/Medium"
```

> **`ReferenceValue` is not a token reference.** `ReferenceValue` — `{ "$ref": "#/props/{PropName}" }` — is a *prop binding*: it signals that a style property's value is driven by a component prop at runtime (e.g., `visible` driven by an `isVisible` prop). It is orthogonal to design token references and remains unchanged in the `Style` union.

Serialized output for a style property carrying a reference currently appears as either an object or a plain string, with no discriminator marking it as a reference vs a literal:

```
backgroundColor: { id: "VAR:123", variableName: "DS Color/Text/Primary" }
textStyleId: { id: "STY:456", name: "Body/Medium" }
```

## Problems

### Implicit reference kind

a property value may be a `VariableStyle`, a `FigmaStyle`, or a plain string literal. Consumers cannot distinguish a reference from a raw value without inspecting field shape. `FigmaStyle` and `VariableStyle` both look like objects with an `id` string but carry different semantics.

### Figma-biased field names

`variableName`, `collectionName`, `collectionId`, and `id` (a raw Figma UUID) are Figma API concepts with no equivalents in any platform-neutral token format. Output consumers (anova-kit CLI, platform adapters) cannot treat this representation as platform-independent.

### Expanding composite reference surface

`typography`, `effects`, and `gradient` properties now use named-style references (`FigmaStyle`) alongside their inline structured types (`Typography`, `EffectsGroup`, `GradientValue`). A fourth category — composites referenced by name — currently reuses `FigmaStyle`, which lacks a `$type` signal telling consumers what the reference resolves to. Additionally, inline composite values (`GradientStop.color`, `Blur.radius`, all variable-bindable `Typography` sub-fields) use `VariableStyle` at the leaf level — the same Figma-biased shape described in point 2, requiring the same replacement.

The [W3C Design Tokens Community Group format module](https://www.designtokens.org/tr/2025.10/format/) (Candidate Recommendation, published 28 October 2025, considered stable and intended for implementation) identifies tokens by path, not by source-tool ID, and reserves `$`-prefixed keys for standard semantics. Figma-specific metadata belongs in a `$extensions` block per that convention, with keys in reverse domain name notation (§5.2.3). Anova output should be structurally compatible with that direction rather than mirroring Figma internals.

### Compact output and human readability

A full `TokenReference` object (`{ $token: "DS Color.Text.Primary", $type: "color" }`) is more verbose than the current flat string representation. This is an intentional trade-off: the structured object makes the token type explicit and is machine-parseable without heuristics. A "simplified" profile — where the transformer emits just the `$token` string instead of the full object — is a valid serialization option for human-readable audit output. That serialization choice belongs in `anova-transformer`'s output configuration, not in the type contract. `TokenReference` defines the canonical typed shape; simplified string output is a projection of it.

---

## Decision Drivers

- **Type–schema sync**: Every type change must have a corresponding schema change. No drift between `types/` and `schema/` is permitted (Constitution I).
- **No runtime logic**: This package declares shapes only. No processing or conditional logic may be added (Constitution II).
- **Stable public API — MAJOR for breaking changes**: Removing or restructuring `VariableStyle` and `FigmaStyle` breaks consumers that type-check against them. A MAJOR version bump is required (Constitution III).
- **Platform-independent output**: Reference representation must not require consumers to understand Figma variable collections or style IDs to extract a token path.
- **Explicit type discrimination**: The resolved token type (`color`, `typography`, `shadow`, `effects`, etc.) must be statically identifiable without field-shape inspection, using DTCG `$type` semantics.
- **Design tokens format alignment**: Reference paths and metadata placement should follow the DTCG convention — `$`-prefixed keys for standard fields, `$extensions` for tool-specific data.
- **Minimal new surface**: New types must represent a genuine shared concept. `TokenReference` replaces two types with one; no net surface expansion.

---

## Options Considered

### Option A: Retain `VariableStyle` and `FigmaStyle` as-is *(Rejected)*

Keep both types unchanged. Accept the current dual-type representation for the foreseeable future.

**Rejected because**:
- `VariableStyle` and `FigmaStyle` have structurally identical shapes (`{ id: string, name?: string }`) with no discriminator — consumers must distinguish them by which property they appear on, which is fragile
- `variableName`, `collectionName`, `collectionId` are Figma-internal metadata with no platform-neutral equivalent; they cannot be mapped to token paths without Figma-specific parsing logic
- Composite named references (`effects`, `typography`) are currently typed as `FigmaStyle` even though they resolve to structured shapes — the absence of a `$type` signal creates ambiguity that will only compound as more composite types are added
- The platform-independence driver is structurally unsatisfiable without replacing the Figma-centric field set

---

### Option B: `TokenReference` — unified discriminated reference with DTCG-aligned extensions *(Selected)*

Introduce a single `TokenReference` interface with a `$type` discriminator using DTCG token type values, a `$token` path field, and Figma-specific metadata isolated in `$extensions["com.figma"]`. Replace all uses of `VariableStyle` and `FigmaStyle` in `Style`, `ColorStyle`, and composite property types with `TokenReference`. Deprecate and eventually remove `VariableStyle` and `FigmaStyle` from the public API.

```yaml
# Option B — new shape
TokenReference:
  $token: string                  # DTCG dot-path, e.g. "DS Color.Text.Primary"; usable directly as DTCG alias {DS Color.Text.Primary}
  $type: color | dimension | string | number | boolean
       | shadow | gradient | typography
       | effects                   # Anova-extended: named reference to an EffectsGroup (multi-shadow + blur); no DTCG equivalent
  $extensions?:
    "com.figma":                  # reverse domain name per DTCG §5.2.3
      id: string                  # Figma variable or style UUID
      name?: string               # Figma name within collection, e.g. "Text/Primary"
      collectionName?: string     # Figma collection name, e.g. "DS Color" (variables only)
      rawValue?: string | number | boolean  # value resolved by Figma at extraction time; no DTCG equivalent

Style: string | boolean | number | null | TokenReference | ReferenceValue

ColorStyle: HexColor | TokenReference | ReferenceValue | GradientValue | null
# HexColor = string (see Color strong-typing note in Decision section)
```

**Pros**:
- Single reference type — no ambiguity between variable and named-style references
- `$type` uses DTCG token type semantics — values describe what the token resolves to (`color`, `typography`, `shadow`, etc.) rather than how Figma stores it (`variable`, `style`, `composite`); this is platform-neutral by definition
- `$type: "effects"` is the only non-DTCG value; it is explicitly documented as an Anova extension for `EffectsGroup` references (multi-shadow + blur) that have no standard DTCG composite equivalent
- The Figma variable vs. named-style origin is fully captured by `$extensions["com.figma"]` — the presence of `collectionName` distinguishes a variable reference from a named-style reference without a top-level Figma-taxonomy field
- `$token` path is platform-neutral; `variableName`/`collectionName`/`collectionId` are retired
- Figma UUID is namespaced under `$extensions["com.figma"]`, consistent with DTCG §5.2.3 reverse domain name notation for tool-specific metadata
- `$extensions` key is open for other tool namespaces without changing the top-level contract

**Cons / Trade-offs**:
- MAJOR break: `VariableStyle` and `FigmaStyle` are referenced throughout `anova-transformer` and `anova-kit`; both packages must update after this is published
- `$token`, `$type`, and `$extensions` use `$` prefixes — unconventional in TypeScript interfaces but intentional for DTCG alignment
- `"effects"` deviates from DTCG `$type` values; this must be explicitly documented as an extension
- Full object form is more verbose than a plain string; compact output is a transformer concern, not a type contract concern (see Context above)

---

### Option C: Additive `StyleReference` union alias over existing types *(Rejected)*

Add a `kind` field to both `VariableStyle` (`kind: "variable"`) and `FigmaStyle` (`kind: "style"`) and export a union alias `StyleReference = VariableStyle | FigmaStyle`. Update `Style` to include `StyleReference` alongside the existing members.

**Rejected because**:
- Retains all Figma-biased field names (`variableName`, `collectionName`, `collectionId`, Figma `id`)
- Platform-independence driver is not satisfied — consumers must still parse Figma-internal metadata to extract a usable token path
- `StyleReference` is syntactic sugar over an unchanged Figma-specific contract

---

### Option D: String-only token reference `{ $token: string }` without `$type` *(Rejected)*

Use a minimal shape `{ $token: string }` for all references (variables, styles, composites), omitting the `$type` discriminator and `$extensions`.

**Rejected because**:
- Without `$type`, consumers cannot determine what shape a resolved token value takes without out-of-band knowledge (e.g., cannot distinguish a `color` token from a `dimension` token or an `effects` composite)
- The implicit-reference-kind problem (driver 3 in Context) is only partially resolved
- References to `EffectsGroup` and `Typography` composites require explicit `$type` discrimination so consumers know to expect a structured shape, not a scalar

---

## Decision

`TokenReference` replaces both `VariableStyle` and `FigmaStyle` as the single type for any style property value that references a design token — whether that token is a Figma variable, a named style, or a composite reference (effects, typography). The new type carries three fields: 

- `$token` (a DTCG dot-path usable directly as a DTCG alias), 
- `$type` (a DTCG token type discriminator), and 
- an optional `$extensions["com.figma"]` block for Figma-specific metadata such as the source UUID, collection name, and resolved scalar. 

This eliminates the implicit ambiguity between `VariableStyle` and `FigmaStyle` objects, isolates all Figma internals behind a namespaced extension key, and provides an explicit `$type` signal for every reference kind — including composite references (`effects`, `typography`) that previously had no discriminator at all. 

`VariableStyle` and `FigmaStyle` are deprecated in `v0.11.0` and scheduled for removal in the next MAJOR release. This change ships alongside ADR 007 (`007-token-reference-config.md`), which replaces the three-field `variables`/`simplifyVariables`/`simplifyStyles` config surface with a single `format.tokens` enum governing how `TokenReference` objects are serialized in transformer output.

### Deferred decisions to subsequent ADRs

- Color strong-typing alignment with DTCG
- Shadow shape alignment with DTCG
- Custom configuration of Anova output for "compact" vs "detailed" data structures to account for human readability and use cases

### TokenReference Shape

```yaml
# Before
VariableStyle:
  id: string                         # Figma variable UUID
  rawValue?: string | number | boolean
  name?: string
  variableName?: string              # e.g. "DS Color/Text/Primary"
  collectionName?: string            # e.g. "DS Color"
  collectionId?: string

FigmaStyle:
  id: string                         # Figma style UUID
  name?: string                      # e.g. "Body/Medium"

Style:     string | boolean | number | null | VariableStyle | FigmaStyle | ReferenceValue
ColorStyle: string | VariableStyle | FigmaStyle | ReferenceValue | GradientValue | null

# After
TokenReference:
  $token: string                     # DTCG dot-path, e.g. "DS Color.Text.Primary"
  $type: "color" | "dimension" | "string" | "number" | "boolean"
       | "shadow" | "gradient" | "typography"
       | "effects"                   # Anova extension: EffectsGroup reference; no DTCG equivalent
  $extensions?:
    "com.figma":                     # reverse domain name per DTCG §5.2.3
      id: string                     # Figma variable or style UUID
      name?: string                  # Figma name within collection, e.g. "Text/Primary"
      collectionName?: string        # Figma collection, e.g. "DS Color" (variables only)
      rawValue?: string | number | boolean  # scalar resolved by Figma at extraction time

Style:     string | boolean | number | null | TokenReference | ReferenceValue
ColorStyle: string | TokenReference | ReferenceValue | GradientValue | null
# string arm: "#RRGGBB" or "#RRGGBBAA" — pattern-constrained in schema only
```

### What Changes and Where

| Concept | `types/` | `schema/` | Bump |
|---------|----------|-----------|------|
| Add `TokenReference` interface | `Styles.ts` | `styles.schema.json` (new `#/definitions/TokenReference`) | MINOR |
| `Style` union: replace `VariableStyle \| FigmaStyle` with `TokenReference` | `Styles.ts` | `styles.schema.json` (`StyleValue` oneOf) | MAJOR |
| `ColorStyle` union: same replacement | `Styles.ts` | `styles.schema.json` (`ColorStyleValue` oneOf) | MAJOR |
| Deprecate `VariableStyle` and `FigmaStyle` | `Styles.ts` (`@deprecated`) | `styles.schema.json` (`deprecated: true`) | MAJOR |
| `effects` property: `FigmaStyle` → `TokenReference` | `Styles.ts` | `styles.schema.json` (`EffectsStyleValue`) | MAJOR |
| `typography` property: `FigmaStyle` → `TokenReference` | `Styles.ts` | `styles.schema.json` (`TypographyStyleValue`) | MAJOR |
| `Shadow`: rename `x`/`y` → `offsetX`/`offsetY`; add `inset?`; replace `VariableStyle` in all fields | `Effects.ts` | `styles.schema.json` (`Shadow` definition) | MAJOR |
| `EffectsGroup`: merge `dropShadows` + `innerShadows` → `shadows` (discriminated by `inset`) | `Effects.ts` | `styles.schema.json` (`EffectsGroup` definition) | MAJOR |
| `Blur.radius`: `VariableStyle` → `TokenReference` (`$type: "dimension"`) | `Effects.ts` | `styles.schema.json` (`Blur` definition) | MAJOR |
| `GradientStop.color`: `VariableStyle` → `TokenReference` (`$type: "color"`) | `Gradient.ts` | `styles.schema.json` (`GradientStop` definition) | MAJOR |
| `Typography` sub-fields (11 fields): `VariableStyle` → `TokenReference` | `Styles.ts` | `styles.schema.json` (`Typography` definition) | MAJOR |
| `ColorStyleValue` string arm: add hex pattern constraint | *(none — type stays `string`)* | `styles.schema.json` | MINOR |


### Gradient stop, blur, and typography inline sub-fields

Beyond the named-style replacements above, `VariableStyle` also appears inside inline composite values wherever individual sub-fields can be variable-bound in Figma:

```yaml
# Before — VariableStyle in inline sub-fields
GradientStop:
  position: number
  color: string | VariableStyle      # variable-bound stop color

Blur:
  visible: boolean
  radius: number | VariableStyle      # variable-bound blur radius

Typography:
  fontSize: number | VariableStyle
  letterSpacing: number | VariableStyle
  lineHeight: string | number | VariableStyle
  textCase: string | VariableStyle
  textDecoration: string | VariableStyle
  paragraphIndent: number | VariableStyle
  # ... (all variable-bindable sub-fields follow the same pattern)

# After — TokenReference replaces VariableStyle in all inline sub-fields
GradientStop:
  position: number
  color: string | TokenReference      # $type: "color"

Blur:
  visible: boolean
  radius: number | TokenReference     # $type: "dimension"

Typography:
  fontSize: number | TokenReference
  letterSpacing: number | TokenReference
  lineHeight: string | number | TokenReference
  textCase: string | TokenReference
  textDecoration: string | TokenReference
  paragraphIndent: number | TokenReference
  # ... (all variable-bindable sub-fields follow the same pattern)
```

This is distinct from the named-style `FigmaStyle` → `TokenReference` replacements for `effects` and `typography` properties: those operate at the *property* level (the whole value is a reference). These sub-field replacements operate at the *leaf* level — the inline composite is present, but one or more of its constituent values is variable-bound.

**Notes**:
- `GradientStop.color` with `$type: "color"` carries the token path for the color variable; `$extensions["com.figma"].rawValue` holds the resolved hex string captured at Figma extraction time.
- `Blur.radius` with `$type: "dimension"` follows the same pattern as `Shadow` offset/blur/spread fields.
- `Typography` sub-field `VariableStyle` arms are fully replaced. Sub-fields with no `VariableStyle` arm (e.g., `fontFamily`) are unchanged.

### References

- **`$token` and `$type` are the only fields a platform adapter needs.** `$token` is the DTCG alias path; `$type` determines how the resolved value is formatted. `$extensions["com.figma"]` is extraction provenance for tooling and round-tripping — not required for platform code generation.
- **`$token` uses `.` as the segment separator** per DTCG alias syntax ([Format §7.1.1](https://www.designtokens.org/tr/2025.10/format/#curly-brace-syntax-token-references)). The original Figma slash-path is preserved in `$extensions["com.figma"].name`.

  | `$token` | DTCG alias | Figma origin |
  |----------|------------|--------------|
  | `"DS Color.Text.Primary"` | `{DS Color.Text.Primary}` | collection `"DS Color"`, name `"Text/Primary"` |
  | `"Body.Medium"` | `{Body.Medium}` | style name `"Body/Medium"` |
  | `"Elevation.Shadow.Card"` | `{Elevation.Shadow.Card}` | style name `"Elevation/Shadow/Card"` |

- **`"effects"` is the sole non-DTCG `$type` value** — no DTCG composite covers a multi-shadow + blur group. It must be documented as an Anova extension and treated as non-portable.
- **Variable vs. named-style origin** is encoded in `$extensions["com.figma"]`: presence of `collectionName` identifies a variable reference; its absence identifies a named-style reference.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Recompile; update any code reading `VariableStyle`- or `FigmaStyle`-shaped objects, shadow offset fields, `dropShadows`/`innerShadows` keys, gradient stop colors, blur radius, or typography sub-fields | Replace reads of `variableName`, `collectionName`, `id` (style name) with `$token` and `$type` checks; Figma UUID now at `$extensions["com.figma"].id`; variable vs. named-style origin: check presence of `$extensions["com.figma"].collectionName`; shadow offsets: `.x`/`.y` → `.offsetX`/`.offsetY`; shadow role: `dropShadows`/`innerShadows` → `shadows.filter(s => !s.inset)` / `shadows.filter(s => s.inset)`; gradient stop `.color` and blur `.radius` now `string \| TokenReference`; typography sub-fields (`fontSize`, `letterSpacing`, etc.) now `number \| TokenReference` where previously `number \| VariableStyle` |

---

## Semver Decision

**Version bump**: Incorporated into `v0.11.0` (`MAJOR`)

**Justification**: Removing `VariableStyle` and `FigmaStyle` from the `Style` and `ColorStyle` union types, from `effects` and `typography` property types, and renaming `Shadow.x`/`Shadow.y` to `Shadow.offsetX`/`Shadow.offsetY` all break consumers that type-check against those interfaces. Per Constitution III: "Removing or renaming an exported type or a named field within a type is a breaking change and MUST follow semantic versioning." This change is batched into `v0.11.0`, which carries MAJOR character, consistent with the typography composite change (ADR 005) already accepted in this release.

---

## Consequences

- All style property values that reference a design token (variable or named style) carry an explicit `$type` discriminator using DTCG token type semantics, eliminating implicit type ambiguity. The Figma variable vs. named-style origin is encoded solely in `$extensions["com.figma"]`.
- The `$token` path field stores a DTCG dot-path (e.g. `"DS Color.Text.Primary"`) usable directly as a DTCG alias. The original Figma slash-path is recoverable from `$extensions["com.figma"].collectionName` and `name`.
- Figma UUIDs are namespaced under `$extensions["com.figma"].id`, isolating Figma-specific metadata per DTCG §5.2.3 reverse domain name notation, opening the `$extensions` block to other tool namespaces without future breaking changes.
- `ReferenceValue` (`{ "$ref": "#/props/..." }`) remains unchanged — it is a prop binding, not a token reference, and continues to serve its distinct role in the `Style` union.
- Hex color values in `ColorStyle` gain schema-level pattern validation; TypeScript type is unchanged. Full DTCG color object support in `$extensions["com.figma"].rawValue` is deferred.
- `Shadow.x`/`Shadow.y` renamed to `Shadow.offsetX`/`Shadow.offsetY` per DTCG §9.6; `Shadow.inset?: boolean` added. `EffectsGroup.dropShadows` and `EffectsGroup.innerShadows` merged into a single `EffectsGroup.shadows?: Shadow[]` — `inset` on each item discriminates drop vs inner. Consumers reading `dropShadows`/`innerShadows` must update to `shadows.filter(s => !s.inset)` / `shadows.filter(s => s.inset)`.
- `Blur.radius`, `GradientStop.color`, and all variable-bindable `Typography` sub-fields (`fontSize`, `letterSpacing`, `lineHeight`, `textCase`, `textDecoration`, `paragraphIndent`, etc.) replace `VariableStyle` with `TokenReference` (carrying the appropriate `$type` for the resolved value — `"dimension"` for numeric offsets/radii, `"color"` for stop colors, etc.). Inline composite values (the `EffectsGroup`, `GradientValue`, and `Typography` objects themselves) are unchanged; only the leaf arms that previously accepted `VariableStyle` are updated.
- Compact string output for token references (`"DS Color.Text.Primary"` instead of the full object) is a valid projection for human-readable views, but is a transformer serialization concern — it does not change this type contract.
- `VariableStyle` and `FigmaStyle` remain as `@deprecated` exports in `v0.11.0` and are removed in the next MAJOR release.
- Any tool validating output against `schema/styles.schema.json` must update to the `v0.11.0` schema to pass validation after `anova-transformer` adopts the new reference shape.
