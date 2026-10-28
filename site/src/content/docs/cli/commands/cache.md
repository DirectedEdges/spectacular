---
title: "cache"
---

Builds the lookup tables `render` uses to resolve a spec's references against your fetched Figma data.

You rarely run this by hand. [`fetch`](/cli/commands/fetch/) and [`applyCustomTokens`](/cli/commands/apply-custom-tokens/) build the cache themselves as their last step, which covers the normal workflow. Reach for `specs cache` when the cache is missing, when something outside those commands changed the files in your data directory, or when `render` tells you to.

## Usage

```bash
specs cache [options]
```

## Why it exists

A spec references the library by name: an instance element names a component, a style key names a token, a glyph element names an icon. None of those names mean anything on their own — they have to be resolved against the data `fetch` downloaded.

That data arrives as whole Figma API responses. A file payload for a large library can be hundreds of megabytes, and `render` needs only a few hundred small entries out of it. Deriving those entries per render meant re-reading the entire payload every time, which cost seconds before any Figma work started. The cache is those entries, extracted once.

## What it writes

Four files under `{data.directory}/cache/`, each covering every source you've fetched:

| File | Maps | Built from |
|------|------|------------|
| `components.yaml` | component node id → published key and name | `{alias}.file/` (or `.file.json`) |
| `styles.yaml` | style name → key and type | `{alias}.file/` (or `.file.json`) |
| `variables.yaml` | token name → key, id, published flag | `{alias}.variables.json` |
| `icons.yaml` | glyph name → node id and key | `{alias}.file/` (or `.file.json`) |

They're generated files. Deleting them is safe — the next `specs cache` rebuilds them — and they should not be edited by hand.

Each entry records which source it came from, because node ids are file-scoped: knowing an entry's origin is what lets `render` tell whether an id is usable in the file it's rendering into, and it lets one library be rebuilt without re-reading the others.

`components.yaml` also records each component's raw Figma name. A spec refers to a component by a formatted key, and that transform is lossy — `DS Link/On overlay/M` and `DS Link On Overlay M` produce the same key — so the name cannot be recovered from the key. Recording it lets `render` place an instance of a component the workspace has no spec for: the library's names are formatted the same way and matched against the spec's key, then the component is imported by its published key. Names are stored raw and formatted at render time, so changing `spec.keys` needs no rebuild.

Every file also records what it was built from — the payload's name, size, and modification time, plus the glyph naming pattern for `icons.yaml`. That's how staleness is detected.

## Staleness

Before each render, the bridge checks the recorded source details against the files on disk. A cache that no longer matches is a hard failure:

```
Error: Render failed: Render cache is not usable:
  - variables.yaml: "library" is stale

Run `specs cache` to rebuild it.
```

`render` refuses rather than rebuilding, for two reasons: rebuilding is exactly the per-render cost the cache removes, and rendering against data that no longer matches what was fetched binds a spec to the wrong variables or drops content — a failure that surfaces far from its cause.

The cache goes stale when a payload is re-fetched, when `applyCustomTokens` rewrites your variables, or when the `figma.glyphs.match` convention changes — a pattern edit changes what the icon entries mean without any file changing. All three are detected.

## Options

### `--config <path>`

Use a specific `config/` directory instead of the default `config/` in the working directory.

### `--force`

Rebuild every source, even those whose recorded details still match the files on disk.

By default a source whose payload hasn't changed is left alone and its entries are carried forward, so rebuilding after fetching one library re-reads that library only. `--force` is the escape hatch for a cache you suspect is wrong for a reason the staleness check can't see.

```bash
specs cache --force
```

## Sources that aren't fetched

The cache is built for every source declared under `data.sources` in `config/settings.yaml`. A source you haven't fetched yet is skipped and reported, not treated as an error:

```
  Cache rebuilt: library
  Not fetched, skipped: brand
  Entries: 3567 components, 97 styles, 1458 variables, 469 icons
```

`render` is stricter: it needs every declared source present and current, and fails naming the ones that aren't.

## Examples

```bash
# Rebuild whatever is out of date
specs cache

# Rebuild everything from scratch
specs cache --force

# Rebuild as part of a render, without a separate command
specs render specs/components/deButton/ --refresh-cache
```

## Related

- [`fetch`](/cli/commands/fetch/) — downloads the payloads the cache is built from, and builds it
- [`applyCustomTokens`](/cli/commands/apply-custom-tokens/) — rewrites variables data, then rebuilds the cache
- [`render`](/cli/commands/render/) — reads the cache; fails when it's missing or stale
