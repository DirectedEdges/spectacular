---
title: "images"
description: "Process image fills and image-source props — the figma.images block and its representation triggers"
---

Image processing is controlled by one block: `figma.images`. A library fact — how a library expresses images is a property of the library, and a wrong declaration loses images rather than merely reshaping them. The block's **presence** is the on-switch (like `subcomponents`), and each member is an **independent representation trigger**; absent by default, so components are unchanged unless the library declares the convention.

| | |
|---|---|
| **File** | `config/conventions/figma.yaml` |
| **Path** | `images` |
| **Type** | block (`backgroundImage`, `match`, `sourceProps`) |
| **Default** | absent (no image processing) |

## Properties

Three triggers, combinable freely:

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `backgroundImage` | `boolean` | No | `false` | Detect `IMAGE`-type fills on containers as [`Styles.backgroundImage`](/schema/styles/); the fallback for stray fills when `match` is set |
| `match` | `string` | No | — | Designated image component name (e.g. `DS Image`): instances of it are the image primitive. Requires a non-empty `sourceProps` — `sourceProps[0]` is its source prop, routed via `propConfigurations` |
| `sourceProps` | `string[]` | No | — | Code-only prop names (exact, raw Figma names — the same convention as subcomponent and glyph patterns) that re-type from `StringProp` to [`ImageProp`](/schema/props/) on any component |

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
  match: DS Image
  sourceProps: [source, image]
```

Component only — the designated component is the sole image representation; stray fills are not detected:

```yaml
images:
  match: DS Image
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

In the pre-split `specs.config.yaml`, this block was `config.processing.images` and the designated component was named by `imageComponent`. That file is no longer read — [`specs migrate config`](/cli/commands/migrate/) converts it, moving `imageComponent` to `match`.

## Further reading

- [Images guide](/guides/images/) for the two patterns end to end.
- [Schema: Styles](/schema/styles/) for the `backgroundImage` value shape.
- [Schema: Props](/schema/props/) for the `ImageProp` shape.
- [Schema: Component](/schema/component/) for the `images` registry.
