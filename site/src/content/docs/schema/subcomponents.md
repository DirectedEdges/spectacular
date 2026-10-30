---
title: "Subcomponents"
description: "Embedded child component definitions and $ref linking"
---

Subcomponents are smaller components embedded within a parent component's spec. They follow the same structure as a top-level `Component` but without `metadata` or nested subcomponents. An optional `source` field carries the Figma node identity needed for reverse-direction tooling.

```ts
type Subcomponent = Omit<Component, 'metadata' | 'subcomponents'> & {
  source?: SubcomponentSource;
};
type Subcomponents = Record<string, Subcomponent>;
```

## Structure

A `Subcomponent` contains:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | `string` | Yes | Subcomponent name |
| `anatomy` | [`Anatomy`](/schema/anatomy/) | Yes | Element map |
| `props` | [`Props`](/schema/props/) | No | Prop definitions |
| `default` | [`Variant`](/schema/variants.md/#variant) | Yes | Default variant |
| `variants` | [`Variant[]`](variants.md) | No | Variant overrides |
| `invalidPropCombinations` | [`PropConfigurations[]`](prop-configurations.md) | No | Invalid prop combinations |
| `source` | `SubcomponentSource` | No | Figma source identity for this subcomponent's node |

### SubcomponentSource

| Property | Type | Description |
|----------|------|-------------|
| `pageId` | `string` | Figma page ID containing this subcomponent's node |
| `nodeId` | `string` | Figma node ID for this subcomponent's component node |
| `nodeType` | `'COMPONENT' \| 'COMPONENT_SET' \| 'FRAME'` | Figma node type |

```yaml
subcomponents:
  formLabel:
    title: Form / Label
    source:
      pageId: "790:6766"
      nodeId: "1477:200"
      nodeType: COMPONENT
    anatomy:
      root:
        type: container
    default:
      layout:
        - root
      elements:
        root: {}
```

## Linking

Elements in the parent anatomy reference subcomponents via `$ref`:

```yaml
anatomy:
  label:
    type: instance
    instanceOf:
      $ref: "#/subcomponents/formLabel"
```

The `$ref` is a JSON Pointer into the same spec document.

## Detection

Subcomponent detection is controlled by [`conventions.platforms.figma.subcomponents`](/schema/conventions/#subcomponents):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scope` | `'NESTED' \| 'PAGE'` | `'NESTED'` | Where to search — within the component frame or across the entire page |
| `match` | `string[]` | `['{C} / _ / {S}']` | Name patterns for matching. `{C}` = parent component name, `{S}` = subcomponent name |
| `exclude` | `string[]` | — | Patterns to exclude from matching |

## Further Reading

- [ADR 030 — Subcomponent $ref for instanceOf](https://github.com/DirectedEdges/specs/blob/main/adr/030-subcomponent-refs.md) — adds `SubcomponentRef` for linking anatomy elements to subcomponents
- [ADR 031 — Subcomponent Search Scope Config](https://github.com/DirectedEdges/specs/blob/main/adr/031-subcomponent-search-scope.md) — replaces `subcomponentNamePattern` with structured `scope`, `match[]`, `exclude[]`
