# ADR: Image content — `backgroundImage` fill, an `images` registry, `ImageProp`, and `ImageBinding`

**Branch**: `063-image-content`
**Created**: 2026-07-14
**Status**: ACCEPTED
**Summary**: Images are supported by `backgroundImage` style, `ImageProp` and binding in components and examples.
**Decides**: backgroundColor, backgroundImage, backgroundImage.objectFit, effects, opacity, rotation, visible
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

Images are unrepresented in the schema today. A Figma node can carry an **image paint** — a fill of `type: 'IMAGE'` referencing an `imageHash`, with a `scaleMode` (`FILL` / `FIT` / `CROP` / `TILE`) — set directly on a container, rectangle, or ellipse. Design systems use images in two distinct ways:

- **Image as a nested component.** The design system has a designated image primitive (e.g. `dsImage`) exposing a source-like property, and other components (e.g. `dsAvatar`) nest an instance of it and forward their own image prop into it. The image is component input, flowing through a nested instance.
- **Image as a layer fill.** There is no designated image component; the image sits directly on a container layer of a broader component — a card's hero banner, a photographic background.

Neither is expressible today:

- `Styles.backgroundColor`, `fillColor`, `strokes` are all typed `ColorStyle` (`string | ColorObject | TokenReference | GradientValue | null`) — **color-semantics only**. There is no fill value that can hold an image, so an image paint is silently dropped by the transformer.
- `types/Props.ts` `AnyProp` is `BooleanProp | StringProp | EnumProp | SlotProp | NumberProp`. There is **no image prop type**, so an image-source property has nowhere to land (a `StringProp` cannot carry the registry reference an image needs, and its `examples` are arbitrary strings).
- There is **no place to store example image data**. `Component` holds a `slotContentExamples` registry (ADR-047) and an `instanceExamples` registry (ADR-046), but nothing for images. The actual pixels a fill points at — the avatar photo, the hero image — have no home, and a bare Figma `imageHash` is meaningless outside the originating Figma file.

The result is a fidelity gap: any component whose design contract includes imagery loses that information entirely, in both the Plugin and REST runtimes.

This ADR establishes two things:

1. **How image sourcing is modelled** — as a nested image component, a layer fill, or both, and how the transformer chooses.
2. **How image data is stored and referenced** — where the data lives and how fills, bindings, and props point at it.

### Naming — how each platform models this

Per Constitution VI (code-platforms-first), comparing the targets:

| Platform | Layer image API | Scale/fit |
|----------|-----------------|-----------|
| Web (CSS) | `background-image: url(...)` | `object-fit` / `background-size`: `cover` / `contain` |
| Web (React) | `<img src>`, `background-image` | `object-fit: cover / contain` |
| iOS (SwiftUI) | `.background { Image(...) }` | `.scaledToFill()` / `.scaledToFit()` |
| Android (Compose) | `Image(...)` / `Modifier.paint` | `ContentScale.Crop` / `Fit` |
| Figma | `ImagePaint` (fill, `type: 'IMAGE'`) | `scaleMode: FILL / FIT / CROP / TILE` |

- **Fill key → `backgroundImage`.** CSS names exactly `background-image`, a longhand sibling of `background-color`; the schema already has `backgroundColor`. Rule 1 (a term 2+ code platforms share — CSS + React/DOM `background-image`) selects `backgroundImage`, and it parallels the existing key. A node can carry an image over a color, so a **separate key** (not an arm on `backgroundColor`) also matches CSS, where the two coexist.
- **Reference key → `$image`.** Follows the schema's `$`-prefixed pointer convention (`$token`, `$binding`, `$slotContent`); names the act of pointing at a stored image.
- **Fit field → `objectFit` (type `ObjectFit`).** The property answering "how is the image fitted to its box" is named differently on every code platform — CSS `object-fit`, Compose `contentScale`, SwiftUI `contentMode`, React Native `resizeMode` — so rule 1 (2+ agree) yields nothing. Rule 2 selects a single strong code platform → web/CSS **`object-fit`**, which keeps the field in the same vocabulary as its `COVER`/`CONTAIN` values *and* its sibling key `backgroundImage`, biasing code over Figma's `scaleMode` — the same move ADR-062 made naming `textOverflow`/`TextOverflow` after CSS.
  - **Why not Figma's `scaleMode`?** Only Figma unifies fill/fit/crop/tile into one enum; no code platform does. On code platforms, tiling is a *separate* property (CSS `background-repeat`, SwiftUI `resizingMode: .tile`, Compose `TileMode`) and crop is fit *plus* a position/transform — and Figma's `CROP`/`TILE` even carry extra data (`imageTransform`, `scalingFactor`). Modelled faithfully, `CROP`/`TILE` are not `objectFit` values; they belong in their own future fields. Naming the field `objectFit` keeps the fit axis pure and refuses to import Figma's conflation (Constitution VI).
