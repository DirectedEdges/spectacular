# CSS binding

**Platform binding for the Specs document format — draft.**

Normative frame: [`SPECIFICATION.md`](../SPECIFICATION.md) §11. This document states how
the CSS binding realises the schema; it does not restate what the members mean —
that is the reference at `/schema`.

Generated from `mappings/bindings/css.json` by `scripts/build-mappings.mjs`.
Edit the binding file, never this page.

## Styles

29 bound, 11 approximated, 6 unsupported, of 46 style keys.

A key whose row says *cluster* does not map on its own — its rule is a case table on the
cluster's own page. Writing a per-key mapping for it would be false, not merely incomplete.

| Disposition | Keys | Meaning |
|---|---|---|
| `bound` | 29 | Realised, and confirmed against the implementation |
| `approximated` | 11 | Realised with loss, and the loss is stated |
| `unsupported` | 6 | Declared as not realised, with the resulting behaviour stated |

Every row below is a claim a reader may rely on.

| Style key | Disposition | CSS module | Notes |
|---|---|---|---|
| `aspectRatio` | bound | cluster [intrinsicSize](clusters/css/intrinsic-size.md) |  |
| `backgroundColor` | approximated | `fills` | Emits `background`. A gradient resolves to a CSS gradient function; a `null` becomes `transparent`. Loss: a gradient stop whose position is not a number silently becomes 0, and a gradient with fewer than two resolvable stops is dropped entirely rather than degraded. |
| `backgroundImage` | approximated | — | Emitted from the sheet layer, outside the main style pipeline. `background-position`, `background-repeat` and `background-size` are emitted independently of whether the image reference resolves — deliberately, so the fit behaviour is conveyed regardless. `objectFit: CONTAIN` becomes `background-size: contain`; everything else, including absent, becomes `cover`. Loss: the source path is reduced to its basename, discarding any directory structure. |
| `bottom` | bound | cluster [absolutePositioning](clusters/css/absolute-positioning.md) |  |
| `centerHorizontalOffset` | bound | cluster [absolutePositioning](clusters/css/absolute-positioning.md) |  |
| `centerVerticalOffset` | bound | cluster [absolutePositioning](clusters/css/absolute-positioning.md) |  |
| `clipsContent` | bound | `layoutToCSS`, `overflow`, `truncation` | Emits `overflow: hidden` or `overflow: visible`. A non-boolean is dropped. |
| `cornerRadius` | approximated | `cornerRadius` | Emits `border-radius`, reordering a per-corner object from the schema's logical order into CSS's. Loss: a corner that cannot be resolved substitutes `0` rather than being reported, and an unresolved token radius with no cached fallback degrades to the keyword `unset`. An ellipse receives `border-radius: 50%` only when this key produced nothing. |
| `cornerSmoothing` | unsupported | — | Not emitted, and nothing attempts a substitute. CSS has no squircle primitive; a clip-path or mask approximation would change the element's box rather than its corner, so none is offered. |
| `crossAxisAlignment` | bound | cluster [autoLayout](clusters/css/auto-layout.md) |  |
| `effects` | approximated | `effects` | Emits `box-shadow`, `filter` and `backdrop-filter`. A `null` resets all three. Loss: a shadow whose offset, blur or spread cannot be resolved substitutes `0`, and an unresolvable colour substitutes `currentColor`, so an unresolved value is masked as a plausible one rather than reported. A blur whose radius fails to resolve emits nothing at all and no reset. |
| `end` | bound | cluster [absolutePositioning](clusters/css/absolute-positioning.md) |  |
| `fillColor` | approximated | `fills` | The CSS property depends on the element type: a glyph or vector takes `background-color`, an untyped legacy element takes `fill`, anything else takes `background`. Loss: a gradient fill on an untyped element is skipped entirely, because an inline SVG paint has no gradient equivalent. |
| `height` | bound | cluster [intrinsicSize](clusters/css/intrinsic-size.md) |  |
| `itemReverseZIndex` | unsupported | — | The key is never read. The semantic it names is approximated by a different mechanism: a variant whose layout reverses the default's child order emits `row-reverse` or `column-reverse`, derived from comparing the two layout trees. A partial reorder is not expressible that way and is handled by relocating the element instead. |
| `itemSpacing` | bound | cluster [autoLayout](clusters/css/auto-layout.md) |  |
| `layoutMode` | bound | cluster [autoLayout](clusters/css/auto-layout.md) |  |
| `layoutSizingHorizontal` | bound | cluster [autoLayoutSizing](clusters/css/auto-layout-sizing.md) |  |
| `layoutSizingVertical` | bound | cluster [autoLayoutSizing](clusters/css/auto-layout-sizing.md) |  |
| `locked` | unsupported | — | Not emitted. `locked` is a canvas-interaction concept with no CSS counterpart, and the transform has no awareness of the key. The value is dropped with no warning. |
| `mainAxisAlignment` | bound | cluster [autoLayout](clusters/css/auto-layout.md) |  |
| `maxHeight` | approximated | `size` | Emits `max-height`, with the same zero suppression as `maxWidth`. |
| `maxLines` | bound | cluster [textTruncation](clusters/css/text-truncation.md) |  |
| `maxWidth` | approximated | `size` | Emits `max-width`. Loss: a resolved value of `0` is suppressed — and unlike a minimum, a maximum of zero is a constraint the schema permits and Figma accepts, so this one is a CSS-side choice rather than a platform limit. |
| `minHeight` | approximated | `size` | Emits `min-height`, with the same zero suppression as `minWidth`. Unlike `height`, it is not suppressed when an aspect ratio is stated. |
| `minWidth` | approximated | `size` | Emits `min-width`. Loss: a resolved value of `0` is suppressed, so an explicit zero minimum is indistinguishable from an unstated one. |
| `opacity` | bound | `opacity` | A literal ratio is emitted directly. A token is multiplied into a percentage — `calc(<var> * 1%)` — because an opacity variable is authored on a 0–100 scale. |
| `padding` | approximated | `padding` | A uniform value emits `padding`; a `null` emits `padding: 0`. A per-side object emits a `padding-block` and `padding-inline` pair, deliberately avoiding the four-value shorthand so a logical side is never misread as a physical one — the direction-safe treatment Figma lacks. Defect: a side present but unresolvable is omitted with no fallback, while `cornerRadius` substitutes `0` for the same class of failure. Nothing should be dropped; the two disagree. |
| `position` | bound | cluster [absolutePositioning](clusters/css/absolute-positioning.md) |  |
| `primaryAxisSizingMode` | unsupported | — | Not emitted. Sizing is derived instead from `layoutSizingHorizontal` and `layoutSizingVertical` against the parent axis, which the `autoLayoutSizing` cluster states. This key is never read. |
| `rotation` | bound | `transform` | Emits `transform: rotate(<n>deg)`. A rotation of 0 is suppressed because it matches the CSS initial value and a transform would otherwise create a containing block for absolute descendants. |
| `start` | bound | cluster [absolutePositioning](clusters/css/absolute-positioning.md) |  |
| `strokeAlign` | bound | cluster [strokeRendering](clusters/css/stroke-rendering.md) |  |
| `strokeDashPattern` | unsupported | — | Not emitted. CSS offers no control over border dash geometry — `border-style: dashed` exists but its dash and gap lengths are chosen by the user agent — so the schema's explicit `{ dash, gap }` in pixels cannot be honoured. A dashed stroke currently renders solid, because the border style the transform emits is always `solid`. |
| `strokeWeight` | bound | cluster [strokeRendering](clusters/css/stroke-rendering.md) |  |
| `strokes` | bound | cluster [strokeRendering](clusters/css/stroke-rendering.md) |  |
| `textAlignHorizontal` | bound | `textAlign` | Remaps the schema's logical values to CSS logical keywords: `START` to `start`, `END` to `end`, `JUSTIFY` to `justify`. All four schema values are covered, so the fallback is unreachable for valid input. |
| `textAlignVertical` | unsupported | — | Not emitted for an element's `styles`. The key is absent from the style pipeline entirely, so a plain element carrying it produces nothing. The separate `contentStyles` member of the same name IS handled for a text primitive filling a slot, and only where that slot admits no components — two different members with one name, and only one of them is realised. |
| `textColor` | bound | `fills` | Emits `color`. A gradient becomes a four-declaration bundle — background, both background-clip prefixes, and a transparent colour — which is the standard way to paint text with a gradient. |
| `textOverflow` | bound | cluster [textTruncation](clusters/css/text-truncation.md) |  |
| `top` | bound | cluster [absolutePositioning](clusters/css/absolute-positioning.md) |  |
| `typography` | approximated | `typography` | A resolvable token emits the `font` shorthand plus a companion `letter-spacing`, since the shorthand cannot carry tracking. Otherwise each member emits its own property, and `fontStyle` is split into `font-weight` and `font-style`. Loss: a weight word absent from the recognised map loses `font-weight` while italic detection still succeeds; `textCase` and `textDecoration` values outside their maps are dropped silently; and the companion letter-spacing depends on a pattern match against the resolved variable name, which if it fails loses tracking. |
| `visible` | bound | `effects`, `layoutToCSS`, `visibility` | Only `false` emits, as `display: none`. A visible element says nothing, so the display its layout chose is not overridden. A variant revealing an element hidden in the default restores display from the default element's own layout mode. |
| `width` | bound | cluster [intrinsicSize](clusters/css/intrinsic-size.md) |  |
| `wrap` | bound | cluster [autoLayout](clusters/css/auto-layout.md) |  |
| `wrapAlignment` | bound | cluster [autoLayout](clusters/css/auto-layout.md) |  |

