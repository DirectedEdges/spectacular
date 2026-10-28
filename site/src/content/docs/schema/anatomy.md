---
title: "Anatomy"
description: "Element tree and element types"
---

The `Anatomy` is a map of named elements that make up a component's structure. Each entry describes what kind of element it is and, optionally, where it was detected and what component it is an instance of.

```ts
type Anatomy = Record<string, AnatomyElement>;
```

## AnatomyElement

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `ElementType \| ElementTypeRef` | Yes | What kind of element this is |
| `detectedIn` | `string` | No | Frame or node name where this element was found |
| `instanceOf` | `string \| SubcomponentRef` | No | Component name this element is an instance of, or a `$ref` to a subcomponent |
| `role` | `RoleConceptName \| RoleConceptName[]` | No | Behavior concept(s) this element carries, read from `role:` annotation lines when [`settings.spec.roles`](/schema/settings/) is on — see [Roles](/roles/) |
| `actions` | `ActionEntry[]` | No | Behavior actions (`{ type }`) read from `action:` annotation lines, deduped in annotation order — see [Actions](/actions/) |
| `$extensions` | `AnatomyElementExtensions` | No | Vendor extensions; `com.figma` carries extraction provenance |

### AnatomyElementExtensions

Only the `com.figma` extension is defined.

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | The element's Figma layer name, present only when the anatomy key cannot reconstruct it — either after [wrapper collapse](/settings/collapse-primitive-wrapper/) or when the name falls outside the safe key grammar (see [Key Formatting](/guides/key-formatting/)) |
| `childRole` | `RoleConceptName \| RoleConceptName[]` | A role annotated on the layer [wrapper collapse](/settings/collapse-primitive-wrapper/) folded into this element, rather than on the element itself. `role` means the component node carried it, `childRole` the collapsed child, both present means both did. Only `role` reaches generated code |

### ElementType

One of 11 string literals:

| Type | Description |
|------|-------------|
| `text` | Text content |
| `glyph` | Icon or symbol |
| `vector` | Vector shape |
| `container` | Layout container (frame, group) |
| `slot` | Insertion point for child content |
| `instance` | Component instance |
| `line` | Line element |
| `ellipse` | Ellipse/circle |
| `rectangle` | Rectangle |
| `polygon` | Polygon |
| `star` | Star shape |

### ElementTypeRef

A URI reference to an externally defined element type:

```ts
type ElementTypeRef = { $ref: string };
// e.g. { $ref: "foundations#/definitions/glyph" }
```

### SubcomponentRef

A JSON Pointer linking to a subcomponent defined in the same spec:

```ts
type SubcomponentRef = { $ref: string };
// e.g. { $ref: "#/subcomponents/formLabel" }
```

Within variants, each element's runtime properties (children, styles, content) are described by the [`Element`](/schema/elements/) type. The element tree can also be expressed as a recursive [`Layout`](/schema/layout/).

## Further Reading

- [ADR 012 — Element Type References](https://github.com/DirectedEdges/specs/blob/main/adr/012-element-type-references.md) — widens `AnatomyElement.type` to support `$ref`-based external element type definitions
- [ADR 030 — Subcomponent $ref for instanceOf](https://github.com/DirectedEdges/specs/blob/main/adr/030-subcomponent-refs.md) — adds `SubcomponentRef` to `instanceOf` on AnatomyElement and Element
