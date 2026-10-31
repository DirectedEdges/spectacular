# CSS binding

**Platform binding for the Specs document format — draft.**

Normative frame: [`SPECIFICATION.md`](../SPECIFICATION.md) §11. This document states how
the CSS binding realises the schema; it does not restate what the members mean —
that is the reference at `/schema`.

Generated from `mappings/bindings/css.json` by `scripts/build-mappings.mjs`.
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

Current state: 29 bound, 11 approximated, 6 unsupported, of 46 style keys.

## Value forms

Every style value may be a literal, a TokenReference, a PropBinding, or a Conditional. A disposition for a key means little without saying what happens to each form (DSPEC-42).

| Form | Disposition | Behaviour |
|---|---|---|
| Literal | bound | The ordinary case; every case table above is written against literals. |
| `TokenReference` | bound | Emitted per `settings.spec.tokens`. A dedicated token-value path recognises `$token` and renders it in the configured notation. |
| `PropBinding` | unsupported | A PropBinding is not applied to any style value. `visible` is the one possible exception and is not currently realised either: the check is a literal `false` comparison, which a `{ $binding }` object fails, so a bound visibility emits nothing. Declared scope, not an unfound gap. |
| `Conditional` | unsupported | Not yet implemented. Nothing in the transform matches a conditional, so a `visible` carrying the ADR-018 conditional form renders permanently visible and the condition is discarded. The render path does implement it, so a document survives a Figma round trip and loses the condition only on the way to CSS. |

## Styles

A key whose row says *cluster* does not map on its own — see the cluster below. Writing a
per-key mapping for it would be false, not merely incomplete.

