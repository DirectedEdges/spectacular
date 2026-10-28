# ADR: The Workspace Stage Graph

**Branch**: `feature/compositions-cli`
**Created**: 2026-10-06
**Status**: ACCEPTED
**Summary**: A workspace is a chain of steps, each reading what the one before it wrote. `specs build` runs that chain once and exits; `specs run` runs it once and then watches, re-running from whichever step the change belongs to. The chain is read from the directory layout, so no setting was added. Steps run inside one process, which means the license is checked once per run instead of once per step — removing a failure where a throttled check quietly produced free-tier output under a paid key. `specs fetch` is not a step: it has no input the CLI can watch, so it stays something a person runs. `specs render` is a step but opts in, because it writes to a live Figma file.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — extends ADR-053 `specs transform` and ADR-096 Specs Directory Layout)*

---

## Scope note

This ADR changes **no types and no schema**. It decides a CLI surface and the
dependency model behind it, in the register's established pattern for
command-surface decisions — ADR-053 (`specs transform`) and ADR-098
(`config/conventions/storybook.yaml`). The `packages/schema/` constitution gates
are not engaged; the Type ↔ Schema Impact section records the absence
explicitly rather than omitting it.

---

## Context

A workspace is a chain of artifacts, each derived from the one before it:

```
Figma REST ──► data/ ──► data/*.manifest.md ──► specs/ ──┬──► specs/analysis/
                                                          ├──► react/src/
                                                          ├──► webcomponents/src/
                                                          ├──► storybook/content/
                                                          └──► the Figma file (render)

specs/analysis/ ──► storybook/content/
```

`specs/analysis/` is both derived from `specs/` and read by `storybook publish`, which
publishes a page per analysis report. It is the only edge in the chain between two local
stages — every other stage reads `specs/` or `data/` directly.

Every edge in that chain is real and already enforced by the commands. What is
missing is any place where the chain itself is **written down**. Today it lives
in the order a person types commands:

```bash
specs scan
specs generate
specs analyze
specs react
specs webcomponents
specs storybook publish
```

Two consequences follow, and both are felt daily.

**Staleness is a human sequencing error.** Skip `specs react` after a
`specs generate` and Storybook shows the previous emission. Nothing reports
this; the output looks finished because it *is* finished — for an input two
revisions old.

