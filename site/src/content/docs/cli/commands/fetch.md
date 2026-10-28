---
title: "fetch"
---
Fetch raw Figma REST API payloads for configured sources.

## Usage

```bash
specs fetch [options]
```

## Output

Payloads land in `data.directory` under deterministic names. The **file**
payload is written as a page-split directory — `{alias}.file/` holding
`manifest.json` (a page index), `root.json` (the file's component, component-set,
and style tables), and one JSON per Figma page — so a library of any size flows
through the pipeline, and `generate` reads only the pages your selected
components need. `variables` and `styles` remain single JSON files
(`{alias}.variables.json`, `{alias}.styles.json`).

There is nothing to configure or opt into: every fetch writes this layout, every
command reads it, and a single-file `{alias}.file.json` from an earlier CLI
keeps working everywhere until your next fetch replaces it. Only scripts of your
own that open `{alias}.file.json` directly need to read the directory instead.

## Stages and timing

A fetch is two stages, and on a large library the first one dominates. Figma
builds the whole file payload before sending any of it, and repeats that work
only when the file changed since your last fetch.

| Stage | What is happening | A 700MB library |
|---|---|---|
| Preparing | Figma serializes the file. Nothing is transferring and the connection sits idle | ~100 seconds after an edit, under a second without one |
| Downloading | The payload transfers and splits to disk | ~10 seconds |

Each stage reports its own elapsed time, and the preparing stage estimates itself
from the size of your previous fetch of that source — as a range, since the rate
varies too much to quote a figure:

```
Figma is preparing core file for download. Last fetch was 704MB,
so this may take more than 90 seconds. CTRL-C to abort.
⠹ Waiting for core file (1m 24s)
✓ Ready: core file — Figma took 1m 24s to prepare it
⠼ Downloading: core file (9s)
✓ Downloaded: core file (9s)
```

A first fetch of a source has no previous size to work from and says so instead
of guessing.

`fetch` waits up to **4 minutes** for Figma to start sending, then fails that
source. The deadline covers the wait only — a download already underway is never
cut off, however slow it runs. Figma discards its preparation when a request
gives up, so a retry starts that work over rather than picking it up.

## Requirements

