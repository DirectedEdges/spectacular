# Skills Architecture

The structural map of the skill set `specs-cli` ships to a consuming project — what the layers are, which one a new fact belongs in, and how a source file here reaches an agent's working directory. `../ARCHITECTURE.md` is the same map for the CLI as a whole; this file covers `src/skills/` only, and the two do not duplicate each other.

Operating rules for working in the CLI are `../CLAUDE.md`. Nothing here is a procedure.

## Sources are the whole truth

Each skill is one `.md` file in this directory, and that file is **exactly** what gets written to disk: frontmatter, the canonical-asset notice, its prerequisite line, then its procedure. Nothing is composed at build time and nothing is interpolated, so what you read in `statesSetup.md` is what an agent reads in `.claude/skills/specs-cli.states.setup/SKILL.md`.

They were TypeScript template literals until every code fence in them needed escaping, which cost a skill that silently stopped installing when one closing delimiter picked up a backslash.

## The delivery path

```
src/skills/<name>.md                      the source, authored here
src/skills/{rules,references,templates}/  supporting files, authored here
        │
        │  esbuild --loader:.md=text --loader:.yaml=text   (package.json · build, watch)
        ▼
dist/specs.js                             each body inlined as a string constant
        │
        │  SKILL_ASSETS  (index.ts)        name + markdown + files[]
        ▼
specs skills install [--dir .claude/skills]   (../commands/skills.ts)
        │
        │  mkdir -p <dir>/<skill.name>/ ; write SKILL.md ; write each file
        ▼
<project>/.claude/skills/<skill.name>/SKILL.md
```

Four consequences worth knowing before changing anything:

- **A new skill is a new `.md`, a new import, and a new row in `SKILL_ASSETS`.** Adding one without the esbuild loader flag fails the build rather than shipping an empty skill.
- **Emitted skills are canonical.** A refresh overwrites them without asking. Local customization belongs in an override layer the refresh never touches — planned, not yet implemented, and the gap every emitted skill's header notice warns about.
- **Order in `SKILL_ASSETS` is load order.** The primer leads, so a fresh install writes the prerequisite before anything that names it. `workspace.setup` follows, because it is the one a workspace with nothing in it needs.
- **In this workspace, delivery is continuous.** `specs-local-workspace/.claude/scripts/skills-sync-watch.sh` snapshots this directory, rebuilds the CLI, and runs `skills install` in every clean room and worktree — so an edit here lands in a room within seconds, with no tarball refresh.

## The layers

Four surfaces an authoring agent reads, each arguing from a different source. The source is what separates them; the obligation vocabulary is deliberately shared.

| Layer | Argues from | Shape | Ships? |
|---|---|---|---|
| The schema package | what a spec **means** | types and JSON schema | separately, as `@directededges/specs-schema` |
| `rules/*.yaml` | the **contract** — schema nodes and the ADRs they project | one file per spec concept, keys mirroring the schema node | yes, as files on `specs-cli.authoring.primer` |
| `references/*.md` | a **mechanism** spanning several nodes or files | one file per mechanism | yes, same asset |
| `specs/**/guidelines.yaml` | **this library's own data** — its tokens, props, styling idiom | `statement` + `level` items, ADR-118 | no — authored per workspace, versions with the catalogue |

### Where a new fact goes

- **A choice at a single node is a rule. A fact spanning more than one node or file is a reference.** A reference that starts advising which value to pick has grown a second copy of a rule, and the two then drift — which is what happened to the single `slots-layout.md` this set replaced.
- **True in every workspace because the schema says so → `rules/`. True only of this library → that library's `guidelines.yaml`, never `rules/`. About using one component → that component's own `guidelines.yaml`.**
- **A shape question is neither.** It is the schema's, through an ADR. A rules entry contradicting the schema is a defect in the rule.

### Precedence

**Rules outrank references.** When both appear to say the same thing the rules file governs, and the fix is to delete the sentence from the reference rather than reconcile them — the reference is the stale copy by definition.

**Neither layer is an authority on what a spec means.** That is the schema's, and both cite it rather than restating it.

**Rules and library guidelines do not collide by construction**, because the routing test above assigns every fact to exactly one of them.

### The obligation vocabulary

Five levels, RFC 2119, one vocabulary across every layer that carries an obligation — the `rules/*.yaml` keys and the `level` field of an authored `guidelines.yaml` are the same five, so a rule an agent reads and a guideline it authors speak one language.

| Level | Weight |
|---|---|
| `must` | absolute — a spec disregarding it is wrong |
| `must-not` | absolute prohibition |
| `should` | strong convention; disregard only with a considered reason |
| `should-not` | strong convention against |
| `may` | permitted, and neither required nor discouraged |

