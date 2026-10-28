---
title: "React"
description: "What the React platform calls the components a promoted primitive becomes, and which prop receives unmapped styling"
---

`config/conventions/react.yaml` states facts about the React platform: how it spells the things a spec names. One file per platform (ADR-078) — the filename *is* the platform key, and the body sits at the file root. Nothing here changes what a spec contains — it is read when a spec is converted into React and when React is read back into a spec, which is why it is a convention rather than a setting: a wrong value produces incorrect output, not different output.

| | |
|---|---|
| **File** | `config/conventions/react.yaml` |
| **Path** | file root |
| **Type** | block (`stylesProp`, `primitives`, `defaultFillWidth`) |
| **Default** | absent |

## `stylesProp`

The prop that receives styling no promotion mapped.

```yaml
stylesProp: sx
```

A name only — what gets placed in it is the generator's decision. A React component
usually takes an object prop such as `sx` or `style`.

Absence means unmapped styling has nowhere to go and is dropped. Every generated
scaffold accepts `style` and `className` on its root, so `style` is a safe value for a
library with no convention of its own.

## `primitives`

Which React component a promoted primitive becomes, and what that component calls its
props.

```yaml
primitives:

  text:
    component: DsText
    props:
      content: text      # DsText takes its string as a prop, not children
      color: color

  glyph:
    component: DsIcon
    props:
      content: name
      color: appearance

  container:
    component: DsBox
    props:
      direction: direction
```

The three keys are the [primitive kinds](/schema/conventions/#primitives) — `text`,
`glyph` and `container`. `component` is the React component's name; `props` renames a
concept to whatever this library calls it, and a concept left unmapped travels as
passed styling in `stylesProp` instead.

This table is the *spelling*. Which layers get promoted at all, and what their styles
are read from, is the Figma-scoped [promotion table](/settings/figma-primitives/) — and
none of it applies until [`promotePrimitives`](/settings/promote-primitives/) is on.

## `defaultFillWidth`

The width, in pixels, of the container this platform places a component in when the
component's root resizes to fill its parent.

```yaml
defaultFillWidth: 375
```

Applies only when the root's horizontal sizing is `FILL`. A root with a fixed or hugging
width already states its width and is unaffected, so this can never override what a
design declares. No default at any level: absence means the platform declares no width
and the rendering tool falls back to its own.

## Further reading

- [Web Components](/settings/web-components/) — the same three keys for custom elements.
- [`specs react`](/cli/commands/react/) — the command that reads this.
- [Conventions schema reference](/schema/conventions/) for the full shape.