- `FIGMA_TOKEN` must be set in your environment (not needed with `--from-bridge`).
- `config/settings.yaml` must include `data.directory` and `data.sources`.
- Fetching `variables` over REST requires your Figma organization to be on an **Enterprise** plan — Figma restricts the variables REST endpoints regardless of your Spectacular license. On any other plan, fetch variables through the plugin instead with [`--from-bridge`](#fetching-variables-via-the-bridge). `file`, `styles`, and `icons` data work over REST on any plan. See [CLI Requirements](/cli/#requirements).
- Fetching `icons` additionally requires:
  - a `figma.glyphs` convention — `match` and/or `structure` — in `config/conventions/figma.yaml` (see [Glyph Name Pattern](/guides/glyph-name-pattern/))
  - `spec.directory` set in `config/settings.yaml` — icon assets are written to the spec workspace, not the data directory
  - the source's `file` payload — listed before `icons` in the same `fetch` array, or fetched in a previous run

## Options

### `--config <path>`
Use a specific `config/` directory.

### `--data-dir <dir>`
Override output directory for fetched payloads. Defaults to `data.directory` from `config/settings.yaml`, or `./data` if not configured.

```bash
specs fetch --data-dir ./custom-data
```

> **Deprecated alias**: `--outDir` still works but will emit a deprecation warning. Prefer `--data-dir`.

### `--only <name[,name...]>`
Narrow the fetch by source alias, by data kind, or both, comma-separated. Aliases come from `data.sources`; kinds are `file`, `variables`, `styles`, and `icons`. An alias fetches every kind for that source; a kind fetches it for every source; `--only library,icons` fetches only the icons of the `library` source. Names that shadow both an alias and a kind, or match nothing, fail with an error naming the valid values.

### `--source <[alias=]url|key>`
Fetch a file or branch that is not in `data.sources` — see [Fetching Figma Branches](#fetching-figma-branches). Repeatable.

Takes a Figma URL pasted straight from the browser, or a bare file key. Given a branch URL — which names both the main file and the branch — it uses the **branch** key, so you never have to pick the right one out of the URL yourself. The `key` field in [`data.sources`](/settings/data-sources/#key) accepts the same two forms.

### `--from-bridge`
Fetch variables from the connected Figma file through the [CLI bridge](/cli/commands/bridge/) instead of the REST API — see [Fetching Variables via the Bridge](#fetching-variables-via-the-bridge). Requires `--only variables`; no `FIGMA_TOKEN` or Enterprise plan needed.

### `--file <fileKey>`
Target a specific connected Figma file with `--from-bridge`. Prompts to choose when more than one is connected in an interactive terminal; required otherwise.

### `--no-geometry`
Omit geometry data from file payloads. By default, `fetch` requests `?geometry=paths` from the Figma API, which includes `fillGeometry`, `strokeGeometry`, `size`, and `relativeTransform` on every node. Geometry adds roughly 60% to the payload — measured at 685MB with it against 426MB without, on the same library.

Use `--no-geometry` when you don't need vector path data. Width and height will fall back to `absoluteBoundingBox` during processing, which is accurate for non-rotated nodes.

```bash
specs fetch --no-geometry --verbose
```

### `--verbose`
Show request URLs and write locations.

## The Render Cache

After downloading, `fetch` builds the lookup tables [`render`](/cli/commands/render/) resolves specs against, under `{data.directory}/cache/`. This is why a normal workflow never needs to run [`specs cache`](/cli/commands/cache/) by hand.

It covers every source in your config that has been fetched — the ones downloaded this run, plus any downloaded previously — and rebuilds only the ones whose payloads actually changed, so refreshing one library doesn't re-read the rest. A source you haven't fetched yet is skipped and reported:

```
  Cache rebuilt: library
  Not fetched, skipped: brand
  Entries: 3567 components, 97 styles, 1458 variables, 469 icons
```

## Examples

```bash
export FIGMA_TOKEN="YOUR_TOKEN"
specs fetch --verbose

# Only refresh foundations payloads
specs fetch --only foundations --verbose
```

## Fetching Icon Assets

Add `icons` to a source's `fetch` array to download the library's icon glyphs as SVG files:

```yaml
# config/settings.yaml
data:
  sources:
    library:
      key: YOUR_FILE_KEY
      fetch: ['file', 'variables', 'styles', 'icons']
```

How it works:

- Glyph components are **derived from the file payload** — every component the `figma.glyphs` convention identifies, by name pattern (`match`, with `{i}` capturing the icon name) and/or by child structure (`structure`, named from the component name). A component set is evaluated through its set name and first variant. No `scan` step is involved.
- SVGs are exported through the Figma images API in batches and written to `assets/icons/` — a sibling of `specs/`, beside `assets/images/`, not into the regenerable data cache. An icon is consumed by every target and produced by none, so it sits outside the spec tree rather than inside it.
- Filenames are stable kebab-case slugs of the captured icon name, including camelCase splitting: `expandMore` → `expand-more.svg`, `Arrow Left` → `arrow-left.svg`.
- Two icons that slug identically keep the first as-is; later duplicates are suffixed with their node id so nothing is silently dropped.

### Glyph export limits

Each glyph is exported through Figma's images API, which renders the component **as it currently appears**:

- Only layers visible in the component's saved state are included — hidden layers are omitted from the SVG.
- Variables resolve to their default modes; the export does not enumerate other modes or variable states.
- One component exports one SVG. If a glyph component packs multiple icons toggled by boolean variables, only the default-visible icon is exported — that authoring pattern is not supported. Use one component per icon for complete asset coverage.

Because glyphs come from the saved file payload, `icons` runs after the other kinds. If the payload is missing, fetch exits with an error telling you to fetch `file` first.

```bash
# Refresh just the icon assets (file payload already on disk)
specs fetch --only library,icons --verbose
```

The downloaded assets match the slugs referenced by generated component output (masked glyph spans resolve `/assets/icons/<slug>.svg`), so serving `assets/icons/` as a static assets directory — for example in Storybook — makes icons render without further mapping. Keeping icons in the spec workspace means a cloned workspace renders completely without re-fetching.

## Fetching Variables via the Bridge

Figma gates the variables REST endpoints behind an Enterprise plan, but the Plugin API reads the same data on any plan. With the [bridge](/cli/commands/bridge/) running and the Spectacular plugin connected in your library file:

```bash
specs fetch --only variables --from-bridge
```

The plugin reads the file's variables and collections and returns them shaped exactly like the REST payload, so the written `<alias>.variables.json` — and everything that reads it: the render cache, [`generate`](/cli/commands/generate/), [`render`](/cli/commands/render/) — works identically whichever way the payload was fetched.

Requirements:

- The bridge is running (`specs bridge start`) and the plugin's CLI Bridge is enabled in the library file (a Pro feature).
- The connected file is one of your configured `data.sources`. The match is by file key; when the plugin cannot read its file's key, name the source yourself: `--only variables,<alias>`.

Differences from a REST fetch:

- Variables consumed from *other* libraries are included only where your file's own variables alias them. A variable used purely through node bindings — never aliased — is not in the payload.
- Deleted-but-still-referenced variables are omitted unless something still aliases them; the REST payload keeps all of them.
- A handful of scope names differ in spelling between Figma's two APIs (the plugin reports `FONT_WEIGHT` where REST reports `FONT_STYLE`); nothing in the pipeline reads them.

## Fetching Figma Branches

A branch is a file with its own key, so nothing about fetching one is special — but a
branch is usually short-lived and fetched to be compared against the library it came
from, which is not worth an edit to `config/settings.yaml`. `--source` fetches a file
that is not in config:

```bash
specs fetch --source "https://www.figma.com/design/MAIN_KEY/branch/BRANCH_KEY/Design-System?node-id=0-1"
```

Paste the branch's URL as it appears in Figma — quoted, because it contains `?` and `&`.
A branch URL carries both the main file's key and the branch's own key, and `fetch` uses
the branch's; you can also pass a bare key if you have one. The flag is
repeatable, and naming any `--source` means only those sources are fetched — the
configured library is not re-downloaded unless `--only <alias>` asks for it.

### Payload names and data kinds

Before downloading anything, `fetch` reads the file's name and, for a branch, the file it
branches from — one small request that also fails on a bad key or token before the large
one starts. It reports what it found:

```
✓ Resolved: library-new-nav-tokens (branch of library) → file, variables, styles
```

- **The alias** — the file's name, prefixed with the configured source it branches from,
  so payloads land beside the library's as `data/library-new-nav-tokens.file/`.
  Override it with `--source <alias>=<url>`. An alias that collides with a configured
  source is refused rather than overwriting the payload you mean to compare against.
- **The data kinds** — copied from the configured source the branch came from, so the two
  payloads are comparable. Fetching a branch of a file that is not in `data.sources` is
  fine; with nothing to copy from, `--only` decides and `file` alone is the default.

A `<alias>.source.json` sidecar records the key and where it came from, since config has
no record of them.

### Scanning and generating from a branch

The alias behaves like any other from here:

```bash
specs scan --source library-new-nav-tokens
specs generate data/library-new-nav-tokens.manifest.md -o ./branch-specs
```

`generate` takes the manifest path, and `-o` matters — without it, branch specs are
written into `spec.directory` over the specs generated from the library.

Ad-hoc payloads contribute to the render cache only where the configured sources define
nothing, so fetching a branch never changes how the library itself resolves. Icons, if
inherited, are written to `assets/icons-<alias>/` rather than over `assets/icons/`.

### Removing a fetched branch

Everything an ad-hoc source wrote is named after its alias, so a finished branch is
removed with:

```bash
rm data/library-new-nav-tokens.*
specs cache --force
```

### Finding a branch key

Easiest is not to: open the branch in Figma, copy the URL, and pass it whole to
`--source`. A branch URL names two files and `fetch` takes the right one.

When you do need the key itself — for a `data.sources` entry, which takes a bare
key and not a URL — it is the segment after `/branch/`, not the leading one:

```
https://www.figma.com/design/PnIKd8F7Y7kaFOTcyaYGuF/branch/QkOXz5n9ugqromA9I87yWF/Design-System?node-id=0-1
                             └──── main file key ───┘        └──── branch key ────┘
```

The leading key is the file the branch came from. Using it resolves a branch
link to main, fetches the wrong document, and reports success — so take the
second.

### Data implications

- **File JSON** — Returns the branch's current state, including any unpublished component changes.
- **Variables** (`/variables/local`) — Returns **all** variables in the branch, including unpublished drafts not yet merged to main. This is what `fetch` uses.
- **Styles** — Returns the branch's current styles metadata, which may include unpublished changes.

> **Note:** The `/variables/published` endpoint (not used by `fetch`) only works with the main file key. Branches always return local/draft state.

### Custom tokens on branches

If you use `applyCustomTokens` with branch-fetched data, be aware that Figma variable and style IDs may differ between main and a branch. Your mapping file IDs must match the IDs in the branch's data files, not main's.

### Keeping a branch in config

A branch you fetch repeatedly over a long life is still worth a config entry — give it
its own alias so the library keeps its own. `key` takes the bare branch key, the segment
after `/branch/`:

```yaml
# config/settings.yaml
data:
  sources:
    library-redesign:
      key: QkOXz5n9ugqromA9I87yWF   # the branch key, not the URL and not main's key
      fetch: ['file', 'variables', 'styles']
```

See [`data.sources` → Branch Keys](/settings/data-sources/#branch-keys).

---

**See Also:**
- [Configuration Reference](/settings/) - data.directory and data.sources setup
- [Generate Command](/cli/commands/generate/) - Processing fetched data
