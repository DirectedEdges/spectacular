# Figma binding

**Platform binding for the Specs document format — draft.**

Normative frame: [`SPECIFICATION.md`](../SPECIFICATION.md) §11. This document states how
the Figma binding realises the schema; it does not restate what the members mean —
that is the reference at `/schema`.

Generated from `mappings/bindings/figma.json` by `scripts/build-mappings.mjs`.
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

Current state: 26 bound, 20 unverified, of 46 style keys.

## Value forms

Every style value may be a literal, a TokenReference, a PropBinding, or a Conditional. A binding must say what it does with each.

| Form | Disposition |
|---|---|
| Literal | bound |
| `TokenReference` | bound — resolves the Figma variable; falls back to $extensions[com.figma].rawValue where the variable is unavailable |
| `PropBinding` | unverified |
| `Conditional` | unverified |

## Styles

A key whose row says *cluster* does not map on its own — see the cluster below. Writing a
per-key mapping for it would be false, not merely incomplete.

| Style key | Disposition | Figma target | Element types | Notes |
|---|---|---|---|---|
| `rotation` | bound | `node.rotation` | all | Degrees, written directly. |
| `visible` | **unverified** | — | all |  |
| `opacity` | bound | `node.opacity` | all | A TokenReference binds the variable; otherwise the raw number is written. |
| `locked` | bound | `node.locked` | all | Canvas interaction only — the Plugin API can still mutate a locked node, so it applies wherever it is reached, children included. |
| `backgroundColor` | **unverified** | — | component, frame, slot, rectangle |  |
| `backgroundImage` | **unverified** | — | component, frame, slot |  |
| `fillColor` | **unverified** | — | vector, ellipse, star, polygon, line, glyph |  |
| `textColor` | **unverified** | — | text |  |
| `effects` | bound | `Effects.apply` | component, frame, slot, text, vector, ellipse, star, polygon, rectangle, line, glyph | Accepts Effects, TokenReference, or null. |
| `clipsContent` | bound | `node.clipsContent` | component, frame, slot | Container types only; the key never reaches another type because no other key list admits it. |
| `cornerRadius` | **unverified** | — | component, frame, slot |  |
| `width` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `height` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | component, frame, slot, instance, text, vector, ellipse, star, polygon, rectangle, glyph |  |
| `minWidth` | **unverified** | — | all |  |
| `minHeight` | **unverified** | — | all |  |
| `maxWidth` | **unverified** | — | all |  |
| `maxHeight` | **unverified** | — | all |  |
| `position` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `top` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `bottom` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `start` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `end` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `centerHorizontalOffset` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `centerVerticalOffset` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `layoutSizingHorizontal` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `layoutSizingVertical` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `strokes` | **unverified** | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line |  |
| `strokeAlign` | **unverified** | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line |  |
| `strokeWeight` | **unverified** | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line |  |
| `strokeDashPattern` | **unverified** | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line |  |
| `typography` | bound | cluster [namedStyleVersusInline](#namedstyleversusinline) | text | Accepts Typography or TokenReference. A font that fails to load degrades to Inter Regular with a warning, never aborts. |
| `textAlignHorizontal` | **unverified** | — | text |  |
| `textAlignVertical` | **unverified** | — | text |  |
| `textOverflow` | **unverified** | — | text |  |
| `maxLines` | bound | `node.maxLines` | text | Deferred to last — honoured only while textTruncation is ENDING, so textOverflow must land first. |
| `mainAxisAlignment` | **unverified** | — | component, frame, slot |  |
| `primaryAxisSizingMode` | bound | `node.primaryAxisSizingMode` | component, frame, slot | Deferred after layoutSizingHorizontal/Vertical, which themselves write it — the shorthand would otherwise clobber the explicit primitive. |
| `crossAxisAlignment` | **unverified** | — | component, frame, slot |  |
| `layoutMode` | bound | cluster [wrapping](#wrapping) | component, frame, slot |  |
| `wrap` | bound | cluster [wrapping](#wrapping) | component, frame, slot |  |
| `wrapAlignment` | bound | cluster [wrapping](#wrapping) | component, frame, slot |  |
| `itemReverseZIndex` | bound | `node.itemReverseZIndex` | component, frame, slot | Auto-layout only — a frame with no layoutMode has nothing to reverse. layoutMode is structural and applied first. |
| `itemSpacing` | bound | cluster [wrapping](#wrapping) | component, frame, slot |  |
| `padding` | **unverified** | — | component, frame, slot |  |
| `cornerSmoothing` | bound | `CornerStyle.applySmoothing` | component, frame, slot, vector, ellipse, star, polygon, rectangle | Skipped on TEXT nodes. |
| `aspectRatio` | bound | `node.targetAspectRatio` | component, frame, slot, text, vector, ellipse, star, polygon, rectangle, glyph | Deferred to last — the lock reads the node final dimensions, so an earlier resize would be clobbered by later sizing keys. |

## Clusters

Keys that resolve jointly. No single key in a cluster determines any single output, so the
resolution rule is the mapping rather than a row in the table above.

### autoVsAbsoluteLayout

bound — keys: `position`, `top`, `bottom`, `start`, `end`, `centerHorizontalOffset`, `centerVerticalOffset`, `layoutSizingHorizontal`, `layoutSizingVertical`, `width`, `height`

**Outputs.** `node.layoutPositioning`, `node.x`, `node.y`, `node.constraints`, `node.layoutSizingHorizontal`, `node.layoutSizingVertical`

**Resolution.** On the READ side these keys are not read from single Figma properties at all. relateAutoVsAbsoluteLayout computes position, the four insets and the two centre offsets from node.constraints plus geometry and parent dimensions (ADR-041). width and height are nulled when the matching layoutSizing is HUG or FILL; layoutSizing is nulled for an absolutely positioned child.

**Partially present.** A STRETCH constraint emits both edges and suppresses the dimension. SCALE emits both edges as percentage strings.

**Stage.** `postEvaluate` — produced by a later pass, not read directly.

*specs-from-figma StylesProcessor.ts:108-274. These keys are POST-PROCESSED, not read — a binding presenting them as direct reads misleads anyone implementing a second time.*

### wrapping

bound — keys: `wrap`, `wrapAlignment`, `itemSpacing`, `layoutMode`

**Outputs.** `node.layoutWrap`, `node.counterAxisAlignContent`, `node.itemSpacing`, `node.counterAxisSpacing`

**Resolution.** wrapAlignment is REMOVED entirely when layoutWrap is not WRAP — a dead property otherwise. itemSpacing becomes a biaxial composite only when layoutMode is HORIZONTAL or VERTICAL and wrap is active, mapping Figma primary/counter axis onto absolute horizontal/vertical.

**Partially present.** With no auto-layout, wrap is forced false and mainAxisAlignment, crossAxisAlignment and wrapAlignment are forced null.

**Stage.** `postEvaluate` — produced by a later pass, not read directly.

*specs-from-figma StylesProcessor.ts:291-300; Style.ts:489-564; BiaxialComposite.ts:29-45*

### namedStyleVersusInline

bound — keys: `typography`

**Outputs.** `node.textStyleId`, `~13 inline text properties`

**Resolution.** A named Figma text style produces a style reference and REMOVES typography. With no named style, typography is re-injected from the unvaried baseline when the variant diff dropped it.

**Partially present.** Typography sub-fields are separately compared against their own TYPOGRAPHY_DEFAULTS constant, a second and distinct default source.

**Stage.** `postProcess` — produced by a later pass, not read directly.

*specs-from-figma StylesProcessor.ts relateTextStyleAndTextProperties; TypographyProcessor.ts:74-80*

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
