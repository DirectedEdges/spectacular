---
title: "Images"
description: "Capture image fills and image-source props, and reach the images a library curates for itself"
---

A design system holds images in more than one place, and Spectacular reaches all of them. An image can be a **layer fill** — a card with a photographic background, a hero banner painted on a container. It can flow through a dedicated **image component** — a `dsImage` or `dsAvatar` with a `source`-like prop. And a library can **curate a set of its own**, the way it curates icons: images on published fill styles, or laid out as named frames on a page, belonging to no component at all. Which of these you get is a declared convention, not a guess.

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

## The Three Patterns

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

### A set the library curates

The images a library publishes for its own sake, belonging to no component: photographs on published **fill styles**, and frames **laid out on a page** and named to a pattern, the way a page of icons holds glyph components.

These are the images someone reaches for when authoring something new, so they are not tied to a component spec at all. `specs fetch` downloads them with its [`images`](/cli/commands/fetch/#fetching-image-fills-carried-by-styles) kind and records them in `data/cache/images.yaml`, which is the roster the next author reads. Declare the page pattern as [`images.match`](/settings/images/#laid-out-image-assets); fill styles need no declaration, because a style painting an image identifies itself.

## Configuration

Everything lives in one block: [`figma.images`](/settings/images/) in `config/conventions/figma.yaml`. Its presence is the on-switch, and each member is an independent representation trigger:

```yaml
# config/conventions/figma.yaml
images:
  match: 'Image / {i}'       # naming pattern for images laid out on a page, {i} = the name
  component: DS Image        # the designated image component (requires sourceProps)
  backgroundImage: true      # detect image fills → Styles.backgroundImage
  sourceProps: [source]      # code-only props typed as images; first = the component's own
```

| Goal | Convention | Behavior |
|------|--------|----------|
| Background fills only | `backgroundImage: true` | Every image fill → `backgroundImage` on containers |
| Component + fill fallback | `component` + `sourceProps` + `backgroundImage: true` | Image props route through the component; stray fills still emit as `backgroundImage` |
| Component only | `component` + `sourceProps` | The component is the **only** image representation; stray fills are not detected |
| Typed image props only | `sourceProps` alone | Listed code-only props re-type to `ImageProp`; no fill detection, no component routing |
| A curated set laid out on a page | `match` | Named frames become library images, fetched with the [`images`](/cli/commands/fetch/#images-laid-out-on-a-page) kind |

`match` names a *pattern*, not a component. Until [ADR-117](/adr/117-library-image-assets/) it named the component, and that value now belongs on `component` — see [Legacy name](/settings/images/#legacy-name).

## Object Fit

`objectFit` uses CSS `object-fit` vocabulary — `COVER` (fill the box and crop, the default) or `CONTAIN` (fit entirely inside). Figma's `scaleMode` is remapped: `FILL → COVER`, `FIT → CONTAIN`, and `CROP`/`TILE` are lossily coerced to `COVER` so no image fill is dropped. For a designated image component, expose fit as an ordinary prop of that component instead.

## How Image Data Is Stored

The `images` registry stores each image once. An entry carries the Figma identity (`$extensions['com.figma'].imageHash`) and — once resolved — a `src`: an emitted asset path (the standard resolved form), a `data:` URI, or an external URL. `src` absent means **unresolved**. Image processing is two-phase:

The Figma plugin cannot embed raw image bytes on the component asset (Figma caps saved data), so it emits identity-only entries and additionally duplicates each detected image into the **Foundations** section for human reference. The REST/CLI path is how you get actual image files.

1. **Detect** — emit `$image` references and the registry, entries carrying only the Figma identity.
2. **Resolve** — the bytes are downloaded and each distinct image is written once to `assets/images/<imageHash>.<ext>` at the workspace root, with `src` added to the registry entry; the identity survives for reverse-direction tooling.

Two commands resolve bytes into that one directory, and because the filename is the image's content hash neither re-downloads the other's work:

| Command | Finds | Recorded as |
|---|---|---|
| `specs generate --get-images` | images on the components being generated | `src` on the component's own registry entry |
| `specs fetch` with the [`images`](/cli/commands/fetch/#fetching-image-fills-carried-by-styles) kind | the library's own images — on published fill styles, and laid out on a page | entries in [`data/cache/images.yaml`](/cli/commands/cache/#what-it-writes) |

## Finding what the library already has

`data/cache/images.yaml` is the roster of every image the workspace holds, keyed by content hash, each entry carrying what the library calls it, where it lives in Figma, and which components use it:

```yaml
entries:
  b60ac7bc8ed5d5b5b7f676b27f46ab44eb2355ef:
    src: assets/images/b60ac7bc8ed5d5b5b7f676b27f46ab44eb2355ef.png
    name: Images / Wanaka
    origin: [style]
    file: library
```

`origin` says where the image lives — `style`, `pageFrame`, or `component`, and an image can be more than one. The whole set is also browsable as the **Foundations → Images** page in a published Storybook.

That file is what makes a library image usable in a spec you are writing by hand: [Using a library image in a spec you are writing](/cli/commands/fetch/#using-a-library-image-in-a-spec-you-are-writing) shows the registry entry to author from it.

The REST runtime resolves entries via a second call (Get Image Fills, whose S3 URLs expire ~14 days), downloading the bytes into emitted files — never persisting the URL or embedding base64. `$image` pointers always resolve to a registry entry, so they never dangle.

## Further Reading

- [`figma.images`](/settings/images/) — convention reference
- [Schema: Styles](/schema/styles/) — the `backgroundImage` value shape
- [Schema: Props](/schema/props/) — the `ImageProp` shape
- [Schema: Prop Configurations](/schema/prop-configurations/) — the `ImageBinding` shape
- [Schema: Component](/schema/component/) — the `images` registry
