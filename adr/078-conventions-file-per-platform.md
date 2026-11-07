# ADR: One Conventions File per Platform, in `config/conventions/`

**Branch**: `078-conventions-file-per-platform`
**Created**: 2026-08-30
**Status**: ACCEPTED
**Summary**: One conventions file per platform in `config/conventions/` composes into `Conventions`, alongside a reserved `primitives.yaml` for the promotion table.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

ADR-071 Decision 10 established the workspace layout — one artifact per question:

```
config/
  conventions.yaml     # what the library is
  settings.yaml        # how output behaves, and where it goes
  pipeline.yaml        # what to run
```

ADR-073 then made `Conventions` a platform-keyed map with `figma` as one key among `react`, `web-components`, `swiftui`, and `compose`. A four-implementation workspace produces roughly this:

```yaml
platforms:
  figma:            # ~30 lines: naming, glyphs, subcomponents, states, images
  react:            # ~14 lines
  web-components:   # ~14 lines
  swiftui:          # ~16 lines
  compose:          # ~16 lines
```

Nothing about that is large. The problem is that it is **one file with several owners**:

- The `figma` entry is authored by whoever knows the Figma library — its naming, its state props, how it organizes subcomponents. That person has no opinion about `foregroundStyle`
- Each code entry is authored by whoever knows that code library. That person has no opinion about `"{C} / Examples / {S}"`
- The entries change on unrelated cadences. A Figma reorganization touches one; a Compose Material bump touches another

The consequences are ordinary but real: no single reviewer can validate the file, every change puts unrelated teams in the same diff, and the design lead opening `conventions.yaml` to check a layer-name pattern scrolls past four blocks of prop names that mean nothing to them.

ADR-071 Decision 1B already rejected splitting *the type* by author, on the grounds that it encodes an org chart rather than a property of the data. That rejection stands and is not reopened here. This ADR asks a different question: given one contract, may it be **composed from several files**?

---

## Decision Drivers

- **One contract, whatever the file count.** `Conventions` stays a single platform-keyed map (ADR-073). Nothing here may reintroduce a namespace split or a second root artifact
- **Ownership should map to something reviewable.** A change to the React vocabulary should be diffable, reviewable, and ownable without touching what the design lead reads
- **No logic in the schema package (Constitution II).** Composition is a loader concern; the package describes the artifact
- **Layout is convention, not configuration (ADR-071 Decision 10).** The existing files are discovered by name in `config/`, not declared. A composition mechanism that requires declaring file paths is a step backwards
- **Do not name anything after a direction or a command.** This pipeline reads code to produce specs and writes specs to produce Figma; ADR-077 removed a read/write framing for exactly this reason, and the same error is available in a folder name
- **Absence keeps its meaning (ADR-071).** A platform with no file declares no conventions — the same statement a missing key made
- **One way to do it.** `config/conventions.yaml` ships in CLI `0.28.0`, which is unreleased — npm's latest is `0.27.0`, and that release's own breaking change is the move from `specs.config.yaml` to `config/`. No workspace outside this repo has ever seen the single-file form, so there is no compatibility to preserve and no reason to carry two layouts forward

---

## Options Considered

Four decisions: whether composition happens at all, where the files live, how a file names its platform, and whether a single-file form exists at all.

---

## Decision 1 — Is `Conventions` composed from several files?

### Option 1A: Yes — several files compose into one `Conventions` *(Selected)*

The loader gathers platform entries from several files and produces one `Conventions`. The type, the schema, and everything downstream see exactly what they see today.

**Pros**:

- Separates ownership without separating the contract. The type stays one map; only the authoring surface splits
- The split is along the platform axis, which is a property of the data, not an org chart — ADR-071 Decision 1B's objection does not apply. That teams happen to align with platforms is a consequence, not the rule
- Purely a loader concern, so nothing in `Conventions` changes and no consumer of the resolved object is affected
- Scales with platforms rather than with team count

**Cons / Trade-offs**:

- The effective conventions for a run are no longer visible in one file. Mitigated by the resolved object being what every consumer sees, and by `metadata.conventions` in emitted specs recording what was actually used
- One more layout rule to know

---

### Option 1B: No — keep one file *(Rejected)*

