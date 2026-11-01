# Figma binding

**Platform binding for the Specs document format — draft.**

Normative frame: [`SPECIFICATION.md`](../SPECIFICATION.md) §11. This document states how
the Figma binding realises the schema; it does not restate what the members mean —
that is the reference at `/schema`.

Generated from `mappings/bindings/figma.json` by `scripts/build-mappings.mjs`.
Edit the binding file, never this page.

## Styles

37 bound, 9 approximated, of 46 style keys.

A key whose row says *cluster* does not map on its own — its rule is a case table on the
cluster's own page. Writing a per-key mapping for it would be false, not merely incomplete.

| Disposition | Keys | Meaning |
|---|---|---|
| `bound` | 37 | Realised, and confirmed against the implementation |
| `approximated` | 9 | Realised with loss, and the loss is stated |

Every row below is a claim a reader may rely on.

| Style key | Disposition | Figma target | Element types | Notes |
|---|---|---|---|---|
| `aspectRatio` | bound | `node.targetAspectRatio` | component, frame, slot, text, vector, ellipse, star, polygon, rectangle, glyph | Deferred to last — the lock reads the node final dimensions, so an earlier resize would be clobbered by later sizing keys. |
| `backgroundColor` | approximated | — | component, frame, slot, rectangle | Resolves in four steps — gradient, resolved style, bound variable, cached raw value — and writes a single solid paint. A token with neither a resolvable variable nor a cached raw value is skipped with a warning, which is the degradation DSPEC-43 permits. Loss: `colorSpace` is never read, so components are taken as sRGB regardless; a `none` component becomes 0; components beyond the third are dropped. Never applied to a text node. |
| `backgroundImage` | approximated | — | component, frame, slot | Appends an image paint rather than replacing existing fills. Loss: `objectFit` is binary — `CONTAIN` becomes Figma's FIT and everything else, including absent, becomes FILL. An image whose hash does not resolve is dropped with no warning. Container types only. |
| `bottom` | bound | cluster [autoVsAbsoluteLayout](clusters/figma/auto-vs-absolute-layout.md) | all |  |
| `centerHorizontalOffset` | bound | cluster [autoVsAbsoluteLayout](clusters/figma/auto-vs-absolute-layout.md) | all |  |
| `centerVerticalOffset` | bound | cluster [autoVsAbsoluteLayout](clusters/figma/auto-vs-absolute-layout.md) | all |  |
| `clipsContent` | bound | `node.clipsContent` | component, frame, slot | Container types only; the key never reaches another type because no other key list admits it. |
| `cornerRadius` | bound | — | component, frame, rectangle, slot | A uniform value sets the node radius; a token also binds the variable to all four corner fields; a per-corner object expands to Figma's physical corner properties. Not applied to a text node. |
| `cornerSmoothing` | bound | `CornerStyle.applySmoothing` | component, frame, slot, vector, ellipse, star, polygon, rectangle | Skipped on TEXT nodes. |
| `crossAxisAlignment` | approximated | — | component, frame, slot | Remaps `START`, `END`, `CENTER` and `BASELINE`. Loss: `STRETCH` is a schema value Figma's counter-axis property cannot express, and it is skipped with a warning — a declared degradation that applies nothing and says so, which is exactly what DSPEC-43 asks for. |
| `effects` | bound | `Effects.apply` | component, frame, slot, text, vector, ellipse, star, polygon, rectangle, line, glyph | Accepts Effects, TokenReference, or null. |
| `end` | bound | cluster [autoVsAbsoluteLayout](clusters/figma/auto-vs-absolute-layout.md) | all |  |
| `fillColor` | approximated | — | vector, ellipse, star, polygon, line, glyph | A gradient takes its own path; otherwise the same four-step paint resolution. On an instance the target is the first fillable descendant, found by walking the subtree. Loss: the colour-space issue above, and an instance with no fillable descendant drops the value silently. |
| `height` | bound | cluster [autoVsAbsoluteLayout](clusters/figma/auto-vs-absolute-layout.md) | component, frame, slot, instance, text, vector, ellipse, star, polygon, rectangle, glyph |  |
| `itemReverseZIndex` | bound | `node.itemReverseZIndex` | component, frame, slot | Auto-layout only — a frame with no layoutMode has nothing to reverse. layoutMode is structural and applied first. |
| `itemSpacing` | bound | cluster [wrapping](clusters/figma/wrapping.md) | component, frame, slot |  |
| `layoutMode` | bound | cluster [wrapping](clusters/figma/wrapping.md) | component, frame, slot |  |
| `layoutSizingHorizontal` | bound | cluster [autoVsAbsoluteLayout](clusters/figma/auto-vs-absolute-layout.md) | all |  |
| `layoutSizingVertical` | bound | cluster [autoVsAbsoluteLayout](clusters/figma/auto-vs-absolute-layout.md) | all |  |
| `locked` | bound | `node.locked` | all | Canvas interaction only — the Plugin API can still mutate a locked node, so it applies wherever it is reached, children included. |
| `mainAxisAlignment` | bound | — | component, frame, slot | Remaps all four schema values to Figma's primary-axis vocabulary. Gated on the node actually having the property, which effectively means an auto-layout container. |
| `maxHeight` | bound | — | all | Written as resolved, preserving zero, as `maxWidth`. |
| `maxLines` | bound | `node.maxLines` | text | Deferred to last — honoured only while textTruncation is ENDING, so textOverflow must land first. |
| `maxWidth` | bound | — | all | Written as resolved. Zero is preserved, because a maximum of zero is a real if unusual constraint and the API accepts it. Skipped on text nodes. |
| `minHeight` | approximated | — | all | Same zero-to-null remap as `minWidth`, for the same API reason. |
| `minWidth` | approximated | — | all | Loss: a value of 0 is written as `null`, because the Plugin API rejects zero for a minimum. An explicit zero minimum and an absent one are therefore indistinguishable on the canvas. Skipped on text nodes. |
| `opacity` | bound | `node.opacity` | all | A TokenReference binds the variable; otherwise the raw number is written. |
| `padding` | approximated | — | component, frame, slot | A uniform value or token sets all four sides; a per-side object expands to Figma's physical padding properties. Loss: `start` always becomes the left padding and `end` the right, with no writing-direction branch, so a right-to-left context renders mirrored. A side omitted from the object is left at its current value rather than reset. |
| `position` | bound | cluster [autoVsAbsoluteLayout](clusters/figma/auto-vs-absolute-layout.md) | all |  |
| `primaryAxisSizingMode` | bound | `node.primaryAxisSizingMode` | component, frame, slot | Deferred after layoutSizingHorizontal/Vertical, which themselves write it — the shorthand would otherwise clobber the explicit primitive. |
| `rotation` | bound | `node.rotation` | all | Degrees, written directly. |
| `start` | bound | cluster [autoVsAbsoluteLayout](clusters/figma/auto-vs-absolute-layout.md) | all |  |
| `strokeAlign` | bound | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line | Passed through unchanged. The schema types this as an open string rather than an enum, so there is no mapping to lose. A `null` is skipped rather than resetting the node's current alignment. |
| `strokeDashPattern` | bound | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line | The schema's `{ dash, gap }` becomes Figma's two-element dash array, which is exactly what the property takes. The schema permits no longer pattern — both members are required and no others are allowed — so nothing is truncated. |
| `strokeWeight` | bound | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line | A number sets the weight; a token also binds the variable to all four per-side fields; a per-side object expands to Figma's physical stroke-weight properties. |
| `strokes` | approximated | — | component, frame, slot, vector, ellipse, star, polygon, rectangle, line | The same four-step paint resolution, written to the node's strokes. Loss: the colour-space issue above. Never applied to a text node, and absent from an instance's key list. |
| `textAlignHorizontal` | bound | — | text | Inverts the capture mapping: the schema's logical `START`, `CENTER`, `END` and `JUSTIFY` become Figma's physical `LEFT`, `CENTER`, `RIGHT` and `JUSTIFIED`. All four schema values are covered, so the fallback is unreachable for valid input. Requires the node's font to be loaded first. |
| `textAlignVertical` | bound | — | text | Passed through unchanged. The schema types this as an open string, and Figma's own values match, so the identity mapping loses nothing. Text nodes only. |
| `textColor` | approximated | — | text | Text nodes only, using the same four-step paint resolution. Loss: the colour-space issue above. |
| `textOverflow` | bound | — | text | Remaps the schema's two values to Figma's truncation vocabulary: `ELLIPSIS` becomes ENDING and `CLIP` becomes DISABLED. Both schema values are covered. Ordering matters — `maxLines` is honoured only while truncation is ENDING, so it is deliberately applied after this key. |
| `top` | bound | cluster [autoVsAbsoluteLayout](clusters/figma/auto-vs-absolute-layout.md) | all |  |
| `typography` | bound | cluster [namedStyleVersusInline](clusters/figma/named-style-versus-inline.md) | text | Accepts Typography or TokenReference. A font that fails to load degrades to Inter Regular with a warning, never aborts. |
| `visible` | bound | — | all | Sets `node.visible` from a boolean. A `$binding` value is skipped by an earlier guard, and the conditional form is deferred to the paired-visibility feature — both are declared at the value-form level. |
| `width` | bound | cluster [autoVsAbsoluteLayout](clusters/figma/auto-vs-absolute-layout.md) | all |  |
| `wrap` | bound | cluster [wrapping](clusters/figma/wrapping.md) | component, frame, slot |  |
| `wrapAlignment` | bound | cluster [wrapping](clusters/figma/wrapping.md) | component, frame, slot |  |

