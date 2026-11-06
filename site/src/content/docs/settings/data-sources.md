---
title: "sources"
description: "Configure which Figma files to fetch and process"
---

`data.sources` tells the CLI which Figma files to fetch data from and what to download from each one. A run choice — which files a workspace reads is this workspace's business, which is why sources sit in `settings.yaml` while the conventions describing the library live in `conventions.yaml`. Each entry is a named alias you choose, mapped to a Figma file key and a `fetch` list of artifact kinds.

| | |
|---|---|
| **File** | `config/settings.yaml` |
| **Path** | `data.sources` |
| **Type** | map of alias → `{ key, fetch }` |
| **Default** | — (required for `fetch` and `generate`) |

## Options

The artifact kinds a source's `fetch` list can name:

| Value | Description |
|---|---|
| `file` | The full Figma document (components, frames, nodes). This is typically your component library file. Required for `generate` |
| `variables` | Figma variable collections and their values. Used for token resolution during `generate` |
| `styles` | Figma styles (color, text, effect). Used for style resolution during `generate` |
| `icons` | The glyph assets matched by [`figma.glyphs.match`](/settings/glyphs/), extracted as SVG files. Requires that convention to be declared and the `file` payload to be fetched |

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `key` | `string` | Yes | The Figma file key for this source, or the file's URL pasted straight from the browser |
| `fetch` | `string[]` | Yes | Which artifact kinds to fetch from this file — the values in Options above |

## Example

```yaml
data:
  sources:
    library:
      key: vtOioqf0hbfCzjj5iRgG3p
      fetch: ['file','variables','styles']
    foundations:
      key: n488on7ZWi67JDiFwoNul2
      fetch: ['variables','styles']
```

## Multiple sources

Most projects have one source. You'd add a second when your design system spans more than one Figma file:

- A shared foundations or tokens file holds the variable collections that your component library references — variables won't resolve without it.
- Your components are split across multiple Figma library files, and you want to generate specs from more than one in the same run.
- A separate file owns the styles (color palettes, typography) used by components in another file.

The `generate` command resolves variables and styles across all configured sources.

## Alias

The alias (e.g. `library`, `foundations`) is a name you assign to each source. It determines the filenames the CLI writes to `data.directory`:

- `${alias}.file/` — the page-split file payload: `root.json` plus one JSON per Figma page (only if `fetch` includes `file`)
- `${alias}.variables.json` (only if `fetch` includes `variables`)
- `${alias}.styles.json` (only if `fetch` includes `styles`)

## `key`

A pasted URL has the key read out of it for you, the same way
[`--source`](/cli/commands/fetch/#fetching-figma-branches) reads one. A branch
URL resolves to the branch rather than the file it branches from.

The key is the segment after `/design/` in the URL Figma shows while the file is
open, if you would rather write it out:

```
https://www.figma.com/design/PnIKd8F7Y7kaFOTcyaYGuF/Design-System?node-id=0-1
                             └──────── key ────────┘
```

A source whose key is missing or unusable fails before anything is downloaded,
naming the source and what it found there.

A branch URL names two files, and the one you want is the second — see
[Branch Keys](#branch-keys) below.

## Branch Keys

A Figma branch is a file with its own key, so `key` accepts a branch key
wherever it accepts a main file key. The catch is that a branch's URL contains
**two** keys, and the branch's own key is the second one — after `/branch/`:

```
https://www.figma.com/design/PnIKd8F7Y7kaFOTcyaYGuF/branch/QkOXz5n9ugqromA9I87yWF/Design-System?node-id=0-1
                             └──── main file key ───┘        └──── branch key ────┘
```

Using the leading key resolves to main, fetches the wrong document, and looks
entirely successful doing it — so take the key after `/branch/`:

```yaml
data:
  sources:
    library:
      key: QkOXz5n9ugqromA9I87yWF   # the branch, not main
      fetch: ['file', 'variables', 'styles']
```

A short-lived branch is usually not worth a config entry at all — pass its URL
to [`specs fetch --source`](/cli/commands/fetch/#fetching-figma-branches)
instead, which takes the branch key out of the URL itself. Put a branch in
`data.sources` only when you fetch it repeatedly over a long life.

Branch data includes unpublished changes — variables, styles, and components that haven't been merged or published to main. See [Fetching Figma Branches](/cli/commands/fetch/#fetching-figma-branches) for implications.

## Legacy name

In the pre-split `specs.config.yaml`, sources lived at the root as `sources`, and this list was named `data`. That file is no longer read — [`specs migrate config`](/cli/commands/migrate/) converts it, moving each source to `data.sources.<name>` and renaming its list to `fetch`.