## Values

Every style value may be a literal, a TokenReference, a PropBinding, or a Conditional. A disposition for a key means little without saying what happens to each form (DSPEC-42).

| Form | Disposition | Behaviour |
|---|---|---|
| Literal | bound | The ordinary case; every case table above is written against literals. |
| `TokenReference` | bound | Emitted per `settings.spec.tokens`. A dedicated token-value path recognises `$token` and renders it in the configured notation. |
| `PropBinding` | unsupported | A PropBinding is not applied to any style value. `visible` is the one possible exception and is not currently realised either: the check is a literal `false` comparison, which a `{ $binding }` object fails, so a bound visibility emits nothing. Declared scope, not an unfound gap. |
| `Conditional` | unsupported | Not yet implemented. Nothing in the transform matches a conditional, so a `visible` carrying the ADR-018 conditional form renders permanently visible and the condition is discarded. The render path does implement it, so a document survives a Figma round trip and loses the condition only on the way to CSS. |

## Defaults

What an absent style key **means** is spec-level, not per-platform: two platforms that
answer differently disagree about what the same document says. It is declared once in the
schema and summarised in [`DEFAULTS.md`](DEFAULTS.md).

What this platform **does** on absence is its own fact, and is recorded per key below.
A key whose behaviour is not `declaredDefault` disagrees with the contract — visibly,
and as a decision rather than an accident.

