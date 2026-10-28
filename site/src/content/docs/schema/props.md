---
title: "Props"
description: "Prop kinds, defaults, and extensions"
---

Props define the configurable inputs of a component. Each prop has a type, a default value, and optional extensions.

```ts
type Props = Record<string, AnyProp>;
type AnyProp = BooleanProp | StringProp | EnumProp | NumberProp | SlotProp | ImageProp | ObjectProp;
```

## Prop Kinds

### BooleanProp

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `'boolean'` | Yes | |
| `default` | `boolean` | Yes | Default value |
| `$extensions` | `PropExtensions` | No | Vendor extensions |

### EnumProp

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `'string'` | Yes | |
| `default` | `string` | Yes | Default value (must be in `enum`) |
| `enum` | `string[]` | Yes | Allowed values |
| `nullable` | `boolean` | No | Whether `null` is a valid value — absent means `false` |
| `$extensions` | `PropExtensions` | No | Vendor extensions |

### StringProp

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `'string'` | Yes | |
| `default` | `string \| null` | No | Deprecated — use `examples` |
| `nullable` | `boolean` | No | Whether `null` is a valid value — absent means `true` |
| `examples` | `string[]` | No | Example values |
| `$extensions` | `PropExtensions` | No | Vendor extensions |

A `StringProp` is distinguished from an `EnumProp` by the absence of `enum`.

### NumberProp

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `'number'` | Yes | |
| `default` | `number` | No | Default value |
| `enum` | `number[]` | No | Closed set of allowed values, recorded when the prop was inferred from a VARIANT prop's finite value set (ADR-072) |
| `nullable` | `boolean` | No | Whether `null` is a valid value — absent means `true` (since 0.29.0) |
| `examples` | `number[]` | No | Example values |

