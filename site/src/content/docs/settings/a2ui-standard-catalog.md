---
title: "standardCatalog"
description: "How this library's vocabulary corresponds to A2UI's basic catalog, in both directions"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge experimental-badge">Experimental</span>')</script>

The `standardCatalog` convention declares how this library's vocabulary corresponds to a runtime standard catalog — [A2UI's basic catalog](https://github.com/a2ui-project/a2ui/blob/main/catalogs/basic/v1/catalog.json). It is the [promote-primitives](/settings/figma-primitives/) relationship pointed at a different pair of vocabularies: there, raw Figma layers promote to your components; here, standard runtime components pair with them.

| | |
|---|---|
| **File** | `config/conventions/a2ui.yaml` |
| **Path** | `standardCatalog` |
| **Type** | `{ elements, components }`, both maps of entries |
| **Default** | the `elements` defaults below; `components` absent |

## Example

```yaml
standardCatalog:
  elements:                 # spec primitive element types — shipped as defaults
    text: { component: Text, props: { content: text } }
    glyph: { component: Icon, props: { content: name } }
    container: { component: Column, horizontal: Row }
  components:               # this library's components — hand-maintained
    deText:
      component: Text
      props: { text: text }
    deIcon:
      component: Icon
      props: { name: name }
      values:
        name: { like: favorite }
    deDivider:
      component: Divider
```

An entry names the standard component, maps props by name, and translates closed vocabularies through `values` tables — a glyph name spelled `like` here is `favorite` there. `slot` has no element entry: slots map structurally, as children, not as a component.

## Both directions

**Raising (implemented)** — an agent composes in the basic vocabulary it already knows, and the A2UI → spec direction raises those nodes into your components through the inverted table: a `Text` node becomes `deText`, `Icon` with `name: favorite` becomes `deIcon` with `name: like`. This is how agent-generated UI lands inside the system's governance instead of beside it.

**Lowering (specified)** — an emission mode that flattens a surface to the basic catalog, so any A2UI renderer and any model prompted on the standard vocabulary can handle the payload without registering your components. A reach story, never the fidelity story.

## What is lost, and why that is the point

A prop with no entry does not transmit when lowering, and some losses are structural: the basic catalog's `Icon` declares **no size member at all** — 16-square versus 24-square is the registered renderer's decision. Declaring the correspondence is what makes the loss visible and deliberate rather than silent, the same discipline the [platform bindings](/schema/mappings/) apply to styles.

Two shapes the convention does not express yet, both recorded rather than papered over:

- **Structural pairings** — the basic catalog's `Button` requires a `Text` *child*, not a label prop, so `deButton ↔ Button` needs a structure rule, not a prop map. `Tabs` pairs the same way.
- **Directional containers in reverse** — `container` lowers to `Column` or `Row` by direction; raising them back to a layout component needs the inverse of that condition.

## Further reading

- [figma.primitives](/settings/figma-primitives/) — the same convention shape, Figma-side
- [specs a2ui](/cli/commands/a2ui/) — the command that consumes this file
