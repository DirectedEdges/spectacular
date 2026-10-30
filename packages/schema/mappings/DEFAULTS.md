# Style defaults

**What a consumer assumes when a style key is absent from a document — draft.**

Normative frame: [`SPECIFICATION.md`](../SPECIFICATION.md) §11. Generated from
`mappings/bindings/_defaults.json`; edit that file, never this page.

This is **not** a per-platform concern. "An absent key means X" is a statement about the
document, and two platforms that answer differently disagree about what the same document
says.

## The problem

STYLE_DEFAULTS is declared only in specs-from-figma and is referenced nowhere in the spectacular repo. Until it lives in the contract, no consumer outside that package can interpret an omitted key correctly.

## Absence is ambiguous

Absence is ambiguous today. removeDefaults drops any style whose value is null, so an absent key may mean "equal to the default" OR "evaluated to null for a structural reason" — strokeAlign is forced null when no visible stroke exists, which is not the same as strokeAlign being INSIDE. A consumer cannot tell these apart from the document.

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
| `rotation` | `0` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `visible` | `true` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `opacity` | `1` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `locked` | `false` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `backgroundColor` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `backgroundImage` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `fillColor` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `textColor` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `effects` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `clipsContent` | `false` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `cornerRadius` | `0` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `width` | `0` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `height` | `0` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `minWidth` | `0` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `minHeight` | `0` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `maxWidth` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `maxHeight` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `position` | `"AUTO"` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `top` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `bottom` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `start` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `end` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `centerHorizontalOffset` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `centerVerticalOffset` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `layoutSizingHorizontal` | `"FIXED"` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `layoutSizingVertical` | `"FIXED"` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `strokes` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `strokeAlign` | `"INSIDE"` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `strokeWeight` | `0` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `strokeDashPattern` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `typography` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `textAlignHorizontal` | `"START"` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `textAlignVertical` | `"TOP"` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `textOverflow` | `"CLIP"` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `maxLines` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `mainAxisAlignment` | `"START"` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `primaryAxisSizingMode` | `"AUTO"` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `crossAxisAlignment` | `"START"` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `layoutMode` | `"NONE"` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `wrap` | `false` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `wrapAlignment` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `itemReverseZIndex` | `false` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `itemSpacing` | `0` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `padding` | `0` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `cornerSmoothing` | `0` | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
| `aspectRatio` | *apply nothing* | specs-from-figma/src/Component/Styles/defaults.ts (STYLE_DEFAULTS) |
