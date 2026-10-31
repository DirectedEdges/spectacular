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

Current state: 37 bound, 9 approximated, of 46 style keys.

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
| `visible` | bound | — | all | Sets `node.visible` from a boolean. A `$binding` value is skipped by an earlier guard, and the conditional form is deferred to the paired-visibility feature — both are declared at the value-form level. |
| `opacity` | bound | `node.opacity` | all | A TokenReference binds the variable; otherwise the raw number is written. |
| `locked` | bound | `node.locked` | all | Canvas interaction only — the Plugin API can still mutate a locked node, so it applies wherever it is reached, children included. |
| `backgroundColor` | approximated | — | component, frame, slot, rectangle | Resolves in four steps — gradient, resolved style, bound variable, cached raw value — and writes a single solid paint. A token with neither a resolvable variable nor a cached raw value is skipped with a warning, which is the degradation DSPEC-43 permits. Loss: `colorSpace` is never read, so components are taken as sRGB regardless; a `none` component becomes 0; components beyond the third are dropped. Never applied to a text node. |
| `backgroundImage` | approximated | — | component, frame, slot | Appends an image paint rather than replacing existing fills. Loss: `objectFit` is binary — `CONTAIN` becomes Figma's FIT and everything else, including absent, becomes FILL. An image whose hash does not resolve is dropped with no warning. Container types only. |
| `fillColor` | approximated | — | vector, ellipse, star, polygon, line, glyph | A gradient takes its own path; otherwise the same four-step paint resolution. On an instance the target is the first fillable descendant, found by walking the subtree. Loss: the colour-space issue above, and an instance with no fillable descendant drops the value silently. |
| `textColor` | approximated | — | text | Text nodes only, using the same four-step paint resolution. Loss: the colour-space issue above. |
| `effects` | bound | `Effects.apply` | component, frame, slot, text, vector, ellipse, star, polygon, rectangle, line, glyph | Accepts Effects, TokenReference, or null. |
| `clipsContent` | bound | `node.clipsContent` | component, frame, slot | Container types only; the key never reaches another type because no other key list admits it. |
| `cornerRadius` | bound | — | component, frame, rectangle, slot | A uniform value sets the node radius; a token also binds the variable to all four corner fields; a per-corner object expands to Figma's physical corner properties. Not applied to a text node. |
| `width` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `height` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | component, frame, slot, instance, text, vector, ellipse, star, polygon, rectangle, glyph |  |
| `minWidth` | approximated | — | all | Loss: a value of 0 is written as `null`, because the Plugin API rejects zero for a minimum. An explicit zero minimum and an absent one are therefore indistinguishable on the canvas. Skipped on text nodes. |
| `minHeight` | approximated | — | all | Same zero-to-null remap as `minWidth`, for the same API reason. |
| `maxWidth` | bound | — | all | Written as resolved. Zero is preserved, because a maximum of zero is a real if unusual constraint and the API accepts it. Skipped on text nodes. |
| `maxHeight` | bound | — | all | Written as resolved, preserving zero, as `maxWidth`. |
| `position` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `top` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `bottom` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `start` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `end` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `centerHorizontalOffset` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `centerVerticalOffset` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `layoutSizingHorizontal` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `layoutSizingVertical` | bound | cluster [autoVsAbsoluteLayout](#autovsabsolutelayout) | all |  |
| `strokes` | approximated | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line | The same four-step paint resolution, written to the node's strokes. Loss: the colour-space issue above. Never applied to a text node, and absent from an instance's key list. |
| `strokeAlign` | bound | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line | Passed through unchanged. The schema types this as an open string rather than an enum, so there is no mapping to lose. A `null` is skipped rather than resetting the node's current alignment. |
| `strokeWeight` | bound | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line | A number sets the weight; a token also binds the variable to all four per-side fields; a per-side object expands to Figma's physical stroke-weight properties. |
| `strokeDashPattern` | bound | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line | The schema's `{ dash, gap }` becomes Figma's two-element dash array, which is exactly what the property takes. The schema permits no longer pattern — both members are required and no others are allowed — so nothing is truncated. |
| `typography` | bound | cluster [namedStyleVersusInline](#namedstyleversusinline) | text | Accepts Typography or TokenReference. A font that fails to load degrades to Inter Regular with a warning, never aborts. |
| `textAlignHorizontal` | bound | — | text | Inverts the capture mapping: the schema's logical `START`, `CENTER`, `END` and `JUSTIFY` become Figma's physical `LEFT`, `CENTER`, `RIGHT` and `JUSTIFIED`. All four schema values are covered, so the fallback is unreachable for valid input. Requires the node's font to be loaded first. |
| `textAlignVertical` | bound | — | text | Passed through unchanged. The schema types this as an open string, and Figma's own values match, so the identity mapping loses nothing. Text nodes only. |
| `textOverflow` | bound | — | text | Remaps the schema's two values to Figma's truncation vocabulary: `ELLIPSIS` becomes ENDING and `CLIP` becomes DISABLED. Both schema values are covered. Ordering matters — `maxLines` is honoured only while truncation is ENDING, so it is deliberately applied after this key. |
| `maxLines` | bound | `node.maxLines` | text | Deferred to last — honoured only while textTruncation is ENDING, so textOverflow must land first. |
| `mainAxisAlignment` | bound | — | component, frame, slot | Remaps all four schema values to Figma's primary-axis vocabulary. Gated on the node actually having the property, which effectively means an auto-layout container. |
| `primaryAxisSizingMode` | bound | `node.primaryAxisSizingMode` | component, frame, slot | Deferred after layoutSizingHorizontal/Vertical, which themselves write it — the shorthand would otherwise clobber the explicit primitive. |
| `crossAxisAlignment` | approximated | — | component, frame, slot | Remaps `START`, `END`, `CENTER` and `BASELINE`. Loss: `STRETCH` is a schema value Figma's counter-axis property cannot express, and it is skipped with a warning — a declared degradation that applies nothing and says so, which is exactly what DSPEC-43 asks for. |
| `layoutMode` | bound | cluster [wrapping](#wrapping) | component, frame, slot |  |
| `wrap` | bound | cluster [wrapping](#wrapping) | component, frame, slot |  |
| `wrapAlignment` | bound | cluster [wrapping](#wrapping) | component, frame, slot |  |
| `itemReverseZIndex` | bound | `node.itemReverseZIndex` | component, frame, slot | Auto-layout only — a frame with no layoutMode has nothing to reverse. layoutMode is structural and applied first. |
| `itemSpacing` | bound | cluster [wrapping](#wrapping) | component, frame, slot |  |
| `padding` | approximated | — | component, frame, slot | A uniform value or token sets all four sides; a per-side object expands to Figma's physical padding properties. Loss: `start` always becomes the left padding and `end` the right, with no writing-direction branch, so a right-to-left context renders mirrored. A side omitted from the object is left at its current value rather than reset. |
| `cornerSmoothing` | bound | `CornerStyle.applySmoothing` | component, frame, slot, vector, ellipse, star, polygon, rectangle | Skipped on TEXT nodes. |
| `aspectRatio` | bound | `node.targetAspectRatio` | component, frame, slot, text, vector, ellipse, star, polygon, rectangle, glyph | Deferred to last — the lock reads the node final dimensions, so an earlier resize would be clobbered by later sizing keys. |

## Needs a decision

What this platform does is settled and stated above. What it *should* do, where a loss is real and its acceptability is a product question, is not a specification's call to make alone. 8 of 46 keys raise one of 4.

#### A non-sRGB ColorObject renders as if it were sRGB

Affects `backgroundColor`, `fillColor`, `textColor`, `strokes`.

The schema admits 14 colour spaces — `oklch`, `display-p3`, `lab` among them — and the render path never reads `colorSpace`. It takes components 0 through 2 as red, green and blue. An `oklch` colour therefore renders wrong rather than degraded, and a `none` component becomes 0. Three ways this could go: reject a non-sRGB ColorObject at validation so it cannot reach a renderer; convert to sRGB at render, which needs a colour-conversion dependency; or declare sRGB the only supported space and say so in the schema, narrowing `colorSpace` to match. The third is the cheapest and the most honest about what is implemented.

#### An unresolved reference produces partial output, silently

Affects `backgroundImage`.

Several paths emit some of a value when part of it cannot be resolved, with no warning. CSS emits background position, repeat and size for an image whose registry entry is missing — a background-image with no image. A gradient with fewer than two resolvable stops is dropped whole. A padding side that fails to resolve is omitted while its siblings emit. Figma drops an image whose hash does not resolve. DSPEC-43 already says a degradation applies the spec own fallback or applies nothing and warns; these apply something and stay quiet, which is the one behaviour it rules out.

#### Zero is not distinguishable from unset

Affects `minWidth`, `minHeight`.

Both platforms treat a dimension of 0 as "no constraint" rather than "a constraint of zero". Figma must: its API rejects 0 for a minimum and requires null. CSS chooses to: the emitter suppresses any resolved value of `0`. So a spec stating an explicit zero minimum cannot be expressed on either platform, and `maxWidth: 0` — which the schema permits and Figma accepts — is dropped by CSS. Either accept that zero means unset and say so in the schema, or keep the distinction and have CSS emit it.

#### Logical sides become physical without a direction

Affects `padding`.

The schema uses `start` and `end` precisely so a document is direction-agnostic. The Figma render maps `start` to `paddingLeft` and `end` to `paddingRight` with no writing-direction branch, so a right-to-left context renders mirrored. CSS gets this right by emitting `padding-block` and `padding-inline` and deliberately avoiding the four-value shorthand. Either Figma gains a direction-aware mapping, or the binding states that Figma output is left-to-right only.

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
