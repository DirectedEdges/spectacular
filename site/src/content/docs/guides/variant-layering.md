---
title: "Variant Layering"
description: "How component properties accumulate across variant configurations"
---

## Overview

Variant layering is the schema model that describes how component properties accumulate across multiple variant configurations. This model enables a succinct, lossless representation of component variants by eliminating redundant data while preserving the complete specification of every valid variant combination.

The model is a sparse differential patch: only the differences are stored. The default variant carries the complete baseline, each entry in `variants` carries only the properties that change at its configuration, and the resolved state is the baseline with every matching variant's deltas applied in declaration order. The same configuration always resolves to the same values.

This model is active when `spec.details` is set to `'LAYERED'` (the default). When set to `'FULL'`, every variant contains its complete resolved state with no layering.

---

## Core Concept

A component's specification consists of:

1. A **default variant** — the complete baseline state with all elements and their properties fully specified
2. **Non-default variants** — incremental changes that apply when specific prop configurations are active

To determine the complete specification for any variant configuration:

1. Start with the default variant's data
2. Layer in the data from every variant whose configuration is a subset of the target configuration
3. Properties from later layers override properties from earlier layers

This produces a deterministic, complete specification for every valid prop combination without duplicating unchanged data across variants.

---

## How Variant Layering Works

### Matching Algorithm

A non-default variant **matches** a target configuration if:
- Every prop in the variant's configuration is present in the target configuration
- The values match exactly

For a target configuration with multiple props, multiple variants may match. All matching variants contribute their data in declaration order, and `variants` lists variants with fewer props before variants with more. Nothing is scored or weighed — position in the array is the whole of the order.

### Example: Alert Component

#### Component Props

```yaml
props:
  size:
    type: string
    default: large
    enum: [small, medium, large]
  appearance:
    type: string
    default: critical
    enum: [critical, warning, success, info]
```

#### Variant Specifications

**Default variant** (complete baseline):
```yaml
default:
  elements:
    root:
      styles:
        fills: DS Color/Alert/Basic/Background filled
        cornerRadius: DS Shape/Border radius/Pill
        itemSpacing: DS Space/Item spacing/0_5x
        paddingLeft: DS Space/Padding/0_5x
        paddingRight: DS Space/Padding/0_5x
        paddingTop: DS Space/Padding/0_25x
        paddingBottom: DS Space/Padding/0_25x
    label:
      styles:
        fills: DS Color/Text/Primary
        textStyleId: Body/Large
```

**Variant: `size: small`** (incremental changes):
```yaml
variants:
  - configuration:
      size: small
    elements:
      root:
        styles:
          itemSpacing: DS Space/Item spacing/0_25x
          paddingLeft: DS Space/Padding/0_25x
          paddingRight: DS Space/Padding/0_25x
          paddingTop: DS Space/Padding/0_125x
          paddingBottom: DS Space/Padding/0_125x
      label:
        styles:
          textStyleId: Body/Small
```

**Variant: `appearance: success`** (incremental changes):
```yaml
variants:
  - configuration:
      appearance: success
    elements:
      root:
        styles:
          fills: DS Color/Alert/Success/Element
      label:
        styles:
          fills: DS Color/Text/Primary Inverse
```

### Resolution Example

To resolve the specification for `size: small, appearance: success`:

1. **Start with default**:
   - `root.fills`: `DS Color/Alert/Basic/Background filled`
   - `root.cornerRadius`: `DS Shape/Border radius/Pill`
   - `root.itemSpacing`: `DS Space/Item spacing/0_5x`
   - `root.paddingLeft`: `DS Space/Padding/0_5x`
   - `root.paddingRight`: `DS Space/Padding/0_5x`
   - `root.paddingTop`: `DS Space/Padding/0_25x`
   - `root.paddingBottom`: `DS Space/Padding/0_25x`
   - `label.fills`: `DS Color/Text/Primary`
   - `label.textStyleId`: `Body/Large`

2. **Layer in `size: small`** (1 prop matches):
   - `root.itemSpacing`: `DS Space/Item spacing/0_25x` *(override)*
   - `root.paddingLeft`: `DS Space/Padding/0_25x` *(override)*
   - `root.paddingRight`: `DS Space/Padding/0_25x` *(override)*
   - `root.paddingTop`: `DS Space/Padding/0_125x` *(override)*
   - `root.paddingBottom`: `DS Space/Padding/0_125x` *(override)*
   - `label.textStyleId`: `Body/Small` *(override)*

3. **Layer in `appearance: success`** (1 prop matches):
   - `root.fills`: `DS Color/Alert/Success/Element` *(override)*
   - `label.fills`: `DS Color/Text/Primary Inverse` *(override)*

