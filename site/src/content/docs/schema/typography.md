---
title: "Typography"
description: "Text style properties for font, spacing, and alignment"
---

A `Typography` object holds individual text style properties. It appears on the `typography` style property as an alternative to a [`TokenReference`](/schema/token-reference/) — when the text style is not backed by a single token, the individual properties are listed instead.

```ts
interface Typography {
  fontSize?: number | 'mixed' | TokenReference;
  fontFamily?: string | 'mixed' | TokenReference;
  fontStyle?: string | 'mixed' | TokenReference;
  lineHeight?: string | number | TokenReference;
  letterSpacing?: number | 'mixed' | TokenReference;
  textCase?: string | 'mixed' | TokenReference;
  textDecoration?: string | 'mixed' | TokenReference;
  paragraphIndent?: number | TokenReference;
  paragraphSpacing?: number | TokenReference;
  leadingTrim?: 'NONE' | 'CAP_HEIGHT' | 'mixed';
  listSpacing?: number | TokenReference;
  hangingPunctuation?: boolean | TokenReference;
  hangingList?: boolean | TokenReference;
}
```

## Properties

| Name | Default |
|------|---------|
| [`fontFamily`](/schema/typography/font-family/) | `null` |
| [`fontSize`](/schema/typography/font-size/) | `16` |
| [`fontStyle`](/schema/typography/font-style/) | `null` |
| [`hangingList`](/schema/typography/hanging-list/) | `false` |
| [`hangingPunctuation`](/schema/typography/hanging-punctuation/) | `false` |
| [`leadingTrim`](/schema/typography/leading-trim/) | `"NONE"` |
| [`letterSpacing`](/schema/typography/letter-spacing/) | `0` |
| [`lineHeight`](/schema/typography/line-height/) | `"AUTO"` |
| [`listSpacing`](/schema/typography/list-spacing/) | `0` |
| [`paragraphIndent`](/schema/typography/paragraph-indent/) | `0` |
| [`paragraphSpacing`](/schema/typography/paragraph-spacing/) | `0` |
| [`textCase`](/schema/typography/text-case/) | `"ORIGINAL"` |
| [`textDecoration`](/schema/typography/text-decoration/) | `"NONE"` |

## Values

| Name | Description | Example |
|------|-------------|---------|
| `number` | Literal numeric value | `16` |
| `string` | Literal string value | `"Inter"` |
| `boolean` | Literal boolean value | `true` |
| `'mixed'` | Multiple conflicting values within a single text node | `"mixed"` |
| [`TokenReference`](/schema/token-reference/) | Reference to a design token | `{ $token: "DS.Font.Size.400", $type: "dimension" }` |
| `'NONE' \| 'CAP_HEIGHT'` | Leading trim enum (for `leadingTrim` only) | `"CAP_HEIGHT"` |

## Example

```yaml
fontSize: 14
fontFamily: Inter
fontStyle: Medium
lineHeight: "150%"
letterSpacing: 0
```

## Further Reading

- [ADR 005 — Replace Typography Flat Properties with Composite](https://github.com/DirectedEdges/specs/blob/main/adr/005-typography-composite.md) — consolidates 14 flat typography keys into a single composite type
- [ADR 032 — Typography leadingTrim — Correct to String Enum](https://github.com/DirectedEdges/specs/blob/main/adr/032-typography-leading-trim-enum.md) — fixes `leadingTrim` to a string enum
- [ADR 033 — Typography fontFamily/fontStyle — Remove Number, Add TokenReference](https://github.com/DirectedEdges/specs/blob/main/adr/033-typography-font-token-reference.md) — adds token reference support to font properties