- **Fit values → `COVER` / `CONTAIN`.** Two concepts — fill-the-box-and-crop vs. fit-entirely-inside:
  - **Cover concept**: no two code platforms share a term (CSS `cover`, SwiftUI `fill`, Compose `Crop`) → rule 2 → web `cover`.
  - **Contain concept**: SwiftUI (`fit`) and Compose (`Fit`) agree, so strict rule 1 would suggest `FIT`, while CSS says `contain`. We deliberately take **`contain`** to keep a **single-origin, coherent pair** with `cover` — the two CSS `object-fit` keywords — rather than splitting the pair (`cover`/`fit`).
  - **Avoiding Figma's `FILL` is itself a driver**: CSS `object-fit: fill` and Compose `FillBounds` both mean *stretch, ignoring aspect ratio* — the opposite behaviour — so `FILL` is a false friend. `cover` carries no such collision.
  - SCREAMING_CASE per the Styles enum-casing rule → `ObjectFit = 'COVER' | 'CONTAIN'`, exactly as ADR-062 rendered CSS's `clip`/`ellipsis` as `TextOverflow = 'CLIP' | 'ELLIPSIS'`. A closed, non-token-bindable set → a named type.
  - The transformer remaps Figma's `scaleMode`: `FILL → COVER`, `FIT → CONTAIN`, and **lossily coerces `CROP → COVER` and `TILE → COVER`** — so an image with *any* Figma scale mode is still captured (no silent drop), even though the crop rectangle / tile repeat is not yet represented. Faithful `CROP`/`TILE` modelling is deferred to their own fields (see Out of Scope).

---

## Decision Drivers

- **Both DS patterns must be expressible** — nested-image-component and image-as-a-layer-fill are both real; the schema should not force one into the other's shape. Which one the transformer emits is a **config choice**, not an inference.
- **Every representation is an explicit trigger, nothing is inferred (2026-07-16 revision).** Image processing is one presence-switched block, `processing.images`, whose members are independent triggers: `backgroundImage` (detect fills), `imageComponent` (route through a designated component), `sourceProps` (type code-only props as images). A consumer with a designated component gets exclusivity by simply *not* enabling `backgroundImage`; enabling both makes the fill the fallback. Nothing is forced on by default — explicitness supersedes the earlier "fallback defaults to true so data is never lost" stance, which paired an on/off gate (`include.imageData`) with a mode selector and was retired with it.
- **First-class unresolved state (two-phase detect → resolve)** — image bytes may be fetched separately from generation (behind a `--get-images` flag, in a subsequent command) or not at all. A spec must be structurally valid and its `$image` references non-dangling *before* any bytes exist, in every runtime. The registry must be able to express an unresolved entry.
- **Bindings flow through props, not fills** — when a designated image component exists, a parent forwards its image prop into the nested instance via `propConfigurations` (the same channel as every other forwarded prop), *not* by prop-binding a `backgroundImage` style. `backgroundImage` is reserved for the distinct no-component case.
- **Store the data once, reference many times** — the same image appears across variants (default / hover / focus) and across a fill and the prop that feeds it. Inline duplication is unacceptable; a referenced registry mirrors `slotContentExamples` dedup (ADR-047).
- **Reuse the established binding pattern** — a bound prop that carries an authoring-default value already exists as `SlotBinding` (ADR-047: `PropBinding` + `examples?: SlotContentRef[]`). Images follow the same shape with an image payload.
- **Portable, self-contained by default** — a bare Figma `imageHash` is useless outside Figma. The stored value must be resolvable by a downstream consumer relative to the spec that carries it: the standard resolved form is an **emitted asset file** inside the output directory (`_images/<imageHash>.<ext>`), making the output directory the self-contained, publishable unit. A `data:` URI or external URL remain schema-valid value forms, but files are what downstream consumers want and what the CLI emits.
- **Room to grow without breaking** — `backgroundImage` is an **object**, not a bare pointer, so `objectFit` (now) and `rotation` / `opacity` / `filters` (later) attach as optional subproperties additively.
- **No color-semantics pollution** — `ColorStyle` (shared by `textColor`, `strokes`, `fillColor`, `backgroundColor`) must stay color-only; an image is not a color.
- **Additive-only** — new optional types, fields, and schema definitions; no existing type or schema changes (MINOR bump).
- **Type ↔ schema parity** (Constitution I) and **no runtime logic** (Constitution II).

---

## Options Considered

### Option A: Config-driven dual model — nested image component *or* `backgroundImage` fallback, both over one `images` registry *(Selected)*

