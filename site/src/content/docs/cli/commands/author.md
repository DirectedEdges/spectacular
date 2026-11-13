---
title: "author"
---

The authoring namespace: everything that opens a hand-authoring round. `status` answers "where do I stand" without writing anything; `start` is the opening move for one new component.

## Usage

```bash
specs author status [options]
specs author start <key> [options]
```

`<key>` is the camelCase spec folder key (`tooltip`, `pageHeader`). A spelling that is not a folder key is refused, and the error names the spelling to use instead.

## status

Prints the authoring startup digest. Read-only — it starts nothing and repairs nothing. Every field is deterministic from data on disk:

| Section | Carries |
|---------|---------|
| `catalogue` | Component and composition folder keys — what exists to nest or emulate |
| `analysis` | Path and last-write date for `props`, `dependencies.byComponent`, and `foundations`, plus `stale: true` when any is missing or predates the newest fetched payload |
| `conventions` | The `config/conventions/` file paths |
| `posture` | The pinned Storybook port read from `storybook/package.json` (never guessed) and whether it answers |

The digest is an index, not a context dump: it names what to read and whether it is fresh, and never carries token names, prop vocabularies, or conventions content.

## start

Everything `status` prints, after one write: `specs/components/<key>/` with all three concern templates — `api.yaml`, `variants.yaml`, `examples.yaml` — and the api document's `title` filled (from `--title`, or derived from the key).

The folder starts **valid**: the templates are designed so a freshly started component passes `specs validate <key> --authored` at zero edits. Every validation error you see afterwards is one you introduced.

`start` never overwrites. An existing folder under the key is an error naming the path, and the folder is left untouched.

## Options

| Option | Meaning |
|--------|---------|
| `--title <title>` | `start` only — the api document's display title |
| `--config <path>` | Path to a `config/` directory |
| `-o, --output <dir>` | Specs directory (default: `spec.directory` from settings) |

Output follows the workspace's `spec.format` — YAML or JSON. A JSON workspace gets `api.json`, `variants.json`, `examples.json`, parsed from the same templates (comments drop, as JSON carries none).
