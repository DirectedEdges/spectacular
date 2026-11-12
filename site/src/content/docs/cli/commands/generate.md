---
title: "generate"
---
Generate component specifications from Figma. There are three ways to run it, distinguished by where the Figma data comes from: a **manifest** listing many components, a **JSON file** plus one named component, or the **live Figma file** itself over the CLI bridge.

```bash
specs generate                                    # manifest mode — many components
specs generate <file.json> -c <component>         # single component mode
specs generate --from-bridge                      # bridge mode — live selection
```

| Mode | Source | Produces | Use it when |
|------|--------|----------|-------------|
| [Manifest](#manifest-mode) | `.md` manifest + downloaded JSON | Every selected component | Generating or regenerating the library |
| [Single component](#single-component-mode) | Downloaded JSON + `-c` | One component | Setting up or iterating on one spec |
| [Bridge](#bridge-mode) | The connected Figma file, live | The current selection | Checking work in progress, or a `render` round-trip |

Manifest and single component mode both read a Figma REST API snapshot that `specs fetch` downloaded, and run the transformer inside the CLI. Bridge mode reads nothing from disk — the plugin generates against the live document and the CLI only writes the result out.

## Manifest Mode

Pass a markdown manifest created by [`scan`](/cli/commands/scan/) to generate specs for all selected components in one pass. The manifest points at the source JSON file and tracks which components are included (`[x]`). This is faster than running `generate` per component, because the file is loaded and indexed once.

The full workflow:

```bash
# 1. Download the Figma data
specs fetch

# 2. Build a manifest of everything in the file
specs scan

# 3. Curate — edit data/library.manifest.md and check [x] the components you want

# 4. Generate
specs generate
```

With no arguments, step 4 uses the default manifest (`{data.directory}/{alias}.manifest.md`) and writes to `spec.directory` from `config/settings.yaml`. Pass either explicitly to override:

```bash
specs generate components.md -o specs/
```

Manifest mode requires an output destination — `-o` or `spec.directory` — since it can produce many files. By default it writes the full split layout: one folder per component, holding one file per concern. Turn parts of that off with [`--combine-as-library`](#--combine-as-library), [`--combine-concerns`](#--combine-concerns), and [`--no-subfolders`](#--no-subfolders):

```bash
specs generate -o specs/
```

```
✓ Loaded manifest: 150 components (42 selected)
⏳ Processing 42 components...

[1/42] DS Accordion... ✓
[2/42] DS Alert... ✓
...
[42/42] DS Toggle... ✓

✓ Generated specs
  - 42 components successful
```

Components that fail are reported individually and the rest still generate; the run exits non-zero if any failed.

### Compositions

If the manifest has a `## Compositions` section, every **checked** row in it is generated too, exactly as for components. Composition specs are written to `specs/compositions/<key>/`, in the same concern files a component gets, and carry `metadata.source.nodeType: FRAME`. That marker is the contract for what the spec describes; the directory is navigation.

```
✓ Loaded manifest: 150 components (42 selected)
✓ Loaded manifest: 6 compositions (5 selected)
⏳ Processing 47 components...
...
✓ Wrote 5 composition spec(s) to compositions/
```

A composition has no variant properties and no prop surface, so its `variants.yaml` carries a default and nothing else. Generating one works on either tier; [emitting code](/cli/commands/react/) from one requires Pro.

`-c` narrows to a single composition by name, node id, or spec key, exactly as it does for a component.

`--combine-as-library` and `--combine-concerns` still collapse a catalogue into documents keyed by spec key — but per kind, so `components/` and `compositions/` each hold their own set. A composition and a component of the same name can never overwrite each other.

A manifest run also writes `latest.metadata.yaml` at the root of the output directory. It holds the facts about the run — author, generator, schema version, conventions and settings — which are identical for every component, so each spec keeps only `metadata.source`. See [Run Metadata](/guides/run-metadata/). Single component and bridge mode are unaffected: each writes the full `metadata` block into its spec.

## Single Component Mode

Pass a Figma JSON file directly and name one component with `-c`, by name or node ID. Useful when setting up a new component, or iterating quickly on one spec without touching the rest of the library.

```bash
specs fetch
specs generate data/library.file -c "DS Button" -o specs/
```

The component is resolved against the JSON file's components and component sets. Node IDs work equally well, and are the reliable choice when a name contains special characters or is duplicated:

```bash
specs generate data/library.file -c "1234:5678" -o specs/
```

Without `-o` (and with no configured `spec.directory`), the spec goes to stdout — handy for piping:

```bash
specs generate data/library.file -c "DS Button" -f yaml | yq '.dsButton.anatomy'
```

Variables and styles are resolved from your configured sources; without config, `generate` falls back to `foundations/variables.json` and `foundations/styles.json` next to the JSON file. Override either with [`-v`](#-v---variables-path) / [`-s`](#-s---styles-path).

## Bridge Mode

Generate from whatever is selected right now in a connected Figma file — no `specs fetch`, no downloaded JSON. Requires the [bridge](/cli/commands/bridge/) running and the Specs 2 plugin open in Figma with its **CLI Bridge** toggle enabled.

```bash
specs bridge start
specs generate --from-bridge -o specs/
```

```
✓ Generated from selection: DS Button
✓ Wrote 1 component spec(s) to specs/components/
```

Because the plugin does the generating, bridge mode behaves differently from the other two in ways worth knowing:

- **The plugin's settings and license govern the spec.** The conventions and settings that shaped the output — key formatting, tier-gated detail — are the plugin's, not your `config/` files. `-l/--license` has no effect; the plugin uses the license stored in its own UI.
- **Your CLI config still controls where and how the spec is written.** `spec.directory`, `spec.format`, and the output flags all apply as usual.
- **The output is as current as the file.** Unsaved and just-edited work is included, so this reflects the document rather than the last fetch.
- **`-c`, `-v`, `-s`, and `--data-dir` are ignored**, and passing a `source` argument is an error.

The selection must be a component, component set, or frame. To target something other than the selection — for a repeatable script, where relying on a manual selection is fragile — pass [`--node`](#--node-id). When several Figma files are connected to one bridge, pick one with [`--file`](#--file-filekey).

Since bridge mode reads the live document, it closes the loop on [`render`](/cli/commands/render/) — render a spec into Figma, then read the result back and compare:

```bash
specs bridge start
specs render specs/components/dsButton/
specs generate --from-bridge -o roundtrip/
diff specs/components/dsButton/api.yaml roundtrip/components/dsButton/api.yaml
```

Common failures:

- `Error: bridge is not running.` — start it with `specs bridge start`.
- `Nothing selected in Figma...` — select a component, component set, or frame in the connected file.
- `Selection must be a component, component set, or frame — got INSTANCE.` — select the source component rather than an instance of it.

## Arguments

### `[source]`
Path to a markdown manifest or a Figma REST API JSON file. The mode is detected from its content.

- **Not provided**: defaults to `{data.directory}/{alias}.manifest.md`, where `data.directory` comes from `config/settings.yaml` and `alias` is `library` if configured with `fetch: [file]`, otherwise the first source alias with `fetch: [file]`. This matches the default output of `specs scan`.
- **Markdown manifest**: manifest mode.
- **Figma JSON**: single component mode — requires `-c`.
- **Bridge mode**: takes no source argument; passing one is an error.

## Options

### `-c, --component <name|id>`
Component name or Figma node ID. Required in single component mode; ignored in bridge mode. In manifest mode it filters the manifest to the named component — matched by name, node ID, or formatted key — and fails with a did-you-mean suggestion when nothing matches.

### `-o, --output <path>`
Output file or directory path.

**`-o` names the specs root — a directory.** The run writes `components/` and `compositions/` beneath it (ADR-096) and reports where each kind landed, so the path you pass is never the full path you get:

```
✓ Wrote 1 component spec(s) to specs/components/
```

- **Directory path** (`-o specs/`): one folder per component under `specs/components/<key>/`. This is the default layout ([ADR-071](/settings/output/)).
- **A path ending in `.yaml`, `.yml` or `.json`**: rejected, unless both splits are off. A split run writes a tree, so a filename cannot be what you meant — the error names the directory to pass instead.
- **Single-file mode only** (`--combine-as-library --combine-concerns`): the filename becomes meaningful, and the kind directory still applies — `-o specs/library.yaml` writes `specs/components/library.yaml`. Pointing at a directory instead names the document `library` for you.
- **Not provided**: falls back to `spec.directory` from `config/settings.yaml` (default `./specs`). Required in manifest mode if that isn't configured; single component and bridge mode write to stdout instead.

### `-f, --format <format>`
Output format: `yaml` or `json`. Defaults to `spec.format` from `config/settings.yaml` (or JSON with no config); the flag takes precedence.

### `-l, --license <key>`
License key for premium features.

With a valid Pro license, generated specs include additional detail such as design token references, variable bindings, and visibility bindings. Without one (or with an invalid key), specs are generated at the free tier — full structure and variants, but raw values instead of token references.

**Resolution priority**: `--license` flag > `SPECS_LICENSE_KEY` env > `ANOVA_LICENSE_KEY` env

```bash
export SPECS_LICENSE_KEY="your-license-key"
specs generate
```

No effect in bridge mode, where the plugin's own license applies. See [Getting Started](/cli/getting-started/#step-2-set-up-your-environment) for setup.

### `--data-dir <dir>`
Override the data directory used for resolving input files and auxiliary data (variables, styles). Defaults to `data.directory` from `config/settings.yaml`, or `./data`.

### `-v, --variables <path>`
External variables JSON file.

- **Default** (no flag): loads all `${alias}.variables.json` for aliases in config whose `fetch` includes `variables`.
- **Fallback** (no sources configured): tries `foundations/variables.json` next to the source JSON file.
- **Override**: the flag replaces that list for this run.

### `-s, --styles <path>`
External styles JSON file.

- **Default** (no flag): loads all `${alias}.styles.json` for aliases in config whose `fetch` includes `styles`.
- **Fallback** (no sources configured): tries `foundations/styles.json` next to the source JSON file.
- **Override**: the flag replaces that list for this run.

### Default layout
With no layout flags, each component gets its own directory of concern files: `api.yaml` (anatomy, props), `variants.yaml` (default, variants), and `examples.yaml` (`slotContentExamples`, `instanceExamples`).

```bash
specs generate -o specs/
```

```
specs/
├── latest.metadata.yaml
├── components/
│   ├── dsButton/
│   │   ├── api.yaml
│   │   └── variants.yaml
│   ├── dsAlert/
│   │   ├── api.yaml
│   │   ├── variants.yaml
│   │   └── examples.yaml
│   └── dsCard/
│       ├── api.yaml
│       └── variants.yaml
└── compositions/
    └── checkoutSmall/
        ├── api.yaml
        └── variants.yaml
```

`specs/` names what each folder holds. `components/` and `compositions/` are the two kinds of spec a run produces; `analysis/` holds the reports [`analyze`](/cli/commands/analyze/) writes. `latest.metadata.yaml` stays at the root, because the run's facts belong to the run rather than to either kind. A component and a composition may share a name with no consequence.

A specs directory written before this layout existed — spec folders directly under `specs/` — is still read, as components, and the run says so once. Re-run `specs generate` to write the current layout; the old root folders are then reported as present but not generated, for you to delete. They are never merged with `components/`, so a stale folder cannot resurrect a component a rename retired.

`examples.yaml` is written only when at least one component has example data, and components without examples are omitted from it. Example output is a [Pro feature](/settings/default-slot-content/) — on the free tier it's omitted entirely, so no `examples.yaml` is produced.

### `--combine-as-library`
Write every component into one library file, instead of a file per component. Concerns still split, so the three concern files now span the whole library:

```bash
specs generate -o specs/ --combine-as-library
```

```
specs/
├── api.yaml
├── variants.yaml
└── examples.yaml
```

Add `--combine-concerns` for a single file holding everything:

```bash
specs generate -o specs/library.yaml --combine-as-library --combine-concerns
```

### `--combine-concerns`
Write API, variants, and examples into one file per component, instead of separate concern files.

```bash
specs generate -o specs/ --combine-concerns
```

```
specs/
├── dsButton/
│   └── dsButton.yaml
├── dsAlert/
│   └── dsAlert.yaml
└── dsCard/
    └── dsCard.yaml
```

Combined with `--no-subfolders`, that flattens to one file per component:

```bash
specs generate -o specs/ --combine-concerns --no-subfolders
```

```
specs/
├── dsButton.yaml
├── dsAlert.yaml
└── dsCard.yaml
```

### `--no-subfolders`
Write component files side by side instead of nesting each in its own folder. Only meaningful while components are split.

```bash
specs generate -o specs/ --combine-concerns --no-subfolders
```

```
specs/
├── dsButton.yaml
├── dsAlert.yaml
└── dsCard.yaml
```

With concerns still split, each component's concern files need a folder to live in, so this flag has no effect.

### `--get-images`
Resolve unresolved registry images into real image files. Requires a [`figma.images`](/settings/images/) convention in `config/conventions/figma.yaml`, a configured source file key, and the `FIGMA_TOKEN` environment variable (the same token `specs fetch` uses).

```bash
specs generate -o specs/ --get-images
```

Generation alone (the *detect* phase) records each image fill as an unresolved registry entry — the Figma identity in `$extensions['com.figma'].imageHash`, no `src` — structurally complete, but with no pixels. With `--get-images`, the CLI calls Figma's Get Image Fills endpoint, downloads each distinct image once, writes it as `assets/images/<imageHash>.<ext>` at the workspace root — a sibling of `specs/`, beside `assets/icons/` (format detected from the bytes — png, jpg, gif, or webp), and **adds** `src` to each entry — a path relative to the spec file that references it. The Figma identity survives for reverse-direction tooling:

```yaml
# without --get-images (detect phase)
images:
  dsCard__hero:
    $extensions:
      com.figma:
        imageHash: 705867125834a686a51bdf161a0a39cdba0f9a58

# with --get-images — src is ADDED; the identity survives
images:
  dsCard__hero:
    src: ../../assets/images/705867125834a686a51bdf161a0a39cdba0f9a58.png
    $extensions:
      com.figma:
        imageHash: 705867125834a686a51bdf161a0a39cdba0f9a58
```

```
assets/
└── images/
    └── 705867125834a686a51bdf161a0a39cdba0f9a58.png
specs/
└── dsCard/
    ├── api.yaml
    └── examples.yaml
```

`$image` pointers (in `backgroundImage` fills and `ImageBinding` examples) are unaffected — resolution touches one registry entry per image, never the references. Files are named by Figma's content hash, so an image shared by many components is downloaded and stored once, and re-runs are idempotent. Figma's download URLs are temporary and are never persisted. `src` is written relative to the spec file that carries it, so its depth follows the layout: `../../assets/images/...` from a component folder, `../assets/images/...` from a flat one.

#### What it records for the images lookup

`--get-images` also writes down what it found, so [`data/cache/images.yaml`](/cli/commands/cache/#what-it-writes) covers all three ways a library holds an image. Generate is the only command that sees the third — a fill on a component — and without a record those images exist on disk and inside one component's spec, leaving the lookup missing a third of its subject.

It writes `{data.directory}/<alias>.component-images.json`, attributed to the source the specs were generated from, and rebuilds the render cache as its last step — so a [`render`](/cli/commands/render/) straight after a generate never meets a cache the generate just invalidated. Each image appears in `images.yaml` with `origin: [component]`, and `usedBy` naming the components that reference it, by spec key.

An image found **both** ways is one entry carrying both facts. A photograph published as a fill style *and* placed on a card reads:

```yaml
25a26b806cc3ed542b6df2da5740d1bb652b1913:
  src: assets/images/25a26b806cc3ed542b6df2da5740d1bb652b1913.png
  name: Images / Emirates Stadium
  usedBy: [deCard, patternsFilterPage]
  origin: [style, component]
  file: library
```

**A scoped run never removes what a fuller run recorded.** Generating three components sees fewer images than a catalogue pass, and an image did not stop existing because today's run was narrow — so the record merges by hash and only ever adds or updates:

```
✓ Recorded 1 component image(s) for the images cache (5 kept from an earlier pass)
```

Nothing prunes it, which is the cost of that rule: an image a component no longer uses stays listed. Deleting `<alias>.component-images.json` and re-running is the reset.

Plain `specs generate` records nothing — it still resolves `src` for images whose files are already on disk, but only `--get-images` makes images that run's business, so a regenerate never dirties a cache it does not rebuild.

### `--from-bridge`
Generate from the current selection in a connected Figma file via the [CLI bridge](/cli/commands/bridge/), instead of from a manifest or downloaded JSON. See [Bridge Mode](#bridge-mode).

### `--file <fileKey>`
Target a specific connected Figma file (bridge mode only). More than one file can be connected to a single bridge at once.

- **One file connected**: not needed.
- **Several connected, interactive terminal**: omitting it prints a numbered picker and prompts you to choose.
- **Several connected, non-interactive (scripts, CI)**: required — the run fails rather than hanging on a prompt.

### `--node <id>`
Generate from a specific node ID instead of the current selection (bridge mode only). The plugin selects the node first, switching pages if the node lives on another one, then restores the page you were on.

### `--remove`
Delete the node once its spec has been read (bridge mode only) — for round-trip testing, so a rendered-then-generated component leaves the Figma page as it was found. **This mutates the connected file**; there is no undo from the CLI side.

### `--config <path>`
Path to a `config/` directory, when it isn't the `config/` directory in the working directory.

```bash
specs generate --config workspaces/mobile/config -o workspaces/mobile/specs/
```

### `--verbose`
Enable detailed logging — resolved config path, source and mode detection, foundations loaded, and per-component progress.

## Generating over an authored spec

**Today `generate` overwrites whatever it finds, every time.** It rebuilds a spec's `metadata` from the Figma node and reads nothing from the file it replaces, so it cannot tell a spec it generated last week from one a person wrote by hand. The protections are procedural — curate in the manifest, scope the run with `-c`, know what you are pointing it at.

That is a real hazard in a workspace that authors specs rather than capturing them. The destructive path is a round trip: author a spec, render it to Figma, fetch the file, and generate the node your own render created back over the spec that produced it.

These are the rules that **should** apply. Not yet enforced — the facts two of them turn on are the spec's origin, which the schema does not yet record, and whether a node came from this workspace's own render, which [the cache now records](/cli/commands/cache/#what-a-render-adds).

`R` is the node being generated from; `S` is the existing spec for that key.

| # | Spec exists | `S` origin | Rendered record | `R` vs recorded node | Behavior |
|---|---|---|---|---|---|
| 1 | no | — | — | `R` not workspace-rendered | **write** — ordinary first capture |
| 2 | no | — | — | `R` **is** a node this workspace rendered | **refuse** — self-capture: a second spec describing a component you already authored |
| 3 | yes | captured | no | same node | **overwrite** — ordinary re-capture, what generate is for |
| 4 | yes | captured | no | different node | **refuse** — two nodes claiming one spec key |
| 5 | yes | authored | no | — | **refuse** — authored work, never rendered |
| 6 | yes | authored | yes | `R` == the rendered node | **refuse** — the round trip, over itself |
| 7 | yes | authored | yes | `R` != the rendered node | **refuse** — an unrelated node over authored work |
| 8 | yes | any | any | any, with the override naming this component | **overwrite** — the deliberate migration path |

Three things the rules settle:

- **The override names the component**, one per invocation — never a count, never a bare boolean. A count is a number filled in from the error message that just printed; a boolean is a flag that ends up in the command permanently, which is how a guard stops existing.
- **A refusal skips the row and everything depending on it.** Generating a component whose dependency was refused produces a spec referencing a spec that was never written — the failure [`curation.includeDependencies`](/settings/curation/) exists to prevent.
- **"Workspace-rendered" is per Figma file.** Rendering one spec into a second file produces a genuinely distinct asset, so capturing from that other file is not self-capture.

A separate question, still open: whether [`scan`](/cli/commands/scan/) should mark a self-rendered node in the manifest so you see it before selecting, omit it, or leave it as it is. A manifest row today carries a checkbox, a name, a node id, a type and a dev status — none of the three facts above.

## Rebuilding the spec tree

`generate` overwrites the files it produces and removes nothing else. A component
you deselect in the manifest, rename in Figma, or rename by changing a naming
convention keeps its old folder — the run has no way to tell a deliberately
deselected component from a stale one, and the same spec directory may hold
components generated from more than one source.

A full run says which folders it found but did not write, so nothing is left for
you to discover later:

```
Note: 2 spec folders are present but were not generated this run: table/oldPart, oldComponent
  Expected if you deselected them or generate from more than one source. Otherwise they are stale — remove them yourself.
```

The note is a statement, not a warning: being present without being generated is
normal in several workflows. Only a full run with no failures reports it — a
`-c, --component` run knows nothing about the components it was not asked for.

When you want the tree to reflect only what is generated now, rebuild it from
empty:

```bash
rm -rf specs/ react/src webcomponents/src
specs generate
specs react
specs webcomponents
```

Delete only directories you generate into. Anything you author or keep alongside
them — analysis reports, notes, hand-written files — is yours, and no command
removes it.

If a Storybook is running against those trees, restart it afterwards. Its index
holds the story ids it saw at startup, so components you removed keep appearing —
and a snapshot run that walks the index will spend its time on stories that no
longer exist.

---

**See Also:**
- [Scan Command](/cli/commands/scan/) - Create component manifest
- [Fetch Command](/cli/commands/fetch/) - Download Figma data for manifest and single component mode
- [Render Command](/cli/commands/render/) - Send a generated spec back into Figma
- [Bridge Command](/cli/commands/bridge/) - Start the local bridge used by `--from-bridge`
- [Render to Figma](/guides/render-to-figma/) - Bridge architecture, setup, and prerequisites
- [Configuration Reference](/settings/) - Format and config options
- [Getting Started](/cli/getting-started/) - Installation and license setup
