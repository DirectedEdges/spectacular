---
title: "Elements"
description: "Element runtime properties and children"
---

Within a [variant](/schema/variants/), each element is described by the `Element` type. This carries the element's runtime properties — its children, parent, styles, content, and any prop-driven behavior.

```ts
type Elements = Record<string, Element>;
```

## Element

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `children` | `string[] \| SlotBinding` | No | Child element names, or a `SlotBinding` to a slot prop. `SlotBinding` extends `PropBinding` with optional `examples?: SlotContentRef[]` — authored sample fills for the slot (e.g. Figma's authoring default at index 0). Non-contractual; code consumers may ignore. |
| `parent` | `string \| null` | No | Parent element key (`null` for root) |
| `styles` | [`Styles`](/schema/styles/) | No | Visual style properties — the element's own |
| `contentStyles` | [`ContentStyles`](/schema/styles/#contentstyles) | No | Styles applied to primitive content *filling* this element, keyed by primitive, as distinct from its own (since 0.35.0) |
| `propConfigurations` | [`PropConfigurations`](/schema/prop-configurations/) | No | Prop values that must hold for this element to appear |
| `instanceOf` | `string \| PropBinding \| SubcomponentRef` | No | Component name, binding, or subcomponent ref |
| `content` | `string \| PropBinding` | No | Text content or glyph name, or a binding to a prop |
| `overrides` | [`Overrides`](#overrides) | No | Style patches reaching inside the component this element instances (since 0.40.0) |
| `$extensions` | `object` | No | Platform extensions. `com.figma` carries capture provenance for a [promoted](/settings/promote-primitives/) element — `promotedPrimitive`, the `styles` the promotion consumed, the `content` a promoted leaf carried, and the hoisted `children` fill a promoted container held (a `SlotContentRef`) |

## Styles vs. content styles

An element has two style blocks, and they describe different subjects. `styles` are the element's own — its padding, alignment, surface, sizing. `contentStyles` are what content *placed inside it* is formatted with.

On a slot element, `contentStyles` is keyed by primitive, using the same [markers](/schema/props/slot/#primitive-content-markers) the slot's `anyOf` carries. Default slot content may hold more than one primitive — a glyph and a label — so a flat block could not say which styles belonged to which:

```yaml
default:
  elements:
    children:
      styles:
        padding: { $token: "DS Space.200", $type: dimension }
        mainAxisAlignment: CENTER
      contentStyles:
        $text:
          typography: { $token: "DS Type.Label.Medium", $type: typography }
          textColor: { $token: "DS Color.Text.OnPrimary", $type: color }
        $glyph:
          fillColor: { $token: "DS Color.Icon.OnPrimary", $type: color }

variants:
  - configuration: { appearance: subtle, state: default }
    elements:
      children:
        contentStyles:
          $text:
            textColor: { $token: "DS Color.Text.Subtle", $type: color }
          $glyph:
            fillColor: { $token: "DS Color.Icon.Subtle", $type: color }
```

Each entry is captured from the **first top-level primitive of that kind** in the slot's default content, evaluated per variant. Where a default fill holds two primitives of one kind — a label and a trailing counter — the first supplies that kind's formatting.

**`contentStyles` applies to a primitive fill only.** When the slot is filled with a component instead, that component brings its own formatting — apply `styles` and discard `contentStyles` rather than applying it to the instance.

`contentStyles` is meaningful only on a slot element, and its keys should agree with that slot's `anyOf` markers. Both are authoring and generator contracts: the schema cannot relate a prop to an element, so neither is validated.

## Overrides

An instance element is a leaf reference: it names the component it renders and configures that component's public surface. `propConfigurations` sets that component's props and `$nested` sets the props of instances below it, but neither reaches a style. `overrides` does — it patches the instanced component's own elements, after that component has resolved its variants and interaction state.

```ts
type Overrides = Override[];
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `configuration` | [`PropConfigurations`](/schema/prop-configurations/) | No | Resolved prop values of the instanced component this entry applies under |
| `elements` | `Record<string, ElementOverride>` | Yes | Patches, keyed by the instanced component's element names |

Each `ElementOverride` carries what one element may have patched:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `styles` | [`Styles`](/schema/styles/) | No | Style values applied over the element's resolved styles |
| `content` | `string` | No | Replacement content for a `text` or `glyph` element — static, never a binding |
| `overrides` | `Overrides` | No | Patches for the component this element instances, where it is itself an instance |

An entry with no `configuration` applies at **every** configuration, not at the base one — so an unscoped patch survives the instanced component's own state rules rather than being beaten by them. An entry with a `configuration` applies only where the instanced component's resolved props match it, which is what lets an author state a different patch at hover.

```yaml
navigation:
  instanceOf: { $ref: "#/subcomponents/action" }
  propConfigurations:
    appearance: text
    state: rest
  styles:                 # how the instance sits in its parent
    width: 48
  overrides:
    - elements:           # applies at every state
        background:
          styles:
            backgroundColor: { $token: "DS Color.Surface", $type: color }
        icon:
          styles:
            fillColor: { $token: "DS Color.Icon.OnSurface", $type: color }
    - configuration:      # applies only where the instance resolves to hover
        state: hover
      elements:
        icon:
          styles:
            fillColor: { $token: "DS Color.Icon.OnSurfaceHover", $type: color }
```

Entries layer in order, the later winning per style key, the way [variants](/schema/variants/) layer over the default.

### What an override may reach

Keys are the names the instanced component's own [anatomy](/schema/anatomy/) uses, and recursion follows **instance** boundaries only — an entry whose element is itself an instance nests its own `overrides`, so one block reaches through a chain of composed instances. Containers and groups are not recursion targets, the same rule [`$nested`](/schema/prop-configurations/) paths follow.

Which style properties an entry may set is declared per property: a property an override may set carries [`overridable: true`](/schema/styles/#overridable), and a property without the annotation is not patchable.

The instanced component's **root** is addressable like any other element. An instance's own `styles` carries only the properties that place it in its parent, so the root's own presentation — its fill, its corners — is reachable only here. Which of the root's properties take effect as placement instead is declared in each platform's style mapping, not in the schema.

### What it does not reach

| Not permitted | Where that belongs |
|---|---|
| `propConfigurations` | [`$nested`](/schema/prop-configurations/) — configuring a nested instance uses its public API |
| `instanceOf` | Swapping the component is a structural change, not a patch |
| `contentStyles` | A property of the component that owns the slot |
| `layout` | An override patches presentation and does not restructure |

The schema validates shape only. An element name absent from the instanced component's anatomy passes validation and is caught when tooling resolves the reference.

### Where to use them

`overrides` is for a **placed** instance — a [composition](/schema/composition/), a slot-content example, an instance example. Inside a component definition it is permitted and discouraged: a component that needs an instance of another component to look different should say so in that component's own [variants](/schema/variants/), where the adjustment is part of the component's contract rather than a patch over it. Nothing validates this.

## Further Reading

- [ADR 016 — Element Content Identification](https://github.com/DirectedEdges/specs/blob/main/adr/016-element-content.md) — replaces `Element.text` with unified `Element.content` field