**Final resolved state**:
```yaml
elements:
  root:
    styles:
      fills: DS Color/Alert/Success/Element
      cornerRadius: DS Shape/Border radius/Pill
      itemSpacing: DS Space/Item spacing/0_25x
      paddingLeft: DS Space/Padding/0_25x
      paddingRight: DS Space/Padding/0_25x
      paddingTop: DS Space/Padding/0_125x
      paddingBottom: DS Space/Padding/0_125x
  label:
    styles:
      fills: DS Color/Text/Primary Inverse
      textStyleId: Body/Small
```

### Multi-Property Variants

Variants can specify multiple props in their configuration. These variants only match when **all** of their configured props are present in the target configuration.

Example variant:
```yaml
variants:
  - configuration:
      size: small
      appearance: success
    elements:
      root:
        styles:
          borderWidth: 2px
```

This variant would **only** match configurations where both `size: small` AND `appearance: success` are active. It would not match `size: small` alone or `appearance: success` alone.

Layering order for `size: small, appearance: success`:
1. Default (0 props)
2. `size: small` (1 prop)
3. `appearance: success` (1 prop)
4. `size: small, appearance: success` (2 props)

---

## Complex Property Layering

Certain style properties support multiple value types to accommodate different design scenarios. When layering variants, these properties follow property-level replacement semantics: a later variant's value completely replaces the earlier value, regardless of the value's internal structure.

### Padding: Scalar vs. Per-Side Values

The `padding` property can be a scalar (when all sides are equal) or a `Sides` object (when sides differ).

**Default variant** — uniform padding:
```yaml
default:
  elements:
    root:
      styles:
        padding: 16  # scalar — all sides are 16px
```

**Variant: `size: compact`** — per-side padding:
```yaml
variants:
  - configuration:
      size: compact
    elements:
      root:
        styles:
          padding:
            top: 8
            end: 12
            bottom: 8
            start: 12
```

**Resolution for `size: compact`**:

The variant's `padding` value completely replaces the default's scalar value. There is no merge between scalar and object forms — the entire property is replaced.

```yaml
# Resolved padding for size: compact
padding:
  top: 8
  end: 12
  bottom: 8
  start: 12
```

**Layering rule**: Padding replacement is **property-level**, not field-level. When a variant specifies `padding`, the entire prior value is discarded and replaced with the new value.

### Color: Primitives, Gradients, and Token References

The `backgroundColor`, `fillColor`, `textColor`, and `strokes` properties can be:
- A hex string (e.g., `"#FF5733"`)
- A `TokenReference` object (token path, type, optional Figma extensions)
- A `GradientValue` object (linear, radial, or angular gradient)
- `null` (no fill/stroke)

**Default variant** — token reference:
```yaml
default:
  elements:
    root:
      styles:
        backgroundColor:
          $token: DS Color.Background.Primary
          $type: color
```

**Variant: `appearance: warning`** — hex color override:
```yaml
variants:
  - configuration:
      appearance: warning
    elements:
      root:
        styles:
          backgroundColor: "#FFA500"
```

**Resolution for `appearance: warning`**:

The hex string replaces the token reference entirely. The consumer receives a literal color, not a token path.

**Layering rule**: Color replacement is **property-level**. The value type (hex vs. token vs. gradient) is irrelevant to the merge algorithm — the entire property is replaced by the later variant's value.

### Typography: Text Style vs. Individual Properties

The `typography` property can be:
- A `TokenReference` object (referencing a Figma text style)
- A `Typography` object (inline properties like fontSize, fontFamily, lineHeight)

**Default variant** — text style token:
```yaml
default:
  elements:
    label:
      styles:
        typography:
          $token: DS Text Style.Body.Large
          $type: typography
```

**Variant: `size: small`** — inline typography override:
```yaml
variants:
  - configuration:
      size: small
    elements:
      label:
        styles:
          typography:
            fontSize: 14
            lineHeight: "20px"
```

**Resolution for `size: small`**:

The inline `Typography` object replaces the text style token reference. The consumer must resolve the inline properties, not the token.

**Note**: Variant layering is **replacement-based**, not field-merging. When a variant specifies `typography`, the entire prior `typography` value — token reference or inline object — is replaced, and no property survives from the value beneath it. No runtime style resolution is performed.

**Layering rule**: Typography replacement is **property-level**. Token references and inline objects do not merge — the later variant's value completely replaces the earlier value.

### Effects: Style Reference vs. Inline Shadow/Blur

The `effects` property can be:
- A `TokenReference` object (referencing a Figma effect style)
- An `Effects` object (inline shadows and blur definitions)

**Default variant** — effect style token:
```yaml
default:
  elements:
    root:
      styles:
        effects:
          $token: DS Effect.Elevation.Medium
          $type: effects
```