**Rejected because**: it leaves every owner in one diff and makes the design lead's file the union of five audiences' concerns. The cost compounds with each platform added, and the fix costs no type change.

---

### Option 1C: Split the type instead — `conventions` and `codeConventions` *(Rejected)*

**Rejected because**: this is ADR-073 Option 2B, rejected there for asserting that Figma is not a platform, and ADR-071 Decision 1B, rejected for encoding an org chart. It also fails on its own terms now: the split would have to be "Figma versus the rest," which stops describing anything the moment two code teams own two platforms.

---

## Decision 2 — Where the files live

### Option 2A: `config/conventions/`, one file per platform *(Selected)*

```
config/
  conventions/
    figma.yaml
    react.yaml
    web-components.yaml
    swiftui.yaml
    compose.yaml
  settings.yaml
  pipeline.yaml
```

The artifact keeps its name; it becomes a directory rather than a file. `settings.yaml` and `pipeline.yaml` are untouched.

**Pros**:

- Preserves ADR-071 Decision 10's rule exactly — one artifact per question, named for the question. `conventions/` is still *the conventions artifact*; only its granularity changed
- The directory name says what the contents are, not who reads them or when. Nothing in it implies a direction or a command
- Ownership maps to a file path, so `CODEOWNERS` works on it without further ceremony
- Discovery stays convention-based: read every file in `config/conventions/`. No paths declared anywhere, consistent with the existing layout
- Scales to N platforms with no rule change, and the two-file case is the common instance rather than a special one

**Cons / Trade-offs**:

- `config/` now holds a directory beside two files. Mild asymmetry, and the alternative is a rule that stops scaling
- Reading the whole conventions means opening a directory

---

### Option 2B: `config/transform/`, holding the code-platform files *(Rejected)*

```
config/
  conventions.yaml       # figma
  transform/
    react.yaml
```

**Rejected because**: it names the folder after a command, and the command is the wrong axis twice over.

First, it is not even accurate today. `platforms.figma` is consumed by `generate`, not `transform`, so this layout sorts conventions by which command reads them — the "grouped by kind of knob" arrangement ADR-071 Decision 10 explicitly retired in favour of grouping by concern. It would need a `config/generate/` sibling to be consistent, and then a third folder for whatever reads conventions next.

Second, and more seriously, **the same conventions are used by more than one command and in more than one direction**. Reading code to produce a spec needs the React vocabulary as much as transforming a spec into React does — knowing that `DsText` is the text primitive is required either way. Filing those conventions under `transform/` bakes in a one-direction assumption, which is the precise error ADR-077 removed when it dropped the read-side / write-side framing. A folder name should not re-encode a distinction the ADRs just rejected.

---

### Option 2C: Flat, dotted — `config/conventions.react.yaml` *(Rejected)*

**Rejected because**: it puts five files in `config/` beside `settings.yaml` and `pipeline.yaml`, so the directory no longer reads as three artifacts. It also makes the artifact's identity a filename prefix, which tooling and `CODEOWNERS` handle worse than a path.

---

### Option 2D: A directory per platform — `config/platforms/react/conventions.yaml` *(Rejected)*

**Rejected because**: a level of nesting holding one file each. The platform axis is already the filename in Option 2A; a directory adds depth and nothing else until a platform needs a second artifact, which nothing suggests it will.

---

## Decision 3 — How a file names its platform

### Option 3A: The filename is the platform id; the file holds the entry body *(Selected)*

```yaml
# config/conventions/react.yaml
stylesProp: sx
images:
  component: DsImage
primitives:
  text:
    component: DsText
    props:
      typography: typography
```

No `platforms:` wrapper, no key repetition. `config/conventions/react.yaml` contributes `platforms.react`.

**Pros**:

- A file owns exactly one platform, so two files cannot declare the same key and there is **no merge rule to specify** — the collision the alternative would need to resolve cannot occur
- The file's identity is its path, which is what `CODEOWNERS`, review routing, and `git log` operate on
- No repetition. The key appears once, as the filename
- Adding a platform is adding a file; removing one is deleting a file, and absence keeps its ADR-071 meaning

**Cons / Trade-offs**:

