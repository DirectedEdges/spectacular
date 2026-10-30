# Style defaults

**What a consumer assumes when a style key is absent from a document — draft.**

Normative frame: [`SPECIFICATION.md`](../SPECIFICATION.md) §11. Generated from
`mappings/bindings/_defaults.json`; edit that file, never this page.

This is **not** a per-platform concern. "An absent key means X" is a statement about the
document, and two platforms that answer differently disagree about what the same document
says.

## The problem

Resolved by ADR-113: every Styles property declares a default, so the schema answers what an absent key means. STYLE_DEFAULTS in specs-from-figma is no longer an authority and should be derived from or asserted against the schema.

## Absence is ambiguous



A key can be absent for at least three reasons, and a consumer reading one document cannot
tell them apart:

| Reason | Recoverable by a consumer? |
|---|---|
| The value equalled a default and was dropped at generation | No — needs the table below |
| A variant inherits it from `default` under layering | Partly — by reading `default`, if it knows the run used layered details |
| The element type cannot carry it | No — needs the per-element-type key table, which ships in no published artefact |

Nothing in a serialized document marks which applies. There is no sentinel, no metadata
member, no `$extensions` marker.

## Defaults

All 46 keys have a declared default.

| Style key | Assumed when absent | Declared by |
|---|---|---|
| `rotation` | `0` | schema/styles.schema.json#/definitions/Styles/properties/rotation (default) |
| `visible` | `true` | schema/styles.schema.json#/definitions/Styles/properties/visible (default) |
| `opacity` | `1` | schema/styles.schema.json#/definitions/Styles/properties/opacity (default) |
| `locked` | `false` | schema/styles.schema.json#/definitions/Styles/properties/locked (default) |
| `backgroundColor` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/backgroundColor (default) |
| `backgroundImage` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/backgroundImage (default) |
| `fillColor` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/fillColor (default) |
| `textColor` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/textColor (default) |
| `effects` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/effects (default) |
| `clipsContent` | `false` | schema/styles.schema.json#/definitions/Styles/properties/clipsContent (default) |
| `cornerRadius` | `0` | schema/styles.schema.json#/definitions/Styles/properties/cornerRadius (default) |
| `width` | `0` | schema/styles.schema.json#/definitions/Styles/properties/width (default) |
| `height` | `0` | schema/styles.schema.json#/definitions/Styles/properties/height (default) |
| `minWidth` | `0` | schema/styles.schema.json#/definitions/Styles/properties/minWidth (default) |
| `minHeight` | `0` | schema/styles.schema.json#/definitions/Styles/properties/minHeight (default) |
| `maxWidth` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/maxWidth (default) |
| `maxHeight` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/maxHeight (default) |
| `position` | `"AUTO"` | schema/styles.schema.json#/definitions/Styles/properties/position (default) |
| `top` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/top (default) |
| `bottom` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/bottom (default) |
| `start` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/start (default) |
| `end` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/end (default) |
| `centerHorizontalOffset` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/centerHorizontalOffset (default) |
| `centerVerticalOffset` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/centerVerticalOffset (default) |
| `layoutSizingHorizontal` | `"FIXED"` | schema/styles.schema.json#/definitions/Styles/properties/layoutSizingHorizontal (default) |
| `layoutSizingVertical` | `"FIXED"` | schema/styles.schema.json#/definitions/Styles/properties/layoutSizingVertical (default) |
| `strokes` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/strokes (default) |
| `strokeAlign` | `"INSIDE"` | schema/styles.schema.json#/definitions/Styles/properties/strokeAlign (default) |
| `strokeWeight` | `0` | schema/styles.schema.json#/definitions/Styles/properties/strokeWeight (default) |
| `strokeDashPattern` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/strokeDashPattern (default) |
| `typography` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/typography (default) |
| `textAlignHorizontal` | `"START"` | schema/styles.schema.json#/definitions/Styles/properties/textAlignHorizontal (default) |
| `textAlignVertical` | `"TOP"` | schema/styles.schema.json#/definitions/Styles/properties/textAlignVertical (default) |
| `textOverflow` | `"CLIP"` | schema/styles.schema.json#/definitions/Styles/properties/textOverflow (default) |
| `maxLines` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/maxLines (default) |
| `mainAxisAlignment` | `"START"` | schema/styles.schema.json#/definitions/Styles/properties/mainAxisAlignment (default) |
| `primaryAxisSizingMode` | `"AUTO"` | schema/styles.schema.json#/definitions/Styles/properties/primaryAxisSizingMode (default) |
| `crossAxisAlignment` | `"START"` | schema/styles.schema.json#/definitions/Styles/properties/crossAxisAlignment (default) |
| `layoutMode` | `"NONE"` | schema/styles.schema.json#/definitions/Styles/properties/layoutMode (default) |
| `wrap` | `false` | schema/styles.schema.json#/definitions/Styles/properties/wrap (default) |
| `wrapAlignment` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/wrapAlignment (default) |
| `itemReverseZIndex` | `false` | schema/styles.schema.json#/definitions/Styles/properties/itemReverseZIndex (default) |
| `itemSpacing` | `0` | schema/styles.schema.json#/definitions/Styles/properties/itemSpacing (default) |
| `padding` | `0` | schema/styles.schema.json#/definitions/Styles/properties/padding (default) |
| `cornerSmoothing` | `0` | schema/styles.schema.json#/definitions/Styles/properties/cornerSmoothing (default) |
| `aspectRatio` | *apply nothing* | schema/styles.schema.json#/definitions/Styles/properties/aspectRatio (default) |
