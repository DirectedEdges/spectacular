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

Current state: 11 bound, 35 unverified, of 46 style keys.

## Value forms

Every style value may be a literal, a TokenReference, a PropBinding, or a Conditional. A binding must say what it does with each.

| Form | Disposition |
|---|---|
| Literal | bound |
| `TokenReference` | bound — resolves the Figma variable; falls back to $extensions[com.figma].rawValue where the variable is unavailable |
| `PropBinding` | unverified |
| `Conditional` | unverified |

## Styles

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
| `width` | **unverified** | — | all |  |
| `height` | **unverified** | — | component, frame, slot, instance, text, vector, ellipse, star, polygon, rectangle, glyph |  |
| `minWidth` | **unverified** | — | all |  |
| `minHeight` | **unverified** | — | all |  |
| `maxWidth` | **unverified** | — | all |  |
| `maxHeight` | **unverified** | — | all |  |
| `position` | **unverified** | — | all |  |
| `top` | **unverified** | — | all |  |
| `bottom` | **unverified** | — | all |  |
| `start` | **unverified** | — | all |  |
| `end` | **unverified** | — | all |  |
| `centerHorizontalOffset` | **unverified** | — | all |  |
| `centerVerticalOffset` | **unverified** | — | all |  |
| `layoutSizingHorizontal` | **unverified** | — | all |  |
| `layoutSizingVertical` | **unverified** | — | all |  |
| `strokes` | **unverified** | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line |  |
| `strokeAlign` | **unverified** | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line |  |
| `strokeWeight` | **unverified** | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line |  |
| `strokeDashPattern` | **unverified** | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line |  |
| `typography` | bound | `Typography.apply` | text | Accepts Typography or TokenReference. A font that fails to load degrades to Inter Regular with a warning, never aborts. |
| `textAlignHorizontal` | **unverified** | — | text |  |
| `textAlignVertical` | **unverified** | — | text |  |
| `textOverflow` | **unverified** | — | text |  |
| `maxLines` | bound | `node.maxLines` | text | Deferred to last — honoured only while textTruncation is ENDING, so textOverflow must land first. |
| `mainAxisAlignment` | **unverified** | — | component, frame, slot |  |
| `primaryAxisSizingMode` | bound | `node.primaryAxisSizingMode` | component, frame, slot | Deferred after layoutSizingHorizontal/Vertical, which themselves write it — the shorthand would otherwise clobber the explicit primitive. |
| `crossAxisAlignment` | **unverified** | — | component, frame, slot |  |
| `layoutMode` | **unverified** | — | component, frame, slot |  |
| `wrap` | **unverified** | — | component, frame, slot |  |
| `wrapAlignment` | **unverified** | — | component, frame, slot |  |
| `itemReverseZIndex` | bound | `node.itemReverseZIndex` | component, frame, slot | Auto-layout only — a frame with no layoutMode has nothing to reverse. layoutMode is structural and applied first. |
| `itemSpacing` | **unverified** | — | component, frame, slot |  |
| `padding` | **unverified** | — | component, frame, slot |  |
| `cornerSmoothing` | bound | `CornerStyle.applySmoothing` | component, frame, slot, vector, ellipse, star, polygon, rectangle | Skipped on TEXT nodes. |
| `aspectRatio` | bound | `node.targetAspectRatio` | component, frame, slot, text, vector, ellipse, star, polygon, rectangle, glyph | Deferred to last — the lock reads the node final dimensions, so an earlier resize would be clobbered by later sizing keys. |

## Concepts not yet bound

Props, anatomy and elements, and layout have no declared binding yet. They are named
here so their absence is visible rather than implied:

| Concept | State |
|---|---|
| Props | not declared |
| Anatomy and elements | not declared |
| Layout | not declared |