Beside an obligation in a rules entry: `instead` (the replacement for a prohibition), `example` (one concrete instance — an illustration, never evidence that a value suits a library), `reads` (artifacts to consult, as paths), `note` (mechanism or rationale), `adr` (the decision the item projects, which makes these files the current-state map of the ADRs).

A rules node carries up to three kinds: `useWhen` — ordered option-to-condition mappings, first match wins, with `dontUseWhen` for explicit negatives; `when` — property interdependencies, where a value `opens` further properties or `requires` a condition; and `guidelines` — the obligation list.

## Two doctrines about skills themselves

### The primer is a prerequisite, not a preamble

`primer.md` is what Specs *is* — a schema and a CLI over strongly structured data, and why that makes an inference a defect rather than a shortcut. Every other skill names it in a prerequisite line instead of carrying a copy.

That is a context decision, not a tidiness one. Inlining it charged every skill read for the same 450 words, so an onboarding session touching three skills paid for it three times. As a prerequisite an agent reads it once and the rest of the session is already taught. The cost is one extra read, once; the saving scales with how many skills a session uses.

Skills holding a judgment — `icons.setup`, `states.setup`, `roles.propose` — depend on the primer most, because each decides something from a library's own data and the primer is what says which artifact may be believed.

### A step a parent skill names is a sub-skill, not a choice

`posture` and `component.compile` are invoked by name from inside `component.author`, at a numbered step. That keeps their text out of the round's priming read — `component.compile` alone is ~790 words that only matter after all three concern files validate — and it lets the round's own cost be measured apart from the compile's.

The distinction that makes this safe: the parent *names* the invocation, so the session has a directive rather than a decision. A skill a session must first decide it needs is a new way to fail, which is why the reference files beside the primer are reading material and not skills, however tempting the symmetry looks.

## The roster

`SKILL_ASSETS` in `index.ts`, in install order.

| Skill | Source | Supporting files |
|---|---|---|
| `specs-cli.primer` | `primer.md` | — |
| `specs-cli.workspace.setup` | `workspaceSetup.md` | — |
| `specs-cli.posture` | `posture.md` | — |
| `specs-cli.version.figmapremerge` | `versionFigmapremerge.md` | — |
| `specs-cli.version.release` | `versionRelease.md` | — |
| `specs-cli.roles.propose` | `rolesPropose.md` | — |
| `specs-cli.roles.apply` | `rolesApply.md` | — |
| `specs-cli.states.setup` | `statesSetup.md` | — |
| `specs-cli.icons.setup` | `iconsSetup.md` | — |
| `specs-cli.images.setup` | `imagesSetup.md` | — |
| `specs-cli.authoring.primer` | `authoringPrimer.md` | 9 × `rules/*.yaml`, 5 × `references/*.md` |
| `specs-cli.guidelines.propose` | `guidelinesPropose.md` | `templates/rules.yaml` |
| `specs-cli.component.author` | `componentAuthor.md` | 5 × `templates/*.yaml` |
| `specs-cli.component.compile` | `componentCompile.md` | — |

`rules/` holds nine files — `anatomy`, `examples`, `layoutStyling`, `primitives`, `props`, `slots`, `styles`, `subcomponents`, `variants` — around 121 obligation entries across them. `primitives.yaml` is the outlier in subject: it governs `config/conventions/figma.primitives.yaml` rather than a spec file.

`references/` holds five — `props`, `slots`, `subcomponents`, `layout`, `styles`. The authoring primer's "Where to go deeper" table names which pack each one rides.

## Reserved ahead of the capability

`specs-cli.composition.author` **does not exist.** `authoringPrimer.md` names it in its prerequisite line and `primer.md`'s routing table sends the task to a workaround instead: the authoring primer's §The two kinds for the folder, `references/layout.md` for the arrangement, and `component.author`'s validate loop. `../commands/author.ts` reserves the `--kind composition` surface and exits with an error naming the missing templates.

## Known drift

Each of these is a stale statement in the source, not a design question.

- `../commands/skills.ts`'s doc comment and the `install` command description both name only *"premerge, release"*. Fourteen skills install, including the whole authoring set.
- `templates/guidelinesRules.yaml` — installed as `specs-cli.guidelines.propose/templates/rules.yaml` — carries the pre-ADR-118 shape: a `guidelines/<area>/<topic>/rules.yaml` path that exists in no workspace, and the retired `must`/`never`/`should`/`could` modality keys. The skill body itself tells the reader to copy `templates/guidelines.yaml` from the component-author skill instead, so the installed template is dead weight pointing at a retired path.
- `authoringPrimer.md`'s description line says *"the six references"*, which names its six pointer forms rather than its five reference files.