**Variant: `state: active`** — inline effects override:
```yaml
variants:
  - configuration:
      state: active
    elements:
      root:
        styles:
          effects:
            shadows:
              - visible: true
                inset: false
                offsetX: 0
                offsetY: 4
                blur: 8
                spread: 0
                color: "#00000040"
```

**Resolution for `state: active`**:

The inline `Effects` object replaces the effect style token reference entirely.

**Layering rule**: Effects replacement is **property-level**. Token references and inline objects do not merge. If a variant needs to "add" a shadow to an existing token's shadows, it must include the complete desired effects state. The transformer does not perform token resolution — the variant spec must contain the complete desired state.

**Key insight for complex properties**: All complex properties (padding, color, typography, effects) follow the same layering rule: **property-level replacement**. The internal structure (scalar vs. object, token vs. inline, gradient vs. hex) does not affect merge semantics. Later variants completely replace earlier values for the same property key.

---

## Interpreting the Output

### Reading Default Variant

The `default` variant always contains complete data. Every element present in the component is listed with all applicable properties.

```yaml
default:
  elements:
    root:
      styles:
        { all properties }
    label:
      styles:
        { all properties }
```

**Interpretation**: This is the component's appearance when all props are set to their default values.

### Reading Non-Default Variants

When `spec.details` is `'LAYERED'` (the default), non-default variants list only changed properties:

```yaml
variants:
  - configuration:
      disabled: true
    elements:
      root:
        styles:
          opacity: 0.36
```

**Interpretation**: When `disabled: true`, the `root` element's `opacity` changes to `0.36`. All other properties remain unchanged from the accumulated baseline (default + any other matching variants).

### Absent Elements

If an element is present in the default but absent from a variant's `elements` object, that element is **unchanged** in that variant. Element absence is not the same as element removal.

Element removal must be explicitly marked (typically via `visible: false` or prop bindings).

### Empty Variants

Some variant configurations produce no element changes at all. By default these are excluded from output. Set `spec.emptyVariants: true` to include them — useful for verifying that a configuration was processed even when it produces no visual difference.

---

## Benefits of the Model

### Succinctness

A Figma component with 3 boolean props theoretically requires 8 variants (2^3). With full duplication, a component with 15 elements and 40 properties per element would yield 4,800 property entries in the output.

With layering, only the ~3-5 properties that actually change per configuration are recorded. This reduces output size by >95% without information loss.

### Determinism

The same component input always produces the same layered output. Variant order and property merge order are fully specified and reproducible.

### Completeness

Every valid prop combination can be resolved to a complete specification by applying the layering algorithm. No information is lost or approximated.

### Human-Readability

Designers and developers can scan variant specifications to understand "what changes when this prop is active" without parsing through hundreds of repeated properties.

The default variant answers: "What does the base component look like?"
Each non-default variant answers: "What changes when this configuration is active?"

### Versioning and Diffing

When a component changes, diffing becomes semantic:
- New properties in a variant = new styling rule added
- Removed properties in a variant = styling override removed (reverts to baseline)
- Changed property values = styling adjustment

With full duplication, every change to the default would show as a change in every variant, obscuring the actual design intent.

---

## Related Schema Properties

### `Variant.configuration`

A `PropConfigurations` object (`Record<string, string | number | boolean>`) listing the prop values this variant requires. Used for matching during layer resolution.

```yaml
configuration:
  size: small
  appearance: success
```

**Empty configuration**: The default variant has no configuration constraints.

### `Variant.invalid`

Boolean flag indicating this prop combination cannot be instantiated (e.g., `disabled: true, hover: true`). Invalid variants are excluded from layer resolution. Controlled by `spec.invalidVariants` (default: `false`).

### `Component.invalidPropCombinations`

When `spec.invalidCombinations` is `true` (the default), the component output includes an `invalidPropCombinations` array listing prop combinations that have no corresponding valid variant.

```yaml
invalidPropCombinations:
  - disabled: true
    state: hover
  - disabled: true
    state: active
```

**Use case**: Documenting constraints for code generation or validation.

### `Settings.spec.details`

Controls whether variant output uses layering:

| Value | Behavior |
|-------|----------|
| `'LAYERED'` | Non-default variants contain only properties that differ from their baseline (default) |
| `'FULL'` | Every variant contains its complete resolved state |

**Default**: `'LAYERED'`

### `Settings.spec.variantDepth`

Controls how many prop dimensions are expanded. See the [Variant Depth](/guides/variant-depth/) guide.

---

## See Also

- [Variant Depth](/guides/variant-depth/) — controlling variant expansion depth
- [Variants](/schema/variants/) — schema definition
- [Settings](/schema/settings/) — full run settings
- [component.schema.json](https://github.com/DirectedEdges/specs/blob/main/packages/schema/schema/component.schema.json) — JSON Schema validation rules
