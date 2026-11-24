---
title: "OverriddenTypographyReference"
description: "A type token reference carrying the members that diverge from the referenced style"
---

A [`TokenReference`](/schema/token-reference/) to a text style, plus the members whose resolved value differs from the ones that style declares. It appears wherever `typography` does — on an element's `styles`, and on a slot's `contentStyles.$text`.

A text layer can carry a named text style and a locally replaced member at the same time, without the binding breaking. Applying a strikethrough to styled text is the case this form exists for: the layer keeps its text style, and the decoration is the local one. The two other forms of `typography` each lose half of that — a plain token reference drops the strikethrough, an inline [`Typography`](/schema/styles/typography/) composite drops the token.

## Members

### `$token`

The path to the referenced text style, as on `TokenReference`.

### `$type`

Always `typography`. It is the one token type whose value has members to override.

### `$extensions`

Optional vendor metadata, identical to [`TokenReference.$extensions`](/schema/token-reference/).

### `$overrides`

Required. A [`Typography`](/schema/styles/typography/) object holding only the members whose resolved value differs from the referenced style's.

It is required because an instance carrying no overrides is already a `TokenReference`. Were it optional, one value would satisfy two branches of the `typography` union, which fails validation rather than falling back to the simpler reading.

## What membership means

A member appears here **only where it diverges** from the referenced style, and a member agreeing with the style is omitted (DSPEC-82). So an entry's presence is the statement that the rendered text differs from its token — not merely that someone touched it.

A producer that cannot resolve the referenced style's own members writes the plain token reference instead. An absent `$overrides` therefore means *no divergence was found*, which is not quite the same as *there is none*.

A consumer resolves the token first and applies `$overrides` over it member by member: the override wins for the members it names, and the token stands for the rest (DSPEC-83).

## Example

```yaml
typography:
  $token: Type/Body/Default
  $type: typography
  $overrides:
    textDecoration: STRIKETHROUGH
```

## Which members can appear

Every member of `Typography` is admitted, with the type and value set it already has — a member valid inline is valid here.

Which of them an authoring tool actually permits to diverge is that tool's behaviour, not a rule of this contract, so the schema does not enumerate them. In Figma today the set is narrow: `textDecoration` is the only member of the composite that reaches it. The other text settings offered beside a bound style — alignment, truncation and max lines — are their own `Styles` properties, which the token never owned.

## Further Reading

- [ADR 128 — Overriding a Member of a Bound Typography Token](https://github.com/DirectedEdges/spectacular/blob/main/adr/128-text-decoration-override.md) — the shape, what membership asserts, and why the override does not ride in `$extensions`
