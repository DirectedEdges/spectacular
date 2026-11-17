---
title: "Promoting Primitives"
description: "Author the promotion table that turns captured primitive layers into design system components"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge pro-badge">Pro</span>')</script>

A designer composing example content draws with layers, not components. A card's title is a text layer; the box holding its body is a frame. Captured as-is, that content reaches your output as styled `div`s and `span`s — correct in appearance, and nothing a consumer could have built from your library.

The **promotion table** closes that gap. It says which of your components a captured layer becomes, and how the layer's styles become that component's props. One text layer carrying a type token becomes `<Text size="300" weight="Bold">`; one auto-layout frame carrying a spacing token becomes `<Container layoutMode="Vertical" itemSpacing="M">`.

Authored at `config/conventions/figma.primitives.yaml`, and read when [`promotePrimitives`](/settings/promote-primitives/) is on. The full property reference is in [the conventions schema](/schema/conventions/#primitives); this page is about writing the thing.

## Each key is one of your components

```yaml
# config/conventions/figma.primitives.yaml
dsText:
  elementType: text
  map:
    - source: typography
      values:
        Typography/font__300__bold: { size: 300, weight: Bold }
    - source: content
      prop: text
```

Three things are being declared: the key `dsText` names the component a layer promotes *to*, `elementType` names the layer shape it promotes *from*, and each `map` rule turns one thing the layer carries into props on the target.

Every side of a rule is checkable against something your workspace already holds, and `specs validate` warns about each: a key with no spec folder, a `values` key that is not a token your library holds, and a written prop the target does not declare. None of them fails a run — a table is often written ahead of the components it names.

## A worked container entry

Containers are the entry most libraries get wrong, because a layout component has no content of its own to recognise it by. Everything it promotes from is structural:

```yaml
# config/conventions/figma.primitives.yaml
dsContainer:
  elementType: container
  map:
    - source: layoutMode              # the frame's own stacking direction
      values:
        VERTICAL:   { layoutMode: Vertical }
        HORIZONTAL: { layoutMode: Horizontal }
        NONE:       { layoutMode: None }     # a frame with no auto-layout
    - source: itemSpacing             # the gap, from the library's spacing scale
      values:
        Spacing/XS: { itemSpacing: XS }
        Spacing/S:  { itemSpacing: S }
        Spacing/M:  { itemSpacing: M }
        Spacing/L:  { itemSpacing: L }
        Spacing/XL: { itemSpacing: XL }
    - source: padding
      values:
        Spacing/S: { padding: S }
        Spacing/M: { padding: M }
```

Four things that entry demonstrates:

**`layoutMode` keys are the literal Figma values**, in capitals — `VERTICAL`, `HORIZONTAL` — and the prop values beside them are whatever your component calls them. The two vocabularies are unrelated on purpose.

**An absent `layoutMode` matches the `NONE` key.** A frame with no auto-layout carries no layout mode at all, and `NONE` is the closed enum's word for that, so declaring the key is how a plain frame promotes rather than falling through.

**A spacing source needs a closed scale.** `itemSpacing` and `padding` can only be enumerated because the library authors them from a finite token collection. A dimension your designers type freely has no vocabulary to list, matches no key, and stays as passed styling — which is the right outcome, not a gap.

**Children are never a source.** There is no `children` rule, and adding one does nothing: a promoted container's children become the target's slot content on their own, through the component's default slot. The one thing this requires of the target is below.

:::caution[The target's root must be the box its children land in]
A promoted container's children go into the target's slot, so that component's root has to be the box they sit in. A layout component that wraps its children in an inner element cannot stand in for one: the `gap`, `padding` and alignment land on the outer box while the children sit a level deeper, so the spacing is simply lost.

Nothing raises an error. Where the constraint does not hold, declare no `container` entry at all — `text` and `glyph` are unaffected.
:::

## What a source can be

A `source` is formed one of three ways:

| Form | Reads | Example |
|---|---|---|
| `content` | the text string or the glyph name — not a style | `source: content` |
| a `Styles` member name | what the layer carries under that key | `source: fillColor` |
| a dotted path into a composite | one member inside it | `source: typography.fontStyle` |

Which members a layer of a given kind carries is the closed honoured set, [listed per element type](/schema/conventions/#rules). A source outside it reads as undefined, so its rule never resolves — the entry is inert rather than invalid, which is why nothing rejects it.

`typography` and the `typography.*` members can never both resolve, because a layer either wears a named text style or is styled ad hoc. Declaring both is how one entry serves either kind of layer.

## What a values key can be

A key is a **full token path or a raw scalar**, matched literally. Nothing is derived from part of a token's name, and nothing is matched partially — a prop value need bear no relation to the token that produced it, which is what lets a colour token write an intent:

```yaml
    - source: fillColor
      values:
        Color/Critical: { appearance: error }
        Color/Warning:  { appearance: warning }
```

One key may write several props, and may write a prop whose meaning differs from the source's.

## Record what you left out

A library value with no row is indistinguishable from one nobody considered. A comment at the top of the file is the whole practice:

```yaml
# Unmapped on purpose: the 19 `Typography theme/*` named styles (no declared
# equivalence to a size/weight pair) and the 6 `__underline` variables
# (dsText has no decoration prop).
```

## Further reading

- [`primitives` in the conventions schema](/schema/conventions/#primitives) — the property reference, the honoured source set per element type, and how entries are selected between
- [`promotePrimitives`](/settings/promote-primitives/) — the setting that turns promotion on, and what capture records about it
- [`slotPrimitives`](/settings/slot-primitives/) — the related setting for what a slot declares it accepts
