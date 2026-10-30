---
title: "Platform Neutrality"
description: "How the schema picks vocabulary when Figma, the web, and native platforms disagree"
---

The schema sits between one design tool and several code platforms, and those platforms do not agree on what to call things. Figma says `primaryAxisAlignItems`, CSS says `justify-content`, SwiftUI says `alignment`. Every name in the contract is therefore a decision, and "whatever the source called it" is not the rule. Where a term is already shared across code platforms, the schema uses the shared one. Where a cross-industry standard already defines a shape, the schema adopts the standard. Where platforms are actively converging, the schema follows the direction of travel rather than the legacy form.

The cost is real and deliberate: a neutral contract means every consumer translates, Figma included. The alternative is adopting one platform's model wholesale, which does not remove translation — it concentrates it on everybody else. A spec that spoke fluent Flexbox would push the work onto Compose and SwiftUI, and a spec that spoke fluent Figma would push it onto all of them at once.

## Principles

| Principle | What it rules out |
|---|---|
| Code platforms outrank Figma | Adopting a Figma API property name because it is what the source happened to call it |
| No single consumer drives the contract | Citing one downstream package's internal model, class structure, or convenience as the reason for a name or shape |
| An existing standard beats an invented shape | Inventing a representation where DTCG or a CSS specification already defines one |
| Logical direction beats physical direction | Naming edges and corners `left` and `right`, which bind the contract to one writing direction |

These are governance rules, not preferences. The first two are invariants of the schema package, and the third is why style enum values are `SCREAMING_CASE` *except* where they come from an external standard — a DTCG color space or a CSS Color 4 keyword keeps the spelling the standard gave it. Every one of them is enforced at review, through the decision record a schema change has to arrive with.

## Examples

Three decisions, each neutralising a different kind of bias — a tool's vocabulary, a legacy physical model, and a convenient shorthand that could not carry the data.

| Decision | Rejected | Adopted |
|---|---|---|
| [Layout alignment](/adr/040-layout-alignment/) | `primaryAxisAlignItems` and `counterAxisAlignItems`, and also `horizontalAlignment` / `verticalAlignment` | `mainAxisAlignment` and `crossAxisAlignment` |
| [Edges and corners](/adr/010-sides-and-corners/) | `paddingLeft`, `paddingRight`, `topLeftRadius` | `Sides` and `Corners` keyed on `start` and `end` |
| [Inline color](/adr/009-color-values/) | A hex string as the canonical inline form | `ColorObject`, the DTCG color shape |

### Layout alignment

`mainAxis` and `crossAxis` is the vocabulary CSS Flexbox and SwiftUI already share, so it is the one the contract uses. Figma's `primaryAxis` / `counterAxis` is internal naming that no code platform reads.

The rejected alternative is the more interesting half. Naming these `horizontalAlignment` and `verticalAlignment` would have been clearer to a reader looking at a single design, and it was turned down because a dimension-absolute name re-introduces the problem one layer down: which dimension is "horizontal" depends on the layout direction, so the field would be wrong half the time rather than merely tool-specific. `MainAxisAlignment` and `CrossAxisAlignment` resolve to `START`, `END`, `CENTER` and friends for the same reason.

### Edges and corners

`Sides` is keyed `top`, `end`, `bottom`, `start`, and `Corners` is keyed `topStart`, `topEnd`, `bottomEnd`, `bottomStart`. Neither matches Figma, which uses physical `left` and `right`, and neither matches the CSS most people write today.

It matches where CSS went. `padding-inline-start` and `border-start-start-radius` are the logical-property equivalents, and an emitter targeting them is doing a rename rather than a conditional. The same keys drive a correct right-to-left layout with no inversion step, which is the part a physical model cannot do at all — `paddingLeft` has to be reinterpreted per writing direction by every consumer, and each one has to get it right independently.

### Inline color

`ColorObject` is the DTCG color shape — a required `colorSpace` and `components` pair, optional `alpha`, and an optional six-digit `hex` fallback — and it is the canonical inline form a color resolves to. It replaced a hex string in that role.

This one is not a correction of a Figma bias. It is a correction of a *web* bias, which is what makes it the clearest evidence that the principle is standard-first rather than anti-Figma. Hex is sRGB only, so it cannot express the Display P3 and OKLCH colors Figma increasingly supports, and `#RRGGBBAA` puts alpha in a position the DTCG specification explicitly moves out of the hex form. The convenient shorthand was silently lossy against the source, so following the standard made the contract more portable and more accurate at once.

Hex did not disappear from output. It moved from being the contract's only form to one of nine the [`color`](/settings/color/) setting can emit.

## Flexibility

Neutrality governs what a field *means* and what it is *called*. It does not govern how a value is spelled on the way out, and several settings exist precisely so a workspace can match its own platform's conventions without the contract changing underneath it.

| Setting | Choices | Default |
|---|---|---|
| [`keys`](/settings/keys/) | `SAFE`, `CAMEL`, `SNAKE`, `KEBAB`, `PASCAL`, `TRAIN` | `CAMEL` |
| [`color`](/settings/color/) | `HEX`, `HEXA`, `RGB`, `RGBA`, `HSLA`, `HSB`, `OKLCH`, `OKLAB`, `OBJECT` | `HEXA` |
| [`format`](/settings/output-format/) | `YAML`, `JSON` | `YAML` |
| [`tokens`](/settings/tokens/) | Eight reference forms, including per-platform `FIGMA_SYNTAX_WEB`, `FIGMA_SYNTAX_IOS` and `FIGMA_SYNTAX_ANDROID` | `TOKEN` |

A team emitting for Android that wants snake-case keys, or a team on a wide-gamut design system that wants `OKLCH` strings, changes a setting rather than asking for a schema change. The defaults are themselves neutrality arguments: `CAMEL` because it is the casing every code consumer of a spec already uses, and `HEXA` because carrying alpha in the value means a translucent color survives a round trip rather than silently flattening.

`tokens` is the clearest case, because it carries platform-specific forms as named options. The default `TOKEN` is the neutral reference — a `$token` path with a `$type` — and a workspace that would rather have its tokens spelled the way its platform spells them can say so explicitly. Neutral by default, platform-specific on request, and the choice is recorded in the workspace's own settings rather than guessed at by the generator.

The line between the two is worth stating plainly, because it is the same line the schema draws everywhere. A setting changes the **form** of output and never its **meaning** — a different value produces different output, not incorrect output. Renaming `crossAxisAlignment` would change meaning for every consumer at once, so it is a contract decision and arrives through a decision record. Choosing `OKLCH` over `HEXA` changes only what your files look like, so it is yours to set.
