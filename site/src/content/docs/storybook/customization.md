---
title: "Customization"
description: "What you can change, what survives a rebuild, and how to take over a page."
---

Three kinds of file live under `storybook/`, with three different rules:

| Where | Written by | Rewritten? |
|---|---|---|
| `storybook/*` and `.storybook/*` — the host | `specs storybook init`, once | Never touched again (`init --force` rewrites them on request) |
| `storybook/content/**` — the generated pages and their data | `specs storybook`, every run | **Wholesale, every run.** Never edit here |
| `storybook/content-overrides/**` — your pages | You | Never. No command writes here |

## Taking over a generated page

Copy it to the same path under `content-overrides/` and edit the copy:

```bash
cp storybook/content/foundations/Color.stories.tsx \
   storybook/content-overrides/foundations/Color.stories.tsx
```

It takes effect immediately — with the server running, the override is indexed
and the generated twin withdrawn within a second or two, and deleting the
override brings the generated page back the same way. No restart in either
direction. Regeneration can never destroy your copy; the command does not
write into that tree.

For a moment after the copy lands, both files carry the same title and
Storybook logs an indexing error (`Unable to index …`). This heals itself as
soon as the next publish pass withdraws the twin — seconds. Don't restart,
don't re-save anything; if it persists past a publish, the two files have
*different* titles and both are being kept.

One consequence of taking a page over: its generated twin is withheld rather
than refreshed underneath, so publish's override report is what tells you when
the data your copy reads has moved.

One thing to stay aware of: your copy still reads the generated data files
under `content/`, and those move when the library and the toolkit move. If a
page you forked stops matching its data, the publish output names the overrides
it found so the divergence is visible rather than a surprise.

## Adding, changing, and removing pages

All three happen in `content-overrides/`, and none needs a restart:

- **Add** — drop any `*.stories.tsx` anywhere under `content-overrides/` with
  a `title` nothing else uses. It is globbed and appears in the sidebar within
  seconds. A title that duplicates an existing page is an indexing error, not
  a quiet shadowing — pick a new one.
- **Change** — edit the file; Vite hot-reloads the open page on save.
- **Remove** — delete the file. If it was an override of a generated page, the
  generated twin returns on the next publish pass: expect up to ~20 seconds
  with `specs storybook dev` running (debounce, publish, reload), or run
  `specs storybook` to force it now.

## Which pages bend, which resist

Not every page is a file you can copy. How a page is built decides how you
customize it:

| Page | Built from | To customize |
|---|---|---|
| Overview, Foundations, Analysis, Versions | A `.stories.tsx` under `content/` | Copy to `content-overrides/` — the mechanism above |
| **Component pages** | No file at all — autodocs entries rendered by `.storybook/ComponentDocs.tsx` | Edit that host file; it changes **every** component page at once. There is no per-component override |
| Mode toolbar | `.storybook/preview.tsx` + generated `content/components/modes.json` | Behavior in the host file; which controls exist via `modes.collections` in the conventions file |

Two consequences worth knowing before you fork:

- A forked foundations page keeps reading the generated data under
  `content/…/data/` — live data is the point, but it means you cannot freeze a
  page's content by forking it, and a data-shape change lands in your fork too.
  The publish output's override report is the early warning.
- Host-file edits (`ComponentDocs.tsx`, `preview.tsx`) are yours until the next
  `init --force`, which rewrites host files wholesale. Re-apply after an
  upgrade; `content-overrides/` is the only tree no command ever writes.

## Editing the host

Everything `init` wrote — the Storybook config, the theme, the port in
`package.json` — is yours. `specs storybook` never touches it. Re-running
`init` refuses so it cannot clobber your edits; `init --force` rewrites the
host files deliberately, and still never touches `content-overrides/`.

The port is the exception worth knowing, because `package.json` is one of the
files `--force` rewrites. Declare it under the `host` concern below and it
survives the rewrite; otherwise `--force` keeps whatever port the scaffold is
already serving.

When a CLI upgrade ships newer host files, the next `specs storybook` run tells
you — the host is stamped at `init`, and a stale stamp prints the one command
that upgrades it. Nothing upgrades silently.

## Declaring conventions: `config/conventions/storybook.yaml`

Choices that are taste rather than library data, declared under the concern
they belong to.

### `host` — where this workspace serves

```yaml
host:
  port: 6101
```

One port per workspace, so each has a localhost you can remember and bookmark.
Every command that needs the address reads it: `init` writes it into the
generated npm script, `dev` and [`specs run`](/cli/commands/run/) serve on it,
and [`specs testing visual shoot`](/cli/commands/testing/) points the browser
at it. A `--port` flag still wins for a single run.

If you add the declaration to a workspace that is already scaffolded, `dev`
says so and names the command that moves the host onto it — the running server
listens on whatever the npm script says, not on what you just declared.

### `color` and `modes` — what the pages show

For colour:

```yaml
color:
  collections:           # which collections render, in this order
    - "Color"
    - "Color Primitives"
  groupLeaves:           # collapse values into one row per folder…
    - "Color Primitives" #   …for just these collections (true = all of them)
  rowGroup:              # a whole group as ONE row — for ramps
    - "Palette"
modes:
  collections:           # collections whose modes become toolbar controls
    - "Color"
```

| Feature | Value | Effect |
|---|---|---|
| `color.collections` | ordered list of collection names | Which collections render, and their order. Absent = every local collection |
| `color.groupLeaves` | `true`/`false`, **or a list of keys** | One row per *folder* of variable names, side by side — for the listed collections, or everywhere with `true` |
| `color.rowGroup` | list of keys | The whole group as a single row — for ramps, whose steps mean something next to each other |
| `modes.collections` | list of collection names | Each becomes a toolbar dropdown switching the attribute the generated stylesheet carries |

**What a layout key may name** — exactly two shapes, nothing deeper:

- A **collection name** (`Color Primitives`) — applies to all of it.
- `Collection/Group`, where *Group* is the **first level** of the variable
  names (`Color/color`, `Color/elevation`). A deeper path like `Color/Neutral`
  names nothing — it is ignored **with a warning naming it** in the publish
  output.

**When an edit seems to do nothing**, in order:

1. Is `specs storybook dev` running? It republishes on save. If not, run
   `specs storybook` yourself.
2. Read the publish output. An unknown collection, feature, or layout key
   warns by name — never silently.
3. Silence plus "nothing changed" means the file genuinely matches what is
   already published.

## What is still taste rather than declared

The order of the sidebar sections, and how wide a colour row may grow before
wrapping. These ship as defaults; they graduate to the conventions file the
same way colour layout did if they earn it.