## Values

Every style value may be a literal, a TokenReference, a PropBinding, or a Conditional. A disposition for a key means little without saying what happens to each form (DSPEC-42).

| Form | Disposition | Behaviour |
|---|---|---|
| Literal | bound | The ordinary case. |
| `TokenReference` | bound | Recognised by its `$token` key and resolved to a Figma variable. Where the variable cannot be resolved, the value falls back to the cached raw value the document carries, which is a degradation using only data the document holds (DSPEC-43). |
| `PropBinding` | bound *(not confirmed per key)* | A dedicated binding path parses `{ $binding: "#/props/NAME" }` and wires the corresponding Figma node field to the component property. |
| `Conditional` | bound *(not confirmed per key)* | The ADR-018 conditional form is implemented on the render path: the condition’s binding target is resolved dynamically and the then/else branch applied. This is the one platform that honours it. |

## Defaults

What an absent style key **means** is spec-level, not per-platform: two platforms that
answer differently disagree about what the same document says. It is declared once in the
schema and summarised in [`DEFAULTS.md`](DEFAULTS.md).

What this platform **does** on absence is its own fact, and is recorded per key below.
A key whose behaviour is not `declaredDefault` disagrees with the contract — visibly,
and as a decision rather than an accident.

| Behaviour | Keys | Meaning |
|---|---|---|
| `unverified` | 46 | Nobody has established what this platform does when the key is absent. |



