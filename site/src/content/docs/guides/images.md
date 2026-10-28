---
title: "Images"
description: "Capture image fills and image-source props — as a designated image component or a container background fill"
---

Design systems use images two ways, and Spectacular captures both. Sometimes an image is a **layer fill** — a card with a photographic background, a hero banner painted directly on a container. Other times it flows through a dedicated **image component** — a `dsImage` or `dsAvatar` with a `source`-like prop that renders whatever image is passed in. Which one you get is a declared convention, not a guess.

## The Problem

Until now the schema had no representation for images at all. An `IMAGE`-type fill on a Figma node was silently dropped, there was no image prop type, and the actual pixels an image points at had nowhere to live. Any component whose design contract includes imagery lost that information entirely.

## What It Does

When the [`figma.images`](/settings/images/) convention is declared, the engine captures image fills and image-source props and stores each distinct image once in a `Component.images` registry, referenced by an `$image` pointer:

```yaml
default:
  elements:
    root:
      styles:
        backgroundImage:
          $image: "card.examples#/images/hero"
          objectFit: COVER          # COVER (default) or CONTAIN

images:
  hero:
    src: "../../assets/images/705867125834a686a51bdf161a0a39cdba0f9a58.jpg"
    $extensions:
      com.figma:
        imageHash: 705867125834a686a51bdf161a0a39cdba0f9a58
```

## The Two Patterns

### Image as a layer fill

No designated image component — the image is painted directly on a container. It lands on [`Styles.backgroundImage`](/schema/styles/) as an `ImageValue` (`{ $image, objectFit? }`). This is the default when no image component is configured.

### Image as a component

Your system has a designated image primitive (say `dsImage`) with an image `source` prop, and other components nest it. The parent forwards its own image prop into the nested instance through `propConfigurations` — the same channel as every other forwarded prop — carrying the authoring-default image as an example:

```yaml
# dsAvatar references dsImage
dsAvatar:
  props:
    image:
      type: image
      nullable: true
  elements:
    imageComponent:
      type: instance
      instanceOf: dsImage

  default:
    elements:
      imageComponent:
        propConfigurations:
          source:
            $binding: "#/props/image"
            examples:
              - $image: "dsAvatar.examples#/images/userPhoto"
```

Sourcing binds through `propConfigurations`, never through `backgroundImage` — `backgroundImage` is reserved for the no-component fill case.

## Configuration

Everything lives in one block: [`figma.images`](/settings/images/) in `config/conventions/figma.yaml`. Its presence is the on-switch, and each member is an independent representation trigger:

```yaml
# config/conventions/figma.yaml
images:
  backgroundImage: true      # detect image fills → Styles.backgroundImage
  match: dsImage             # designate an image component (requires sourceProps)
  sourceProps: [source]      # code-only props typed as images; first = dsImage's source prop
```

| Goal | Convention | Behavior |
|------|--------|----------|
| Background fills only | `backgroundImage: true` | Every image fill → `backgroundImage` on containers |
| Component + fill fallback | `match` + `sourceProps` + `backgroundImage: true` | Image props route through the component; stray fills still emit as `backgroundImage` |
| Component only | `match` + `sourceProps` | The component is the **only** image representation; stray fills are not detected |
| Typed image props only | `sourceProps` alone | Listed code-only props re-type to `ImageProp`; no fill detection, no component routing |

## Object Fit

`objectFit` uses CSS `object-fit` vocabulary — `COVER` (fill the box and crop, the default) or `CONTAIN` (fit entirely inside). Figma's `scaleMode` is remapped: `FILL → COVER`, `FIT → CONTAIN`, and `CROP`/`TILE` are lossily coerced to `COVER` so no image fill is dropped. For a designated image component, expose fit as an ordinary prop of that component instead.

## How Image Data Is Stored

The `images` registry stores each image once. An entry carries the Figma identity (`$extensions['com.figma'].imageHash`) and — once resolved — a `src`: an emitted asset path (the standard resolved form), a `data:` URI, or an external URL. `src` absent means **unresolved**. Image processing is two-phase:

The Figma plugin cannot embed raw image bytes on the component asset (Figma caps saved data), so it emits identity-only entries and additionally duplicates each detected image into the **Foundations** section for human reference. The REST/CLI path is how you get actual image files.

1. **Detect** — emit `$image` references and the registry, entries carrying only the Figma identity.
2. **Resolve** (CLI's `generate` command only) — `specs generate --get-images` fetches the bytes, writes each distinct image once to `assets/images/<imageHash>.<ext>` at the workspace root, and ADDS `src` (the file's path relative to the referencing spec file); the identity survives for reverse-direction tooling.

The REST runtime resolves entries via a second call (Get Image Fills, whose S3 URLs expire ~14 days), downloading the bytes into emitted files — never persisting the URL or embedding base64. `$image` pointers always resolve to a registry entry, so they never dangle.
:::

## Further Reading

- [`figma.images`](/settings/images/) — convention reference
- [Schema: Styles](/schema/styles/) — the `backgroundImage` value shape
- [Schema: Props](/schema/props/) — the `ImageProp` shape
- [Schema: Prop Configurations](/schema/prop-configurations/) — the `ImageBinding` shape
- [Schema: Component](/schema/component/) — the `images` registry
