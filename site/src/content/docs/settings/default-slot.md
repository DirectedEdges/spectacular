---
title: "slots.default"
description: "Naming patterns identifying the one slot a layout component composes through"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge pro-badge">Pro</span>')</script>

Naming patterns identifying a component's **default slot** — the one slot it always composes further content through. A library fact: absence means the library designates no default slot, and every slot fill binds explicitly. When declared, the matching slot prop is marked `defaultSlot: true`, and fills into that slot on a nested instance capture as children rather than as a reference.

| | |
|---|---|
| **File** | `config/conventions/specs.yaml` |
| **Path** | `slots.default.match` |
| **Type** | block with a single `match` array of strings |
| **Default** | absent (no default slot designated) |

## Example

```yaml
slots:
  default:
    match:
      - children
      - items
```

`match` is an array because one library may name this slot differently across component families — `children` on a page row, `items` on a list. Any pattern in the array matches, compared case-insensitively against the slot's name. `*` is the one wildcard.

## Result

A screen built from nested layout components captures as a single tree:

```yaml
layout:
  - root:
      - pageRow:
          - section:
              - container:
                  - card1
                  - card2
                  - card3
anatomy:
  pageRow: { type: instance, instanceOf: dsPageRow }
  section: { type: instance, instanceOf: dsSection }
  container: { type: instance, instanceOf: dsContainer }
  card1: { type: instance, instanceOf: dsCard }
```

Without the convention, each level is its own `slotContentExamples` entry, and the level above points at it:

```yaml
elements:
  pageRow:
    propConfigurations:
      children: { $slotContent: '#/components/screen/slotContentExamples/dsPageRow__children' }
```

A **non**-default slot is untouched and still binds explicitly — that reference is the only shape that can say *which* of several slots a fill belongs to. Both shapes coexist in one spec: a card whose `children` nest as a tree still carries `header: { $slotContent: … }`.

## Convention placement

It sits with the spec conventions rather than under a platform because what it names is a slot prop the spec declares, not a Figma layer. There is one answer per library, and every platform reads it.

Declaring it changes how composed content is captured. Content a host places in a nested instance's default slot becomes that instance's **children** — anatomy, elements and layout together — instead of a `slotContentExamples` entry addressed by a `$slotContent` reference. A hierarchy of layout components then reads as one tree rather than a chain of one-level-deep registry entries.

## The spec-side marker

The convention is read once, at generation time. The slot prop it matches carries `defaultSlot: true` in the generated spec:

```yaml
props:
  children:
    type: slot
    defaultSlot: true
```

Every later reader — the transforms, `specs render`, any other tool — reads that marker off the spec rather than re-evaluating the pattern, so a consumer needs no access to the conventions the spec was generated under. At most one slot prop per component is marked; when several patterns match one component, the earlier pattern wins and the conflict is reported.

The patterns themselves are also recorded, under `metadata.conventions.specs`, for the one question the marker cannot answer. When `specs render` meets nested children under an instance, the slot it has to fill belongs to *that instance's* component — a different component, whose spec and marker the render does not hold — so it matches the patterns against the instance's slot names instead.

## Licensing

Composed content is a Pro feature, so flattened nesting follows the same gates as the reference shape: a Pro license, and — for a component rather than a composition — [`defaultSlotContent`](/settings/default-slot-content/).

## Further reading

- [`defaultSlotContent`](/settings/default-slot-content/) — the run choice that decides whether composed slot content is recorded at all; the two names are close and mean different things.
- [Schema: Conventions](/schema/conventions/#slots) for the `slots` member's shape.
- [Schema: Props](/schema/props/#slotprop) for the `defaultSlot` marker this convention produces.
- [Schema: Children](/schema/children/) for the nested shape it permits.