| Behaviour | Keys | Meaning |
|---|---|---|
| `platformInitial` | 46 | Applies the platform's own initial value, which may differ from the schema's declared default. |

> Seeded from the transform’s documented policy and **not yet confirmed per key**. A seeded value is a starting point, not a finding.

## Clusters

Keys that resolve jointly. No single key in a cluster determines any single output, so the
resolution rule is the mapping rather than a row in the Styles table. Each cluster's rule
is its own page.

| Cluster | Disposition | Keys | Resolution |
|---|---|---|---|
| [absolutePositioning](clusters/css/absolute-positioning.md) | bound | 7 | 7-row case table |
| [autoLayout](clusters/css/auto-layout.md) | bound | 6 | 3-row case table |
| [autoLayoutSizing](clusters/css/auto-layout-sizing.md) | bound | 2 | 11-row case table |
| [intrinsicSize](clusters/css/intrinsic-size.md) | bound | 3 | 4-row case table |
| [strokeRendering](clusters/css/stroke-rendering.md) | bound | 3 | 7-row case table |
| [textTruncation](clusters/css/text-truncation.md) | bound | 2 | 4-row case table |

## Losses

What this platform does is settled and stated above. Where a loss is real, its *acceptability* is a product question rather than a specification's to settle alone. 6 of 46 keys raise one of 2 such questions, of which 2 remain open.

### A value is dropped rather than degraded

Affects `backgroundColor`, `effects`.

A gradient whose stops do not yield two resolvable colours is dropped whole. A `padding` side that is present but unresolvable is omitted while its siblings emit, whereas `cornerRadius` substitutes `0` for the same failure. DSPEC-43 says a degradation applies the spec's own recorded fallback, or applies nothing and warns — dropping part of a value silently is neither.

**Open.** See #816 on the disagreement between the composite types, and #815 on the gradient path.

### Zero is not distinguishable from unset

Affects `minWidth`, `minHeight`, `maxWidth`, `maxHeight`.

Both platforms currently treat a dimension of 0 as "no constraint" rather than "a constraint of zero".

**Open.** Deferred — see #814, and #812 on what an absent `width`/`height` means. The two interact and should be settled together.
