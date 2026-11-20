<!--
  Reference shipped beside specs-cli.authoring.primer — not an invokable skill.
  Canonical; `specs skills install` overwrites it on every refresh.
-->

# Reference: the style property map

Load with the **variants pack**, when `variants.yaml` begins. Assumes `specs-cli.authoring.primer` is read.

Styles live per element in `variants.yaml`: fully on every element under `default.elements.<el>.styles`, and as deltas under `variants[].elements.<el>.styles`. The schema source of truth is `styles.schema.json#/definitions/Styles`, and every property below names its definition there. Each definition carries its own description, examples, and — for closed value sets — a described `oneOf` of every option.

**Read the schema for what a property or option means. This reference carries only the map.** Judgment about styling — which token to reach for, when a literal is a defect, what to omit, how `visible` may be bound, which composite form to use — is in `rules/styles.yaml` beside this skill. Where this file and that one seem to overlap, the rules file governs.

## The property map

Properties group by the shape of their value. A property not in this table does not exist — `Styles` rejects unknown keys.

| Group | Properties | Value shape |
|---|---|---|
| Numbers | `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `opacity`, `rotation`, `cornerSmoothing`, `maxLines` | number, `$token`, or null (`NumberStyleValue`) |
| Colors | `backgroundColor`, `textColor`, `fillColor`, `strokes` | `{r,g,b,a}` object, gradient, `$token`, or null (`ColorStyleValue`) |
| Sides | `padding`, `strokeWeight` | single value or `{top, end, bottom, start}`, each number or `$token` (`SidesStyleValue`) |
| Corners | `cornerRadius` | single value or `{topStart, topEnd, bottomEnd, bottomStart}` — logical inline-axis keys — each number or `$token` (`CornersStyleValue`) |
| Deep: typography | `typography` | `$token` naming a text style, **or** an inline `Typography` object — members and their defaults are declared on the `Typography` definition |
| Deep: effects | `effects` | `$token` naming an effect style, or an effects array of shadows and blurs (`EffectsStyleValue`) |
| Deep: image | `backgroundImage` | `ImageValue` or `$token` (`ImageStyleValue`) |
| Booleans | `clipsContent`, `wrap`, `locked`, `itemReverseZIndex` | boolean, `$token`, or null (`BooleanStyleValue`) |
| Bindable boolean | `visible` | boolean, `$token`, `$binding`, or `Conditional` (`BooleanBindableStyleValue`) — the one style a prop may drive |
| Spacing | `itemSpacing` | number when uniform, `{horizontal, vertical}` when the gaps differ, or `$token` (`ItemSpacingStyleValue`) |
| Grid tracks | `gridColumns`, `gridRows` | an integer track count, or `{minSize}` for as many tracks as fit (`GridTracksStyleValue`) — structural, and non-null on at most one of the two |
| Other | `strokeDashPattern`, `aspectRatio` | per their definitions; neither accepts `$token` |

`visible` is the only entry here a prop may drive directly. Where that binding is legal, and the one null-test form that has any effect, are in `rules/styles.yaml · visible` and `rules/variants.yaml · conditionals`.

## Structural properties take no token

Structural properties carry layout structure, accept only their closed value set or null, and reject `$token`. The schema is the authority: every such definition says **"Structural property — not token-bindable"** and declares its options as a described `oneOf`.

They are `layoutMode`, `gridColumns`, `gridRows`, `position`, `mainAxisAlignment`, `crossAxisAlignment`, `wrapAlignment`, `textAlignHorizontal`, `textAlignVertical`, `textOverflow`, `layoutSizingHorizontal`, `layoutSizingVertical`, `primaryAxisSizingMode`, `strokeAlign` — several narrowed to closed sets by ADR-115 — plus the `position: ABSOLUTE` offsets `top`, `start`, `end`, `bottom`, `centerHorizontalOffset`, `centerVerticalOffset`, which take numbers.

## The token reference shape

A token reference is an object, never a bare string:

```yaml
padding: {$token: 'Constants/Spacing/2x', $type: dimension}
```

| Field | Holds |
|---|---|
| `$token` | the slash-separated path, per the `TokenReference` definition |
| `$type` | the token's type — `color`, `dimension`, `typography`, `effects` are the common ones |

Segment names and casing belong to the library, not to the author. Where to resolve a path and its type, which report is authoritative, and what to do when the library has no token for a property are all in `rules/styles.yaml · tokens`.

**Composite tokens bind whole nodes.** `typography: {$token, $type: typography}` corresponds to a Figma text style; `effects: {$token, $type: effects}` to a Figma effect style — plural on both sides, because `effects` is the Specs extension type for an effect-style reference and the singular is not in the enum.

## Defaults and deltas

`default.elements.<el>.styles` carries the complete baseline for the element. A variant's `styles` carries only what that configuration changes. The resolved component is every matching variant layered onto the default in order, like a cascade.

Composite members declare their own defaults in the schema (ADR-116). Which to omit is `rules/styles.yaml · defaults`; how variants layer is `rules/variants.yaml · layering`.

## Where to go deeper

| Question | Goes to |
|---|---|
| What does this property or option mean? | `styles.schema.json`, mirrored as generated pages under `/schema/styles/` |
| Which value should I write here? | `rules/styles.yaml` |
| How are elements arranged, and how does sizing work? | `references/layout.md` |
| Does platform X realise this key? | `mappings/bindings/<platform>.json` |