| Style key | Disposition | CSS module | Notes |
|---|---|---|---|
| `rotation` | bound | `transform` | Emits `transform: rotate(<n>deg)`. A rotation of 0 is suppressed because it matches the CSS initial value and a transform would otherwise create a containing block for absolute descendants. |
| `visible` | bound | `effects`, `layoutToCSS`, `visibility` | Only `false` emits, as `display: none`. A visible element says nothing, so the display its layout chose is not overridden. A variant revealing an element hidden in the default restores display from the default element's own layout mode. |
| `opacity` | bound | `opacity` | A literal ratio is emitted directly. A token is multiplied into a percentage — `calc(<var> * 1%)` — because an opacity variable is authored on a 0–100 scale. |
| `locked` | unsupported | — | Not emitted. `locked` is a canvas-interaction concept with no CSS counterpart, and the transform has no awareness of the key. The value is dropped with no warning. |
| `backgroundColor` | approximated | `fills` | Emits `background`. A gradient resolves to a CSS gradient function; a `null` becomes `transparent`. Loss: a gradient stop whose position is not a number silently becomes 0, and a gradient with fewer than two resolvable stops is dropped entirely rather than degraded. |
| `backgroundImage` | approximated | — | Emitted from the sheet layer, outside the main style pipeline. `background-position`, `background-repeat` and `background-size` are emitted independently of whether the image reference resolves — deliberately, so the fit behaviour is conveyed regardless. `objectFit: CONTAIN` becomes `background-size: contain`; everything else, including absent, becomes `cover`. Loss: the source path is reduced to its basename, discarding any directory structure. |
| `fillColor` | approximated | `fills` | The CSS property depends on the element type: a glyph or vector takes `background-color`, an untyped legacy element takes `fill`, anything else takes `background`. Loss: a gradient fill on an untyped element is skipped entirely, because an inline SVG paint has no gradient equivalent. |
| `textColor` | bound | `fills` | Emits `color`. A gradient becomes a four-declaration bundle — background, both background-clip prefixes, and a transparent colour — which is the standard way to paint text with a gradient. |
| `effects` | approximated | `effects` | Emits `box-shadow`, `filter` and `backdrop-filter`. A `null` resets all three. Loss: a shadow whose offset, blur or spread cannot be resolved substitutes `0`, and an unresolvable colour substitutes `currentColor`, so an unresolved value is masked as a plausible one rather than reported. A blur whose radius fails to resolve emits nothing at all and no reset. |
| `clipsContent` | bound | `layoutToCSS`, `overflow`, `truncation` | Emits `overflow: hidden` or `overflow: visible`. A non-boolean is dropped. |
| `cornerRadius` | approximated | `cornerRadius` | Emits `border-radius`, reordering a per-corner object from the schema's logical order into CSS's. Loss: a corner that cannot be resolved substitutes `0` rather than being reported, and an unresolved token radius with no cached fallback degrades to the keyword `unset`. An ellipse receives `border-radius: 50%` only when this key produced nothing. |
| `width` | bound | cluster [intrinsicSize](#intrinsicsize) |  |
| `height` | bound | cluster [intrinsicSize](#intrinsicsize) |  |
| `minWidth` | approximated | `size` | Emits `min-width`. Loss: a resolved value of `0` is suppressed, so an explicit zero minimum is indistinguishable from an unstated one. |
| `minHeight` | approximated | `size` | Emits `min-height`, with the same zero suppression as `minWidth`. Unlike `height`, it is not suppressed when an aspect ratio is stated. |
| `maxWidth` | approximated | `size` | Emits `max-width`. Loss: a resolved value of `0` is suppressed — and unlike a minimum, a maximum of zero is a constraint the schema permits and Figma accepts, so this one is a CSS-side choice rather than a platform limit. |
| `maxHeight` | approximated | `size` | Emits `max-height`, with the same zero suppression as `maxWidth`. |
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
| `strokeDashPattern` | unsupported | — | Not emitted. CSS offers no control over border dash geometry — `border-style: dashed` exists but its dash and gap lengths are chosen by the user agent — so the schema's explicit `{ dash, gap }` in pixels cannot be honoured. A dashed stroke currently renders solid, because the border style the transform emits is always `solid`. |
| `typography` | approximated | `typography` | A resolvable token emits the `font` shorthand plus a companion `letter-spacing`, since the shorthand cannot carry tracking. Otherwise each member emits its own property, and `fontStyle` is split into `font-weight` and `font-style`. Loss: a weight word absent from the recognised map loses `font-weight` while italic detection still succeeds; `textCase` and `textDecoration` values outside their maps are dropped silently; and the companion letter-spacing depends on a pattern match against the resolved variable name, which if it fails loses tracking. |
| `textAlignHorizontal` | bound | `textAlign` | Remaps the schema's logical values to CSS logical keywords: `START` to `start`, `END` to `end`, `JUSTIFY` to `justify`. All four schema values are covered, so the fallback is unreachable for valid input. |
| `textAlignVertical` | unsupported | — | Not emitted for an element's `styles`. The key is absent from the style pipeline entirely, so a plain element carrying it produces nothing. The separate `contentStyles` member of the same name IS handled for a text primitive filling a slot, and only where that slot admits no components — two different members with one name, and only one of them is realised. |
| `textOverflow` | bound | cluster [textTruncation](#texttruncation) |  |
| `maxLines` | bound | cluster [textTruncation](#texttruncation) |  |
| `mainAxisAlignment` | bound | cluster [autoLayout](#autolayout) |  |
| `primaryAxisSizingMode` | unsupported | — | Not emitted. Sizing is derived instead from `layoutSizingHorizontal` and `layoutSizingVertical` against the parent axis, which the `autoLayoutSizing` cluster states. This key is never read. |
| `crossAxisAlignment` | bound | cluster [autoLayout](#autolayout) |  |
| `layoutMode` | bound | cluster [autoLayout](#autolayout) |  |
| `wrap` | bound | cluster [autoLayout](#autolayout) |  |
| `wrapAlignment` | bound | cluster [autoLayout](#autolayout) |  |
| `itemReverseZIndex` | unsupported | — | The key is never read. The semantic it names is approximated by a different mechanism: a variant whose layout reverses the default's child order emits `row-reverse` or `column-reverse`, derived from comparing the two layout trees. A partial reorder is not expressible that way and is handled by relocating the element instead. |
| `itemSpacing` | bound | cluster [autoLayout](#autolayout) |  |
| `padding` | approximated | `padding` | A uniform value emits `padding`; a `null` emits `padding: 0`. A per-side object emits a `padding-block` and `padding-inline` pair, deliberately avoiding the four-value shorthand so a logical side is never misread as a physical one — the direction-safe treatment Figma lacks. Defect: a side present but unresolvable is omitted with no fallback, while `cornerRadius` substitutes `0` for the same class of failure. Nothing should be dropped; the two disagree. |
| `cornerSmoothing` | unsupported | — | Not emitted, and nothing attempts a substitute. CSS has no squircle primitive; a clip-path or mask approximation would change the element's box rather than its corner, so none is offered. |
| `aspectRatio` | bound | cluster [intrinsicSize](#intrinsicsize) |  |

## Losses and decisions

What this platform does is settled and stated above. Where a loss is real, its *acceptability* is a product question rather than a specification's to settle alone. 6 of 46 keys raise one of 2 such questions, of which 2 remain open.

#### A value is dropped rather than degraded

Affects `backgroundColor`, `effects`.

A gradient whose stops do not yield two resolvable colours is dropped whole. A `padding` side that is present but unresolvable is omitted while its siblings emit, whereas `cornerRadius` substitutes `0` for the same failure. DSPEC-43 says a degradation applies the spec's own recorded fallback, or applies nothing and warns — dropping part of a value silently is neither.

**Open.** See #816 on the disagreement between the composite types, and #815 on the gradient path.

#### Zero is not distinguishable from unset

Affects `minWidth`, `minHeight`, `maxWidth`, `maxHeight`.

Both platforms currently treat a dimension of 0 as "no constraint" rather than "a constraint of zero".

**Open.** Deferred — see #814, and #812 on what an absent `width`/`height` means. The two interact and should be settled together.

## Clusters

Keys that resolve jointly. No single key in a cluster determines any single output, so the
resolution rule is the mapping rather than a row in the table above.

### autoLayout

bound · verified against an implementation — keys: `layoutMode`, `mainAxisAlignment`, `crossAxisAlignment`, `wrap`, `wrapAlignment`, `itemSpacing`

**Operands.** Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `self.layoutMode` | document |
| `self.mainAxisAlignment` | document |
| `self.crossAxisAlignment` | document |
| `self.wrap` | document |
| `self.wrapAlignment` | document |
| `self.itemSpacing` | document |

**Cases** — ordered, first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | (`self.layoutMode` absent **or** `self.layoutMode` = `NONE`) | *nothing* | without a layout mode the whole cluster is inert; the element stays in flow |
| 2 | `self.layoutMode` = `HORIZONTAL` | `display: flex`<br>`flex-direction: row` |  |
| 3 | `self.layoutMode` = `VERTICAL` | `display: flex`<br>`flex-direction: column` |  |

**Member cases** — ordered, first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `self.mainAxisAlignment` present | `justify-content: <mapped>` |  |
| 2 | `self.crossAxisAlignment` present | `align-items: <mapped>` |  |
| 3 | `self.wrap` = `true` | `flex-wrap: wrap` |  |
| 4 | `self.wrap` = `false` | `flex-wrap: nowrap` |  |
| 5 | `self.wrapAlignment` present | `align-content: <mapped>` |  |
| 6 | `self.itemSpacing` present **and** `self.itemSpacing.sign` = `nonNegative` | `gap: <self.itemSpacing>` |  |
| 7 | `self.itemSpacing` present **and** `self.itemSpacing.sign` = `negative` | NOT on this element — a negative margin on `<selector> > * + *`, emitted by elementRules | gap does not accept negative values; overlap is a sibling margin |

*css/style/layoutToCSS.ts:39-96; css/sheet/elementRules.ts:254-268. `cases` decides display and direction; `memberCases` apply only when a case above emitted a display.*

### autoLayoutSizing

bound · verified against an implementation — keys: `layoutSizingHorizontal`, `layoutSizingVertical`

**Operands.** Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `self.layoutSizingHorizontal` | document |
| `self.layoutSizingVertical` | document |
| `self.clipsContent` | document |
| `self.maxLines` | document |
| `self.width` | document |
| `self.height` | document |
| `parent.layoutMode` | document (ancestor) |
| `parent.crossAxisAlignment` | document (ancestor) |
| `context.isInstance` | emitter context |
| `context.isDefaultBlock` | emitter context |

**Derived predicates.**

| Name | Expression | Source |
|---|---|---|
| `derived.mainHugs` | `context.isInstance` = `false` **and** `self.clipsContent` ≠ `true` **and** `self.maxLines` absent | layoutToCSS.ts:133-134 |
| `derived.crossStretches` | `context.isInstance` = `false` **and** (`parent.crossAxisAlignment` absent **or** `parent.crossAxisAlignment` = `STRETCH`) | layoutToCSS.ts:130-131 |

**Cases** — ordered, first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `self.layoutSizingHorizontal` = `HUG` **and** `parent.layoutMode` = `HORIZONTAL` **and** `derived.mainHugs` = `true` | *nothing* | the parent main axis already hugs |
| 2 | `self.layoutSizingHorizontal` = `HUG` | `width: fit-content` |  |
| 3 | `self.layoutSizingHorizontal` = `FILL` **and** `parent.layoutMode` = `HORIZONTAL` | `flex: 1 0 0` |  |
| 4 | `self.layoutSizingHorizontal` = `FILL` **and** `parent.layoutMode` = `VERTICAL` **and** `derived.crossStretches` = `true` | *nothing* | the parent stretches it across the cross axis already |
| 5 | `self.layoutSizingHorizontal` = `FILL` | `width: 100%` |  |
| 6 | `self.layoutSizingVertical` = `HUG` **and** `parent.layoutMode` = `VERTICAL` **and** `derived.mainHugs` = `true` | *nothing* |  |
| 7 | `self.layoutSizingVertical` = `HUG` | `height: fit-content` |  |
| 8 | `self.layoutSizingVertical` = `FILL` **and** `parent.layoutMode` = `VERTICAL` | `flex: 1 0 0` |  |
| 9 | `self.layoutSizingVertical` = `FILL` **and** `parent.layoutMode` = `HORIZONTAL` **and** `derived.crossStretches` = `true` | *nothing* |  |
| 10 | `self.layoutSizingVertical` = `FILL` | `height: 100%` |  |
| 11 | (`parent.layoutMode` = `HORIZONTAL` **or** `parent.layoutMode` = `VERTICAL`) **and** (`context.isDefaultBlock` = `true` **or** `self.layoutSizingHorizontal` present **or** `self.layoutSizingVertical` present **or** `self.width` present **or** `self.height` present) **and** `self.layoutSizingOnParentAxis` ≠ `FILL` | `flex-shrink: 0` | stated sizing on a flex child that is not FILL must not shrink |

**Otherwise.** *nothing* — FIXED or absent contributes nothing from this cluster

*css/style/layoutToCSS.ts:130-179. Cases are ordered and the first match wins. `self.layoutSizingOnParentAxis` is the axis-selected key the source computes from parentLayoutMode.*

### absolutePositioning

bound · verified against an implementation — keys: `position`, `top`, `bottom`, `start`, `end`, `centerHorizontalOffset`, `centerVerticalOffset`

**Operands.** Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `self.position` | document |
| `self.top` | document |
| `self.bottom` | document |
| `self.start` | document |
| `self.end` | document |
| `self.centerHorizontalOffset` | document |
| `self.centerVerticalOffset` | document |
| `parent.layoutMode` | document (ancestor) |
| `context.isRoot` | emitter context |

**Derived predicates.**

| Name | Expression | Source |
|---|---|---|
| `derived.hasInsets` | (`self.top` present **or** `self.bottom` present **or** `self.start` present **or** `self.end` present) | position.ts:4-9 |
| `derived.parentAutoLayout` | (`parent.layoutMode` = `HORIZONTAL` **or** `parent.layoutMode` = `VERTICAL`) | position.ts:18-27 (parentAutoLayout argument) |
| `derived.nonZeroInset` | (`self.top` present **and** `self.top` ≠ `0` **or** `self.bottom` present **and** `self.bottom` ≠ `0` **or** `self.start` present **and** `self.start` ≠ `0` **or** `self.end` present **and** `self.end` ≠ `0`) | position.ts:24 |
| `derived.opposingAnchors` | (`self.top` present **and** `self.bottom` present **or** `self.start` present **and** `self.end` present) | position.ts:25 |

**Cases** — ordered, first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `self.position` = `ABSOLUTE` | `position: absolute` | an explicit position wins outright |
| 2 | `self.position` = `AUTO` | `position: static` |  |
| 3 | `self.position` absent **and** `context.isRoot` = `true` | *nothing* | a root never infers absolute |
| 4 | `self.position` absent **and** `derived.hasInsets` = `false` | *nothing* | no coordinates, nothing to infer from |
| 5 | `self.position` absent **and** `derived.parentAutoLayout` = `false` | `position: absolute` | outside auto-layout, any coordinate is meaningful |
| 6 | `self.position` absent **and** (`derived.nonZeroInset` = `true` **or** `derived.opposingAnchors` = `true`) | `position: absolute` | inside auto-layout only a meaningful coordinate implies absolute |
| 7 | `self.position` absent | *nothing* | a zero-only single anchor inside auto-layout is canvas noise |

**Offset cases** — ordered, first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `self.top` present | `inset-block-start: <self.top>` |  |
| 2 | `self.bottom` present | `inset-block-end: <self.bottom>` |  |
| 3 | `self.start` present | `inset-inline-start: <self.start>` |  |
| 4 | `self.end` present | `inset-inline-end: <self.end>` |  |
| 5 | `self.centerVerticalOffset` present **and** `derived.verticalAnchored` = `false` | `inset-block-start: <self.centerVerticalOffset>` | an edge anchor on the same axis wins; both would put two values on one property |
| 6 | `self.centerHorizontalOffset` present **and** `derived.horizontalAnchored` = `false` | `inset-inline-start: <self.centerHorizontalOffset>` |  |
| 7 | (`derived.verticalCentred` = `true` **or** `derived.horizontalCentred` = `true`) | `translate: <-50% on each centred axis, 0 on the other>` |  |

*css/style/position.ts:4-27 (hasInsets, impliesAbsolute), 42-59, 84-107 (centerDecls). `cases` decides the position property; `insetCases` decides the offsets. verticalAnchored/horizontalAnchored are presence of top|bottom and start|end respectively.*

### strokeRendering

bound · verified against an implementation — keys: `strokes`, `strokeAlign`, `strokeWeight`

**Operands.** Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `self.strokes` | document |
| `self.strokeWeight` | document |
| `self.strokeAlign` | document |
| `context.isDefaultBlock` | emitter context |

**Derived predicates.**

| Name | Expression | Source |
|---|---|---|
| `derived.asOutline` | **not** `self.strokeWeight.form` = `perSideObject` **and** `self.strokeWeight.form` ≠ `tokenReference` | border.ts:51-53 — a per-side object becomes border-*, a scalar or token becomes outline-* |
| `derived.gradientStroke` | `self.strokes.form` = `gradient` | border.ts:73-113 |

**Cases** — ordered, first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `derived.gradientStroke` = `true` | *nothing* | a gradient stroke is painted by a separate pseudo-element rule, not a border or outline |
| 2 | `self.strokes` present **and** `derived.asOutline` = `false` | `border-color: <self.strokes>`<br>`border-style: solid` |  |
| 3 | `self.strokes` present **and** `derived.asOutline` = `true` | `outline-color: <self.strokes>`<br>`outline-style: solid` |  |
| 4 | `self.strokeWeight` present **and** `derived.asOutline` = `false` | `border-width: <per side>` |  |
| 5 | `self.strokeWeight` present **and** `derived.asOutline` = `true` **and** (`self.strokeAlign` = `OUTSIDE` **or** `self.strokeAlign` = `CENTER`) | `outline-width: <self.strokeWeight>` |  |
| 6 | `self.strokeWeight` present **and** `derived.asOutline` = `true` | `outline-width: <self.strokeWeight>`<br>`outline-offset: <negated self.strokeWeight>` |  |
| 7 | `context.isDefaultBlock` = `true` **and** `self.strokeWeight` absent | `border-width: 0 or outline-width: 0, matching whichever style was emitted` | a default block must reset a width it did not state |

**Otherwise.** *nothing*

*css/style/border.ts:51-53, 73-167. strokeAlign contributes no declaration of its own — it only flips the outline-offset sign. `strokeDashPattern` is NOT consulted: see its own row.*

### intrinsicSize

bound · verified against an implementation — keys: `width`, `height`, `aspectRatio`

**Operands.** Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `self.width` | document |
| `self.height` | document |
| `self.aspectRatio` | document |

**Cases** — ordered, first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `self.width` present | `width: <self.width>` |  |
| 2 | `self.height` present **and** `self.aspectRatio` present | *nothing* | a stated ratio derives the height |
| 3 | `self.height` present | `height: <self.height>` |  |
| 4 | `self.aspectRatio` present | `aspect-ratio: <x> / <y>` |  |

**Otherwise.** *nothing*

*css/style/size.ts:22-34. minWidth, minHeight, maxWidth and maxHeight are independent and map one-to-one.*

### textTruncation

bound · verified against an implementation — keys: `textOverflow`, `maxLines`

**Operands.** Every fact the cluster reads. Nothing outside this set participates.

| Operand | From |
|---|---|
| `self.textOverflow` | document |
| `self.maxLines` | document |

**Cases** — ordered, first match wins.

| # | When | Emits | Why |
|---|---|---|---|
| 1 | `self.maxLines` present **and** `self.maxLines` ≠ `1` | `display: -webkit-box`<br>`-webkit-box-orient: vertical`<br>`-webkit-line-clamp: <self.maxLines>`<br>`line-clamp: <self.maxLines>`<br>`overflow: hidden` | multi-line clamp changes the display type |
| 2 | `self.maxLines` = `1` **and** `self.textOverflow` = `ELLIPSIS` | `white-space: nowrap`<br>`overflow: hidden`<br>`text-overflow: ellipsis` |  |
| 3 | `self.maxLines` = `1` | `white-space: nowrap`<br>`overflow: hidden` |  |
| 4 | `self.textOverflow` = `ELLIPSIS` | `overflow: hidden`<br>`text-overflow: ellipsis` |  |

**Otherwise.** *nothing*

*css/style/truncation.ts:12-37. The multi-line case sets display, so it interacts with the autoLayout cluster on the same element.*

## Absent keys

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

## Concepts not yet bound

Props, anatomy and elements, and layout have no declared binding yet. They are named
here so their absence is visible rather than implied:

| Concept | State |
|---|---|
| Props | not declared |
| Anatomy and elements | not declared |
| Layout | not declared |
