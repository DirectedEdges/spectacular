---
name: specs-cli.images.setup
description: Work out how a library holds its own images — on published fill styles, laid out on a page, or routed through an image component — write the images convention, refetch, and prove the images resolve.
---
<!--
  Canonical skill emitted by `specs skills install` — overwritten on every
  refresh; do not edit in place. A local override layer (a separate file the
  refresh never touches) is planned but not yet implemented; until it exists,
  local customizations belong in your own separate skill.
-->

> **Prerequisite — read once per session.** If you have not already read
> `.claude/skills/specs-cli.primer/SKILL.md` in this session, read it now. It is
> what Specs is and why its data is structured, and this procedure assumes it.

# Set up library images

Establish the [`images` convention](https://spectacular.systems/settings/images/) in `config/conventions/figma.yaml`, and turn on the `images` fetch kind: so the images a library holds become **named, downloaded assets** someone can reference when authoring, rather than pixels locked inside a Figma file.

A library holds images in three places, and they are found three different ways:

| Where it lives | Found by | Needs declaring? |
|---|---|---|
| A published **fill style** whose paint is an image | `specs fetch` with the `images` kind | **No** — a style painting an image identifies itself |
| A frame **laid out on a page**, named to a pattern | the same fetch, once `images.match` declares the pattern | **Yes** — `images.match` |
| A fill **on a component** | `specs generate --get-images` | `processing.images` in the convention block |

All three land in one place: `assets/images/<imageHash>.<ext>`, named for the image's content, and listed in `data/cache/images.yaml` keyed by that hash. An image found more than one way is one file and one entry carrying every fact about it.

With no `images` block at all, `--get-images` is inert — the CLI says so rather than failing: *"--get-images has no effect — images is not configured in config/conventions/figma.yaml"*. Fill styles are still fetched, because they need no declaration; laid-out frames are not, because nothing has said which frames they are.

This skill **authors a convention**, like `icons.setup` and `states.setup`. The shape of the evidence — a name pattern, a frame's position — is mechanical and checkable. What is not mechanical is **which frames in a file are library images at all.** A Figma file is full of images that are not library assets: screenshots in documentation, photos inside component examples, a moodboard. No rule separates those from the curated set; that is the judgment, and getting it wrong publishes someone's scratch page as design-system content.

## Order matters, and it costs a refetch

The `images` fetch kind downloads bytes, and it reads two payloads to decide what to download:

1. the source is already fetched with `fetch: [file, styles]`
2. this skill establishes the convention from those payloads
3. `images` is added to the source's fetch list
4. **that source is refetched**, which is when images are actually pulled

Say the refetch is coming before you start. Images are large — a curated photographic set runs to tens of megabytes — so this is slower than the icons equivalent, and a user who is not expecting it will think something looped.

**If you declare `images.match`, the `file` payload becomes a requirement of the `images` kind**, and fetch says so rather than finding nothing. Laid-out frames are read from the file payload; fill styles are read from the styles payload and a node request. A stale `file` payload is the one failure that looks like a broken convention: the frames you are looking at in Figma are simply not in the data yet. Refetch `file` first when the user added the frames recently.

## Steps

1. **Know which artifact answers which question.** Getting this wrong is the one failure that reliably produces a confident wrong answer:

   | Artifact | States | Does **not** state |
   |---|---|---|
   | `data/<alias>.styles.json` | every published style — `name`, `key`, `node_id`, `style_type` | **the paint** — no fills, no image reference |
   | `data/<alias>.file/page-*.json` | `type`, `children`, `fills` (with `imageRef`), `absoluteBoundingBox` — explicitly | the paint of a fill *style* |
   | `data/cache/images.yaml` | what was downloaded, by hash — `src`, `name`, `usedBy`, `origin` | anything not yet fetched |
   | `data/<alias>.manifest.md` | component name, node id, node type, dev status | **parentage, children, size, fills** |

   **A fill style's paint is not in the file payload.** The file's style map carries the name, key and type only; the style's defining node is not in the document tree at all. That is why the `images` kind makes a node request for fill styles and does not need one for frames — a frame carries its own `fills`.

   **A `/` in a frame name is not containment.** `Image / Wanaka` says nothing about where that frame sits. The payload states the parent. Read it.

   So: **names suggest, position decides, and the refetch proves.**

2. **Start with what is already free.** Fill styles need no convention, so check whether the library already has a curated set there before proposing anything:

   ```bash
   specs fetch --only <alias>,images
   ```

   If the source is not yet configured for `images`, read `data/<alias>.styles.json` instead and count the `FILL` styles. Either way, report what you find — a library with 24 image fill styles may already have the set it needs, and the laid-out pattern is then an addition rather than the main event.

   **Do not skip this.** Proposing a page pattern to a library that keeps its images on styles is solving a problem it does not have.

3. **Get candidates for laid-out images from the names. Suggestion only.** Search `data/<alias>.file/page-*.json` for frames whose names suggest an image set — the library's own prefix, `image`, `photo`, `asset`, case-insensitively — and look at the shape of what comes back:

   - **Are there many?** A curated set is a handful to a few dozen. Two frames are probably not a set.
   - **Are they named the same way, in a pattern?** A fixed prefix with the image's own name varying after it.
   - **Is there more than one such pattern?** Two prefixes are two candidate populations, not one with exceptions. Keep them separate and prove each independently.
   - **What page are they on?** A curated set is almost always authored together on one page. Page locality is the strongest signal available.

   Record the counts. Nothing about membership is settled yet.

4. **Prove the position rule, from the payload.** This is the test, and it is stricter than the icons equivalent because position is what separates a curated asset from any image anywhere in the file.

   A frame qualifies only when **both** hold:

   | Must hold | Why | Where it is stated |
   |---|---|---|
   | It is a **direct child of a page**, or a direct child of a **section** that is itself a direct page child | A library lays its asset page out as top-level frames, optionally grouped into sections. Anything deeper is content, not a published asset | the node's position in `page-*.json` — the page's `children`, or a `SECTION` child's `children` |
   | It paints a **visible `IMAGE` fill** with an `imageRef` | A frame named like an asset that paints no image is a label or a spacer | the node's `fills` |

   Sample several frames from the population — not one — and read their actual nodes. Then gather corroborating evidence. **None of it is conclusive on its own**, and all of it is worth stating because a reviewer can sanity-check it instantly:

   - Are they all about the same size?
   - Do they sit in a grid, in layout order?
   - Is the page they are on named for images?

   **Then look for the disproof.** Deliberately sample for frames that match the name and fail the position rule — a matching frame inside a component, inside an example, two sections deep. Report what you find. A handful of near-misses is a set with outliers worth naming; a population where half the matches sit inside components means the name pattern is doing the wrong work, and the right outcome is to say so.

5. **Confirm the population with the user — once, after the proof.** Ask about *membership*, never about syntax. Which frames are library images is the one thing they know and you cannot derive.

   Show them: the count, two or three example names, the page they sit on, the position facts that held, and any outliers. Then one question:

   > "The `Images` page has 24 frames named `DE Image / <name>`, each a direct page
   > child painting one image. There are 6 more matching frames inside components on
   > other pages. Are the 24 the library's image set, and should the 6 stay out?"

   Their answer decides membership. Do not relitigate it with evidence afterwards.

6. **Write the pattern.** It is one line, and it needs no payload read:

   ```yaml
   images:
     match: 'DE Image / {i}'
   ```

   `{i}` marks where the image's name appears and becomes a `(.+)` capture — the captured text is the image's name in `data/cache/images.yaml`. The pattern must contain it, and it matches the frame name whole. A `match` without `{i}` is rejected with a message naming the placeholder, because a pattern with no capture matches one literal name and would silently find at most one image.

   **`{i}` is the same placeholder `glyphs.match` uses.** It captures an icon's name there and an image's here; the property it sits in says which. Nothing else is shared — a glyph pattern matches a *component* name, an image pattern a *frame* name.

   **`images.match` is one string, not a list**, like `glyphs.match` and unlike `subcomponents.match` in the same file.

   Prefer a pattern anchored by punctuation the set carries and other frames do not. A delimiter the set uses consistently does the excluding for free, where a bare prefix leaves `{i}` to swallow whatever follows it.

7. **Measure the pattern both ways**, against the payload, before fetching anything:

   - **Recall** — of the frames you called library images in step 3, how many does it match?
   - **Precision** — does it match anything you called *not* a library image, including anything that fails the position rule?

   Report both as counts. A pattern that matches 24 of 30 is not a pass; name the 6 and say what they are.

   **Do not widen a pattern to swallow misses.** `{i}` is greedy, so a loose pattern claims whole populations. The position rule limits the damage — a greedy match inside a component is still excluded — but it does not limit it on the asset page itself. A tight pattern with named exceptions beats a loose one.

8. **Declare the designated image component, if the library has one.** This is a separate member and a separate question from the laid-out set:

   ```yaml
   images:
     match: 'DE Image / {i}'
     component: DE Image
     sourceProps: [Image source]
   ```

   `component` is what **this platform** calls the designated image component — `DE Image` in Figma, `DsImage` in React — and each platform declares its own name in its own conventions file. It requires a non-empty `sourceProps`, whose first entry is that component's own source prop; declared without it, the component is inert and the loader says so.

   **`component`, not `match`.** Until ADR-117 the component's name lived on `match`; a library migrating from an older config moves that value across, and `specs migrate config` does it automatically for a pre-split file. If you find `match: DE Image` — a component name with no `{i}` — that is the old shape, and moving it to `component` is the fix.

   Add `backgroundImage: true` when image fills on ordinary containers should also be captured, as `Styles.backgroundImage`.

9. **Write the block, and write the report.** The `images` block goes into `config/conventions/figma.yaml`. The reasoning goes to `reports/<YYYY-MM-DD>.images-setup.proposal.md`, creating the directory if it does not exist — not into `analysis/` or `specs/`, which are regenerated. Name that path when you hand it over.

   The report carries the counts and the reasoning:

   - what the fill styles already held, as a count, from step 2
   - the grouping from step 3, as counts
   - the position facts that held, and the sampled frames they came from
   - recall and precision, as numbers
   - every frame you called a library image that the convention does **not** match, named
   - anything it matches that you did not call a library image, named — this list should be empty, and if it is not, say why you are accepting it
   - whether a designated component was declared, and its `sourceProps`

10. **Turn images on and refetch that source.** The convention does nothing until the fetch kind is added:

    ```yaml
    sources:
      <alias>:
        fetch: [file, variables, styles, images]
    ```

    ```bash
    specs fetch --only <alias>,images
    ```

    `--only` takes aliases and fetch kinds, so naming both narrows the run to one source's images. **Not `fetch --source`** — on `fetch` that flag names a file that is *not* in the config and takes a URL or key.

    **The line it prints is the first real proof**, and it separates the two sources:

    ```
    ✓ Downloaded: library.images (29/29 from 24 fill styles + 5 laid out, 3s)
    ```

    The laid-out count should match the population you proved in step 4, give or take the outliers you named. **`0 laid out` with a declared pattern means one of two things**, and they are worth distinguishing before touching the convention: the `file` payload predates the frames, or the pattern does not match. Refetch `file` and run again before concluding the convention is wrong — a stale payload is the more common cause and the one that looks least like itself.

11. **Prove the images resolved — this is what makes the claim true.** A convention that matches nothing fails exactly like one that was never written: no error, and a workspace that looks complete.

    Three artifacts, and all three have to agree:

    | Check | Where | What right looks like |
    |---|---|---|
    | The entries exist, by name | `data/cache/images.yaml` | one entry per image, keyed by hash, each with a `name` and an `origin` |
    | The bytes exist | `assets/images/` | one hash-named file per entry that has a `src` |
    | A human can see them | Storybook **Foundations → Images** | the grid, named, after `specs storybook publish` |

    Report the counts by origin, because they are different claims:

    - `origin: [style]` — from fill styles, which needed no convention
    - `origin: [pageFrame]` — from the pattern you just wrote. **This is the number that proves this skill worked.**
    - `origin: [component]` — from `generate --get-images`, which is a separate run
    - an entry with **no `src`** — found, but its bytes did not arrive. A legitimate state, not a failure; nothing prunes it, and a re-run picks it up

    An image with an empty `origin` on the Storybook page is a file on disk that no producer recorded — usually a leftover from an older run, and worth naming rather than ignoring.

    If nothing resolved as `pageFrame` at all, do not widen the pattern blindly: take one frame you proved in step 4, compare its name against the pattern character by character, and confirm from the payload that it really is a direct page child. Those two are the usual culprits, in that order.

12. **Component images are a second run, and a separate switch.** `generate --get-images` finds images on the components being generated, and it needs `processing.images` configured plus a Figma token:

    ```bash
    specs generate --get-images
    ```

    It writes into the same `assets/images/` directory with the same hash naming, so it never re-downloads what the fetch already pulled, and the reverse holds too. Run it when the library routes images through components — `component` declared, or `backgroundImage: true` — and report its count beside the other two.

## What this skill does not cover

**Authoring a spec that uses one of these images.** This skill makes the set exist and be nameable; writing an `images` registry entry into a component spec — a `src`, the Figma identity under `$extensions`, and an `$image` pointer at it — is an authoring act. It belongs to the component-authoring skills, and `data/cache/images.yaml` is the lookup they read to do it.

Say where the images landed and what they are called, and stop there.
