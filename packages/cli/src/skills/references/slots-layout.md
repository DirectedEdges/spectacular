<!--
  Reference shipped beside specs-cli.authoring.primer — not an invokable skill.
  Canonical; `specs skills install` overwrites it on every refresh.
-->

# Reference: layout trees and slots

Load when authoring layout, slots, or any composition. Assumes `specs-cli.authoring.primer` is read; style property details are in `references/styles.md` beside this file.

## Layout trees

A layout is an array of `LayoutNode` starting at the root: a leaf is an element name as a plain string; a parent is an object whose one key is the element name and whose value is the array of its children.

```yaml
layout:
  - root:
      - label
      - notch
```

Rules the validator enforces:

- Every name in the tree is declared in the anatomy the tree belongs to — the component's for `default`/`variants`, the triplet's own for a slot content entry.
- There is one tree per variant block. A variant carrying `layout` replaces the structure wholesale for that configuration; a variant without one inherits the default's.

## Auto-layout vs absolute

Positioning is two decisions, made on different elements:

**The container decides flow.** `layoutMode: HORIZONTAL | VERTICAL` makes a container auto-layout: children flow along the main axis, spaced by `itemSpacing`, aligned by `mainAxisAlignment` / `crossAxisAlignment`, padded by `padding`. `layoutMode: NONE` makes a plain container whose children sit where their coordinates put them.

**The child decides participation.** Inside an auto-layout container, a child with `position: ABSOLUTE` leaves the flow and pins itself with offsets — `top`, `start`, `end`, `bottom`, `centerHorizontalOffset`, `centerVerticalOffset`. `position: AUTO` (the default) stays in flow.

| Intent | Author |
|---|---|
| Items in a row/column with consistent gaps | Container: `layoutMode`, `itemSpacing`, `padding`, alignments. Children: nothing positional |
| One child pinned over/outside the flow (a notch, a badge dot, a close affordance) | Container stays auto-layout; that child gets `position: ABSOLUTE` plus offsets |
| Freeform canvas placement | Container: `layoutMode: NONE`; every child positioned explicitly |

Element-type selection — including the rule that a styled decorative block (a notch, a badge dot) is a `container`, never a shape primitive — lives in `rules/anatomy.yaml` beside the primer skill, with the worked notch example; positioning judgments are in `rules/layoutStyling.yaml`. Placement variants swap which offset edge is set — null the old edge, set the new one.

Sizing per element: `layoutSizingHorizontal` / `layoutSizingVertical` take the auto-layout sizing vocabulary (`FILL`, `HUG`, `FIXED`); `width`/`height` belong to the FIXED case, while `min`/`max` bounds are legal under **any** sizing mode — hug-with-a-floor and fill-with-a-ceiling included. Prefer `HUG`/`FILL` over fixed dimensions wherever the content should drive size — fixed dimensions are the most common authored-layout defect.

## Slots: one relationship across three files

A slot is a prop the component exposes for content it does not define. Authoring one touches all three files, and this traversal is the part most worth getting right:

| Step | File | What is written |
|---|---|---|
| 1. Declare the slot | `api.yaml` | `props.<slot>: {type: slot}` — optionally `defaultSlot: true` (at most one), `anyOf` (permitted component names), `minChildren`/`maxChildren` |
| 2. Bind an element to it | `variants.yaml` | the slot-bearing element's `children: {$binding: '#/props/<slot>', examples: [{$slotContent: …}, …]}` — a `SlotBinding`; `examples[0]` is the authored default fill |
| 3. Author the fills | `examples.yaml` | `slotContentExamples.<name>` — an anonymous triplet of `anatomy` + `elements` + `layout`, complete in itself |

A slot-bearing element sizes `layoutSizingVertical: HUG`. Its height is its fills' height, so a slot left `FIXED` renders the component wrong.

A fill arrives one of two ways:

- **Default slot** — an instance filling the designated default slot may be nested as a plain child element. The nesting is the fill; nothing points between levels.
- **Named slot** — every other fill binds explicitly through a `$slotContent` pointer. Only this form can say *which* of several slots a fill belongs to.

### The pointer grammar

| Pointer | Resolves to |
|---|---|
| `#/components/<key>/slotContentExamples/<name>` | a named fill in that spec's examples file |
| `#/components/<key>/subcomponents/<sub>/slotContentExamples/<name>` | a named fill owned by a subcomponent slice |

`<key>` is the spec folder key, and the `components` segment names the whole spec-key space — a composition addresses other specs' fills *and its own* through the same form (`#/components/<compositionKey>/slotContentExamples/<name>`). These two forms are the only ones the emitters resolve; the schema also documents `#/compositions/…` pointers, but nothing resolves them today — do not author them. `specs validate` resolves every pointer; a dangling one is an error.

### Filling another component's slot

When an `instanceExamples` entry or a nested instance's `propConfigurations` sets a slot prop, the value is a `$slotContent` pointer — never inline content, never a `$binding` (instance examples are documented configurations, not live bindings):

```yaml
instanceExamples:
  withActions:
    propConfigurations:
      children: {$slotContent: '#/components/tooltip/slotContentExamples/tooltip__children__rich'}
```

## Slot content triplets

A `slotContentExamples` entry (and a composition) is a self-contained triplet: its `anatomy` declares its own elements, its `elements` describes every one of them, its `layout` arranges them — checked against its *own* anatomy, not the host component's. An element inside a triplet may be `type: instance` with `instanceOf` pointing at any workspace component; that is how composed content nests real components.

## Compositions

A composition spec folder is written as the same three concern files a component is — `api.yaml` (title, anatomy, props), `variants.yaml` (default layout and elements), `examples.yaml` — under `specs/compositions/<key>/`. What differs is the content: most of its anatomy is `type: instance` elements with `instanceOf` naming real components, its layout is the page structure down from `root`, and its instances configure their targets through `propConfigurations`.

Fills in a composition follow the same split as everywhere else, and the two mechanisms are not in tension: a **default-slot** fill nests as plain children of the instance in the composition's layout tree (ADR-099 — that nesting is the fill, not "flattening"), while a **named-slot** fill is authored in `slotContentExamples` and bound with `$slotContent`. "Author each fill where it belongs" means exactly that routing — named fills in the examples registry, default fills as children — never that default fills should be lifted into the registry.

(The schema's bare `Composition` triplet — `anatomy`+`elements`+`layout` with optional `slotContent` — is the shape a `$slotContent` pointer into `#/compositions/…` resolves to, not the on-disk folder format.)