- Renaming a platform renames a file. Correct — they are the same fact
- A file's contents start at `stylesProp:` with no in-file statement of which platform they describe. Conventional for directory-keyed configuration (`.github/workflows/`, `hosts.d/`), and the path is visible in every editor and diff
- A shared fragment across two platforms cannot be expressed. ADR-073 Decision 3B already rejected inheritance on the platform axis; this is consistent with it

---

### Option 3B: Each file carries a full `platforms:` map, deep-merged *(Rejected)*

**Rejected because**: it permits two files to declare the same platform, which forces a merge rule — file ordering, key precedence, deep versus shallow — for a capability nobody asked for. It also repeats each key in two places, where they can disagree.

---

### Option 3C: The file declares its own id in a `platform:` member *(Rejected)*

**Rejected because**: it allows filename and declared id to differ, so the path stops being trustworthy and every tool must open a file to learn what it configures.

---

## Decision 4 — Is there a single-file form at all?

### Option 4A: No — `config/conventions/` is the only layout *(Selected)*

`config/conventions.yaml` is not a valid workspace layout. A workspace declares its conventions as one file per platform inside `config/conventions/`, whatever the platform count.

**Pros**:

- **Nothing is being broken.** `config/conventions.yaml` is introduced by CLI `0.28.0`, which is unreleased; npm's latest is `0.27.0`, and 0.28.0's own headline change is the move from `specs.config.yaml` to `config/`. The single-file form has never reached a workspace outside this repository, so supporting it would be preserving compatibility with something that never existed
- **One layout, one discovery path.** The CLI reads a directory. There is no branch, no both-present error to define, and no question about which form takes precedence — none of which buys anything once the alternative form has no users
- The `specs migrate config` command that 0.28.0 already ships can emit the directory form directly, so no workspace ever lands on a layout it would later migrate off
- Removes a permanent cost from the CLI in exchange for a one-time edit to a handful of in-repo test workspaces
- Every workspace looks the same regardless of platform count, so documentation, examples, and tooling have one shape to describe

**Cons / Trade-offs**:

- A workspace with only Figma conventions gets `config/conventions/figma.yaml` — a directory holding one file. Mildly ceremonious, and the honest price of a single layout. It also stops being ceremonious the moment a second platform arrives, which is the direction every workspace travels
- `config/` holds one directory beside two files, an asymmetry with no escape hatch. Accepted: the asymmetry reflects that one artifact is composed and two are not

---

### Option 4B: Both forms are valid; declaring both is an error *(Rejected)*

A workspace has either `config/conventions.yaml` or `config/conventions/`, never both.

**Rejected because**: it buys backwards compatibility with a form that has never been released. The cost is permanent and lands on every consumer that loads conventions — two discovery paths, a both-present error to define and test, two layouts to document, and two shapes for any tooling that reads or writes the artifact. Weighed against a one-time edit to in-repo test workspaces, the trade is clearly wrong. The moment to have one layout is before the first release, and that moment is now.

---

### Option 4C: Merge both, directory overriding file *(Rejected)*

**Rejected because**: it invents a precedence rule to support a layout nobody wants — half the conventions in a file and half in a directory beside it — and it compounds Option 4B's cost rather than avoiding it.

---

## Decision 5 — Where the platform-neutral promotion table lives

ADR-075 adds `Conventions.primitives`, which is not a platform: a component's props are
the same whichever platform renders it, so the table is stated once. Decision 3 makes a
filename a platform id, which leaves this file with no obvious home.

### Option 5A: `config/conventions/primitives.yaml`, a reserved basename *(Selected)*

The table sits in the same directory, and `primitives` is reserved — the loader reads it
as the neutral section rather than as a platform, and no platform may take that id.

```
config/
  conventions/
    figma.yaml         # platform
    react.yaml         # platform
    primitives.yaml    # the promotion table — not a platform
  settings.yaml
  pipeline.yaml
```

**Pros**:

- Everything that composes into one `Conventions` lives in one directory, which is what
  Decision 1 established. A reader looking for what conventions a workspace declares finds
  all of it in one place
- One reserved name is a small, checkable rule. A platform id of `primitives` is a
  collision the loader can refuse, and nothing else changes
- The file is the one most likely to be machine-generated from each component's own spec.
  Keeping it a separate file means regenerating it never merges around a human's edits to
  a platform's conventions
