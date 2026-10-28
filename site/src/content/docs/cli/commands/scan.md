---
title: "scan"
---
Scan a Figma file and generate a manifest of all components.

## Usage

```bash
specs scan [file] [options]
```

## Format

The manifest is a markdown file with a metadata header, a Components table, a Compositions table (when any frame is marked ready for dev), and a read-only Glyphs table (when a `glyphs` convention is declared):

```markdown
# Component Manifest

**Scan format version:** 2  
**Generated:** 2026-05-08T18:02:11Z  
**File:** /absolute/path/to/data/library.file
**Variables:** /absolute/path/to/data/library.variables.json
**File last modified:** 2026-05-08T17:48:26Z

---

## Components

| ✓ | Name | ID | Type | Dev Status |
|------|------|------|------|------------|
| [x] | DS Accordion | 1234:5678 | COMPONENT_SET | READY_FOR_DEV |
| [x] | DS Alert | 1234:5679 | COMPONENT_SET | READY_FOR_DEV |
| [ ] | DS Avatar | 1234:5680 | COMPONENT_SET | NONE |
| [ ] | DS Button Copy | 1234:5681 | COMPONENT | NONE |
| [x] | DS Button | 1234:5682 | COMPONENT_SET | READY_FOR_DEV |

## Compositions

_Frames marked `READY_FOR_DEV` in Figma — a frame with no marking gets no row. Check and uncheck to curate, exactly as above._

| ✓ | Name | ID | Type | Dev Status |
|---|------|----|------|------------|
| [x] | Checkout / Small | 3070:1147 | FRAME | READY_FOR_DEV |
| [ ] | Home / Large | 4240:0115 | FRAME | READY_FOR_DEV |

## Glyphs

_Detected via the `glyphs` convention in `config/conventions/figma.yaml`. Excluded from `specs generate`._

| Name | ID | Type |
|------|------|------|
| DS Icon Glyph / arrow-down | 1234:9001 | COMPONENT |
| DS Icon Glyph / close | 1234:9002 | COMPONENT |
```

**Metadata:**
- `Scan format version` — manifest format version (currently `2`); used to detect and migrate older manifests automatically.
- `Generated` — Timestamp of manifest creation.
- `File` — Path to Figma file used.
- `Variables` — Path to variables file (if provided).
- `File last modified` — File-level `lastModified` timestamp from the Figma REST payload.

