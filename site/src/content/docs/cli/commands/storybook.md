---
title: "storybook"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge experimental-badge">Experimental</span>')</script>

Scaffolds, generates, and runs the workspace Storybook — one instance for the whole system, not one per framework. [The Storybook section](/storybook/) covers what you get; this page is the command reference.

Free on every tier. The CLI never ships or installs Storybook itself: `init` writes a `package.json` that declares it, and you run the one install in your own workspace.

## Usage

```bash
specs storybook init [--force] [--port <port>]   # scaffold the host, once
specs storybook dev                              # run everything, watching
specs storybook [publish] [concern]              # regenerate content, once
```

Every form accepts `--config <path>` for a workspace whose `config/` is not in the current directory.

## `specs storybook init`

Writes the host, once:

```
storybook/
├── package.json          declares Storybook (Node 20.19+); you run `npm install`
├── tsconfig.json
├── .storybook/           main.ts, preview.tsx, manager.tsx, scaffold.json
├── content/components/   tabs.json + modes.json, seeded so the host compiles
└── content-overrides/    yours — no command ever writes here
```

Prints the install and next steps rather than running them. Refuses if `.storybook/` already exists.

### `--force`

Rewrite the host files deliberately — the upgrade path when a newer CLI ships newer templates (a stale host announces itself at every publish). Rewrites only what `init` owns; `content/` and `content-overrides/` are never touched.

### `--port <port>`

The dev-server port written into the scaffolded `package.json`.

Normally you declare it instead, once, in [`conventions/storybook.yaml`](/schema/conventions/#host):

```yaml
host:
  port: 6101
```

A declared port gives the workspace a localhost that stays put, and survives a `--force` rewrite. Without one, `init` keeps whatever port the existing scaffold already serves, falling back to `6006` for a fresh workspace. The flag overrides both, for that one run.

## `specs storybook dev`

Publishes once, then starts everything that reacts and keeps running until Ctrl-C:

| Child | Job |
|---|---|
| [`specs react --watch`](/cli/commands/react/#--watch) | Re-emits components when specs change — spawned when `react/` exists |
| [`specs webcomponents --watch`](/cli/commands/webcomponents/#--watch) | Same, for the Web Components tree |
| The workspace's own Storybook | Serves, hot-reloads emitted output, and republishes generated pages when `config/`, `specs/`, or `assets/` change |

`fetch`, `generate`, and `render` stay yours to run; everything downstream of them follows. One interrupt stops all children.

:::note[Or run the whole workspace]
`dev` starts at `specs/` — you generate your specs yourself. [`specs run`](/cli/commands/run/) *(experimental)* starts at `data/` and serves Storybook as well, so a fresh fetch or a ticked checkbox flows all the way through without a second command. Both share one implementation of the server and its index recovery. `dev` is unchanged and still the right choice when Storybook is what you're working on.
:::

`dev` also watches the instance's health. Storybook caches a per-file parse
failure — a half-saved story file can leave its index returning 500 after the
file is fine again, which reads as the server dying. `dev` detects it, names
the file, re-triggers the parse itself, and if the file has a real error says
so in one sentence. Never restart Storybook for this; fix and re-save the
named file and the index recovers on its own.

## `specs storybook publish [concern]`

Regenerates the content tree, once — the form for scripts and CI, and the default when no subcommand is given (`specs storybook` alone publishes everything). While `dev` runs you never type this; the server runs it for you.

```bash
specs storybook publish              # every concern
specs storybook publish foundations # just one
```

Each concern writes `storybook/content/<concern>/` wholesale and prunes what no longer belongs; an unknown concern name errors with the list.

### `overview`

The Getting Started page: the refresh loop and where to go next, so the
sidebar's first entry answers "what do I do with this" without leaving the
instance. Always publishes.

### `foundations`

The generated [Color, Icons, and Typography pages](/storybook/foundations/)
and the data files they read (`data/colors.json`, `icons.json`,
`typography.json`). Reads the fetched library payloads — variables, the style
map, the glyph directory — plus the specs for glyph references, and applies
the author's [`conventions/storybook.yaml`](/storybook/customization/)
choices. Publishes when the workspace has the data; a workspace that never
ran `fetch` gets no Foundations section rather than empty pages.

### `components`

Not the component stories — those come from
[`react`](/cli/commands/react/) and
[`webcomponents`](/cli/commands/webcomponents/). This concern writes the
navigation contract the host reads at build time: `tabs.json` (which
framework tabs exist, derived from which trees you emitted — Specs is always
present) and `modes.json` (which variable collections get toolbar mode
controls, from `conventions/storybook.yaml`). Always publishes, because the
scaffolded host cannot compile without them.

### `analysis`

One page per analysis found in `specs/analysis/` — a Report tab (dashboards
land per-analysis) and a Specs tab reading the analysis YAML in place. The
section exists only when at least one analysis does: running your first
`specs analyze` is what creates it.

### `versions`

A placeholder holding the section's place in the navigation until the
releases index lands — your `versions/` folder (reports, changelogs,
per-version specs) rendered in the instance.

Publishing is deterministic and diff-aware: unchanged input writes nothing and says so. The run also reports any overrides in effect, warns when their underlying data changed, warns on unknown keys in [`conventions/storybook.yaml`](/storybook/customization/) by name, and announces a host scaffolded by an older CLI.

## Exit behavior

`init` and `publish` exit non-zero on refusal or error with the reason named. `dev` runs until interrupted; a child that dies is reported and the rest keep running.

## See Also

- [Storybook section](/storybook/) — what each generated page shows, customization, the override tree
- [Technical Details](/storybook/technical-details/) — how the emitted trees expect to be served
- [`react`](/cli/commands/react/) / [`webcomponents`](/cli/commands/webcomponents/) — the transforms whose output the instance shows
