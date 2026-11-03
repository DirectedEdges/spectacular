---
title: "Props"
description: "Prop kinds, defaults, nullability, and extensions"
---

Props define the configurable inputs of a component. Each prop is one of seven kinds, discriminated by its `type` member — a consumer reads `type` before interpreting the rest. Each kind has its own reference page, generated from the schema; this page is the map.

```ts
type Props = Record<string, AnyProp>;
type AnyProp = BooleanProp | StringProp | EnumProp | NumberProp | SlotProp | ImageProp | ObjectProp;
```

## Kinds

| Kind | Discriminator | What it is |
|---|---|---|
| [`BooleanProp`](/schema/props/boolean/) | `type: boolean` | A prop a consumer sets on or off |
| [`StringProp`](/schema/props/string/) | `type: string`, no `enum` | Text content, glyph/instance swap, or other open string values |
| [`EnumProp`](/schema/props/enum/) | `type: string` + `enum` | One of a closed list — the variant axis |
| [`NumberProp`](/schema/props/number/) | `type: number` | A numeric value, open or enumerated |
| [`SlotProp`](/schema/props/slot/) | `type: slot` | A place content goes, filled with structure rather than a scalar |
| [`ImageProp`](/schema/props/image/) | `type: image` | An image-valued prop |
| [`ObjectProp`](/schema/props/object/) | `type: object` | Named, individually typed scalar members |

`StringProp` and `EnumProp` share `type: string`; the presence of `enum` is what discriminates them.

## Nullability

`nullable` is optional on every kind that carries it. Its absence is meaningful, and what it means depends on whether the kind's value set is open or closed:

| Prop kind | Absent `nullable` means | Why |
|-----------|-------------------------|-----|
| [`StringProp`](/schema/props/string/nullable/) | `true` | Open value set — nothing enumerates it |
| [`NumberProp`](/schema/props/number/nullable/) | `true` | Open value set |
| [`SlotProp`](/schema/props/slot/nullable/) | `true` | Open content set; a slot may be empty |
| [`ImageProp`](/schema/props/image/nullable/) | `true` | Open value set |
| [`EnumProp`](/schema/props/enum/nullable/) | `false` | `enum` lists every accepted value, and `null` is not one of them |
| [`BooleanProp`](/schema/props/boolean/) | *(no member)* | Booleans are never nullable |

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

Every kind carries an optional [`$extensions`](/schema/props/extensions/) object — vendor provenance under reverse-domain keys, currently `com.figma` only. A consumer never needs it to interpret the prop; the render direction reads it to reverse what capture recorded.

## Platform bindings

How each kind is realised per platform — and the joint rules deciding which kind a Figma property even becomes — is declared in the platform bindings:

- [Figma](/schema/mappings/figma/) — property definitions, variant axes, code-only props, object folding
- [React](/schema/mappings/react/) — typed parameters, slots to `children`, state classification
- [Web Components](/schema/mappings/webcomponents/) — properties and reflected attributes
- [CSS](/schema/mappings/css/) — props as selection, never declarations

## See Also

- [Prop Configurations](/schema/prop-configurations/) — how a variant or example sets prop values
- [Prop Binding](/schema/prop-binding/) — how an element member binds to a prop
- [Key Formatting](/guides/key-formatting/) — how Figma property names become prop keys