**Components row format:**
- `[x]` / `[ ]` — checked / unchecked. Edit by hand to curate.
- `Dev Status` — `READY_FOR_DEV` (designer-flagged in Figma Dev Mode) or `NONE` (unset). Read-only on each scan; changes drive the default merge behavior. A marking on a node nested inside a frame may read as `NONE` here even though Figma shows it set — see [Markings scan may not see](#markings-scan-may-not-see).

**Compositions row format:**
- The same five columns as Components, curated the same way: `[x]` / `[ ]`, edited by hand.
- `Dev Status` reads `READY_FOR_DEV` on every row — that marking is what earned the row a place. A frame without it is not listed at all.
- `Type` — always `FRAME`.

**Glyphs row format:**
- No checkboxes — glyphs are always excluded from `specs generate`. The section is purely informational so you can see what was detected.
- `Type` — `COMPONENT` or `COMPONENT_SET`.

## Authoring

Edit the manifest to refine selections. The `Dev Status` column is informational — only the `✓` cell drives `generate`:

```markdown
| ✓ | Name | ID | Type | Dev Status |
|------|------|------|------|------------|
| [x] | DS Button | 1234:1 | COMPONENT_SET | READY_FOR_DEV |
| [x] | DS Alert | 1234:2 | COMPONENT_SET | READY_FOR_DEV |
| [ ] | DS Button OLD | 1234:3 | COMPONENT_SET | NONE |
| [ ] | Example/Usage | 1234:4 | COMPONENT | NONE |
```

### Defaults

When generating a fresh manifest (no prior file exists, or `--reset-checks` is set), `scan` decides which components to check using this rule:

1. **If any component in the file has `devStatus: READY_FOR_DEV`** (set by designers in Figma's Dev Mode): only those components are checked. Everything else is unchecked.
2. **Otherwise** (no `devStatus` signal exists anywhere in the file): falls back to a heuristic that includes all `COMPONENT_SET` and standalone `COMPONENT` nodes. This preserves backward compatibility for libraries that haven't adopted Dev Mode status.

`--include-all` overrides both — every row is checked.

### Rescan

If a manifest already exists at the output path, `scan` merges with it instead of overwriting:

- **devStatus unchanged for a row** → prior checkbox state is preserved.
- **devStatus changed for a row** → Figma wins by default. The checkbox flips to match the new devStatus (`READY_FOR_DEV` → `[x]`, `NONE` → `[ ]`). Use `--keep-checks` to suppress this and preserve manual choices.
- **New components** discovered in the file → checked according to the default rule above.
- **Components removed** from the file → dropped from the manifest. The summary line reports the count.

A summary line is printed after each merge, e.g. `Merge: 2 added, 1 removed, 5 updated by devStatus, 180 preserved`.

### Glyph partitioning

When a `figma.glyphs` convention is declared in `config/conventions/figma.yaml`, top-level components it identifies are routed to a separate `## Glyphs` section in the manifest instead of `## Components`. Both forms partition: `match` uses `{i}` as the glyph-name placeholder — `'DS Icon Glyph / {i}'` matches `DS Icon Glyph / arrow-down` and extracts `arrow-down` — and `structure` identifies plainly named glyph components by their child shapes ([glyphs](/settings/glyphs/)). These are the same conventions the processing engine evaluates for glyph detection inside component instances, so what `scan` partitions matches what `generate` treats as a glyph at processing time.

```yaml
# config/conventions/figma.yaml
glyphs:
  match: 'DS Icon Glyph / {i}'
  # and/or
  structure:
    children:
      - type: VECTOR
        name: 'Vector'
```

Glyphs in the partitioned section are:

- **Read-only.** No checkbox column; `specs generate` ignores them entirely. To include or exclude a glyph from generation, change its name in Figma so it no longer matches (or change the pattern).
- **Re-derived on every scan.** The Glyphs section is rebuilt from the current Figma payload — manual edits to that section won't survive a rescan.
- **Omitted when empty.** If no components match the pattern, the section isn't written.

If you remove the `glyphs` convention and rescan, previously-partitioned glyphs return to `## Components` and become curatable again.

### Compositions

A **composition** is a Figma frame that arranges components into a screen, a page, or a pattern. Compositions are curated exactly as components are — same columns, same checkbox, same rescan rules. What differs is only which frames are **eligible** for a row.

**Eligibility: the frame must be marked Ready for dev in Figma.**

- **No marking, no row.** An unmarked frame never appears, not even unchecked. This is what keeps the section usable: a real production library holds around 20,000 frames and marks about a dozen. A frame is a working container by default; the marking is what makes it a deliverable.
- **Position does not matter to eligibility.** A frame on a page, in a section, or inside any other container is equally eligible. Position does affect whether `scan` can *see* the marking, though — see [Markings scan may not see](#markings-scan-may-not-see) below.
- **The outermost marking wins.** A marked frame inside another marked frame is not listed separately; it is already captured as part of its ancestor, and listing it would spec the same arrangement twice.
- **Authoring aids are excluded**, the same as for components — a frame matching `figma.subcomponents.exclude`, or under the `codeOnlyProps` container, is not a composition.

**Curation: the checkbox decides what this run specs.**

| | What happens |
|---|---|
| First scan | Every eligible composition starts checked |
| You uncheck one, then rescan | It stays unchecked — no flag needed |
| A frame gains the marking | It appears, checked |
| A frame loses the marking | Its row is dropped, like a deleted component's |
| `--include-all` | Checks every eligible composition. It widens curation, never eligibility |
| `--reset-checks` | Re-derives every checkbox from scratch |

Unchecking a row and unmarking the frame in Figma both remove a composition from the run, and the difference matters: unchecking is a decision about **this run**, recorded in the manifest and reversible there; unmarking says the frame is **not a deliverable**, and removes it from the manifest entirely.

`curation.includeDependencies` does not apply to compositions. A checked composition does not pull in the components it composes — those stay curated on their own merits. If a composition composes a component you have not selected, the emitted scaffold imports output that was never generated, which `transform-verify-imports` reports as one line of error.

Compositions are specced on either tier. **Emitting code** from one — `specs react`, `specs webcomponents` — requires Pro.

A frame whose name yields no spec key (one named with whitespace alone, which real libraries contain) is skipped with a warning naming its node id, because its spec folder would have no name.

### Markings scan may not see

Frames and components nested inside other frames and marked `READY_FOR_DEV` may not be recognized by `scan`. The marking exists in Figma, but the REST payload `scan` reads does not always carry it, so the row is absent and nothing warns.

Observed: a frame that is a direct child of a page, and a frame inside a section, both carry their marking through. A frame nested inside another frame, or inside a plain group, does not.

This is an authoring consideration rather than something to work around. Mark the frame you mean to deliver at a position the payload reports — a page child, or inside a section — and the row appears. If a marked frame you expect is missing from the manifest, its nesting is the first thing to check.

The outermost-marking rule above is unaffected in outcome: a marked frame inside a marked ancestor is still listed once, under the ancestor.

## Examples

### Basic scan

```bash
# Zero-config: auto-resolves the only configured source
# Default output: {data.directory}/library.manifest.md
specs scan

# Or pass an explicit file path
specs scan data/library.file -o components.md
```

### Multiple sources

```bash
# When config/settings.yaml declares multiple data.sources, pick one:
specs scan --source library
specs scan --source foundations
```

### With variables

```bash
# Include variables path in manifest metadata
specs scan --variables data/library.variables.json
```

### Verbose output

```bash
# See component count and file stats
specs scan --verbose

# Output:
# ✓ Scanned library.file
# ✓ Found 164 components (12 selected, 152 excluded)
# ✓ Found 6 compositions (5 selected, 1 excluded)
# ✓ Detected 48 glyphs (excluded from generate)
#   Merge: 1 updated by devStatus, 163 preserved
# ✓ Saved to /absolute/path/to/data/library.manifest.md
```

## Arguments

### `[file]` (optional)
Path to Figma REST API JSON file. When omitted, `scan` resolves the file from the sources configured under `data.sources` in `config/settings.yaml`:

- **1 source configured** → auto-selected
- **2+ sources configured** → must specify one with `--source <alias>`
- **No sources configured** → error; pass `[file]` explicitly

```bash
# Zero-config: auto-resolves when one source is configured
specs scan

# Select a specific source when multiple are configured
specs scan --source library

# Or pass a file path explicitly
specs scan data/library.file
```

## Options

### `--source <alias>`
Configured source alias to scan. Required when multiple sources exist under `data.sources` in `config/settings.yaml`. Cannot be combined with an explicit `[file]` argument.

```bash
specs scan --source library
```

### `-o, --output <path>`
Output manifest path. Optional — defaults to `{data.directory}/{alias}.manifest.md`, where `data.directory` comes from `config/settings.yaml` and `alias` is either the resolved source name or derived from the input filename (e.g., `library.file` (or `library.file.json`) → `library.manifest.md`).

```bash
# Explicit output path
specs scan -o manifests/design-system.md

# Default: writes to data/library.manifest.md (from settings data.directory)
specs scan --config config/
```

### `--data-dir <dir>`
Override the data directory used for resolving input files and default output path. Defaults to `data.directory` from `config/settings.yaml`; when a `config/` exists without one, files resolve against the config's parent directory.

```bash
specs scan --data-dir ./custom-data
```

### `--config <path>`
Path to the `config/` directory. Used to resolve `data.directory` and `data.sources` for auto-selection and the default output path.

### `--include-all`
Include all components regardless of devStatus or heuristics. Overrides the default rule and bypasses the merge step entirely.

### `--keep-checks`
Preserve the prior manifest's checkbox state for every existing row, even when a component's `devStatus` has changed since the last scan. The Dev Status column still updates so you can see Figma's signal — only the `✓` column is locked. Newly-discovered components still use the default inclusion rule.

Use this when you've made deliberate manual curation choices that should survive Figma's signal flipping.

### `--reset-checks`
Ignore the existing manifest entirely and re-derive every checkbox from current `devStatus` (or the heuristic fallback). Equivalent to deleting the manifest before running `scan`.

`--keep-checks` and `--reset-checks` are mutually exclusive.

### `-v, --variables <path>`
Variables JSON file path.

This is written into the manifest header as metadata for reference.

```bash
specs scan --variables data/library.variables.json
```

### `--verbose`
Enable detailed logging.

```bash
specs scan --verbose
```

## Migration

Manifests produced by older versions of `scan` (checkbox-list format like `- [x] Name (id, TYPE)`) are detected automatically. On the next `scan`, prior checkbox state is preserved as-is, the new `Dev Status` column is populated from the current Figma payload, and the file is rewritten in the v2 table format. No manual migration step is required.

---

**See Also:**
- [Generate Command](/cli/commands/generate/) - Generate specs from manifest or single component
- [Render Command](/cli/commands/render/) - Uses scan data to bind glyphs, styles, and variables when rendering in Figma
- [figma.glyphs](/settings/glyphs/) - The conventions (name pattern and structure) that drive Glyphs-section partitioning
- [Configuration Reference](/settings/) - Format and config options