- **`Component.images`** — a registry (`Record<string, ImageData>`) holding each distinct image once, keyed by id. Each entry is an object carrying the Figma identity in `$extensions['com.figma'].imageHash` and — once resolved — a `src` (an emitted asset path, the standard resolved form; a `data:` URI or external URL are also valid). `src` absent = unresolved; the two-phase state is structural, not a string-scheme convention. Lives in the *examples* concern (ADR-061), beside `slotContentExamples` — under specs-cli `--split-concerns` it is emitted in `examples.yaml`, which is where the concern-split `$image` prefix (`<component>.examples#/images/...`) comes from. Answers Q2.
- **`ImageProp`** (`type: 'image'`) — the type of an image source property (the designated component's source prop, and any parent prop forwarded into it). Minimal: no `examples` on the prop.
- **`ImageBinding`** — `PropBinding` + `examples?: ImageValue[]`, used **in `propConfigurations`** to forward a parent image prop into a nested image instance's source prop, carrying the authoring-default image seen in Figma. Mirrors `SlotBinding` (ADR-047).
- **`Styles.backgroundImage`** — an `ImageValue` object (`{ $image, objectFit? }`) or `null`; the **fallback** for a container image fill when no image component is configured.
- **`Config.processing.images`** — the presence-switched processing block: `{ backgroundImage?, imageComponent?, sourceProps? }`. Each member is an independent representation trigger; `imageComponent` requires a non-empty `sourceProps`, whose FIRST entry is the component's own source prop.

**How the config drives it** (block presence = image processing on):

- **`backgroundImage: true`** → image fills on `container` elements emit as `backgroundImage`. Alone, this is the fills-only mode; paired with `imageComponent`, it is the fallback for fills outside the designated component.
- **`imageComponent` + `sourceProps`** → instances of the named component are the image primitive; their image routes through the source prop (`sourceProps[0]`) via `propConfigurations`. Without `backgroundImage`, the component is the **only** image representation — stray fills are not detected at all (fills never evaluate).
- **`sourceProps` alone** → the listed code-only props (raw Figma names, matching the subcomponent/glyph pattern convention) re-type from `StringProp` to `ImageProp` on any component — no fill detection, no component routing.

Strictness is the natural consequence of omitting a trigger rather than an opt-in flag.

**Image as a nested component** (`images: { imageComponent: dsImage, sourceProps: [source] }`):

```yaml
# dsAvatar — api.yaml
props:
  image:
    type: image
    nullable: true
elements:
  root:           { type: container }
  imageComponent: { type: instance, instanceOf: dsImage }

# dsAvatar — variants.yaml  (bind via propConfigurations on the nested instance — NOT via backgroundImage)
default:
  elements:
    imageComponent:
      propConfigurations:
        source:
          $binding: "#/props/image"
          examples:
            - $image: "dsAvatar.examples#/images/userPhoto"

# dsAvatar — examples.yaml (resolved: an emitted file, path relative to this spec file)
images:
  userPhoto: "_images/89b270d29dd5ea753b71af11bfcf1bf0ecc851cf.png"
```

**Image as a layer fill** (`images: { backgroundImage: true }`):

```yaml
# card — variants.yaml
default:
  elements:
    root:
      styles:
        backgroundImage:
          $image: "card.examples#/images/hero"
          objectFit: COVER         # optional; COVER | CONTAIN; absent = COVER

# card — examples.yaml (resolved: an emitted file, path relative to this spec file)
images:
  hero: "_images/705867125834a686a51bdf161a0a39cdba0f9a58.jpg"
```

**Pros**:
- Expresses **both** DS patterns; the choice is an explicit, deterministic config, not a heuristic.
- Nested-component sourcing flows through `propConfigurations` like every other forwarded prop — no special "bindable fill" concept; `backgroundImage` stays a plain fill.
- One registry, referenced by fills, bindings, and props → no cross-variant or fill-vs-prop duplication (mirrors `slotContentExamples`).
- `ImageBinding` reuses the exact `SlotBinding` shape — no new binding concept.
- `backgroundImage` as an object leaves a clean, additive path for `rotation`/`opacity`/`filters` later.
- `ColorStyle` stays color-only.

**Cons / Trade-offs**:
- Two code paths (component vs. fallback) the transformer must implement, gated by config.
- Per-fill `rotation`/`opacity` are deferred (see Out of Scope), so a rotated/faded standalone image fill is not yet fully faithful in the fallback path.

---

### Option B: Fill-only — overload `ColorStyle` with an image arm; no prop type, no component mode *(Rejected)*

**Rejected because**: it pollutes a type literally named `ColorStyle` — shared by `textColor`, `fillColor`, and `strokes` — allowing "an image as a text color," which is nonsensical. It also cannot express the nested-image-component pattern (no image prop, no forwarding), and gives example data no home. Solves only half the problem and violates the color-semantics driver.

---

### Option C: Component-only — always model images through a designated image component; no `backgroundImage` fallback *(Rejected)*

**Rejected because**: it cannot represent an image paint set **directly on an arbitrary container** when the design system has **no** image component — a common Figma case — without fabricating a synthetic component that does not exist in the design. The fallback fill is necessary; hence the config-driven duality of Option A.

---

### Option D: Inline the data on each fill, no registry *(Rejected)*

**Rejected because**: the same image recurs across variants and across a fill and its feeding prop; inlining base64 duplicates it every time, bloating output and precluding dedup. Contradicts the "store once, reference many" driver and diverges from `slotContentExamples`.

---

### Option E: `type: image` + repo-relative file paths written by the plugin *(Rejected)*

The registry reference is a repo-relative file path (e.g. `./assets/userPhoto.png`), and the Figma plugin downloads each image's bytes and writes it as a file into the consumer's repo.

**Rejected because**:
- The **Figma plugin runtime has no filesystem access** — it runs sandboxed, with node built-ins (`fs`, `path`, `os`) stubbed out of the plugin build; it cannot deterministically write files into a local repo. Extraction must yield a value the plugin *can* produce (bytes → `data:` URI), not a side-effecting file write.
- The spec becomes **non-self-contained and non-portable** — it is meaningless without its sibling asset files in the exact expected layout, breaking the "portable, self-contained by default" driver and the schema's deterministic, side-effect-free output rule.
- What the accepted design does instead (2026-07-15 revision): the **CLI** emits asset files into `_images/` **inside the output directory** — the output directory is the self-contained unit, not the consumer's repo — and that emission is the standard resolved form. The rejection here is specifically of *plugin-written, consumer-repo-relative* files: file emission is a CLI concern layered on top of the model, never the model's basis and never the plugin's job.

---

### Option F: `type: string` + repo-relative file path (no image prop type) *(Rejected)*

Reuse `StringProp`; the prop value is a file-path string. No `ImageProp`, `ImageValue`, or `images` registry.

**Rejected because**:
- A `StringProp` cannot distinguish an image from arbitrary text, carries no `objectFit`, and its `examples` are plain strings with no registry or dedup — the same reasons `ImageProp` is justified over `StringProp` (see Context). Reverse tooling and code generators lose the semantic signal that this input *is* an image.
- Inherits Option E's file-path portability problem (paths, not data) on top of the typing loss.

---

### Option G: `type: image` + CDN URLs *(Rejected)*

The registry reference is a CDN URL pointing at a hosted copy of each image.

**Rejected because**:
- **There is no CDN** hosting these design-system images, and standing one up is out of scope.
- Figma identifies image fills by content **`imageHash`**, not by any stable public URL; deriving or matching a CDN URL for a given fill from Figma data is near impossible. The current design permits an *external URL* as one registry-value form when a consumer genuinely has hosted assets, but it never assumes or requires a CDN.

---

## Decision

Add an `images` registry to `Component`, an `ImageValue`-typed `backgroundImage` fallback fill to `Styles`, an `ImageProp` to the prop union, and an `ImageBinding` (PropBinding + image examples) used in `propConfigurations`. Gate the whole feature on the presence of `Config.processing.images`, whose members (`backgroundImage`, `imageComponent`, `sourceProps`) are independent representation triggers. New types live in a new `types/Image.ts`.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `types/Image.ts` *(new)* | Add `ObjectFit = 'COVER' \| 'CONTAIN'` | MINOR |
| `types/Image.ts` *(new)* | Add `ImageValue` (`{ $image: string; objectFit?: ObjectFit }`) | MINOR |
| `types/Image.ts` *(new)* | Add `ImageData` (`{ src?: string; $extensions?: { 'com.figma'?: { imageHash } } }`) with `FigmaImageExtension`/`ImageDataExtensions` | MINOR |
| `types/Image.ts` *(new)* | Add `Images = Record<string, ImageData>` (registry: id → resolved data or placeholder) | MINOR |
| `types/Image.ts` *(new)* | Add `ImageProp` (`type: 'image'`) | MINOR |
| `types/Image.ts` *(new)* | Add `ImageBinding` (`PropBinding & { examples?: ImageValue[] }`) | MINOR |
| `types/Styles.ts` | Add field `backgroundImage: ImageValue \| TokenReference \| null` to `Styles` | MINOR |
| `types/Styles.ts` | Add `'backgroundImage'` to the `StyleKey` union | MINOR |
| `types/Props.ts` | Add `ImageProp` to the `AnyProp` union | MINOR |
| `types/PropConfigurations.ts` | Add `ImageBinding` to the `PropConfigurationValue` union | MINOR |
| `types/Component.ts` | Add field `images?: Images` to `Component` | MINOR |
| `types/index.ts` | Re-export `ObjectFit`, `ImageValue`, `FigmaImageRef`, `ImageData`, `Images`, `ImageProp`, `ImageBinding` | MINOR |
| `types/Config.ts` | Add `processing.images?: { backgroundImage?: boolean; imageComponent?: string; sourceProps?: string[] }` to `Config`; on `ResolvedConfig`, `backgroundImage` and `sourceProps` are required-with-defaults (false, []) when the block is present | MINOR |

**Example — new shapes** (`types/Image.ts`):
```yaml
# Object fit — CSS object-fit vocabulary, SCREAMING_CASE. Not token-bindable. Optional; default COVER.
ObjectFit: "'COVER' | 'CONTAIN'"

# A layer-fill value: a reference into the images registry plus optional fit. An OBJECT so
# rotation/opacity/filters can be added later as optional subproperties without a breaking change.
ImageValue:
  $image: string            # pointer, e.g. "#/images/hero" or "card.examples#/images/hero"
  objectFit?: ObjectFit

# Registry entry: two-phase, expressed structurally — src absent = unresolved.
# The Figma identity rides in $extensions and SURVIVES resolution, so
# reverse-direction tooling can reconstruct an ImagePaint (and reuse the same
# Figma image across round-trips) without re-uploading bytes.
ImageData:
  src?: string                               # asset path (standard) | data: URI | external URL
  $extensions?:
    com.figma?:
      imageHash: string                      # Plugin ImagePaint.imageHash / REST fills[].imageRef
Images: "Record<string, ImageData>"          # keys ^[a-zA-Z0-9_-]+$

# Image-valued prop — minimal; example images live on the binding, not here
ImageProp:
  type: "image"
  default?: string | null    # an images reference, or null
  nullable?: boolean
  $extensions?: PropExtensions

# A bound image prop carrying the authoring-default example image (mirrors SlotBinding, ADR-047).
# Used in propConfigurations to forward a parent image prop into a nested image instance's source prop.
ImageBinding:
  $binding: string           # inherited from PropBinding, e.g. "#/props/image"
  examples?: ImageValue[]
```

**Example — `Styles` addition** (`types/Styles.ts`):
```yaml
# Within the Styles Partial — sibling to backgroundColor. Fallback container fill only
# (the nested-image-component path binds through propConfigurations, not here).
Styles:
  backgroundColor: ColorStyle
  backgroundImage: ImageValue | null    # non-text elements; absent = no image fill
```

**Example — `Config` additions** (`types/Config.ts`):
```yaml
# Config.processing — block presence is the on-switch; each member is an independent trigger
images?:
  backgroundImage?: boolean    # default false — detect image fills → Styles.backgroundImage
                               # (the stray-fill fallback when imageComponent is set)
  imageComponent?: string      # designated image component name (e.g. "dsImage"); requires sourceProps
  sourceProps?: string[]       # raw Figma code-only prop names typed as images;
                               # sourceProps[0] is the imageComponent's own source prop
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `schema/styles.schema.json` | Add property `backgroundImage` → `#/definitions/ImageStyleValue` under `Styles.properties` | MINOR |
| `schema/styles.schema.json` | Add definitions `ImageStyleValue`, `ImageValue`, `ObjectFitValue` | MINOR |
| `schema/component.schema.json` | Add property `images` → `#/definitions/Images` on the component object | MINOR |
| `schema/component.schema.json` | Add definitions `Images` and `ImageData` (object: optional `src`, `$extensions['com.figma'].imageHash`) | MINOR |
| `schema/component.schema.json` | Add `#/definitions/ImageProp` to the `AnyProp` `oneOf` and define `ImageProp` | MINOR |
| `schema/component.schema.json` | Add `#/definitions/ImageBinding` to the `PropConfigurationValue` `oneOf` and define it | MINOR |
| Config schema | Add `processing.images` (`{ backgroundImage?, imageComponent?, sourceProps? }`; `imageComponent` requires a non-empty `sourceProps`) | MINOR |

**Example — new shapes** (`schema/styles.schema.json`):
```yaml
backgroundImage:
  $ref: "#/definitions/ImageStyleValue"
  description: "Fallback container image fill (used when no image component is configured). Represented in Figma as an IMAGE-type fill."

ImageValue:
  type: object
  description: "A layer image fill — a reference into an images registry plus optional fit."
  properties:
    $image:    { type: string, description: "Pointer into an images registry, e.g. '#/images/hero'." }
    objectFit: { $ref: "#/definitions/ObjectFitValue" }
  required: ["$image"]
  additionalProperties: false

ObjectFitValue:
  type: string
  enum: ["COVER", "CONTAIN"]
  description: "How the image is fitted to its layer (CSS object-fit vocabulary). Structural, not token-bindable. Absent = COVER. Transformer remaps Figma FILL→COVER, FIT→CONTAIN and coerces CROP→COVER, TILE→COVER."

ImageStyleValue:
  description: "Container image fill value — an ImageValue object, or null."
  oneOf:
    - { $ref: "#/definitions/ImageValue" }
    - { type: "null" }
```

**Example — new shapes** (`schema/component.schema.json`):
```yaml
# On the component object, beside slotContentExamples (the "examples" concern — examples.yaml under --split-concerns)
images:
  $ref: "#/definitions/Images"
  description: "Registry of image data referenced by backgroundImage fills (ImageValue.$image), ImageBinding examples, and ImageProp default. De-duplicated by the transformer."

Images:
  type: object
  patternProperties:
    "^[a-zA-Z0-9_-]+$": { $ref: "#/definitions/ImageData" }
  additionalProperties: false

# Two-phase expressed structurally: src absent = unresolved; resolution ADDS src
ImageData:
  type: object
  description: "A registry entry for one distinct image; the Figma identity in $extensions survives resolution."
  properties:
    src:         { type: string, description: "Resolved image source — emitted asset path (standard), data: URI, or URL. Absent = unresolved." }
    $extensions: { com.figma: { imageHash: string } }
  additionalProperties: false

ImageProp:
  type: object
  description: "Image-valued property. The authoring-default image rides on the ImageBinding at the binding site, not here."
  properties:
    type:     { type: string, const: "image" }
    default:  { type: ["string", "null"] }
    nullable: { type: boolean }
    $extensions: { $ref: "#/definitions/PropExtensions" }
  required: ["type"]
  patternProperties: { "^\\$": {} }
  additionalProperties: false

ImageBinding:
  type: object
  description: "A prop-bound image forwarded into a nested image instance's source prop, with authoring-default examples."
  properties:
    $binding: { type: string }
    examples: { type: array, items: { $ref: "#/definitions/ImageValue" } }
  required: ["$binding"]
  additionalProperties: false
```

### Notes

- **Fill-style precedence (2026-07-15 revision).** A Figma fill *style* (`fillStyleId`) whose styled paint is an **image** routes its style reference to `backgroundImage` as a `TokenReference` with **`$type: image`** (a Specs extension to the DTCG type set, like `effects`) — never to `backgroundColor`, which stays color-only and emits nothing for an image paint. `Styles.backgroundImage` is therefore `ImageValue | TokenReference | null` (schema: `ImageStyleValue` gains the `TokenReference` arm; `TokenReference.$type` gains `image`). A style-referenced image contributes no `images` registry entry — the token names the style; the pixels stay Figma-side, like every other tokenized value. The paint's `scaleMode` is not carried on the token form (fit belongs to the style's own definition).
- **Sourcing binds through `propConfigurations`, never through `backgroundImage`.** A parent forwarding an image into a nested image component uses an `ImageBinding` under that instance's `propConfigurations`, exactly like any other forwarded prop. `Styles.backgroundImage` carries only a static/example `ImageValue` for the no-component fallback.
- **Where image-source props come from.** Figma has no native image-typed component property, so an `ImageProp` is not extracted from a Figma property directly — it originates from an existing **code-only prop** (ADR-027; `$extensions.com.figma.source.kind = 'codeOnlyProp'`), which Figma surfaces as a `string`. The transformer re-types a conventionally-named code-only prop as `type: image` — initially a hard-coded name (e.g. a code-only prop named `imageSource`) mapped to `ImageProp` instead of `StringProp`. This is transformer behaviour, not a schema mechanism; the schema only defines the resulting `ImageProp` shape.
- **`objectFit` placement.** For the **image component**, fit (`COVER`/`CONTAIN`) is an ordinary prop/variant of that component (e.g. an `EnumProp` with `enum: ["COVER","CONTAIN"]`) — no schema-special handling. For the **fallback fill**, it is `ImageValue.objectFit`. Answering the sibling-vs-subproperty question: it is a **subproperty** of the `backgroundImage` object.
- **Why `backgroundImage` is an object.** It already needs `$image` + optional `objectFit`, and modelling it as an object (not a bare pointer) means `rotation`, `opacity`, and `filters` can be added later as optional subproperties without a breaking change. This also keeps a fill's own opacity/rotation distinct from the node's `styles.opacity`/`styles.rotation`.
- **`processing.images` resolution.** The block is optional on both shapes (presence-switched, like `subcomponents`/`instanceExamples`). When present on `ResolvedConfig`, `backgroundImage` (default `false`) and `sourceProps` (default `[]`) are required-with-defaults. `imageComponent` without a non-empty `sourceProps` is invalid — the component needs a forwarding target (`sourceProps[0]`) — and is dropped with a warning at config validation.
- **Registry value & data storage (answers Q2; 2026-07-16 revision — supersedes the string-scheme form).** Each entry is an object: the Figma identity in `$extensions['com.figma'].imageHash` (always present when extracted from Figma), and a `src` once resolved — an **emitted asset path** (the standard resolved form), a `data:` URI, or an external URL. Resolution **adds** `src` rather than replacing anything, so the hash survives for reverse-direction tooling: figma-from-specs reconstructs an `ImagePaint` from it and round-trips reuse the same Figma image without re-uploading bytes. Whether/when the CLI resolves an entry is a CLI concern (this package stays logic-free). The resolved form is a file, not embedded base64 — files are what downstream consumers actually want, and embedding bloats every spec read.
- **Emitted-file layout (2026-07-15 revision — supersedes the earlier `data:`-URI default).** The CLI writes each distinct image once to **`_images/<imageHash>.<ext>`** inside the output directory, and the registry value is that file's path **relative to the spec file that references it** (`_images/...` beside the spec files; `../_images/...` when spec files sit in per-component folders). The underscore avoids colliding with a component titled "Images" and marks the folder as non-component content; hash-named files de-duplicate across components and make re-runs idempotent; the extension is detected from the downloaded bytes (png/jpg/gif/webp). Relative-to-file references mean any consumer that opens a spec resolves its images like sibling files, without knowing the output root.
- **Unresolved images live in the registry *entry*, not `$image`.** `$image` stays a uniform registry pointer; the Figma hash rides in the entry's `$extensions` and the resolution state in the presence of `src`. This keeps every reference stable across resolution (a `--get-images` run touches one entry per image, not every occurrence in variants/bindings/props), preserves dedup, and lets any detection-only or size-constrained producer emit the tiny identity-only registry so `$image` never dangles. Overloading `$image` to be *either* a pointer *or* a raw hash was considered and rejected — it splits `$image` into two syntactic forms and forces reference rewrites on resolution.
- **Two-phase resolution.** Detection (`processing.images`) emits `$image` references and an `images` registry of identity-only entries (no `src`). A later resolution step — `generate --get-images` (REST: the Get Image Fills call) — adds `src` to each entry. A spec is valid and fully structured before any bytes are fetched.
- **Reference form.** `$image` and `ImageProp.default` are pointers into an `images` registry — root-relative (`#/images/hero`) in a single-file spec, or carrying the component + concern prefix (`card.examples#/images/hero`) in concern-split output (ADR-061); the cross-file addressing follows ADR-061, not this ADR.
- **`ImageBinding` reuses `SlotBinding`'s shape** (ADR-047: `PropBinding` + `examples?`), here with `examples?: ImageValue[]`.
- **`backgroundImage` optional & non-text.** `Styles` is a `Partial`; present only where a container image fill exists (not `TEXT`/`GLYPH`). `additionalProperties: false` on `Styles` requires the property be declared for valid output.

