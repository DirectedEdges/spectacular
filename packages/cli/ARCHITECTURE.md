# CLI Architecture

`@directededges/specs-cli` — orchestrates fetch → scan → generate → transform
→ render over the closed processing engine and emitter packages. Two esbuild
bundles: `dist/specs.js` (the binary) and `dist/bridge-server.js` (the bridge
daemon). Dev invocation is always `node <repo>/packages/cli/dist/specs.js …`,
never the globally installed `specs` binary (a stale published release — a
hook blocks it).

## Invariants & gotchas

- **Every `src/` directory is lowercase, and names a feature or a stage** —
  `analyze/`, `cache/`, `emit/`, `fetch/`, `generate/`, `render/`, `scan/`,
  `storybook/`, `testing/visual/`, `transforms/css/values/`. A feature folder is
  named for its command, not for the plural of what it holds — `analyze/`, not
  `analyzers/`. `src/commands/` holds one file per command, named for the command;
  anything a command needs beyond registration and argument parsing lives in the
  feature folder it belongs to. `tests/unit/` mirrors the same names.
- **Commands import feature folders; nothing in a feature folder imports a
  command.** One-way, and checkable in one grep — `grep -rn "from '.*commands/"
  src --include=*.ts` should match `src/index.ts` and nothing else. It did not
  hold before: `pipeline/steps.ts` reached into a command file for `emitTarget`,
  and three commands reached into another command's file for the cache report
  (specs#697).
- **`src/utilities/` has an entry rule, and it is the whole reason it stays
  small: a file belongs to a feature folder when exactly one feature imports it,
  and lives here only when more than one does.** Nothing is filed here because no
  other folder suggested itself. The rule is read off the imports, not judged —
  `grep -rl "utilities/<name>.js" src --include=*.ts` names the consumers, and one
  consumer means the file is in the wrong place. It reached 25 files without it,
  and most of those turned out to be the private code of `generate` and `scan`,
  the two largest commands and the only substantial ones that had no folder.
- **Nothing in `utilities/` imports a feature folder** — `grep -rn "from '\.\./"
  src/utilities` is empty. A shared module that reaches into one feature is not
  shared, it is misfiled: the dev-status vocabulary sat in scan's discovery module
  while the manifest parser imported it from there, which is why `devStatus.ts`
  is its own file.

- **There is no MCP server.** The persistent local process is the *bridge*
  (`src/bridge/server.ts`): WebSocket 9001 for plugin connections keyed by
  `fileKey`, HTTP 9002 control (`POST /render`, `POST /generate`,
  `POST /variables`, `POST /inspect`, `POST /annotate`, `GET /status`). Pid/log
  files live under `~/.specs`. Two of those are the role-adoption pair and the
  only reason the bridge reads structure as well as specs: `/inspect` describes a
  live component's anatomy elements keyed the way the spec keys them, `/annotate`
  adds role annotations to one page's components. `/annotate` is the only
  mutating endpoint besides `/render`, and it appends — it never assigns over an
  annotation already on a layer.
- `npm run watch` rebuilds only `dist/specs.js` — **bridge/server changes need
  an explicit `npm run build`** to refresh `dist/bridge-server.js`. That applies
  to every module `server.ts` imports, not only the file itself.
- **`server.ts` is the only module in `src/bridge/` that opens a port**, and
  keeping it that way is what makes the rest testable. Importing it to call a
  function starts a listener on 9001, so anything another module could own —
  the operations, the manifest builders, workspace resolution — belongs there
  instead.
- Legacy single-file configs (`specs.config.yaml`) are **refused with an
  error, never read** — `specs migrate config` is the only path to the split
  `config/` layout (ADR-071/078).
- `src/index.ts` auto-loads `.env` from cwd before commander parses (never
  overwrites existing env).
- `SPECS_DEV_TIER` is an **engine** seam, not a CLI one — it lives in
  from-specs' `entitlement.ts` (dev builds only). The CLI just displays the
  license level the engine stamped into `component.metadata.generator.license`
  via `src/generate/licenseStatus.ts`.
- Version is compile-time (`__SPECS_CLI_VERSION__` esbuild define) — not
  readable from package.json at runtime.
- Tests run from the **repo root** (`vitest -c vitest.config.ts
  packages/cli/tests`), not from the package.
- Engine + emitters are ordinary `dependencies`, statically imported, external
  to the bundle (`--packages=external`) — resolved from `node_modules` at
  runtime, which in dev are symlinks into sibling checkouts.
- `src/figma-shim.ts` installs a stub `global.figma` so engine code written
  against the Plugin API runs in Node — imported first, by design.
- **`src/utilities/specsLayout.ts` is the only thing that knows the `specs/`
  layout** (ADR-096): which directory holds each kind, how a spec folder is
  recognised, and how a pre-`components/` directory reads as legacy. Every reader
  resolves through it. Two divergent filters preceded it — the emitter walk looked
  for a child holding `api.yaml`, the version assembler skipped names starting `_`
  or `.` — and a third kind had nowhere to go.
- **`src/utilities/specFolderKey.ts` is the only derivation of the folder a spec is
  written under.** Independent of `settings.spec.keys`, which governs keys *inside*
  a spec and the formatted `instanceOf` values the bridge matches against raw Figma
  names. Two derivations were a real defect: a guard rejected a name the writer
  would have silently folded into a directory called `component`.
- A transform declares which kinds it reads (`readsKinds`), defaulting to
  components only — so one that has not considered compositions never receives
  them. Dependencies and styling analysis read both; props and keys do not.
- **A file payload is built before any of it is sent, and a fetch is two stages,
  not one.** Figma serializes the whole document before the first byte leaves,
  and only repeats that work when the file changed since the last fetch:
  measured at 10–18 seconds per 100MB against a transfer that runs near 75MB/s,
  so a 700MB fetch is ~100 seconds of silence then ~10 seconds of download.
  Treating the two as one is what made a healthy wait look like a hang, and made
  the elapsed figure describe neither stage (specs#707). Each stage's line is
  erased by the next (`utilities/spinner.ts`'s `erasePrintedLine`), so a finished
  kind leaves one `✓ Downloaded:` line and the estimate and the wait are gone:
  live progress while it matters, no transcript of it afterwards. That erase
  reads the cursor's position, so nothing may print between a stage's line and
  the spinner below it, and the caller hands over the text it printed because a
  wrapped line occupies more than one row.
- **Every progress line names the kind as `<alias>.<kind>`**, the spelling the
  error paths and the on-disk artifacts already use — `testlibrary file` reads as
  "the file called testlibrary". The stage labels are `Preparing:` and
  `Downloading:`, parallel verbs naming the work; `Waiting for` named the CLI's
  posture instead, and was the only line in the sequence that did.
- **The two stages are reported as two and timed as one.** One `kindStart` per
  loop iteration is handed to both spinners as `startSpinner`'s `since`, so the
  live counter does not restart at the stage boundary, and `✓ Downloaded:` reports
  the kind's total — read at print time, after the split, not from the download
  spinner's return. A clock per stage is why a two-minute wait used to finish as
  `(0s)`: the wait's figure was on the line the download line erased, so the only
  number that survived described a transfer of a few hundred milliseconds. The
  `✓ Ready:` line still names the prepare duration, which is what a cumulative
  clock reads at the end of the first stage.
- **The first-byte deadline covers the wait only — never the body.**
  `figmaFetch` aborts if no headers arrive within `FIRST_BYTE_TIMEOUT_MS`
  (4 minutes) and clears the timer the moment they do: a transfer already in
  flight is making progress, and a partial payload is worth nothing. Moving that
  `clearTimeout` would silently start killing slow downloads. Giving up also
  discards the build — Figma starts over on the next request — so nothing here
  retries, and the failure says so rather than implying a cheap retry.
- `src/fetch/` holds what only `fetch` uses — `estimate.ts`, `fileKey.ts`. A second
  caller moves it out, by the entry rule above — to the one feature that imports it,
  or to `utilities/` when several do. That is why the payload split and its reader do
  not live here: `sectionedFile.ts` imports `payloadSplit.ts` and shares its format
  version, so the three are one on-disk format and move as one, and `sectionedFile`
  alone has six consumers.
- `src/fetch/estimate.ts` predicts the wait from the **previous** fetch
  of the same source (`manifest.json`'s `sourceBytes`, else the monolithic
  payload's size on disk), and deliberately answers in bands rather than
  figures — the measured rate spans a wide enough range that a number would
  claim precision the data does not support.
- **`fetch` is the only consumer of a source's file key**, which is why
  `normalizeSources` validates and resolves every `data.sources.*.key` instead of
  `ConfigLoader` doing it: the bridge and Storybook read aliases and `fetch`
  lists, never keys. It takes a key or a pasted URL — the same resolution
  `--source` uses — and collects every unusable key so one run names them all
  rather than failing at the first. The check precedes the first request because
  an absent key reached the API as the literal string `undefined` and came back a
  404 that read as a stale key (specs#706).

## Commands

Registered in `createProgram()` (`src/index.ts`). **One flat file per command,
named for the command** — `src/commands/<command>.ts`, so `ls src/commands/`
is the command list and there is nothing to translate between a command name
and the file to open. Each file is registration, flags and argument parsing;
the work lives in the feature folder.

| Command | Role |
|---|---|
| `init` | Scaffold split `config/` |
| `migrate` | Legacy config → split layout; manifest v1→v2 |
| `build`, `run` | The whole chain over `src/pipeline/` — `build` once then exits, `run` once then watches. What they share as commands is `pipeline/chainCommand.ts` (ADR-101) |
| `generate` | Figma file / manifest / bridge → specs |
| `scan` | Discover components → `<alias>.manifest.md` |
| `fetch` | Figma REST download (file, variables, styles, icons); `--from-bridge` reads variables through the plugin instead (non-Enterprise path) |
| `cache` | Render lookup caches |
| `applyCustomTokens` | Inject custom tokens into foundations |
| `react`, `webcomponents` | Emit one platform target whole — component, contract, stylesheet, stories. Both are four lines over `emit/targets.ts`, which also holds the `emitTarget()` the chain calls in-process |
| `analyze` | Dependency/prop/styling/key/role analyzers. Naming none runs every analyzer |
| `render` | Spec → Figma via bridge |
| `bridge` | start/stop/status for the daemon |
| `version` | Spec workspace versioning: diff/history/bump/restore/premerge/report over `src/version/`. Free tier |
| `skills` | Emits the canonical premerge/release orchestration skills into `.claude/skills/` |
| `storybook` | Scaffold the host (`init`) and rewrite what it shows (`publish`, `dev`) over `src/storybook/` |
| `testing visual` | Visual testing over the emitted Storybook (`src/testing/visual/`): manifest → baseline/shoot → diff → report, fidelity (vs Figma exports) or regression (vs accepted renders). Kind-aware keying throughout; compositions advisory. Playwright/pixelmatch/pngjs are the customer's install in `testing/visual/` (`init` scaffolds it), never CLI deps. Baseline capture only runs when named — no trigger, no staleness model, provenance only |
| `audit` | Deprecated; an inline alias in `index.ts` that rewrites argv to `scan`. The one command with no file of its own |

- **Nothing removes a spec folder.** `generate` overwrites what it produces and
  reports folders it found but did not write; a run cannot tell a component
  deselected on purpose, or one generated from another source, from a stale one.
  The platform trees are derived and *are* pruned — the full rule is in the
  repo-root `ARCHITECTURE.md` under "What the tooling may delete".
- `✓ Fetch complete` is checked against disk, not inferred from the absence of an
  error: a requested kind missing on disk fails the run, a configured kind that
  `--only` excluded warns. Counts printed by `reportCache()` are cache contents
  across every source, not what the run downloaded. `reportCache` also takes the
  aliases the caller **attempted** and failed, because the cache cannot tell those
  from a source nobody asked for — both simply have no payload — and describing a
  failed source as "skipped" put "nothing was tried" one line under its failure
  (specs#708).
- A transformer that writes into each component's own folder declares
  `perComponentOutput` (basename, extension follows the run's format) so the
  command can name those files — output appearing unannounced in a spec folder
  reads as corruption.

## Key nodes

| Node | Role |
|---|---|
| `src/config/ConfigLoader.ts` | **The config seam.** Precedence: CLI flags > file > defaults. Discovery: `./config/` → legacy files (refused) → `~/.specs/config.yaml`. Conventions are a *directory*, one file per platform; `conventions/primitives.yaml` reserved (ADR-075). Relative directories resolve against the parent of `config/`, not cwd |
| `src/config/PlatformConventions.ts` | `figmaOf()` / `platformOf()` — every conventions consumer goes through these |
| `src/bridge/` | `server.ts` is the two listeners and the HTTP router, and nothing else: the sockets, result routing by `requestId`, and `withJsonBody`, which holds the read-parse-respond envelope every endpoint shares. `operations.ts` is one method per message the plugin answers, taking the registry, the request tracker and the bound workspace resolver as arguments so it can run against a fake socket. `manifests.ts` and `workspace.ts` are pure — what a render payload needs from the caches, and where a render reads from. Also `client.ts` (`postRender`, `postGenerateFromSelection`, `postInspect`, `postAnnotate`), connection pick (`resolveFileKey`), pidfile. **Only `server.ts` opens a port**, which is what lets everything else be tested |
| `src/generate/licenseStatus.ts` | Reads engine-stamped license state; the CLI validates nothing |
| `src/cache/` | `cache.ts` builds the render lookup caches under `{data.directory}/cache/`; `report.ts` prints a refresh result, shared by `specs cache` and by every command that refreshes as its last step |
| `src/analyze/` | The five analyzers behind `specs analyze` — `Props`, `Styling`, `Dependencies`, `Keys`, `Roles` — and `index.ts`, the registry that resolves names to them and answers what a run with no names does. Named for the command, like every other feature folder; it was `analyzers/`, named for the plural of its contents. `roleVocabulary.ts` sits beside them: the one machine-readable copy of the documented role concepts and their emission status, because the schema types a role as an open string and a coverage report needs to tell a typo from a concept |
| `src/generate/` | What only `specs generate` uses: `manifestParser.ts` (the v1 manifest), `fileSourceAlias.ts` (which configured source carries the component file), `imageFills.ts` (ADR-063 phase two), `licenseStatus.ts` + `licenseGuidance.ts` (display and the transient-failure wording) |
| `src/scan/` | What only `specs scan` uses: `discovery.ts` (component and composition discovery over a REST payload, monolithic or sectioned), `glyphPatternMatch.ts`, `manifestMigrationV1ToV2.ts` |
| `src/utilities/` | The 15 modules more than one feature imports — the layout seam, the payload format (`sectionedFile` + `payloadSplit` + `payloadRead`, one on-disk format in three files), the key derivations, the exit-code contract, the watch loop, the dev-status vocabulary. Entry rule above; it is not a catch-all |
| `src/transforms/` | Open counterparts of transform modules (see drift note below). Root holds what more than one transformer or a command uses — `states.ts`, `naming.ts`, `writeAtomic.ts`, `examples.ts`, `externalWrites.ts`, the registry; everything only the stylesheet needs is under `css/` |
| `src/transforms/css/` | The stylesheet transformer, in four stages: `values/` (spec value → CSS value), `style/` (spec style key → declarations, one module per property family), `analysis/` (what the spec says about its elements), `sheet/` (declarations → a stylesheet). A module imports from a stage above it, never below. `css/README.md` is the map (specs#691) |
| `skills/` | Procedures a customer's agent runs. Holding place until #592 makes skills canonical and ships them from the CLI package; `skills/README.md` says what is provisional |
| `src/pipeline/` | **The chain seam** (ADR-101). `steps.ts` is the single place the order lives — each step declares `inputs`, `outputs`, `active` and a `run` that calls a command's `runX()` function in-process, never a subprocess, which is what holds the license to one check per run. `plan.ts` answers which steps a workspace has and which step a changed file enters at; `drive.ts` is the two drivers; `chainCommand.ts` is the flags, option mapping and failure report `build` and `run` share, so the pair cannot drift on what they accept. A step runs whole or scoped by `--components`, except `analyze`, which always reads the whole catalogue because every analyzer's `finalize()` writes a catalogue-wide report |
| `src/utilities/specsLayout.ts` | **The layout seam.** `resolveSpecsLayout` (reads, legacy-aware) / `writeLayout` (always current) / `specFolderNames` / `dirFor(kind)` / `analysisDir()`. Emitted trees mirror it: `<tree>/src/<kind-dir>/<Name>` |
| `src/writers/` | Output *strategy* writers: single / component / concern / combined file. `WriteResult.filesWritten` documents itself as relative to the output directory and in fact holds **absolute** paths — re-base before comparing |
| `src/version/` | Versioning internals, one folder per pipeline stage: `assemble.ts` (concern files → component; `assembleCompositions` for the other kind, keyed separately since a shared name is legal — every composition change is patch-class and compositions carry no version of their own) → `diff/` (`compare.ts`, `renames.ts`) → `rules/` (`grade.ts` matches and grades, reading the rules-as-data in `semver.ts`; `--rules` overrides) → `ledger/` (`store.ts` for `versions/<libVersion>/` folders + `ledgers/*.json` with no snapshots, `cut.ts` the cut engine, `assets.ts`, `git.ts`) → `report/` (`dataset.ts` builds, `render.ts` renders the premerge canon). A module imports from a stage above it, never below. `figmaPremerge.ts` is the whole pipeline as one command; `skills.ts` is the skill markdown `specs skills install` emits, here with the versioning it orchestrates until #592 |
| `src/emit/` | The transform run shared by `specs react` and `specs webcomponents` — `run.ts` (discovery, `--components` narrowing, per-component failure reporting, `finalize`, `--watch`), `targets.ts` (which transformers a target runs, its flags, and `emitTarget()` for the chain's in-process call), and `prune.ts`, the only thing here that deletes |
| `src/utilities/errorCodes.ts` | **The exit-code contract.** The whole set, documented, imported by every command. The values are a public interface — an existing code's number never changes |
| `src/utilities/watchLoop.ts` | The `--watch` loop: debounce a save burst into one run, never overlap two, run once more if a change arrived mid-run. Debounce stays per caller (800ms re-emitting a catalogue, 300ms rendering one spec into Figma); `runOnStart` is false for the emitters, which must run before they know what to watch |
| `src/testing/visual/` | Visual testing internals: `specIndex` (discovery through the layout seam — never a flat read), `manifest` (payloads via `SectionedFile`, variant↔story join inputs, kind-aware pin rules), `storyJoin` (exact/overlay/no-story resolution), `baseline` (REST images capture, overt only), `shoot` (Playwright pool, width pin + composition height pin, pseudo-state poses), `diff` (white-union flatten, pixelmatch, `visual-ignore.yaml` scoring, advisory compositions, report JSON+md), `accept` (regression baseline promotion), `deps` (customer-install resolution from `testing/visual/` — Node ≥22 require()s ESM without throwing, so every load unwraps a default export), `init` (scaffold). State: `<workspace>/testing/visual/{figma,render,diff,accepted}/<kind>/<key>/` |
| `src/writers/RunMetadataFile.ts` | `latest.metadata.<format>` — a manifest run's facts, stated once (ADR-089). `RunMetadataFile.separate()` lifts them out of every spec and reduces each block to `source`; `RunMetadataReader.find()` reads the document back, looking in the spec's own directory then one level up |
| `src/render/SpecLoader.ts` | Spec discovery + loading for render. Rehydrates a reduced spec's run metadata here, at the one place every render input is loaded, so no reader downstream has to know the spec was reduced |
| `tests/unit/config/ConfigLoader.test.ts` | The config feature suite — temp `config/` trees on disk |
| `tests/integration/cli.integration.test.ts` | In-process runner (spied exit/console, no subprocess) |

## Data flow — generate

Source auto-detect: `.json` → file mode · `*.manifest.md` → manifest mode ·
`--from-bridge` → plugin returns a built spec (no REST, no engine call).
File/manifest path: `ConfigLoader.load()` → `loadFoundations` →
**`Components.fromRestApi(ids, library, conventions, settings, {styles,
variables, collections, author, generator}, onProgress, licenseInput)`**
(batch, plural — not `Component.fromRestApi`) → `LicenseStatus.display()` →
`RunMetadataFile.separate()` (manifest mode only, written at the specs root) →
strategy writer, once per kind into `writeLayout(...).dirFor(kind)` (ADR-096) —
including the collapsing layouts, which collapse *within* a kind so a shared name
cannot make two specs overwrite each other. Guards: all-error "not valid for this runtime" → AUTH_ERROR;
with a key present, transient license statuses exit NETWORK_ERROR/RATE_LIMIT
rather than silently emitting FREE output (specs#119).

## Data — split file payloads (specs#559–#563, umbrella #553)

The file payload artifact is the page-split `<alias>.file/` directory —
`manifest.json` (formatVersion, page index with id/name/bytes/sha256,
separators, whole-payload sha256), `root.json` (the payload with
`document.children` emptied — valid JSON, holds the root
components/componentSets/styles maps), and one raw `page-NNN.json` per page.
`fetch` streams the download through the splitter
(`utilities/payloadSplit.ts`, byte-level JSON state machine; 769MB in ~13s)
and removes the transient monolithic file on success; a split failure keeps
`<alias>.file.json` as the rescue. `finish()` refuses a payload that did not end
on a structural boundary — balanced depth, no open string, non-empty: the
response is chunked with no `content-length`, so a body that stops early without
a transport error is otherwise indistinguishable from a complete one and would be
written as a real artifact. Reassembly is byte-perfect:
`root[0..prefixBytes) + sep_i + page_i … + root[prefixBytes..)`, verifiable
against `sourceSha256` (harness/dev check only).

All consumers read through `utilities/sectionedFile.ts` (`SectionedFile`) —
root maps, per-page iteration, or `assembleDocument()` (pruned documents with
automatic cross-page fault-in; generate seeds the manifest-selected
components' pages). Pre-existing monolithic payloads keep working everywhere
as a read fallback. `SPECS_SHADOW_INGEST=1` runs both paths and diffs
(dev-only). Scan and generate accept a `<alias>.file` directory path wherever
a payload path is accepted; version premerge passes whichever exists.

## Data flow — transform

`ConfigLoader.load()` → transformer names from positionals |
`pipeline.transformers` | default `['contract']` → `resolveSpecsLayout` → per spec
folder of **each kind**: `transformer.run(apiYaml, context)` — context carries
`processingStates`/`propRoles` from `figmaOf(conventions)`,
`platform: platformOf(conventions, transformer.platformId)` (react and
web-components are peer platform ids, ADR-073), and `specsRoot` + `kind` (ADR-096)
→ `transformer.finalize()` for catalog-level output.

`specsRoot` is handed over rather than derived: an emitter used to find it by
walking up a fixed number of levels from its own output directory, correct for one
output depth, and a composition emits at a second. Composition output is Pro
(ADR-097) — a free run filters it out before the loop and reports the count once.

Unknown transformer names warn and skip; any component failure → non-zero exit.

## Verification

Repo-root `npm test`; invoke the built CLI as `node
packages/cli/dist/specs.js` (watcher keeps it fresh). License integration
tests are placeholder-only (skipped without `ANOVA_TEST_KEY_*` env).

## Known drift (as of 2026-09-29)

- `packages/cli/CLAUDE.md` (May 11) is badly stale: claims an MCP server,
  directory-per-command layout, `Component.fromRestApi`, a working
  `specs.config.yaml`, and lists half the commands. Prefer this file.
- `src/transforms/` holds open counterparts of from-specs modules in the
  other repo — deliberately unsynced; which side is authoritative is an open
  cross-repo question.
- `src/transforms/states.ts` mirrors two facts from the closed packages'
  RoleSpecs: `ROLE_NATIVE_STATES` (which state concepts a role announces on
  its own element) and `COLLAPSING_ROLES` (which roles consume their subtree).
  The stylesheet needs both to know what markup the scaffold actually emits —
  a change to either fact there must land here too, or selectors anchor on
  elements and attributes that no longer exist.
- No tsc declaration step despite `types: dist/index.d.ts` in package.json.
