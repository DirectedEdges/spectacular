---
title: "Themes"
description: "The theme an element selects for a token group, and how it resolves"
---

A design token does not carry one value. `DE Color/Surface/Primary` resolves to one colour under one theme and another colour under a second, and which theme applies is a fact of the element rather than of the token. `themes` is where an element states the theme in force for itself and everything beneath it.

```ts
type Themes = Record<string, string>;
```

It sits on [`Element`](/schema/elements/), beside `styles`, so it reaches every place elements appear:

- a variant's `elements`
- a [composition's](/schema/composition/) `elements`
- a [slot content](/schema/slot-content/) fill
- a subcomponent's elements

## Keys and values

A [token reference](/schema/token-reference/) path leads with the group the token belongs to — `DE Color` in `DE Color/Surface/Primary`. A group defines the themes its tokens resolve under, and a `themes` entry selects one of them.

| | What it names | Why that spelling |
|---|---|---|
| Key | A token group, verbatim | It must match the group segment of the `$token` paths the selection governs |
| Value | One of that group's themes, verbatim | The token source owns the theme vocabulary |

```yaml
themes:
  DE Color: Dark
  DE Space: Compact
```

Neither is formatted to [`spec.keys`](/settings/keys/), which governs anatomy keys, prop keys and references to them. A token group is none of those: it is already verbatim everywhere else it appears in a spec, leading a `$token` path.

The map shape allows one key per group, so a group cannot be selected twice on one element.

## Inheritance

A key is written only on the element that selects the theme. Nothing copies the effective selection onto descendants, so the written facts are the authored facts.

```yaml
default:
  elements:
    root:
      themes:
        DE Color: Dark
      styles:
        backgroundColor: { $token: "DE Color/Surface/Primary", $type: color }
    decorativeIcon:
      styles:
        fillColor: { $token: "DE Color/Alert/Info/Element", $type: color }

variants:
  - configuration: { appearance: Warning }
    elements:
      root:
        themes:
          DE Color: Dark
          DE Space: Compact
```

`decorativeIcon` carries no `themes` key, so its fill resolves under `root`'s `Dark` selection. A descendant that selects the same group overrides it for its own subtree, and selections layer across variants like any other element property ([Variants](/schema/variants/)).

## Rules

| Rule | Consequence |
|---|---|
| An absent key means inherit, not default | An element's effective themes are its own keys merged over its ancestors', through nested instance boundaries, nearest selection winning. Unlike an absent [style key](/schema/styles/), there is no declared default at this site |
| A selection equal to the group's default theme is written | `DE Color: Light` on a group whose default theme is `Light` holds light inside a dark ancestor, where an absent key would inherit the dark |
| A selection made above the component is not recorded | The theme a component was authored *within* is the context it was captured in, not part of its design, so a consumer supplies that context itself |

## Limits

| Limit | Detail |
|---|---|
| A value is never a binding | A selection cannot vary with a prop. The map shape admits that widening later without a reshape, the way [`content`](/schema/elements/) and `styles.visible` already accept a [`PropBinding`](/schema/prop-binding/) |
| A selection is never locked | Any ancestor or descendant overrides it, so a component that holds one theme against every ambient context is not expressible with this alone |
| Names are unvalidated strings | A misspelled group or theme passes schema validation and fails when something tries to resolve it |

## Platforms

Every target has its own mechanism for scoping a theme to part of a tree, and a `themes` entry is what each one reads.

| Platform | What a selection becomes |
|---|---|
| CSS | The scope of the stylesheet's theme override block, set on the selecting element rather than the document root |
| React | An attribute on the selecting element; the root's is settable on the instance, with the authored selection as its default |
| Web Components | The same attribute, same contract |
| Figma | A variable collection mode re-applied to the node, so the subtree resolves as authored |

## Provenance

In a Figma-sourced spec a token group is a variable collection and a theme is one of its modes. That mapping is provenance, like the `collectionName` a [token reference](/schema/token-reference/) records under `$extensions['com.figma']` — a `themes` entry itself names neither, and no consumer needs the Figma reading to resolve one.

## See Also

- [Elements](/schema/elements/) — the type `themes` sits on
- [Token Reference](/schema/token-reference/) — what a selection changes the resolution of
- [Variants](/schema/variants/) — how a selection layers across variants
- [`spec.keys`](/settings/keys/) — the key formatting a token group is exempt from
