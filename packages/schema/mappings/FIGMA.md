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

Every style value may be a literal, a TokenReference, a PropBinding, or a Conditional. A disposition for a key means little without saying what happens to each form (DSPEC-42).

| Form | Disposition | Behaviour |
|---|---|---|
| Literal | bound | The ordinary case. |
| `TokenReference` | bound | Recognised by its `$token` key and resolved to a Figma variable. Where the variable cannot be resolved, the value falls back to the cached raw value the document carries, which is a degradation using only data the document holds (DSPEC-43). |
| `PropBinding` | bound *(not confirmed per key)* | A dedicated binding path parses `{ $binding: "#/props/NAME" }` and wires the corresponding Figma node field to the component property. |
| `Conditional` | bound *(not confirmed per key)* | The ADR-018 conditional form is implemented on the render path: the condition’s binding target is resolved dynamically and the then/else branch applied. This is the one platform that honours it. |

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
| `cornerRadius` | **unverified** | — | component, frame, rectangle, slot |  |
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

bound · figma-to-spec · **asserted**, not mechanically checked — keys: `position`, `top`, `bottom`, `start`, `end`, `centerHorizontalOffset`, `centerVerticalOffset`, `layoutSizingHorizontal`, `layoutSizingVertical`, `width`, `height`

**Operands.** Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `node.constraints.horizontal` | Figma node |
| `node.constraints.vertical` | Figma node |
| `node.position` | Figma node geometry |
| `node.dimension` | Figma node geometry |
| `parent.dimension` | Figma parent geometry |
| `parent.layoutMode` | Figma parent |
| `self.layoutSizing` | the axis-matching sizing key |
| `context.isRoot` | capture context |

**Cases** — ordered, first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `node.constraints` = `MIN` | the leading edge offset — `start` or `top` — set to the node position |  |
| 2 | `node.constraints` = `MAX` | the trailing edge offset — `end` or `bottom` — set to parent dimension less node position less node dimension |  |
| 3 | `node.constraints` = `CENTER` | `the matching centre offset, set to node position plus half the node dimension less half the parent dimension` |  |
| 4 | `node.constraints` = `STRETCH` | `both edge offsets on the axis`<br>`the axis dimension suppressed` | a stretched node is defined by its edges, not its size |
| 5 | `node.constraints` = `SCALE` | `both edge offsets on the axis, as percentage strings` |  |

**Otherwise.** *nothing* — a flow-placed child in auto-layout records no positioning offsets

**Stage.** `postEvaluate` — produced by a later pass, not read directly.

*Per axis. These keys are computed from constraints and geometry, never read from a single Figma property — a binding presenting them as direct reads misleads anyone implementing a second time. ADR-041 governs the constraint mapping.*

### wrapping

bound · figma-to-spec · **asserted**, not mechanically checked — keys: `wrap`, `wrapAlignment`, `itemSpacing`, `layoutMode`

**Operands.** Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `node.layoutMode` | Figma node |
| `node.layoutWrap` | Figma node |
| `node.itemSpacing` | Figma node |
| `node.counterAxisSpacing` | Figma node |

**Cases** — ordered, first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | (`node.layoutMode` absent **or** `node.layoutMode` = `NONE`) | `wrap` false<br>`mainAxisAlignment` null<br>`crossAxisAlignment` null<br>`wrapAlignment` null | none of them mean anything without auto-layout |
| 2 | `node.layoutWrap` ≠ `WRAP` | `wrapAlignment` removed entirely | a dead property otherwise — removed, not nulled |
| 3 | (`node.layoutMode` = `HORIZONTAL` **or** `node.layoutMode` = `VERTICAL`) **and** `node.layoutWrap` = `WRAP` | `itemSpacing` as a biaxial composite, mapping the Figma primary and counter axes onto absolute horizontal and vertical |  |
| 4 | `node.itemSpacing` present | `itemSpacing` as a scalar |  |

**Otherwise.** *nothing*

**Stage.** `postEvaluate` — produced by a later pass, not read directly.

*A property that cannot apply is removed rather than recorded as null, so a reader never sees a dead key.*

### namedStyleVersusInline

bound · figma-to-spec · **asserted**, not mechanically checked — keys: `typography`

**Operands.** Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `node.textStyleId` | Figma node |
| `baseline.typography` | the unvaried baseline for this element |

**Cases** — ordered, first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `node.textStyleId` present | `a style reference`<br>`typography` removed | the named style is the source; resolved values beside it would be a second copy |
| 2 | `node.textStyleId` absent **and** `self.typography` absent **and** `baseline.typography` present | `typography` re-injected from the baseline | a variant diff dropped it, but with no named style the values are the only record |
| 3 | `node.textStyleId` absent | `typography` as resolved values |  |

**Otherwise.** *nothing*

**Stage.** `postProcess` — produced by a later pass, not read directly.

*A named text style and inline typography are mutually exclusive in a document: one is a reference, the other is the resolved values. Typography sub-fields are additionally compared against their own defaults, a second and distinct default source from the style keys.*

## Absent keys

What an absent style key **means** is spec-level, not per-platform: two platforms that
answer differently disagree about what the same document says. It is declared once in the
schema and summarised in [`DEFAULTS.md`](DEFAULTS.md).

What this platform **does** on absence is its own fact, and is recorded per key below.
A key whose behaviour is not `declaredDefault` disagrees with the contract — visibly,
and as a decision rather than an accident.

| Behaviour | Keys | Meaning |
|---|---|---|
| `unverified` | 46 | Nobody has established what this platform does when the key is absent. |



## Concepts not yet bound

Props, anatomy and elements, and layout have no declared binding yet. They are named
here so their absence is visible rather than implied:

| Concept | State |
|---|---|
| Props | not declared |
| Anatomy and elements | not declared |
| Layout | not declared |
