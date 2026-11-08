---
title: "images"
description: "Process image fills and image-source props — the figma.images block and its representation triggers"
---

Image processing is controlled by one block: `figma.images`. A library fact — how a library expresses images is a property of the library, and a wrong declaration loses images rather than merely reshaping them. The block's **presence** is the on-switch (like `subcomponents`), and each member is an **independent representation trigger**; absent by default, so components are unchanged unless the library declares the convention.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `images` |
| **Type** | block (`match`, `component`, `backgroundImage`, `sourceProps`) |
| **Default** | absent (no image processing) |

## Properties

Four triggers, combinable freely:

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `match` | `string` | No | — | Naming pattern identifying the images a library lays out on a page, with `{i}` capturing the image name (e.g. `Image / {i}`). The same form [`glyphs.match`](/settings/glyphs/) takes |
| `component` | `string` | No | — | What this platform calls the designated image component (e.g. `DS Image` in Figma, `DsImage` in React): instances of it are the image primitive. Requires a non-empty `sourceProps` — `sourceProps[0]` is its source prop, routed via `propConfigurations` |
| `backgroundImage` | `boolean` | No | `false` | Detect `IMAGE`-type fills on containers as [`Styles.backgroundImage`](/schema/styles/); the fallback for stray fills when `component` is set |
| `sourceProps` | `string[]` | No | — | Code-only prop names (exact, raw Figma names — the same convention as subcomponent and glyph patterns) that re-type from `StringProp` to [`ImageProp`](/schema/props/) on any component |

## Laid-Out Image Assets

A library curates images the way it curates icons — a page of them, named for what they are. `match` is how that set is declared:

```yaml
images:
  match: 'Image / {i}'
```

A frame qualifies when its name matches the pattern **and** it sits either as a direct child of a page, or as a direct child of a section that is itself a direct child of a page. That position rule is what separates a curated grid from an image used incidentally deeper in the file — a pattern matched at any depth would extract placeholders inside components as library assets.

The captured `{i}` is the image's name. `{i}` is the same placeholder `glyphs.match` uses: in a glyph pattern it captures an icon's name, in an image pattern an image's, and the property it sits in says which.

A library nesting its images more than one section deep is not detected, and nothing reports the absence — the images are simply not found.

## Example

Background fills only:

```yaml
images:
  backgroundImage: true
```

Component with background-fill fallback — image props route through `DS Image`; any image fill outside it still emits as `backgroundImage`:

```yaml
images:
  backgroundImage: true
  component: DS Image
  sourceProps: [source, image]
```

Component only — the designated component is the sole image representation; stray fills are not detected:

```yaml
images:
  component: DS Image
  sourceProps: [source]
```

Typed image props only — re-type `image`-named code-only props without detecting fills or designating a component:

```yaml
images:
  sourceProps: [image]
```

## Result

With images processing on, images are stored once in the `Component.images` registry and referenced by `$image`. A layer fill lands on `backgroundImage`; a sourced image forwards through `propConfigurations` as an `ImageBinding`:

```yaml
components:
  dsAvatar:
    title: DS Avatar
    props:
      image:
        type: image
        nullable: true
    default:
      elements:
        imageComponent:
          propConfigurations:
            source:
              $binding: "#/props/image"
              examples:
                - $image: "dsAvatar.examples#/images/userPhoto"
    images:
      userPhoto:
        src: "../../assets/images/89b270d29dd5ea753b71af11bfcf1bf0ecc851cf.png"
        $extensions:
          com.figma:
            imageHash: 89b270d29dd5ea753b71af11bfcf1bf0ecc851cf
```

When the `images` block is absent, none of this is emitted.

## Object Fit

Image fills carry an optional `objectFit` using CSS `object-fit` vocabulary — `COVER` (default) or `CONTAIN`. Figma's `scaleMode` is remapped: `FILL → COVER`, `FIT → CONTAIN`, with `CROP`/`TILE` lossily coerced to `COVER` so no image fill is dropped. For a designated image component, expose fit as an ordinary prop of that component instead.

## Storage

Each `images` entry holds the Figma identity (`$extensions['com.figma'].imageHash`) and, once resolved by `specs generate --get-images`, a `src` path. The two-phase resolution model, the per-runtime behavior, and the asset layout are covered in the [Images guide](/guides/images/#how-image-data-is-stored).

## Legacy name

In the pre-split `specs.config.yaml`, this block was `config.processing.images` and the designated component was named by `imageComponent`. That file is no longer read — [`specs migrate config`](/cli/commands/migrate/) converts it, moving `imageComponent` to `component`.

## Further reading

- [Images guide](/guides/images/) for the two patterns end to end.
- [Schema: Styles](/schema/styles/) for the `backgroundImage` value shape.
- [Schema: Props](/schema/props/) for the `ImageProp` shape.
- [Schema: Component](/schema/component/) for the `images` registry.