- No new directory, and no change to how the other files are found

**Cons / Trade-offs**:

- The directory no longer holds only platforms, so Decision 3's "the filename is the
  platform id" gains an exception. It is a single, named exception rather than a rule with
  a shape to infer
- A design system whose component is genuinely called `primitives` cannot be a platform id.
  Platform ids name implementations — `react`, `swiftui` — so this costs nothing real

---

### Option 5B: `config/primitives.yaml`, beside `settings.yaml` *(Rejected)*

**Rejected because**: it separates one artifact of `Conventions` from the rest of it, so a
reader has to know that conventions come from two places in `config/`. Decision 1's whole
point is that several files compose into one `Conventions`; the composition should be
visible in one directory.

---

### Option 5C: A `primitives` key inside every platform file, merged *(Rejected)*

**Rejected because**: it states a platform-neutral fact in a platform's file, and then needs
a merge rule for what happens when two platforms declare the same component differently —
which is exactly the question Decision 3 was designed to remove.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| *(none)* | `Conventions`, `ResolvedConventions`, and `Settings` are unchanged. Composition is a loader concern | — |

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `workspace.schema.json` | `config/conventions.yaml` replaced by `config/conventions/`, one file per platform id with the entry body as its root | MINOR |
| `conventions.schema.json` | Added a definition validating a single platform entry standalone — the per-file root — alongside the existing whole-artifact definition | MINOR |

**Example — the layout**:

```
config/
  conventions/
    figma.yaml
    react.yaml
  settings.yaml
  pipeline.yaml
```

```yaml
# config/conventions/figma.yaml
naming: SENTENCE
glyphs:
  match: "DS Icon Glyph / {i}"
```

```yaml
# config/conventions/react.yaml
stylesProp: sx
primitives:
  text:
    component: DsText
```

These compose into the `Conventions` object ADR-073 defines, unchanged.

### Notes

`conventions.schema.json` needs a standalone definition for one platform entry so a single file can be validated on its own, in an editor, without the rest of the directory. The whole-artifact definition references the same definition, so the two cannot drift.

Discovery is by convention: every `*.yaml` directly inside `config/conventions/`, with the basename as the platform id. No recursion, and no paths declared in `Settings` — consistent with ADR-071 Decision 10, where layout is convention rather than configuration.

There is exactly one layout. `config/conventions.yaml` is not read, and a workspace holding one gets an error naming the directory it should become — the same posture CLI `0.28.0` already takes toward an unmigrated `specs.config.yaml`, rather than a silent fall back to defaults.

A file whose basename matches no platform any generator reads is inert, exactly as an unread platform key would be. A consumer-side warning is the mitigation and a consumer concern (Constitution II).

---

## Type ↔ Schema Impact

- **Symmetric**: Yes, trivially — no type changes, and the schema addition is a re-entry point into an existing definition rather than a new shape
- **Parity check**: the standalone per-platform definition ↔ `PlatformConventions`, the same definition the whole-artifact form references

---

## Downstream Impact