### Out of scope (deferred)

The Figma `ImagePaint` surface is larger than this ADR; the following are intentionally excluded and can be added additively later:

- **Faithful `CROP` / `TILE` rendering** (Figma) — these are **coerced to `COVER`** so the image is still captured (no silent drop), but the crop rectangle (`imageTransform`) and tile repeat (`scalingFactor`) are not represented. Modelled faithfully they are separate axes from fit — a crop-transform field and a repeat/tiling field, matching how CSS/SwiftUI/Compose separate them from `object-fit` — so they belong in their own future fields, not as `objectFit` values.
- **Per-fill `rotation` and `opacity`** — for the **image-component** path these are already expressible on the **instance element's** `styles.rotation` / `styles.opacity`; for the **fallback fill** they would become optional subproperties of the `backgroundImage` object, but their cross-platform mapping (CSS/iOS/Android) is unresolved, so they are deferred. The object shape reserves room for them.
- **`imageTransform`** (crop/pan matrix), **`scalingFactor`** (TILE zoom), **`filters`** (exposure/contrast/saturation/temperature/tint/highlights/shadows) — not modelled.
- **`visible`** on the paint — a paint-level visibility toggle is not surfaced; layer visibility is already handled by `styles.visible`.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**:
  - `ObjectFit` ↔ `ObjectFitValue` (`enum ["COVER","CONTAIN"]`).
  - `ImageValue` (`{ $image, objectFit? }`) ↔ `#/definitions/ImageValue` (`$image` required, `objectFit` optional).
  - `ImageData` ↔ `#/definitions/ImageData` (object: optional `src`; `$extensions['com.figma'].imageHash` required inside the extension).
  - `Styles.backgroundImage` (`ImageValue | null`) ↔ `Styles.properties.backgroundImage` → `ImageStyleValue`; `StyleKey` gains `'backgroundImage'`.
  - `Images` (`Record<string, ImageData>`) ↔ `#/definitions/Images` (values → `#/definitions/ImageData`); `Component.images` ↔ component `images` property.
  - `ImageProp` ↔ `#/definitions/ImageProp`, added to `AnyProp` `oneOf`.
  - `ImageBinding` ↔ `#/definitions/ImageBinding`, added to `PropConfigurationValue` `oneOf`.
  - `Config.processing.images` ↔ `processing.images` (`{ backgroundImage?, imageComponent?, sourceProps? }` — `imageComponent` requires a non-empty `sourceProps`).

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | When `processing.images` is present: with `backgroundImage`, extract `IMAGE` fills, dedup into the `images` registry, and emit `backgroundImage` on containers; with `imageComponent`, route designated instances' images through `sourceProps[0]` via `propConfigurations` (`ImageBinding` when the host has an image prop; a direct registry-reference string otherwise); re-type `sourceProps`-named **code-only props** (ADR-027) from `string` to `type: image`. Without the `backgroundImage` trigger, stray fills are never detected. The two runtimes resolve image bytes differently — see **Runtime notes** below. | New extraction/registry/dedup logic, the trigger branches, the code-only-prop → `ImageProp` re-typing, and the per-runtime byte-resolution path; recompile against new types. The largest downstream work item. |
| `specs-cli` | New keys/registry may appear in output; `processing.images` becomes a config option; a resolution step turns unresolved entries into emitted files. | Recompile against new schema; surface the new config; add a **`--get-images`** resolution path on `generate` that calls Get Image Fills, fetches bytes, writes `_images/<imageHash>.<ext>` inside the output directory, and adds `src` (a spec-file-relative path) to each entry (see Notes: emitted-file layout). |
| `specs-plugin-2` | New keys/registry may appear in plugin-side output; the plugin needs settings to drive image processing; and it **cannot embed raw image bytes** on the component asset (Figma saved-data size limits) — see **Runtime notes** below. | Recompile against new types; extract image fills/props in the plugin runtime. Emit the `images` registry with **identity-only entries** (not bytes) and duplicate detected images into the **Styling Inventory** (200×200 boxes). Surface the config (`processing.images` and its triggers) in settings. **A concrete UI is a suggested starting point, not part of this decision** — see the note below. |

