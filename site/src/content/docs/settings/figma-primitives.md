---
title: "Promotion table"
description: "Which design system component a raw layer stands for, and how its styles become that component's props"
---

`config/conventions/figma.primitives.yaml` is the promotion table: it decides which design system component a raw `text`, `glyph` or `container` layer in composed example content stands for. `specs init` does not seed this file — a workspace adds it when it turns [`promotePrimitives`](/settings/promote-primitives/) on; until then the table is inert.

| | |
|---|---|
| **File** | `config/conventions/figma.primitives.yaml` |
| **Path** | the file root — one entry per promotable component |
| **Type** | map of entry → `{ elementType, match?, map }` |
| **Default** | absent (file not seeded; nothing promotes) |

## Properties

Each entry names the `elementType` it promotes *from* — one of `text`, `glyph` or
`container` — a `map` of rules, in precedence order, and optionally `match`, the layer
names that select it.

A rule names one `source` and then either:

- **`prop`** — the source's value is written to that prop as-is
- **`values`** — a literal lookup from what the source carries to the props it produces,
  so one source may write several props at once, and may reach a prop whose meaning
  differs from its own

A key in `values` is a full token path or a raw scalar. It is never matched partially.

## Example

```yaml
text:
  elementType: text
  map:
    - source: typography
      values:
        'Type/Heading/Large': { size: L, weight: bold }
        'Type/Body': { size: M }
    - source: textColor
      prop: color
    - source: content
      prop: text
```

An entry selected by layer name:

```yaml
Section:
  elementType: container
  match: ['DS Section', 'Section']
  map:
    - source: layoutMode
      values: { VERTICAL: { direction: column } }
```

## File scope and naming

A component's props are the same whichever platform renders it, so the table is stated
once rather than per platform. It carries the `figma.` qualifier because what it *reads*
is Figma — its `source` keys name Figma style properties and its `values` keys name
Figma tokens (ADR-073 Decision 5). A file named `primitives.yaml` is refused with the
rename that fixes it.

## Accepted sources

The honoured set is closed per kind:

| Kind | Sources |
|---|---|
| `text` | `typography`, `typography.fontSize`, `typography.fontFamily`, `typography.fontStyle`, `textColor`, `content` |
| `glyph` | `width`, `height`, `fillColor`, `content` |
| `container` | `layoutMode` |

A source outside the set, or one the element does not carry, simply does not resolve —
its value stays in `styles` and reaches output as passed styling.

`typography` and `typography.*` can never both resolve: a layer wearing a text style
carries the token, and a layer styled ad hoc carries the composite. Declaring both is
how one entry serves either authoring style.

## Selecting between entries

Several entries may share an `elementType`. A design system with a text, a heading and a
body component is three entries, and which one is selected depends on whether the entry
declares `match`:

| | Rule |
|---|---|
| `match` declared and resolving | Selected immediately — the layer's name starts with one of the prefixes |
| No `match`, or none resolving | Selected by score — the most rules resolving against the element wins, and at least one must |

`elementType` gates both. A `text` layer never promotes to a `container` entry, whatever
it is named.

## Matching on the layer name

`match` holds **prefixes**, not whole names: a name matches when the layer's name starts
with one of them, exactly and case-sensitively. Composed content holds many layers of one
kind distinguished by suffix, so `Section 1`, `Section 2` and `Section 3` are all matched
by `Section`. The array lets a library mid-rename name both of its conventions, as
`['DS Section', 'Section']` does.

A resolved match short-circuits everything else. No score is computed, and no rule in
`map` need resolve — an entry whose every prop is a default can declare a name and an
empty `map`, and its styling still reaches output through the platform's `stylesProp`.

Where two entries both match, the **longest** matching prefix wins: a `Section Header`
entry outranks a `Section` one for a layer named `Section Header 2`. Selection therefore
never depends on the order the table is written in.

This is what a layout family needs. `Section`, `Block` and `Container` map the same closed
container vocabulary and score identically against any frame, so styling cannot tell them
apart; the layer name can.

The target need not itself be a primitive: `elementType` describes the layer shape a
promotion starts from, not the component it lands on.

## Further reading

- [Promote Primitives](/settings/promote-primitives/) — the setting that turns this on.
- [React](/settings/react/) and [Web Components](/settings/web-components/) — what each platform calls the components named here.
- [Conventions schema reference](/schema/conventions/) for the full shape.