Measured against `specs` on `release/schema-0.31.0+cli-0.28.0`. These are the file-layout impacts; the namespace move (`conventions.figma` → `platforms.figma`) carries its own inventory in ADR-073.

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` — `Config/ConfigLoader.ts` | `CONFIG_DIR_FILES = ['conventions', 'settings', 'pipeline']` and `readPart(dir, 'conventions')` treat conventions as one of three peer files. Conventions stops being a `readPart` and becomes a directory read | Split the discovery path; keep `settings` and `pipeline` as they are |
| `specs-cli` — `commands/MigrateCommand.ts` | Writes literal targets `config/conventions.yaml`, `config/settings.yaml`, `config/pipeline.yaml`, and its pre-flight guard refuses when `config/` already holds any of `conventions|settings|pipeline` × `yaml|json` | Write `config/conventions/<platform>.yaml`; extend the overwrite guard to the directory |
| `specs-cli` — `Config/migrations/configV1.ts` | Returns a single `conventions` object for the migrator to serialize | Return per-platform entries, or have `MigrateCommand` split the one it returns |
| `specs-cli` — `Config/ConfigTemplates.ts` | `generateConventionsTemplate()` emits one document with a `figma:` root, registered under the key `'config/conventions.yaml'`. It carries inline comments and a docs link, so it is authored content, not a stub | Split into a per-platform template, written to `config/conventions/figma.yaml` |
| `specs-cli` — `commands/InitCommand.ts` | Scaffolds `config/` and names `config/conventions.yaml` in its `--help` description | Write `config/conventions/figma.yaml`; update the description |
| `specs-cli` — `bridge/server.ts` | `resolveSources()` reads `config/conventions.yaml` **and** `config/settings.yaml` by literal path, with its own pre-split `specs.config.yaml` fallback that `ConfigLoader` refuses. Two read paths that disagree | Consolidate onto `ConfigLoader`; delete the literal paths and the legacy fallback |
| `specs-plugin-2` | Never touches workspace files; receives conventions over the bridge | None |
| `specs-from-figma` / `figma-from-specs` | Receive a resolved `Conventions`; unaffected by layout | None |
| Docs site (`specs/site`) | Pages documenting the `config/` layout and `specs init` / `specs migrate config` output | Update layout examples |
| `specs-testing` workspaces | Six in-repo workspaces hold `config/conventions.yaml` | Mechanical conversion, one file per platform |
| Workspaces outside this repository | None — `config/conventions.yaml` ships in the unreleased CLI `0.28.0` | None |

The finding worth acting on is `bridge/server.ts`. Every other consumer reads conventions through `ConfigLoader`, so one change to discovery serves them all; the bridge opens the files itself, its failure mode is silence rather than an error, and it is out of step already — it reads a pre-split `specs.config.yaml` that `ConfigLoader` refuses.

---

## Semver Decision

**Version**: `0.32.0` (release branch `release/schema-0.32.0+cli-0.29.0`) — **MINOR**

**Justification**: no type changes. `config/conventions.yaml` is introduced by the unreleased CLI `0.28.0` (npm's latest is `0.27.0`), so replacing it with `config/conventions/` invalidates no published layout — the same reasoning ADR-073 uses to reshape `Conventions` itself. The release stays MINOR against the published baseline. This holds only until `0.28.0` ships.

---

## Consequences

- Ownership maps to a file path. The React vocabulary is reviewable and ownable without touching what a design lead reads, and `CODEOWNERS` needs no special handling
- `config/conventions/figma.yaml` holds only Figma facts, which is the file the design lead opens
- There is no merge rule, because a platform is declared in exactly one file. The collision case cannot arise
- The contract is unchanged. Every consumer receives one `Conventions` object and cannot tell which layout produced it
- There is one layout. No discovery branch, no precedence rule, no both-present error — and a workspace with only Figma conventions accepts a directory holding one file as the price
- **This must land alongside `0.28.0`.** Once the single-file form ships, replacing it is a breaking change to every workspace that adopted it
- **The layout ends up read in one place.** `bridge/server.ts` is consolidated onto `ConfigLoader` rather than repointed, so this is the last layout change that has to be applied twice. That also removes a divergence the two paths already carry: the bridge serves pre-split workspaces that every other command refuses, and it will refuse them too — a behaviour change that belongs in the CLI changelog
- **`specs init` scaffolds Figma and nothing else.** Which implementations a workspace targets is not knowable at init time, and a commented placeholder file would claim a platform id no generator reads — the inert-file case the notes above describe. Adding a code platform is hand-authored; a `--platform` flag to scaffold one is out of scope here
- **Config scaffolding is authored content, not a stub.** `generateConventionsTemplate()` carries inline comments and a documentation link, so splitting it per platform is writing templates, not slicing one
- Together with ADR-073's inventory, the whole conventions move touches `specs-schema`, six CLI subsystems, 15 source files across `specs-from-figma` and `figma-from-specs`, roughly 44 of their test files, one line of `specs-plugin-2`, and about 45 docs pages. None of it is deep, and all of it is cheaper now than after `0.31.0` and `0.28.0` ship
- **Out of scope, and now more visible**: `metadata.conventions` in an emitted spec records the resolved conventions, which in a five-platform workspace means four platforms' vocabulary riding along in every spec generated from Figma. Whether metadata should carry only the platforms a run used is a separate question this ADR deliberately does not answer