**Suggested plugin Settings UI (non-binding — a starting point informed by this ADR, not a schema decision):** an **"Images"** checkbox (→ `processing.images` block presence) revealing the three triggers — a **background fills** checkbox (→ `backgroundImage`), a **source prop names** field (→ `sourceProps`, comma-separated raw Figma names, first = the component's source prop), and an **image component name** field (→ `imageComponent`, requires source props). The config options are identical to the REST/CLI path; only the resolved bytes differ.

### Runtime notes (populating the `images` data)

The `images` registry is one string per image, but the two runtimes obtain and deliver that data very differently — an asymmetry consumers must expect:

- **REST** — `GET /v1/files/:key` represents image fills only as `imageRef` hashes inside `fills[]`; the raw bytes are **not** in the file JSON. Resolving them requires a **second call**, `GET /v1/files/:key/images` (Get Image Fills), which returns a map of `imageRef` → a **temporary S3 download URL (expires ~14 days)**. Until that call runs (gated behind `generate --get-images`), registry entries carry only the identity (no `src`). When it runs, because the S3 URLs expire, the CLI fetches the bytes, emits asset files (`_images/<imageHash>.<ext>` inside the output directory), and adds `src` (the spec-file-relative path) — never the S3 URL, and never embedded base64.
- **Plugin** — Figma caps the data saved on a node/component asset, so embedding raw image **bytes** would blow that budget. The plugin emits the `images` registry with **identity-only entries** (tiny, within budget) rather than data, and additionally duplicates each detected image into the **Styling Inventory** section (e.g. 200×200 boxes) for human reference. Config options match the REST/CLI path; only the resolved bytes are absent.

Because both runtimes emit the identity registry, `$image` pointers (on `backgroundImage`, `ImageBinding.examples`, `ImageProp.default`) **always resolve to a registry entry** — resolved or not — and never dangle, in any runtime. This is the two-phase model (see Notes), not a per-runtime special case.

---

## Semver Decision

**Version bump**: `0.28.0 → 0.28.0` (`MINOR`; lands within the in-progress, unreleased `0.28.0`)

**Justification**: Every change is additive — a new `types/Image.ts` module, one new optional `Styles` key, one new `AnyProp` member, one widened `PropConfigurationValue` union, one new optional `Component` field, two new optional `Config` fields, and their additive schema definitions. No existing type, field, or schema property is removed, renamed, or restructured; `ColorStyle` is untouched. Additive changes are `MINOR` per Constitution III and the Versioning policy. Because `0.28.0` is unreleased, the additions ride within that MINOR release.

---

## Consequences

- Spec output faithfully represents imagery in both DS patterns — nested image component (via `propConfigurations` + `ImageBinding`) and layer fill (via `backgroundImage`) — selected deterministically by the independent triggers of `Config.processing.images`. Image fills are no longer silently dropped when detection is enabled.
- A consumer can enforce a single image representation by designating an `imageComponent` and omitting the `backgroundImage` trigger — routing all imagery through the component — with no extra flag; enabling both makes the fill the stray-fill fallback.
- Image processing is **two-phase**: detection (`processing.images`) emits `$image` references and an `images` registry of identity-only entries; a later resolution step (`generate --get-images`; REST's Get Image Fills call) emits asset files under `_images/` and adds `src` to each entry — the Figma identity survives. A spec is valid and fully structured before any bytes are fetched, and `$image` references never dangle.
- Runtime differences narrow to byte *resolution* (see Runtime notes): REST needs the Get Image Fills call (temporary S3 URLs); the plugin keeps placeholder values and surfaces bytes visually via the Styling Inventory. Consumers needing embedded data use the REST/CLI resolution path.
- A single `Component.images` registry stores each image once; fills, bindings, and props reference it, so no image duplicates across variants or between a fill and its feeding prop.
- Sourcing an image into a component flows through the normal prop-forwarding channel (`propConfigurations`), keeping `backgroundImage` a plain, unbound fill and avoiding a second "bindable fill" concept.
- Example images ride on the binding (`ImageBinding.examples`), exactly like slot authoring defaults (`SlotBinding.examples`).
- `ColorStyle` remains color-only; `backgroundImage` is a distinct fill whose object shape reserves room for `rotation`/`opacity`/`filters` without a future break.
- Reverse-direction tooling (`figma-from-specs`) gains named keys to reconstruct an `ImagePaint` (`$image` → `imageHash` via the registry; `objectFit` inverts the remap — `COVER → FILL`, `CONTAIN → FIT`; `CROP`/`TILE` were coerced away, so they are lossy and not recoverable) and to write image-valued component props.
- `ObjectFit`, `ImageValue`, `FigmaImageRef`, `ImageData`, `Images`, `ImageProp`, and `ImageBinding` become part of the public type surface, subject to Constitution III stability rules.
- Consumers validating against `schema/*` must adopt `0.28.0`; components carrying `backgroundImage`, `images`, or an `image` prop would fail validation against `0.27.0` (`additionalProperties: false`).
