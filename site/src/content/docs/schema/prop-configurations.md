---
title: "PropConfigurations"
description: "Prop value maps for variant activation and invalid combinations"
---

A flat map of prop names to the values they must hold for a condition to apply, or to the references and bindings that resolve their values at the call site.

```ts
type PropConfigurations = Record<
  string,
  string | number | boolean | null | PropBinding | CompositionRef | ImageBinding | ObjectPropValue
>;
```

| Arm | Where it applies | Description |
|-----|------------------|-------------|
| `string \| number \| boolean` | Anywhere `PropConfigurations` is used | Static scalar prop value |
| `null` | Anywhere `PropConfigurations` is used, under a nullable prop | The prop is unset in this configuration (since 0.31.0) |
| `PropBinding` (`{ $binding }`) | `Element.propConfigurations` only | Pass-through binding to a parent prop |
| `CompositionRef` (`{ $composition }`) | `Element.propConfigurations` only, under a slot-prop key | JSON Pointer to a named `Composition` (in `Component.slotContent` or in an external composition file) used to fill a nested instance's slot |
| `ImageBinding` (`{ $binding, examples? }`) | `Element.propConfigurations` only, under an image-prop key | Forwards a parent image prop into a nested image instance's source prop, carrying authoring-default example images (since 0.28.0) |
| `ObjectPropValue` (member-keyed object) | Anywhere `PropConfigurations` is used, under an object-prop key | Member names to scalar values, or `null` to unset a member; layering is evaluated per member (since 0.39.0, ADR-111) |

`InstanceExample.propConfigurations` accepts scalars, `null`, slot-content references, and `ObjectPropValue` — `PropBinding` is not permitted there.

An `ObjectPropValue` sets the members of an [`ObjectProp`](/schema/props/#objectprop). Member names must not begin with `$`, which is what keeps the form distinguishable from `PropBinding` and the other `$`-keyed references:

```yaml
# A variant configuring two members; an omitted member keeps its resolved value
margin:
  compact: none
  expanded: large
```

## Unset props

`null` means the prop is **unset** in this configuration. It is a value, not an absence, and the distinction matters because configurations layer:

- an **absent** key keeps whatever value the preceding configurations resolved to
- a **`null`** key replaces that resolved value with "no value"

A nullable prop is therefore fully described by its own key. Nothing beside it — a paired visibility flag, a producer extension — needs to be read to know whether the prop is set:

```yaml
# The header slot is filled
header:
  $slotContent: "#/components/card/slotContentExamples/cardHeader"

# The header slot is unset — this component shows no header
header: null
```

## Usage

PropConfigurations appear in four places:

- **Variant `configuration`** — declares which prop combination activates a [variant](/schema/variants.md/#variant). When all listed props match their specified values, the variant's overrides are applied.
- **`invalidPropCombinations`** — an array on the [Component](/schema/component/) root (carried by the api concern) that declares prop combinations which should never occur together.
- **`Element.propConfigurations`** — sets prop values on a nested instance element; accepts the full union (scalars, `PropBinding`, `CompositionRef`).
- **`InstanceExample.propConfigurations`** — documents a complete configuration; scalars, `null`, and slot-content references.

## Example

```yaml
size: large
disabled: true
```

This configuration matches when the `size` prop equals `"large"` **and** the `disabled` prop is `true`.
