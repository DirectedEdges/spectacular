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

Current state: 23 bound, 23 unverified, of 46 style keys.

## Value forms

Every style value may be a literal, a TokenReference, a PropBinding, or a Conditional. A binding must say what it does with each.

| Form | Disposition |
|---|---|
| Literal | bound |
| `TokenReference` | bound — emitted per settings.spec.tokens; see code/style-mapping.md |
| `PropBinding` | unverified |
| `Conditional` | unverified |

## Styles

A key whose row says *cluster* does not map on its own — see the cluster below. Writing a
per-key mapping for it would be false, not merely incomplete.

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
| `width` | bound | cluster [intrinsicSize](#intrinsicsize) |  |
| `height` | bound | cluster [intrinsicSize](#intrinsicsize) |  |
| `minWidth` | **unverified** | `size` |  |
| `minHeight` | **unverified** | `size` |  |
| `maxWidth` | **unverified** | `size` |  |
| `maxHeight` | **unverified** | `size` |  |
| `position` | bound | cluster [absolutePositioning](#absolutepositioning) |  |
| `top` | bound | cluster [absolutePositioning](#absolutepositioning) |  |
| `bottom` | bound | cluster [absolutePositioning](#absolutepositioning) |  |
| `start` | bound | cluster [absolutePositioning](#absolutepositioning) |  |
| `end` | bound | cluster [absolutePositioning](#absolutepositioning) |  |
| `centerHorizontalOffset` | bound | cluster [absolutePositioning](#absolutepositioning) |  |
| `centerVerticalOffset` | bound | cluster [absolutePositioning](#absolutepositioning) |  |
| `layoutSizingHorizontal` | bound | cluster [autoLayoutSizing](#autolayoutsizing) |  |
| `layoutSizingVertical` | bound | cluster [autoLayoutSizing](#autolayoutsizing) |  |
| `strokes` | bound | cluster [strokeRendering](#strokerendering) |  |
| `strokeAlign` | bound | cluster [strokeRendering](#strokerendering) |  |
| `strokeWeight` | bound | cluster [strokeRendering](#strokerendering) |  |
| `strokeDashPattern` | **unverified** | — | No module literal matched — coverage not recoverable by scan; confirm by hand. |
| `typography` | **unverified** | `typography` |  |
| `textAlignHorizontal` | **unverified** | `textAlign` |  |
| `textAlignVertical` | **unverified** | — | No module literal matched — coverage not recoverable by scan; confirm by hand. |
| `textOverflow` | bound | cluster [textTruncation](#texttruncation) |  |
| `maxLines` | bound | cluster [textTruncation](#texttruncation) |  |
| `mainAxisAlignment` | bound | cluster [autoLayout](#autolayout) |  |
| `primaryAxisSizingMode` | **unverified** | — | No module literal matched — coverage not recoverable by scan; confirm by hand. |
| `crossAxisAlignment` | bound | cluster [autoLayout](#autolayout) |  |
| `layoutMode` | bound | cluster [autoLayout](#autolayout) |  |
| `wrap` | bound | cluster [autoLayout](#autolayout) |  |
| `wrapAlignment` | bound | cluster [autoLayout](#autolayout) |  |
| `itemReverseZIndex` | **unverified** | — | No module literal matched — coverage not recoverable by scan; confirm by hand. |
| `itemSpacing` | bound | cluster [autoLayout](#autolayout) |  |
| `padding` | **unverified** | `padding` |  |
| `cornerSmoothing` | **unverified** | — | No module literal matched — coverage not recoverable by scan; confirm by hand. |
| `aspectRatio` | bound | cluster [intrinsicSize](#intrinsicsize) |  |

## Clusters

Keys that resolve jointly. No single key in a cluster determines any single output, so the
resolution rule is the mapping rather than a row in the table above.

### autoLayout

bound — keys: `layoutMode`, `mainAxisAlignment`, `crossAxisAlignment`, `wrap`, `wrapAlignment`, `itemSpacing`

**Outputs.** `display`, `flex-direction`, `justify-content`, `align-items`, `flex-wrap`, `gap`, `column-gap`, `row-gap`

**Resolution.** layoutMode selects display:flex plus flex-direction; absent, the cluster emits nothing and the element stays in flow. mainAxisAlignment becomes justify-content and crossAxisAlignment becomes align-items — both meaningless without layoutMode.

**Partially present.** A non-negative itemSpacing emits gap. A NEGATIVE itemSpacing emits no gap at all: overlap is expressed as a negative margin on a sibling-combinator rule (`selector > * + *`) emitted by a different module entirely, so the declaration does not land on this element.

*css/style/layoutToCSS.ts:39-96; css/sheet/elementRules.ts:254-268*

### autoLayoutSizing

bound — keys: `layoutSizingHorizontal`, `layoutSizingVertical`

**Outputs.** `width: fit-content`, `height: fit-content`, `flex: 1 0 0`, `width: 100%`, `height: 100%`, `flex-shrink: 0`

**Resolution.** Resolved against facts about the PARENT, not this element: the parent layoutMode axis and the parent crossAxisAlignment. FILL emits flex:1 0 0 on the parent main axis, width/height:100% across it, and NOTHING when the parent cross-stretches. HUG emits fit-content unless the parent main axis already hugs.

**Partially present.** flex-shrink:0 is gated on whether layoutSizing OR the matching width/height is stated at all — three keys plus a default-block flag jointly decide one declaration. clipsContent and maxLines on this element suppress the HUG branch.

*css/style/layoutToCSS.ts:130-179. A per-key table cannot state this: the same key value yields three different outputs depending on the parent.*

### absolutePositioning

bound — keys: `position`, `top`, `bottom`, `start`, `end`, `centerHorizontalOffset`, `centerVerticalOffset`

**Outputs.** `position: absolute`, `position: static`, `inset-block-start`, `inset-block-end`, `inset-inline-start`, `inset-inline-end`, `translate`

**Resolution.** An explicit position wins outright. Absent, impliesAbsolute decides from inset presence plus the parent layoutMode: outside auto-layout any inset implies absolute; inside it, only a non-zero inset or two opposing anchors do — zero-only single anchors are canvas noise.

**Partially present.** An edge anchor on an axis cancels the centre offset for that same axis, because emitting both would put two values on one property. translate carries -50% only on the axes the centre offsets survived on.

*css/style/position.ts:4-27 (hasInsets, impliesAbsolute), 84-107 (centerDecls)*

### strokeRendering

bound — keys: `strokes`, `strokeAlign`, `strokeWeight`

**Outputs.** `border-color`, `border-style`, `border-width`, `outline-color`, `outline-style`, `outline-width`, `outline-offset`, `border-image: none`

**Resolution.** strokeWeight SHAPE decides the property family: a per-side object becomes border-*, a scalar or token becomes outline-*. A gradient stroke takes neither — it is painted by a separate pseudo-element rule.

**Partially present.** strokeAlign contributes no declaration of its own; it only flips the sign of outline-offset, and is skipped for OUTSIDE and CENTER.

*css/style/border.ts:51-53 (asOutline), 73-141. The same strokes value maps to a different CSS property depending on a sibling key shape.*

### intrinsicSize

bound — keys: `width`, `height`, `aspectRatio`

**Outputs.** `width`, `height`, `aspect-ratio`

**Resolution.** A stated aspectRatio suppresses the height declaration even though height is present in the document — the ratio derives it.

**Partially present.** minWidth/minHeight/maxWidth/maxHeight are independent and map one-to-one.

*css/style/size.ts:22-34*

### textTruncation

bound — keys: `textOverflow`, `maxLines`

**Outputs.** `white-space`, `overflow`, `text-overflow`, `display: -webkit-box`, `-webkit-box-orient`, `-webkit-line-clamp`, `line-clamp`

**Resolution.** A truth table, not a per-key mapping: maxLines of 1, more than 1, or absent, crossed with textOverflow ELLIPSIS, yields three structurally different declaration sets.

**Partially present.** maxLines above 1 switches the element to a -webkit-box, which changes its display and therefore interacts with the autoLayout cluster.

*css/style/truncation.ts:12-37*

## Absent keys

What a consumer assumes when a style key is **absent** is spec-level, not per-platform:
two platforms that answer differently disagree about what the same document says. It is
declared once, in [`bindings/_defaults.json`](bindings/_defaults.json), and summarised in
[`DEFAULTS.md`](DEFAULTS.md).

## Concepts not yet bound

Props, anatomy and elements, and layout have no declared binding yet. They are named
here so their absence is visible rather than implied:

| Concept | State |
|---|---|
| Props | not declared |
| Anatomy and elements | not declared |
| Layout | not declared |