**`--watch` exists per command, and only per command.** `specs react --watch`,
`specs webcomponents --watch` and `specs render --watch` each watch their own
input. `specs storybook dev` (ADR-098, specs#644) is the only thing that
composes them — it spawns `specs react --watch` and `specs webcomponents --watch`
alongside the Storybook dev server, and says so in its own header comment:

> You run fetch, generate, and renders yourself; this owns everything that reacts.

That boundary is not a design choice so much as the limit of what a
Storybook-scoped command may reasonably claim. `specs storybook dev` cannot
start the chain at `data/`, because it knows about Storybook, not about what
feeds Storybook. The composition belongs one level up.

The gap this ADR closes is the absence of a **declared stage graph** — stages
with named inputs and outputs — and of the two drivers that should run over it:
one that traverses the graph once and exits, and one that traverses it
continuously.

---

## Decision Drivers

- **One graph, one definition.** A one-shot build and a watch loop that disagree
  about what depends on what is two implementations of the dependency model, and
  the second one is always the stale one. The graph is declared once and both
  drivers read it.
- **CI needs a non-zero exit.** The release stack (`release.testing.fullsuite`)
  needs a command that performs the whole chain and fails loudly. A watcher
  cannot serve that role: it never exits.
- **A change enters at one node.** Editing `specs/Alert/api.yaml` must not
  re-scan `data/`. Entry-node resolution is the correctness property that
  distinguishes a stage graph from "run everything again".
- **Every step must have an input the CLI can watch.** This is what decides
  membership. A step whose input lives somewhere the CLI cannot see has no event
  that could start it, so it is not part of the chain — it is something a person
  does, which then produces an input the chain reacts to.
- **Nothing in the default path may touch the network or the Figma file.**
  `specs render` writes to the connected Figma file and can destroy a person's
  work with `--overwrite`. It stays an explicit act, never a side effect of
  saving a spec.
- **The curation manifest is human-authored.** `data/{alias}.manifest.md`
  carries checkboxes a person ticks. Any automatic re-scan risks rewriting a
  human decision; `settings.curation.preserveManualSelections` already governs
  this and must be honoured identically by both drivers.
- **No new schema surface without a need.** Workspace layout is already
  detectable (`storybook/workspace.ts` does it today). A settings key that
  restates what detection can read is surface for nothing.
- **Silent invalidation is undebuggable.** When an orchestrator decides what to
  re-run, a wrong decision is indistinguishable from a transform bug. The plan
  must be printed, not inferred.
- **Entitlement is resolved once per invocation.** One license resolution per
  `specs build`, and one per `specs run` *session* — not once per stage, and
  not once per traversal. Today entitlement is memoised in a process-local
  closure (`createEntitlement`) and bound per package, so every stage that runs
  in its own process pays its own validate call. The license proxy is rate
  limited, and a throttled check is not a verdict: `rate-limited` is a
  `TRANSIENT_STATE`, which the target emitters raise as
  `LICENSE_NOT_VALIDATED` but which `LicenseManager.resolve()` maps to `FREE`.
  An orchestrator that multiplies license calls therefore does not merely waste
  requests — it manufactures silent free-tier output under a valid key. This
  driver constrains the execution model, not just a cache.

---

## Options Considered — Command surface

### Option A: `specs build` (one-shot) and `specs run` (watch) *(Selected)*

Two commands over one graph definition. `build` performs a topological
traversal, prints what it ran, and exits non-zero on the first stage failure.
`run` performs the same traversal once at startup, then watches every stage's
declared inputs and re-traverses from the entry node on change.

**Pros**:
- Satisfies *CI needs a non-zero exit* and *one graph, one definition*
  simultaneously — the thing CI runs and the thing a designer runs are the same
  traversal with different drivers.
- Matches the convention every adjacent tool already set (`vite build` /
  `vite dev`, `tsc` / `tsc --watch`, `turbo run build` / `turbo watch`), so the
  surface needs no explanation.
- Each command's failure semantics are honest: `build` stops; `run` reports the
  failed stage and keeps watching, because the fix is the next file save.

**Cons / Trade-offs**:
- Two help entries where the original request described one.
- The names are not quite symmetric in English — "run" does not obviously mean
  "watch". Addressed in the naming decision below.

---

### Option B: `specs build` with `--watch` *(Rejected)*

One command, a flag selecting the driver.

**Rejected because**: it reads as though watching is a mode of building, and the
two differ in more than persistence — `build` has a terminal node
(`storybook publish` writes and the process ends), while `run` has a *sink* (a
Storybook dev server that stays up and hot-reloads). Those are different graphs
at the last edge, and a flag hides that. The flag also invites
`--no-watch`-shaped drift the moment CI wants different defaults.

---

### Option C: `specs run` only, with `build` as an alias *(Rejected)*

The literal form of the original request: the two are equivalent.

**Rejected because**: it violates *CI needs a non-zero exit*. A command that
sometimes exits and sometimes does not cannot be put in a CI step or a release
script. Aliasing also forfeits the one place the distinction is cheap to teach —
the help text.

---

## Options Considered — Naming

### Option A: `run` and `build` *(Selected)*

**Pros**:
- `specs build` is unambiguous and already the word used for the artifact-
  producing pass in every adjacent toolchain.
- `run` is short, and the command it most resembles — `npm run` — is the one a
  person types to start a long-lived process.

**Cons / Trade-offs**:
- `specs storybook dev` keeps its own name, so the workspace has both `run` and
  `dev` meaning "watch". The ADR accepts this: `dev` is scoped to a subcommand
  that only starts Storybook, and renaming it would break a surface shipped in
  ADR-098.

---

### Option B: `dev` and `build` *(Rejected)*

**Rejected because**: it is the more consistent pair in isolation, but `specs dev`
and `specs storybook dev` differing only by scope is a worse collision than two
distinct words. It would also be a rename of a shipped command if the subcommand
were to follow.

---

## Options Considered — How the chain is worked out

### Option A: Derived from workspace detection *(Selected)*

The graph is a constant in the CLI. Which of its stages are *active* in a given
workspace is read from the filesystem, exactly as `resolveWorkspace()` already
does — `react/src` exists → the react stage is active; `storybook/.storybook`
exists → the publish stage is active; a configured source with `fetch: [file]`
→ scan and generate have an input.

```yaml
# No new settings. The workspace already says what it is:
#   data/ds.file/            → scan has an input
#   data/ds.manifest.md      → generate has an input
#   specs/                   → the target stages have an input
#   react/src/               → the react stage is active
#   webcomponents/src/       → the webcomponents stage is active
#   storybook/.storybook/    → the publish stage is active
```

**Pros**:
- Satisfies *no new schema surface without a need*. Zero keys added to
  `Settings`, so no type, no JSON schema property, no migration, no docs page in
  `settings/`.
- Cannot drift from reality. A declared stage list can name a tree that was
  deleted; detection cannot.
- Reuses machinery that exists and is already tested.

**Cons / Trade-offs**:
- A workspace cannot express "I have a `react/` tree but never build it" without
  a flag on the invocation. Accepted: `--only` and `--skip` cover it, and a
  standing preference is better evidence of a need than a guess at one.

---

### Option B: The list of steps is written out in settings *(Rejected)*

A new `settings.build.stages` naming the stages and their order.

**Rejected because**: it adds schema surface to restate what the directory
layout already states, and it introduces a second source of truth for the
dependency order — the one place a mistake is both easy to make and impossible
to detect from the output. It also reopens a settled question: ADR-096 made the
directory layout the declaration of what a workspace contains.

---

### Option C: Read the layout, but let settings add the optional steps *(Rejected for now)*

Detection for the local steps; a `settings.build` key to let a workspace make
`render` a permanent part of its chain.

**Rejected because**: a setting that writes to a live Figma file on every
routine build is dangerous and has no undo, and nothing yet shows a workspace
wants it. Recorded here as the shape to adopt *if* that need appears, so the
next author does not have to work it out again.

---

## Options Considered — How a step is run, and how often the license is checked

The current composition, `specs storybook dev`, spawns this same CLI binary as a
child process per watcher, and says why: *"spawns this same CLI binary for the
watchers, so no PATH assumptions."* That reasoning is sound for two long-lived
watchers. It does not survive a graph that re-traverses on every file save.

Measured against today's code, one spawn-based traversal costs:

| Stage | Proxy calls | Why |
|-------|-------------|-----|
| `generate` | 2 | `LicenseManager.resolve()` is uncached, and the dual-write flip validates a second time — noted in `GenerateCommand.ts` as "(Validates the license a second time.)" |
| `react` | 1 | `createEntitlement('react')` — memoised, but only within its own process |
| `webcomponents` | 1 | `createEntitlement('webcomponents')` — a separate binding, so a separate call |
| **Total** | **4** | per traversal, every traversal |

Our own testing notes put the validate endpoint at roughly three requests per
thirty-two seconds. A single startup traversal exceeds that, and the first
file-save re-traversal lands in `rate-limited`.

### Option A: Steps run inside one process, and the engine remembers its own answer *(Selected)*

Each step is a function the chain calls directly. Nothing is injected and no new
way to supply a license answer is created. The only change is that `resolve()`
remembers what the proxy told it, for the life of the process, the same way the
emitter packages already do.

One process therefore asks once, and every step after the first reuses it.

**Pros**:
- One call per `build`, one per `run` session, however many steps run and
  however many times they re-run.
- Removes the rate-limit failure instead of working around it.
- Adds no new way to claim Pro. The proxy still produces every verdict, and the
  engine is still the only thing that asks.
- Fixes the double check inside `specs generate` for everyone, not only for runs
  that go through `build` or `run`.
- Process startup disappears from every re-run, which is most of the wait when
  re-emitting a single component.

**Cons / Trade-offs**:
- Step bodies have to be callable functions. `runEmitters()` and the Storybook
  `publish()`/`init()` functions already are; `ScanCommand` and
  `GenerateCommand` keep their work inside their command handlers and call
  `process.exit()` at the end. Pulling those apart is the bulk of the work.
- One step crashing could take down the whole process. Each call is wrapped, so
  a failed step is reported as a failed step.

---

### Option B: Each step runs as a separate `specs …` command *(Rejected)*

Extend what `specs storybook dev` does today — shell out to `specs scan`,
`specs generate`, `specs react --components …` in order.

**Rejected because**: four license calls every time anything changes, and the
failure it produces is the dangerous kind. A throttled check inside `generate`
comes back as free, so specs get written at the wrong tier and the run still
reports success. It also makes stopping a half-finished run a matter of killing
processes mid-write.

---

### Option C: Keep separate processes, pass the answer down in an environment variable *(Rejected)*

**Rejected because**: an environment variable that tells a process it is Pro is
a published way to skip paying. `SPECS_DEV_TIER` is deliberately compiled out of
released builds so that no such path exists; adding one back as the production
mechanism undoes that on purpose.

---

### Option D: The engine accepts an already-decided answer from its caller *(Rejected)*

An earlier draft of this ADR proposed this: let the CLI resolve the license once
and hand the result to `@directededges/specs-from-figma` instead of letting it
check for itself.

**Rejected because**: that package is published. An optional parameter taking a
decided answer means `fromRestApi(data, { level: 'PRO', status: 'active' })`
works for anybody — not a patched copy, but the supported interface. It is the
same bypass as Option C wearing different clothes, and it is worse, because it
is documented. Remembering the answer requires no such parameter: the engine
keeps deciding for itself and simply stops asking the same question four times.

A note on what is and is not being claimed. None of this stops a determined
person — the CLI runs on their machine and the code can be edited. The line this
ADR holds is narrower and worth stating: **nothing outside the engine may supply
a verdict, and nothing is written to disk.** What is remembered lives in memory
and dies with the process, so there is no file to edit and no flag to set.
Against someone who would edit the installed code, this changes nothing — they
could already do that. Against everyone else, it adds no new door.

---

## Options Considered — Which steps belong in the chain

### Option A: Only steps with a watchable input; `render` opts in *(Selected)*

`specs fetch` is **not a step in the chain and gets no flag.** Its input is the
Figma file, which the CLI cannot watch, so nothing could ever trigger it. It is
something a person runs; what it writes into `data/` is then an input the chain
reacts to. A person fetches when they mean to, and a running `specs run` picks
up the result from `scan` onward.

`specs render` *does* have a watchable input — `specs/` — so it could be in the
chain. It is kept out because it writes to a live Figma file and can destroy
someone's work. It joins only on `--render`.


| Stage | Reads | Writes | Default |
|-------|-------|--------|---------|
| `scan` | `data/{alias}.file/` | `data/{alias}.manifest.md` | Yes |
| `generate` | `data/{alias}.manifest.md`, `data/{alias}.file/` | `specs/` | Yes |
| `analyze` | `specs/`, `config/`, `data/{alias}.variables.json`, `data/{alias}.styles.json` | `specs/analysis/`, `styling.*` in each spec folder | Yes |
| `react` | `specs/`, `config/` | `react/src/` | When `react/src/` exists |
| `webcomponents` | `specs/`, `config/` | `webcomponents/src/` | When `webcomponents/src/` exists |
| `storybook publish` | `config/`, `specs/`, `specs/analysis/`, `assets/` | `storybook/content/` | When `storybook/.storybook/` exists |
| `render` | `specs/` | **the connected Figma file** | **No** — `--render` |

`analyze` sits between `generate` and the target stages, which is where both its edges put
it: it reads `specs/`, so it cannot precede `generate`, and `storybook publish` reads the
`specs/analysis/` it writes, so it cannot follow the stage that consumes it. Its position
relative to `react` and `webcomponents` is not a dependency — those read no analysis — but
it is not arbitrary either, and the reason is in the Notes below: `analyze` writes into
`specs/`, which is what the target stages watch.

**Pros**:
- Every step in the chain has something the CLI can watch, so every step has a
  reason to run. Nothing sits in the list waiting for a flag that is really just
  a person deciding.
- `specs build` in CI needs no `FIGMA_TOKEN` and cannot reach a live Figma file.
- Fetching stays a deliberate act, which is where the API budget is spent — but
  it needs no flag here to stay that way. Leaving it out is what keeps it
  deliberate.

**Cons / Trade-offs**:
- Someone wanting one command that fetches and then rebuilds everything writes
  `specs fetch && specs build`. That is two words longer and says plainly that a
  network call happened.

---

### Option B: Everything in by default, with `--no-*` to opt out *(Rejected)*

**Rejected because**: the default would render into a live Figma file. The
blast radius of getting that wrong — `--overwrite` deleting a page component —
is unrecoverable, and the opt-out only protects people who already know to use
it.

---

### Option C: Stop at `specs/` and leave React and Web Components opt-in *(Rejected)*

**Rejected because**: it reproduces the exact staleness this ADR exists to
remove. `specs/` current and `react/src/` two revisions behind is the failure
mode, not an acceptable default.

---

### Option D: `fetch` in the chain, off by default, reachable with a flag *(Rejected)*

The first draft of this ADR took this position.

**Rejected because**: a flag is the wrong shape for it. Every other step runs
because something it watches changed; `fetch` would only ever run because a
person asked, which is `specs fetch` — a command that already exists and says
what it does. Putting it behind a flag on `run` and `build` adds a second way to
do one thing, and quietly moves a network call into a command whose whole claim
is that it stays local.

---

## Options Considered — Whether the curation manifest is a step of its own

### Option A: The manifest is its own step, and editing it starts the chain *(Selected)*

`scan` writes `data/{alias}.manifest.md`; `generate` reads it. The manifest is
therefore an ordinary edge in the graph, which means a **human edit to the
manifest is a graph event** — ticking a checkbox triggers `generate` and
everything downstream, with no re-scan.

| Input changed | Entry node |
|---------------|------------|
| `data/{alias}.file/**` | `scan` |
| `data/{alias}.manifest.md` | `generate` |
| `data/{alias}.variables.json`, `data/{alias}.styles.json` | `analyze` |
| `specs/**` (hand edit) | `analyze` |

**Pros**:
- Curation becomes a first-class input to the loop rather than something a
  person does and then separately remembers to act on.
- Avoids the hazard directly: a manifest edit never re-runs the stage that would
  overwrite it.

**Cons / Trade-offs**:
- `scan` writing the manifest must not re-trigger itself. The driver suppresses
  events on a stage's own declared outputs — required for every stage, not just
  this one.
- When `settings.curation.preserveManualSelections` is `false` (the default), a
  `data/` change re-derives checkboxes from `devStatus` and can silently
  de-select a component mid-session. Both drivers honour the setting
  identically — `run` must not quietly pass `--keep-checks`, because that would
  make the watch loop and the CI build disagree. Instead `run` **warns once at
  startup** when a manifest exists and the setting is `false`, naming the
  setting that would make the loop safe.

---

### Option B: Only `data/` starts the chain; the manifest is invisible *(Rejected)*

**Rejected because**: it makes a human's curation edit invisible to the loop.
The person ticks a box and nothing happens, which is indistinguishable from the
watcher being broken.

---

### Option C: `scan` is opt-in, like `render` *(Rejected)*

**Rejected because**: `scan` is local, deterministic, and cheap, and its only
hazard — the checkbox rewrite — is already governed by an existing setting.
Excluding it would mean a fresh `data/` payload never reaches `specs/` without
manual intervention, which is the stated problem.

---

## Options Considered — How precisely a change is matched to work

### Option A: Match by the exact path that changed, down to one component *(Selected)*

A stage declares its inputs as paths, not as directories-by-convention. Within
`config/`, that is per *file* — the layout ADR-098 established already splits
concerns into separate files, so `config/conventions/storybook.yaml` invalidates
`storybook publish` alone, while a change under `config/settings.yaml` reaches
the stages that read settings.

Where a stage already accepts a scope flag, the driver passes one. `specs react`
and `specs webcomponents` take `--components <keys...>`; `specs generate` takes
`-c`. A change to `specs/Alert/api.yaml` therefore re-emits `Alert`, not the
catalogue.

**Pros**:
- Satisfies *a change enters at one node* at the granularity that makes a watch
  loop usable on a real catalogue rather than merely correct.
- Respects the existing posture that full-catalogue runs are expensive and
  deliberate.

**Cons / Trade-offs**:
- Scoped emission can mask a cross-component effect — a shared token change that
  should have re-emitted everything. Mitigated by scoping only on inputs that
  are *per-component by construction* (a spec folder), and never on shared
  inputs (`config/`, `assets/`, the cssvars source), which always invalidate the
  whole stage.

---

### Option B: Whole-stage invalidation only *(Rejected)*

**Rejected because**: correct, and unusable. Every spec save would re-emit the
entire catalogue for both platforms, which is the cost that makes people stop
running the watcher.

---

## Decision

### Command surface

Two new top-level commands on `specs`:

```
specs build [options]     Run every step once, in order, then exit.
specs run   [options]     Run every step once, then watch and re-run from
                          whichever step the change belongs to. Runs until Ctrl-C.
```

Shared options:

| Option | Effect |
|--------|--------|
| `--config <path>` | Workspace config directory, as every other command |
| `--only <step...>` | Run these steps and nothing else |
| `--skip <step...>` | Run everything except these steps |
| `--components <keys...>` | Limit the run to these component folders |
| `--render` | Add the `render` step at the end — writes to the connected Figma file |
| `--dry-run` | Print what would run, and run nothing |
| `--verbose` | Per-step detail, as every other command |

There is no `--fetch`. Fetching is `specs fetch`, which a person runs when they
mean to; what it writes into `data/` is picked up from `scan` onward.

`run` starts the Storybook dev server once the publish step has made its content
current, when the workspace has a Storybook host. One command covers the whole
workspace, which is the point of having it at all.

The server and its index-recovery handling are shared with `specs storybook dev`
rather than reimplemented — one function both commands call. That code is the
subtlest in the package and the least likely to survive being kept in step
twice. `--skip storybook` skips the server along with the publish: a server
showing content nothing maintains is worse than no server.

### The chain

Steps, what each reads, and what each writes are as given in the table above.
Every step a workspace actually has runs by default; `render` joins only on its
flag.

### How steps run, and how the license is checked

Steps run **inside one process**, as ordinary function calls. They are not
started as separate `specs …` commands.

That single change is what fixes the license cost, because the license answer is
already remembered for the life of a process — it just was not being remembered
in the one place every step passes through. `resolve()` in
`LicenseManager` makes a fresh network call every time it is asked. Giving it
the same remember-the-answer behaviour the emitter packages already have means
one process asks once:

| | Today | With the answer remembered |
|---|---|---|
| `generate` (including the dual-write re-check) | 2 calls | 1 |
| `react` | 1 | 0 — reuses the answer |
| `webcomponents` | 1 | 0 — reuses the answer |
| **A whole `specs run` session** | **4, every time anything changes** | **1, ever** |

Rules:

- **Nothing outside the engine may supply the answer.** No parameter, no
  environment variable, no file on disk. The license proxy is the only thing
  that produces a verdict, and the engine is the only thing that asks. What is
  remembered lives in memory for the life of the process and disappears when it
  exits.
- **A check that did not complete is not an answer.** `error`, `network-error`
  and `rate-limited` mean the question went unanswered, not that the answer is
  free. A key that was given and could not be checked stops the run before the
  first step, using the wording `transientFailureGuidance()` already produces.
  It is never retried per step — retrying is what exhausted the limit in the
  first place.
- **One answer per session, held until you quit.** `specs run` asks once at
  startup and never again. If a key is revoked while a session is open, that
  session keeps working until it is restarted; the next one will not. This is
  deliberate — re-checking on a timer would put the repeated calls back.
- **The tier is stated once.** The startup line says free or Pro, so which one
  a session is running at is visible rather than guessed.

### Plan output

Every traversal prints what it resolved, in both drivers. Without this the
orchestrator is undebuggable — a missed invalidation is indistinguishable from a
transform bug, which is the failure mode this workspace has already paid for
once with a stale `dist/bridge-server.js`.

```
$ specs run
[specs run] license: PRO (active) — resolved once for this session
[specs run] plan: scan → generate → analyze → react, webcomponents → storybook publish
[specs run] watching data/, specs/, config/, assets/

data/ds.manifest.md changed
  → generate (Alert) → analyze → react (Alert), webcomponents (Alert) → storybook publish
  ✓ 5 stages, 1 component, 2.1s

specs/components/alert/api.yaml changed
  → analyze → react (Alert), webcomponents (Alert) → storybook publish
  ✓ 4 stages, 1 component, 1.4s
```

The second line is the hand-edit case, and it enters **below** `generate`, not at it. A
person editing a spec is editing the hub (ADR-096); re-running `generate` would overwrite
what they just wrote from `data/`. `specs/` is an input to the stages that read it and an
output of the stage that writes it, and no change to it ever starts the chain further up.

### Driver semantics

| | `specs build` | `specs run` |
|---|---|---|
| Traversal | Once | Once at startup, then per change |
| Stage failure | Stop; exit non-zero | Report the stage; keep watching |
| Last step | `storybook publish`, then the process exits | `storybook publish`, then back to waiting, with the Storybook server up alongside |
| Which steps run | Decided once | Re-derived per pass — a workspace changes shape while a session is open |
| Concurrency | Independent stages may run in parallel | Same, plus in-flight runs are cancelled by a newer change |
| Entitlement | Resolved once, before the first stage | Resolved once, at startup, for the session |
| Exit | `0` all stages succeeded, non-zero otherwise | Only on Ctrl-C |

A burst of file events — what a `specs fetch` or a multi-file save produces — is
coalesced into one traversal. A change arriving mid-traversal cancels the
in-flight run from the affected node downward and restarts it; stages already
complete and unaffected are not re-run.

### Relationship to `specs storybook dev`

`specs storybook dev` keeps its name, its flags and its behaviour — the command
for someone who wants the server and the target watchers and nothing upstream.
`specs run` supersedes it for whole-workspace watching, and its docs page says
so. No deprecation: the composition moving up a level does not make the scoped
command wrong.

What changes is how it is built. It becomes the same machinery as `specs run`,
limited to the target and publish steps, instead of its own thing that starts
separate commands. Left as it is, it would be the one path still making two
license calls a session, and still unable to re-emit only the component that
changed.

### Notes

- **`render` overwrites under `run` and not under `build`.** Overwriting deletes
  an existing same-titled page component before re-rendering. That is the normal
  case when a watch loop re-renders the component you just edited, and a
  destructive surprise in a build someone ran once — so `specs run --render`
  overwrites and `specs build --render` does not, where a title collision is an
  error. This follows the rule `specs render --watch` already set for itself.
  Overwriting in a one-shot run stays `specs render --overwrite`, done on
  purpose.
- **A scoped render that matches nothing is an error, not an empty success.**
  `--components` warns and skips a name it cannot find, matching the emitters.
  When *no* name matches, the run fails: otherwise a typo in a CI invocation
  passes green having rendered nothing.
- **Having nowhere to render to is a skip, not a failure.** No bridge, no
  connected file, or more than one connected file with nothing saying which —
  each is a fact about the environment rather than a fault in the workspace.
  The step reports why and the run carries on, so closing Figma does not end a
  watch session and does not fail a build whose every other step wrote what it
  should. A render that was *attempted* and failed still fails, including a
  `--file` naming something that is not connected. A step may therefore end in
  three states, not two: ran, skipped, or failed — and only the last decides an
  exit code.
- **The chain never prompts.** `resolveFileKey` asks a person to pick when two
  or more files are connected and the terminal is interactive. Reached from
  `specs run`, that prompt can arrive in the middle of a pass with nobody
  watching, and the loop looks hung with nothing on screen explaining it. The
  target is resolved once, before any spec is read, and passed down explicitly.
  `--file` is accepted by both commands so the advice in the skip message works
  on the command that printed it.
- `--only` and `--skip` name steps, not commands, and cannot be combined.
- The step names are the first column of the table above: `scan`, `generate`, `analyze`,
  `react`, `webcomponents`, `storybook`, `render`.
- **`analyze` always runs whole, and `--components` does not scope it.** Each analyzer's
  `finalize()` writes one aggregate report per concern — `analysis/props.yaml`,
  `analysis/dependencies.graph.yaml`, `analysis/styling.byToken.yaml` and the rest — from
  the specs that run visited. A scoped analyze would therefore replace a catalogue-wide
  report with a one-component one and report success. This is the shared-input rule stated
  under *How precisely a change is matched to work*, applied to a stage whose output is
  shared by construction even though its input is read per spec.
- **`analyze` writes into `specs/`, which the target stages watch.** Besides
  `specs/analysis/`, the styling analyzer writes a `styling.*` document into each spec
  folder. Those are declared outputs of the stage, so the driver suppresses them as events
  — the same suppression `scan` already requires for the manifest it writes. Ordering
  `analyze` before `react` and `webcomponents` is what makes a traversal settle in one
  pass regardless: by the time the target stages read a spec folder, everything that run
  will write into it is already there.
- **A spec folder's `styling.*` is an analyze output, not a generate output.** A workspace
  that never runs `analyze` has none, and the target stages do not require one — so
  skipping the stage degrades the Storybook analysis pages and nothing else.
- `--dry-run` makes no license call. Printing what would happen is not doing it,
  and a dry run that spent a license call would make the tool you reach for when
  something is wrong part of what is wrong.

---

## Type ↔ Schema Impact

**None.** This ADR adds no type and changes no schema. `packages/schema/` is
untouched, so the constitution's parity gates are not engaged.

What a workspace contains is read from the directory layout, the way
`resolveWorkspace()` already reads it, so no setting was added either. If a
later need forces one, the shape is recorded as the rejected Option C under
*How the chain is worked out*, and it would need its own ADR.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Implements both commands and the chain | New `src/pipeline/` module; `index.ts` registers `Build` and `Run`; the work inside `ScanCommand`, `GenerateCommand` and `AnalyzeCommand` pulled out into functions that return instead of calling `process.exit()`; `storybook/dev.ts` rebuilt on the same machinery |
| `specs-schema` | None | None |
| `specs-from-figma` | One internal change | `LicenseManager.resolve()` remembers the proxy's answer for the life of the process, keyed by license key, and remembers only completed checks. No change to any exported signature, and nothing new that a caller can pass in |
| `specs-plugin-2` | None | None — `render` reaches the plugin over the existing bridge, unchanged |
| `specs-testing` | None required | May replace scripted command sequences with `specs build` |

---

## Release Impact

**No version is proposed.** This ADR changes no schema, so there is no schema
version to state. The CLI change is additive — two new commands, no existing
command, flag, or output behaving differently — so it lands in whatever release
it merges into, as an addition in that release's CHANGELOG.

The one behaviour change anywhere is the license check happening once per
process instead of once per call. That is a fix, visible only as fewer network
calls and the removal of a failure that produced free-tier output under a paid
key.

---

## Consequences

- A workspace gets one command that brings everything up to date, and one that
  keeps it up to date. Forgetting a step stops being possible.
- The order these things depend on each other is written down in one place for
  the first time. Adding a new platform becomes a line in that list rather than
  something everyone has to remember.
- CI and the release checks get a single command that fails properly when
  something is wrong.
- Curation starts working both ways: ticking a checkbox in the manifest
  regenerates what it selected.
- A workspace running `specs run` with
  `settings.curation.preserveManualSelections: false` is told once at startup
  that new data can re-tick its checkboxes. The setting behaves exactly as
  before; it is just no longer silent.
- `specs storybook dev` becomes the small version of a general thing. Its own
  comment — "fetch, generate, and renders stay yours" — stops describing a limit
  of the tooling and starts describing that command's job.
- **One license call per run, down from four every time anything changes.** The
  failure where a throttled check quietly produced free-tier output under a paid
  key is gone, because the question is only asked once.
- The double check inside `specs generate` goes away for everyone, including
  people running `specs generate` on its own.
- Steps become plain functions, which makes them testable directly. `scan`,
  `generate` and `analyze` currently end by exiting the process, so today they can only be
  tested by running the CLI.
- Analysis reports stop going stale silently. `specs/analysis/` is derived from `specs/`
  and read by `storybook publish`, so a published analysis page describing a catalogue two
  revisions old was the same staleness failure this ADR exists to remove — just one nobody
  was looking for, because no command sequence anyone typed included `specs analyze`.
- A new risk: the chain can decide wrongly what needs rebuilding, and a wrong
  decision looks exactly like a broken transform. Printing what it decided, and
  `--dry-run`, are how that stays diagnosable — they are not conveniences.
- A second new risk: with everything in one process, one step crashing could
  take down the whole thing. Every step call is wrapped, and `run` reports the
  failure and keeps watching.
- A session holds its license answer until you quit it. A key revoked mid-session
  keeps working until the next restart. Accepted deliberately: re-checking on a
  timer would bring back the repeated calls this decision exists to remove.
