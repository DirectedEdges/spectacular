---
title: "images.setup"
description: "Work out how your library holds its own images, then prove they resolve to named, downloaded assets"
---

A skill that establishes the [`images`](/settings/images/) convention for your library and turns on the [`images`](/cli/commands/fetch/#fetching-image-fills-carried-by-styles) fetch kind: so the images your library holds become **named assets** someone can reference when authoring, rather than pixels locked inside a Figma file.

Installed by [`specs skills install`](/cli/commands/skills/) as `.claude/skills/specs-cli.images.setup/`, then invoked in Claude Code.

## Scope

A library holds images in three places, and they need different amounts of declaring:

| Where it lives | Found by | Needs declaring? |
|---|---|---|
| A published **fill style** whose paint is an image | `specs fetch` with the `images` kind | **No** — a style painting an image identifies itself |
| A frame **laid out on a page**, named to a pattern | the same fetch, once `images.match` declares the pattern | **Yes** |
| A fill **on a component** | [`specs generate --get-images`](/cli/commands/generate/) | `processing.images` in the convention block |

So part of this works with nothing written at all. The skill checks what fill styles already give you before proposing a pattern — a library that keeps its curated images on styles may need no new config.

Reach for it when your library lays images out on a page the way it lays out icons, or when you are unsure which of the three shapes you have.

## Rationale

The shape of the evidence is mechanical — a frame's name and its position in the page tree can both be read off the payload. What cannot be derived is **which frames in the file are library images at all.**

A Figma file is full of images that are not library assets: screenshots in documentation, photos inside component examples, a moodboard someone left on a page. No rule separates those from the curated set. That judgment is the user's, and getting it wrong publishes a scratch page as design-system content.

This is why the position rule is strict. A qualifying frame is a direct child of a page, or a direct child of a section that is itself a direct page child — and nothing deeper. A pattern matched at any depth would extract the placeholder inside a component as a library asset.

## What it produces

- An `images` block in `config/conventions/figma.yaml` — `match` for the laid-out pattern, `component` for a designated image component if the library has one.
- `images` added to the source's `fetch` list, and that source refetched.
- A proposal report at `reports/<YYYY-MM-DD>.images-setup.proposal.md`, carrying the counts, the position facts, and recall and precision as numbers.

## How it proves the convention worked

A convention that matches nothing fails exactly like one that was never written — no error, and a workspace that looks complete. So the skill reports counts by origin rather than reporting success:

```
✓ Downloaded: library.images (29/29 from 24 fill styles + 5 laid out, 3s)
```

Three artifacts have to agree: the entries in [`data/cache/images.yaml`](/cli/commands/cache/#what-it-writes), the hash-named files under `assets/images/`, and the **Foundations → Images** page in a published Storybook.

`0 laid out` with a pattern declared is the failure worth distinguishing: usually the `file` payload predates the frames rather than the pattern being wrong. Refetching `file` comes before touching the convention.

## What it does not cover

Authoring a spec that *uses* one of these images. The skill makes the set exist and be nameable; writing an `images` registry entry into a component spec is an authoring act, and `data/cache/images.yaml` is the lookup that answers it — see [Using a library image in a spec you are writing](/cli/commands/fetch/#using-a-library-image-in-a-spec-you-are-writing).

## Related

- [`figma.images`](/settings/images/) — the convention reference
- [Images guide](/guides/images/) — the three patterns end to end
- [`icons.setup`](/cli/skills/icons-setup/) — the same shape, for glyph components
- [`fetch`](/cli/commands/fetch/) — the `images` kind and its prerequisites