Inferred from Figma variant values when [`conventions.platforms.figma.inferNumberProps`](/schema/conventions/#platform-members) is enabled; a prop inferred from a VARIANT source carries the variant's values as `enum`.

### SlotProp

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `'slot'` | Yes | |
| `default` | `string \| null` | No | Default slot content |
| `nullable` | `boolean` | No | Whether `null` is a valid value — absent means `true` |
| `minChildren` | `number` | No | Minimum number of children the slot accepts (since 0.25.0) |
| `maxChildren` | `number` | No | Maximum number of children the slot accepts (since 0.25.0) |
| `anyOf` | `string[]` | No | Permitted component type names (since 0.14.0) |
| `defaultSlot` | `boolean` | No | Whether this is the component's designated default slot. Absent means `false` |
| `$extensions` | `PropExtensions` | No | Vendor extensions |

Slot constraint properties (`minChildren`, `maxChildren`, `anyOf`) are emitted when [`conventions.platforms.figma.slotConstraints`](/schema/conventions/#platform-members) is declared.

`defaultSlot` marks the one slot a layout component always composes through. It is set at generation time, when the prop's name matched the library's [`specs.slots.default.match`](/schema/conventions/#slots) convention, and is read off the spec thereafter — a consumer needs no access to those conventions to know which slot it is:

```yaml
props:
  children:
    type: slot
    defaultSlot: true
```

An instance filling a `defaultSlot` prop may be nested as a plain [child](/schema/children/) rather than through a [`SlotContentRef`](/schema/slot-content-ref/). Every other slot binds explicitly, which is the only shape that can say *which* of several slots a fill belongs to.

**At most one `SlotProp` per component may be `true`.** This is a constraint over sibling entries in one `props` map, which JSON Schema cannot express without reaching into a named prop's value to compare it against its siblings. It is therefore an authoring and generator contract, not schema-validated: `specs generate` marks at most one and reports a component whose declared convention matches several, and a hand-authored spec that breaks the invariant is malformed input a consumer may reject.

### ImageProp

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `'image'` | Yes | |
| `default` | `string \| null` | No | Default image — an `images` registry reference, or null |
| `nullable` | `boolean` | No | Whether `null` is a valid value — absent means `true` |
| `examples` | `ImageValue[]` | No | Authoring-default images the component was authored with (since 0.33.0) |
| `$extensions` | `PropExtensions` | No | Vendor extensions |

An image-valued property (e.g. a `dsImage` `source` prop). Emitted for code-only props named in [`figma.images.sourceProps`](/schema/conventions/#images) (since 0.28.0).

An authoring-default image sits in one of two places, and they describe different things:

| Location | Describes |
|----------|-----------|
| [`ImageBinding.examples`](/schema/prop-configurations/) | The image at *that binding site* — how one consumer placed it |
| `ImageProp.examples` | The image *the component itself* was authored with |

Where both apply to one rendered instance, the binding is the more specific statement. A designated image component is the origin of an image rather than a consumer of one, so it has no binding site in its own spec — `examples` on the prop is its only home for this.

`examples` is non-contractual reference material, parallel to `StringProp.examples`, and is distinct from `default`: a default states what the prop resolves to when a consumer omits it, while examples only demonstrate typical content.

```yaml
props:
  imageSource:
    type: image
    examples:
      - $image: "#/components/dsImage/images/dsImage__image"
```

### ObjectProp

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `'object'` | Yes | |
| `members` | `Record<string, ObjectPropMember>` | Yes | Named members, each a scalar prop definition. At least one member |
| `$extensions` | `PropExtensions` | No | Vendor extensions |

A prop whose value is an object of named, individually typed members (since 0.39.0, ADR-111). `ObjectPropMember` is `BooleanProp | StringProp | EnumProp | NumberProp` — members are one level deep: no slots, images, or nested objects. Member names carry no schema semantics (a breakpoint vocabulary is the library's choice), must not begin with `$`, and must not contain the declared separator.

There is no top-level `default` or `nullable`: defaults live per member, and the object's value always exists as the composition of its members' states.

```yaml
props:
  margin:
    type: object
    members:
      compact:
        type: string
        default: none
        enum: [none, small, large]
      expanded:
        type: string
        default: none
        enum: [none, small, large]
```

Figma authors members as separator-delimited flat property names (`margin.compact`, `margin.expanded`), folded into one `ObjectProp` when [`conventions.platforms.figma.objectProps`](/schema/conventions/#platform-members) is declared. Each member's `$extensions['com.figma'].name` records the flat source name, so unfolding back to Figma is reversal, not re-derivation. Configurations set an object prop with a member-keyed value — see [Prop Configurations](/schema/prop-configurations/).

## Nullability

`nullable` is optional on every prop kind that carries it. Its absence is meaningful, and what it means depends on whether the prop's value set is open or closed:

| Prop kind | Absent `nullable` means | Why |
|-----------|-------------------------|-----|
| `StringProp` | `true` | Open value set — nothing enumerates it |
| `NumberProp` | `true` | Open value set |
| `SlotProp` | `true` | Open content set; a slot may be empty |
| `ImageProp` | `true` | Open value set |
| `EnumProp` | `false` | `enum` lists every accepted value, and `null` is not one of them |
| `BooleanProp` | *(no field)* | Booleans are never nullable |

An explicit `nullable: false` on an open-valued prop asserts that a value always exists — useful when a code-only prop was authored with a non-empty default:

```yaml
props:
  # No nullable key — accepts null
  label:
    type: string
  # Explicitly asserts a value is always present
  headingLevel:
    type: number
    default: 2
    nullable: false
```

## Extensions

The `$extensions` object holds vendor-specific metadata. Currently only the `com.figma` extension is defined.

### FigmaPropExtension

| Property | Type | Description |
|----------|------|-------------|
| `type` | `string` | Figma property type (e.g. `BOOLEAN`, `TEXT`, `INSTANCE_SWAP`, `VARIANT`) |
| `source` | `FigmaCodeOnlySource` | Present when the prop originates from a code-only prop layer |
| `name` | `string` | The Figma property name, present only when the prop key cannot reconstruct it — see [Key Formatting](/guides/key-formatting/) |

### FigmaCodeOnlySource

| Property | Type | Description |
|----------|------|-------------|
| `kind` | `'codeOnlyProp'` | Always `'codeOnlyProp'` |
| `layer` | `string` | Sub-layer name in the code-only container |
| `instanceOf` | `string` | Component name, for enum code-only props |

## Further Reading

- [ADR 027 — Code-Only Props](https://github.com/DirectedEdges/specs/blob/main/adr/027-code-only-props.md) — surfaces Figma code-only props with `$extensions` source metadata
- [ADR 028 — Slot Quantity and Content Constraints](https://github.com/DirectedEdges/specs/blob/main/adr/028-slot-constraints.md) — adds `anyOf` to SlotProp; originally added `minItems`/`maxItems` (renamed in ADR-056)
- [ADR 056 — Rename SlotProp.minItems/maxItems → minChildren/maxChildren](https://github.com/DirectedEdges/specs/blob/main/adr/056-slot-children-constraints.md) — aligns field names with Figma native `slotSettings`; adds native `preferredValues` resolution
- [ADR 029 — NumberProp](https://github.com/DirectedEdges/specs/blob/main/adr/029-number-prop.md) — adds the `NumberProp` type with opt-in inference
- [ADR 063 — Image Content](https://github.com/DirectedEdges/specs/blob/main/adr/063-image-content.md) — adds the `ImageProp` type and image fills/registry
- [ADR 088 — Authoring-default images on `ImageProp`](https://github.com/DirectedEdges/specs/blob/main/adr/088-image-prop-examples.md) — adds `ImageProp.examples`
- [ADR 066 — Lossless Key Formatting](https://github.com/DirectedEdges/specs/blob/main/adr/066-lossless-key-formatting.md) — adds `name` to `FigmaPropExtension` so lossy key formats stay reversible
- [ADR 111 — Object-Typed Props](https://github.com/DirectedEdges/specs/blob/main/adr/111-object-props.md) — adds `ObjectProp` with named scalar members, folded from separator-named Figma properties
