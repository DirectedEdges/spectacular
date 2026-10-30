# React binding

**Platform binding for the Specs document format — draft.**

Normative frame: [`SPECIFICATION.md`](../SPECIFICATION.md) §11. This document states how
the React binding realises the schema; it does not restate what the members mean —
that is the reference at `/schema`.

Generated from `mappings/bindings/react.json` by `scripts/build-mappings.mjs`.
Edit the binding file, never this page.

## Disposition

Every style key carries one of four dispositions:

| Disposition | Meaning |
|---|---|
| `bound` | Realised, and confirmed against the implementation |
| `approximated` | Realised with loss, and the loss is stated |
| `unsupported` | Declared as not realised, with the resulting behaviour stated |
| `unverified` | Coverage detected, mapping not yet confirmed by a human — **work, not a claim** |

A reader may rely on `bound`, `approximated` and `unsupported` rows. An `unverified`
row asserts nothing.

Current state: 46 unverified, of 46 style keys.

## Value forms

Every style value may be a literal, a TokenReference, a PropBinding, or a Conditional. A binding must say what it does with each.

| Form | Disposition |
|---|---|
| Literal | bound |
| `TokenReference` | bound — emitted per settings.spec.tokens; see code/style-mapping.md |
| `PropBinding` | unverified |
| `Conditional` | unverified |

## Styles

| Style key | Disposition | CSS module | Notes |
|---|---|---|---|
| `rotation` | **unverified** | `transform` |  |
| `visible` | **unverified** | `effects`, `layoutToCSS`, `visibility` |  |
| `opacity` | **unverified** | `opacity` |  |
| `locked` | **unverified** | — | No module literal matched — coverage not recoverable by scan; confirm by hand. |
| `backgroundColor` | **unverified** | `fills` |  |
| `backgroundImage` | **unverified** | — | No module literal matched — coverage not recoverable by scan; confirm by hand. |
| `fillColor` | **unverified** | `fills` |  |
| `textColor` | **unverified** | `fills` |  |
| `effects` | **unverified** | `effects` |  |
| `clipsContent` | **unverified** | `layoutToCSS`, `overflow`, `truncation` |  |
| `cornerRadius` | **unverified** | `cornerRadius` |  |
| `width` | **unverified** | `layoutToCSS`, `size` |  |
| `height` | **unverified** | `layoutToCSS`, `size` |  |
| `minWidth` | **unverified** | `size` |  |
| `minHeight` | **unverified** | `size` |  |
| `maxWidth` | **unverified** | `size` |  |
| `maxHeight` | **unverified** | `size` |  |
| `position` | **unverified** | `position`, `styleToCSS` |  |
| `top` | **unverified** | `position` |  |
| `bottom` | **unverified** | `position` |  |
| `start` | **unverified** | `position`, `textAlign` |  |
| `end` | **unverified** | `position`, `textAlign` |  |
| `centerHorizontalOffset` | **unverified** | `position` |  |
| `centerVerticalOffset` | **unverified** | `position` |  |
| `layoutSizingHorizontal` | **unverified** | `layoutToCSS` |  |
| `layoutSizingVertical` | **unverified** | `layoutToCSS` |  |
| `strokes` | **unverified** | `border`, `options` |  |
| `strokeAlign` | **unverified** | `border` |  |
| `strokeWeight` | **unverified** | `border` |  |
| `strokeDashPattern` | **unverified** | — | No module literal matched — coverage not recoverable by scan; confirm by hand. |
| `typography` | **unverified** | `typography` |  |
| `textAlignHorizontal` | **unverified** | `textAlign` |  |
| `textAlignVertical` | **unverified** | — | No module literal matched — coverage not recoverable by scan; confirm by hand. |
| `textOverflow` | **unverified** | `truncation` |  |
| `maxLines` | **unverified** | `layoutToCSS`, `truncation` |  |
| `mainAxisAlignment` | **unverified** | `layoutToCSS` |  |
| `primaryAxisSizingMode` | **unverified** | — | No module literal matched — coverage not recoverable by scan; confirm by hand. |
| `crossAxisAlignment` | **unverified** | `layoutToCSS` |  |
| `layoutMode` | **unverified** | `layoutToCSS` |  |
| `wrap` | **unverified** | `layoutToCSS` |  |
| `wrapAlignment` | **unverified** | `layoutToCSS` |  |
| `itemReverseZIndex` | **unverified** | — | No module literal matched — coverage not recoverable by scan; confirm by hand. |
| `itemSpacing` | **unverified** | `layoutToCSS` |  |
| `padding` | **unverified** | `padding` |  |
| `cornerSmoothing` | **unverified** | — | No module literal matched — coverage not recoverable by scan; confirm by hand. |
| `aspectRatio` | **unverified** | `aspectRatio` |  |

## Concepts not yet bound

Props, anatomy and elements, and layout have no declared binding yet. They are named
here so their absence is visible rather than implied:

| Concept | State |
|---|---|
| Props | not declared |
| Anatomy and elements | not declared |
| Layout | not declared |