## Clusters

Keys that resolve jointly. No single key in a cluster determines any single output, so the
resolution rule is the mapping rather than a row in the Styles table. Each cluster's rule
is its own page.

| Cluster | Disposition | Keys | Resolution |
|---|---|---|---|
| [autoVsAbsoluteLayout](clusters/figma/auto-vs-absolute-layout.md) | bound | 11 | 5-row case table |
| [namedStyleVersusInline](clusters/figma/named-style-versus-inline.md) | bound | 1 | 3-row case table |
| [wrapping](clusters/figma/wrapping.md) | bound | 4 | 4-row case table |

## Losses

What this platform does is settled and stated above. Where a loss is real, its *acceptability* is a product question rather than a specification's to settle alone. 8 of 46 keys raise one of 4 such questions, of which 2 remain open.

### A value is dropped rather than degraded

Affects `backgroundImage`.

A gradient whose stops do not yield two resolvable colours is dropped whole. A `padding` side that is present but unresolvable is omitted while its siblings emit, whereas `cornerRadius` substitutes `0` for the same failure. DSPEC-43 says a degradation applies the spec's own recorded fallback, or applies nothing and warns — dropping part of a value silently is neither.

**Open.** See #816 on the disagreement between the composite types, and #815 on the gradient path.

### Zero is not distinguishable from unset

Affects `minWidth`, `minHeight`.

Both platforms currently treat a dimension of 0 as "no constraint" rather than "a constraint of zero".

**Open.** Deferred — see #814, and #812 on what an absent `width`/`height` means. The two interact and should be settled together.

### A non-sRGB ColorObject renders as if it were sRGB

Affects `backgroundColor`, `fillColor`, `textColor`, `strokes`.

The schema admits 14 colour spaces and the render path never reads `colorSpace` — components 0 through 2 are taken as red, green and blue regardless, so an `oklch` value is misread rather than approximated. A `none` component becomes 0, and components beyond the third are dropped.

**Decided.** Convert to sRGB at render time (#813). The schema keeps all 14 spaces; the render path gains a conversion with gamut mapping for values outside sRGB. Until that lands, a non-sRGB ColorObject renders wrong rather than degraded.

### Logical sides become physical without a direction

Affects `padding`.

The schema uses `start` and `end` so a document is direction-agnostic. The Figma render maps `start` to the left padding with no writing-direction branch.

**Decided.** Accepted as a platform limit. Figma cannot express a writing direction, so the mapping is left-to-right only and the loss is declared rather than fixed — which is what `approximated` means. CSS stays direction-safe by emitting `padding-block` and `padding-inline`.
