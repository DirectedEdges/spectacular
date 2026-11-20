<!--
  Reference shipped beside specs-cli.authoring.primer — not an invokable skill.
  Canonical; `specs skills install` overwrites it on every refresh.
-->

# Reference: layout trees, nesting, and arrangement

Load with the **variants pack**, when `variants.yaml` begins. Assumes `specs-cli.authoring.primer` is read; style property details are in `references/styles.md` beside this file.

This reference carries the map: the tree that holds elements, the four ways a container arranges its children, and how arrangement works once the tree runs through instances and slot fills. **Property meanings are the schema's and judgment is the rules files' — both are linked at the end rather than restated here.**

**A note on the word.** In Specs, *composition* names a kind of spec — a folder under `specs/compositions/`. The act of arranging and nesting elements is layout, and it is this file. Nothing below is specific to composition specs; it applies the same inside a single component.

## The layout tree

An array of `LayoutNode` starting at the root. A leaf is an element name as a plain string; a parent is an object whose one key is the element name and whose value is the array of its children.

```yaml
layout:
  - root:
      - media
      - body:
          - title
          - price
```

What the validator enforces: every name in the tree is declared in the anatomy that tree belongs to — the component's for `default` and `variants`, the triplet's own for a slot content entry — and there is one tree per variant block. A variant carrying `layout` replaces the structure wholesale for that configuration; a variant without one inherits the default's.

## Four arrangements, one property

`layoutMode` on the **container** decides how its children are arranged. There are four values, and the rest of the layout surface is a consequence of which one is set:

| `layoutMode` | Children are | Then set |
|---|---|---|
| `HORIZONTAL` / `VERTICAL` | stacked along that axis | `itemSpacing`, `padding`, `mainAxisAlignment`, `crossAxisAlignment`, `wrap` |
| `GRID` | filling cells of equal tracks on one templated axis, in source order | exactly one of `gridColumns` / `gridRows`, plus `itemSpacing` and `padding` |
| `NONE` | placed by their own coordinates | nothing on the container; every child positions itself |

```yaml
# a three-up card grid that becomes two-up and one-up as the container narrows
root:
  styles:
    layoutMode: GRID
    gridColumns: { minSize: 280 }
    itemSpacing: { $token: Spacing/M, $type: dimension }
```

`gridColumns` and `gridRows` take either an integer — that many equal tracks — or `{minSize: <n>}`, which fits as many tracks as it can at that minimum and shares the remainder. **Exactly one of the two is non-null**: `GRID` templates one axis, and the other follows from the child count.

Independently, a **child** decides whether it participates. `position: ABSOLUTE` leaves the flow and pins the child with offsets; `position: AUTO`, the default, stays in it.

```yaml
# a badge pinned over the flow, hanging past the top-right corner
badge:
  styles:
    position: ABSOLUTE
    top: -6
    end: 8
```

## Layout components come before container trees

A library usually publishes its own layout components, and they are the preferred way to arrange composed content. Two mechanisms matter here.

**The promotion table consolidates a container tree into component instances.** `config/conventions/<platform>.primitives.yaml` maps a captured container to one of your components, turning the frame's `layoutMode`, `itemSpacing` and `padding` into that component's props:

```yaml
# config/conventions/figma.primitives.yaml
dsStack:
  elementType: container
  map:
    - source: layoutMode
      values:
        VERTICAL:   { direction: Vertical }
        HORIZONTAL: { direction: Horizontal }
    - source: itemSpacing
      values:
        Spacing/M: { gap: M }
```

A promoted container's **children become the target's slot content on their own** — there is no `children` source, and the one thing it requires of the target is that its root is the box those children land in. A layout component wrapping its children in an inner element cannot stand in for one: the gap and padding land on the outer box while the children sit a level deeper.

**Which layout components a library has is the library's own fact.** The names, what each is for, and the order they nest in — a page shell holding rows, a row holding sections, a section holding blocks — are declared in `specs/foundations/layout/guidelines.yaml`, not here and not inferred from component names. Read it before authoring a container tree in composed content.

An atomic component's own internals stay primitive. The promotion map governs composed content — compositions, `instanceExamples`, slot content — not what a small component is built from.

## Arrangement through a hierarchy

A tree gets deeper three ways, and they are not interchangeable:

| Depth arrives as | Written as | Whose layout governs the inside |
|---|---|---|
| This spec's own nesting | a parent key in the layout tree | this spec's layout tree |
| An instance of another component | an `instance` element with `instanceOf` | **that component's own spec** |
| A slot's fill | a `slotContentExamples` triplet, or a nested child in the default slot | **the triplet's own layout tree** |

**Layout authority stops at an instance boundary.** A parent cannot arrange the inside of an instance. It has two levers, and both are declarations on the instance element rather than reaching into it:

```yaml
# variants.yaml — configuring an instance, and filling its slot
elements:
  header:
    instanceOf: pageHeader
    propConfigurations:
      density: Compact
      actions: { $slotContent: '#/components/pageHeader/slotContentExamples/twoButtons' }
```

A fill can itself hold instances that have slots, and the same rule applies at each level — which is how a deep arrangement works without any spec reaching into another.

Two consequences before authoring a deep tree:

- A slot-bearing element's height belongs to whatever fills it, so its vertical sizing is not a free choice.
- A component fill discards the slot's `contentStyles`, so formatting that a slot declares cannot survive promotion to a component.

## Where to go deeper

Property meanings, options and validated examples — the schema is the authority, and the docs site mirrors it one page per property:

| Property | Page |
|---|---|
| `layoutMode` | `/schema/styles/layout-mode/` |
| `gridColumns`, `gridRows` | `/schema/styles/grid-columns/`, `/schema/styles/grid-rows/`, `/schema/styles/adaptive-grid-tracks/` |
| `itemSpacing`, `padding` | `/schema/styles/item-spacing/`, `/schema/styles/padding/` |
| `mainAxisAlignment`, `crossAxisAlignment` | `/schema/styles/main-axis-alignment/`, `/schema/styles/cross-axis-alignment/` |
| `wrap`, `wrapAlignment` | `/schema/styles/wrap/`, `/schema/styles/wrap-alignment/` |
| `position` and its offsets | `/schema/styles/position/`, `/schema/styles/position-offset/` |
| `layoutSizingHorizontal`, `layoutSizingVertical`, `primaryAxisSizingMode` | `/schema/styles/layout-sizing-horizontal/`, `/schema/styles/layout-sizing-vertical/`, `/schema/styles/primary-axis-sizing-mode/` |

The installed schema is the version you are authoring against; the site tracks `main`. Where they disagree, the schema wins.

| Question | Goes to |
|---|---|
| Which value should I write here, and what pairs with what? | `rules/layoutStyling.yaml` — flow, grid, positioning, layout components |
| Which element type should carry this? | `rules/anatomy.yaml` |
| Sizing modes, bounds, and what `FILL` means at a root | `rules/styles.yaml · layoutSizingHorizontal\|layoutSizingVertical` |
| Writing the promotion table | `rules/primitives.yaml`, and `/guides/primitives/` |
| How Figma constraints become offsets | `/guides/layout-positioning/` |
| How a slot is declared, bound and filled | `references/slots.md` |
