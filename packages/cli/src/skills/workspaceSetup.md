---
name: specs-cli.workspace.setup
description: Set up a Specs workspace from nothing — install, config, Figma sources, secrets, fetch, curate, build, and a Storybook running in the browser. Two stops for the human: which components to spec, and which improvement passes to run.
---
<!--
  Canonical skill emitted by `specs skills install` — overwritten on every
  refresh; do not edit in place. A local override layer (a separate file the
  refresh never touches) is planned but not yet implemented; until it exists,
  local customizations belong in your own separate skill.
-->

> **Prerequisite — read once per session.** If you have not already read
> `.claude/skills/specs-cli.primer/SKILL.md` in this session, read it now. It is
> what Specs is and why its data is structured, and this procedure assumes it.

# Set up a workspace

This runs once per workspace. A command-by-command walkthrough of the same setup, for someone not using an agent, is at https://spectacular.systems/cli/getting-started/.

## Role

You are setting up Specs CLI for a user in the current working directory. Specs CLI generates component specifications from a Figma design system, and working code from those specifications. Your job is to walk the user through the setup interactively, make every non-obvious decision *with* the user (not for them), and leave them with a Storybook running in their browser showing their own design system.

By the end they will have a `config/` directory, a populated `.env`, generated specs, analysis reports, React and Web Components trees, their icons resolved by name, their states classified, and a Storybook running in their browser.

You must follow this procedure **top to bottom**. Do not skip steps. Do not batch multiple steps before checking in. After each numbered step, verify the step succeeded before moving on.

Step 10 is a stop: the user picks which improvement passes to run from a checklist, once they can see their Storybook working. All three, one, or none are normal outcomes.

**Ask only what this procedure tells you to ask.** Everything else has a default that is already correct. A question you invent is friction.

---

## Pre-flight (do this before anything else)

Run these checks in order. Stop if any fail.

### P1. Confirm working directory

Run `pwd` and show the output to the user:

> "I'm set up to onboard you to Specs CLI in `<pwd output>`. Is that the right directory?"

If they say no, ask them to `cd` and restart. Do not proceed.

### P2. Confirm the directory is empty or intended

Run `ls -la`. If the directory has a `specs.config.yaml` or `specs.config.json`, that's a **pre-split configuration** (ADR-071). The CLI refuses to read it — `specs init` will refuse too — so it must be converted first:

> "This directory has a `specs.config.yaml` from an earlier Specs CLI. I can run `specs migrate config` to convert it — it writes `config/conventions/` (per-platform files) and `config/settings.yaml`, and renames the old file to `.migrated`. Or should I stop so you can pick a different directory?"

If they choose migration, continue to Step 1 to install the CLI, then run `specs migrate config` in place of Step 2 and show them the generated files. Resume from Step 4 (secrets) — the migrated files already carry their sources and settings, so confirm rather than re-ask.

A leftover `config/conventions.yaml` (flat file) or `config/pipeline.yaml` is also pre-split residue: the conventions file makes the CLI refuse; the pipeline file is ignored with a warning (its transformers became `specs react` / `specs webcomponents`, and `specs analyze` takes its analyzers as arguments). `specs migrate config` cleans both up.

If the directory has any of: `config/`, `data/`, `specs/` — assume a previous setup exists:

> "This directory already has `<files>`. Should I (a) overwrite, (b) merge/resume, or (c) stop so you can pick a different directory?"

A `.env` on its own, with no `config/`, is **not** a previous setup. Pre-provisioning the Figma token before anyone runs the CLI is a normal enterprise pattern, so treat the directory as fresh and say what you found instead of asking the overwrite question:

> "You already have a `.env` here, so I'll read the Figma token from it rather than asking you for one. Nothing else is set up yet, so we're starting fresh."

When you reach Step 4, confirm the file carries a populated `FIGMA_TOKEN=` line without printing its value, and skip the token walkthrough.

If the directory has unrelated files (e.g., a `package.json` for another project), confirm:

> "This directory contains `<summary>`. Are you sure you want to set up Specs CLI *alongside* those files?"

Only proceed with explicit confirmation.

### P3. Confirm Node.js is available

Run `node --version` and `npm --version`. Both must print a version, and Node must be **20.19 or newer** — the Storybook host in Step 8 declares that floor and `npm install` will refuse below it. If either command fails or the version is too old:

> "Specs CLI needs Node.js 20.19 or newer. Please install the current LTS build from https://nodejs.org and come back."

Stop. Do not try to install Node.js yourself.

---

## Step 1. Confirm the CLI

The CLI is already installed — `specs skills install` is what put this file on disk, so it cannot be missing. Confirm the version and record how it is invoked:

```
specs --version
```

If that fails, they installed it somewhere not on `PATH` and are reaching it another way. Run `npx @directededges/specs-cli --version` instead, and use `npx @directededges/specs-cli <command>` for every command below rather than bare `specs`.

Use whichever form worked, consistently, for the rest of the session.

---

## Step 2. Scaffold the config

Run `specs init` (or `npx @directededges/specs-cli init`). Verify a `config/` directory appears holding a `conventions/` folder and `settings.yaml`:

- `config/conventions/figma.yaml` — **facts about the Figma library** (naming patterns, glyph and subcomponent matching, images). A wrong value here produces *incorrect* output.
- `config/conventions/specs.yaml` — **conventions about the spec itself** (states classification, accessibility props). Scaffolded fully commented; leave it alone during onboarding.
- `config/conventions/react.yaml` and `config/conventions/web-components.yaml` — **what each code platform calls the things the spec models**. Scaffolded fully commented; leave them alone during onboarding.
- `config/settings.yaml` — **choices about the run** (sources, format, file layout). A different value here produces merely *different* output.

Tell the user:

> "I've created a `config/` directory: `conventions/` holds facts about your Figma library, and `settings.yaml` holds choices about this run. The scaffolded values are production-ready, so the only thing we need to fill in is your Figma file."

The scaffold is commented throughout — every setting names what it does and links to its documentation. Read the files rather than asking the user about a setting, and never recite the scaffold's contents back at them. They can open it themselves at any time.

If `specs init` refuses because it found a `specs.config.yaml`, you skipped P2 — go back and run `specs migrate config` first.

### 2a. The other skills are already installed

`specs skills install` wrote all of them into `.claude/skills/` alongside this one. Step 10 is where they get used, if the user asks for them. Do not describe them here; that step does.

**To use one, read its `SKILL.md` and follow the steps in it.** A skill is not registered as something you can invoke by name in the session that installed it — the file is the procedure, and reading it is how you run it.

---

## Step 3. Configure Figma sources

### 3a. Get the Figma file URL

Ask:

> "Paste the URL of your Figma file — the one you'd share with a teammate."

Figma URLs come in two shapes. Handle both:

- **Main file URL** — format:
  `https://www.figma.com/design/<fileKey>/<filename>?node-id=...` Example: `https://www.figma.com/design/AbC123XyZ/My-Design-System` → use `AbC123XyZ` as the key.

- **Branch URL** — format:
  `https://www.figma.com/design/<mainKey>/branch/<branchKey>/<filename>` Example: `https://www.figma.com/design/AbC123XyZ/branch/Br4nch789/My-Design-System` → use `Br4nch789` as the key (the branch key, **not** the main key).

Extract the key yourself from whichever URL the user pastes. Do **not** ask the user to extract it — that's the kind of friction this flow exists to remove.

If the URL is a branch URL, warn:

> "This URL points to a Figma branch. Generated specs will reflect the branch contents, including unpublished changes. Proceed?"

### 3b. Name the source

Ask (default to `library`, pre-filled if your UI supports it):

> "What should I call this source? Default: **library**. Just hit enter to accept, or type a custom name.
>
> Examples:
> - `GDS Library` → I'd save it as `gdsLibrary`
> - `RDS UI Kit` → I'd save it as `rdsUiKit`
> - `library` → stays `library`
>
> Source names become keys in `config/settings.yaml`, so I'll camelCase whatever you give me to keep it YAML-safe."

Take whatever the user provides and convert to camelCase for the YAML key. Preserve spaces/original casing only in explanatory comments, not as the actual key.

### 3c. Additional sources

Ask:

> "Do you have a separate tokens/foundations file to pull from? Many teams keep foundations (colors, spacing, type) in a file distinct from components."

Repeat 3a–3b for each additional source. A components or foundations source gets the full `fetch` list — `file`, `variables`, and `styles`. It is marginally more bandwidth on a file that does not need all three, and it keeps the flow simple.

**An icons source is the exception: give it `fetch: [file]` only.** The `icons` kind needs a `glyphs` convention in `config/conventions/figma.yaml`, which onboarding leaves commented out, and `specs fetch` refuses to start without it — so an icons file cannot fetch icons during onboarding. Handing it the full list instead is worse than it looks: icon files are large, and `variables` and `styles` on a file that holds only glyphs download hundreds of megabytes that nothing downstream reads.

Say so rather than quietly dropping what they asked for:

> "Your icons file needs a glyph naming pattern configured before `specs` can pull icons from it, which is a step past onboarding. I'll register the file now and fetch just its structure — we can turn icons on afterwards."

**If there is more than one source, `library` is the best name for the one holding the components** — but it is a recommendation, not a requirement, and **the name the user gave in 3b wins.** `specs generate` looks for the alias `library` first; with no `library` it falls back to the first source that fetches `file`, which depends on key order in the file. So:

- If the user did not name it, or had no preference, use `library` and say why.
- If the user named it something else, keep their name and **write it first in the `sources:` block**. That makes it the `file` fallback, so a bare `specs generate` still lands on it. Confirm this in Step 8 by checking which source the run reports.

Never rename a source the user named. Tell them what you did:

> "I'll keep your name `<theirs>` for the components file and write it first, so the later commands still run with no arguments. (`library` is the conventional name if you'd rather switch.)"

Typical result (in `config/settings.yaml`):

```yaml
data:
  directory: ./data
  sources:
    library:
      key: <key>
      fetch: [file, variables, styles]
    foundations:
      key: <key>
      fetch: [file, variables, styles]
    icons:                        # only if they have a separate icons file
      key: <key>
      fetch: [file]               # not `icons` — see above
```

Write the full `data.sources:` block to `config/settings.yaml` now, replacing the placeholder `library:` entry `specs init` wrote. **The `icons` fetch kind never appears during onboarding**, for the reason given above. Show the user what you wrote.

**Change nothing else in `config/settings.yaml`.** `specs init` writes every setting out, at the value this flow wants. Do not read the file back to confirm a value, do not recite the settings to the user, and do not ask about any of them.

---

## Step 4. Secrets (.env setup)

### CRITICAL RULES — follow these exactly

1. **Create `.gitignore` BEFORE creating `.env`.** If one exists, append any missing lines rather than replacing it. Write the whole set, not just `.env` — every line below is something a workspace generates and nobody should commit, and the `data/` pair is the one people get wrong:

   ```gitignore
   # Secrets — never commit
   .env

   # Fetched Figma payloads: large, regenerable with `specs fetch`.
   # The manifest is the exception — it records which components you curated,
   # which is a decision, not an artifact.
   #
   # `data/*`, not `data/` — git never descends into an excluded directory, so
   # the negation below would never apply and the manifest would be ignored too.
   data/*
   !data/*.manifest.md

   # Working documents from the setup skills. Proposals, not outputs.
   reports/

   node_modules/
   ```

   Tell the user what the `data/` pair does. Ignoring the payloads and keeping the manifest is the only part of this that is not obvious, and losing the manifest means losing their component selection.
2. **Never echo the token back to the conversation.** If the user pastes their PAT inline, acknowledge receipt ("got it, writing now") without repeating the value, and write it directly to `.env`.
3. **Prefer letting the user paste the token into the file themselves.** Create `.env` with the key stubs (`FIGMA_TOKEN=` and optionally `SPECS_LICENSE_KEY=`), then instruct them to open `.env` and paste their values. This is the safer default.
4. **Never commit or stage `.env`.** If the user asks you to commit setup files, stage the `config/` directory and `.gitignore` only; skip `.env`.
5. **Never log, cat, or grep `.env` contents back to the chat.** If you need to verify the file is populated, check the file exists and is non-empty, not its contents.

### 4a. Figma Personal Access Token

Walk the user through:

> "You need a Figma Personal Access Token. I'll open the page for you:
>
> https://www.figma.com/settings/tokens
>
> Click **Generate new token** with the name 'Specs CLI' and these scopes:
> - `file_metadata:read`
> - `file_content:read`
> - `library_assets:read`
> - `library_content:read`
> - `file_variables:read` (Enterprise only — skip if unavailable)
>
> Copy the token. I've created `.env` for you — open it and paste the token after `FIGMA_TOKEN=`. Let me know when it's saved."

Wait for explicit confirmation before proceeding.

### 4b. License key (optional)

**First check whether the `.env` already carries one.** Confirm that a populated `SPECS_LICENSE_KEY=` line exists without printing its value, exactly as you did for `FIGMA_TOKEN` in 5a. A pre-provisioned key is as normal as a pre-provisioned token. If there is one, say so and skip the question entirely:

> "Your `.env` already has a Pro license key, so we'll run with Pro features on."

Asking a user whether they have a key that is already sitting in their `.env` is friction, and taking their "no" at face value means reporting free-tier behaviour for a run that is not free-tier. Only if the line is absent or empty, ask:

> "Do you have a Specs **Pro license key**? It unlocks design token references, variable bindings, invalid-combination analysis, and composition specs. The **free tier** works fine without one — you'll still get full anatomy, props, variants, raw style values, working React and Web Components, and Storybook.
>
> - **Yes, I have a key** → paste into `.env` after `SPECS_LICENSE_KEY=`.
> - **Not yet** → skip; you can add it later. We'll run in free-tier mode."

If they add a key, note that the React and Web Components steps inside `specs run` (Step 9) **fail the run** rather than falling back to free tier when a key is present but cannot be validated — offline, rate-limited, interrupted. That is deliberate: a silent fallback would write a whole free-tier tree under a valid key and report success.

---

## Step 5. Fetch Figma data

Set expectations before you start it. A large enterprise library is a large download — a ~950MB components file takes around four minutes, most of it silent while Figma builds the payload before sending a byte. Tell the user:

> "This first fetch can take several minutes on a big library, and most of that time looks like nothing happening while Figma assembles the file. A transient disconnect partway through is normal — I'll re-run the part that failed."

If the download fails mid-transfer, re-run it following the retry hint `fetch` prints: the hint names the source and every data kind still missing, so one `--only` run recovers the source without re-downloading the ones that already succeeded. Repeated failures or a payload too large to read are the case for `--no-geometry`, which drops `fillGeometry`, `strokeGeometry`, `size`, and `relativeTransform` and makes the payload around a third smaller:

```
specs fetch --no-geometry
```

It is safe whenever the user doesn't need vector path data. Width and height fall back to `absoluteBoundingBox`, which is accurate for every non-rotated node — so the only specs it degrades are ones with rotated layers. Offer it as the remedy for size, not as the default.

Run `specs fetch`. Verify:

1. Command exits 0.
2. Artifacts exist in `data.directory` (default `./data/`) for each source (only the fetch kinds they configured): a `<source>.file/` directory (the file payload, split into `root.json` plus one JSON per Figma page) and `<source>.variables.json` / `<source>.styles.json` files.
3. The files are non-empty.

If `fetch` fails with an auth error, the token is wrong or missing scopes. Ask the user to regenerate it with all the scopes listed in 5a.

If `fetch` 404s, the file key is wrong or the token's user doesn't have access to that file.

---

## Step 6. Scan for components

With exactly one source configured, run:

```
specs scan
```

**With more than one source, run `scan` once per source and name each one with `--source <alias>` — including the first.** (`scan --source` takes an alias; the same flag on `fetch` does not, which is why other skills warn about it.) A bare `specs scan` fails when it has more than one source to choose between; it will not silently pick the first:

```
specs scan --source library
specs scan --source foundations
```

No `-o` flag needed. `scan` writes the manifest to `data/<alias>.manifest.md` by default (`data.directory` from `config/settings.yaml`). Let the default do its work — every command downstream assumes it.

Verify each manifest file exists at `data/<source>.manifest.md` and has at least one component listed. Show the user the manifest contents (first ~20 lines is fine).

If a source genuinely has no components (e.g., a pure tokens/foundations file), `scan` will return an empty manifest. That's fine — just note it and move on.


## Step 7. **STOP — component selection**

**Do not run `generate` yet.** The user needs to curate which components get specs.

Tell the user:

> "Open `data/<source>.manifest.md` and uncheck any components you don't want specs for. By default all are selected. Common things to exclude: internal helpers, slot utilities, experimental components, anything prefixed with `_`.
>
> Let me know when you've saved the manifest and I'll run the generator."

A first-time manifest from a real library is long, so give the user the naming patterns to sort it by rather than leaving them to read every line. Read the manifest yourself and point at whichever of these it actually shows:

- **A shared prefix marks the published set.** The component sets a team publishes to its consumers usually share one prefix; everything without it is internal. Offer to select by that prefix.
- **A leading `.` or `_` marks a private component.** Figma's own convention for a component the library does not publish.
- **A sigil such as `❖` is decoration, not meaning.** Teams use it to mark component sets in layer names; it says nothing about whether the component should get a spec.
- **A helper path prefix marks a utility.** Names under a path segment like `Helpers /`, `Internal /`, or `Slots /` are scaffolding for other components rather than components a consumer uses.

State these as heuristics the user confirms, not as exclusions you apply. Their library may deliberately publish something that looks internal.

**On a large library the operation is inverted, and the wording above is not.** Selecting 8 components out of 376 is not "uncheck what you don't want" — it is uncheck everything, then check eight. Say it that way round when the manifest is long, and do the bulk edit yourself rather than asking the user to.

**Then print the exact list you checked, and count it.** Not the headline names you were aiming for — every row. A selection is easy to make and hard to verify afterwards, and the next step bills by component: every extra row is time in Step 8 and again in Steps 12 and 13. If the count surprises you, re-read the manifest before generating rather than after.

Wait for explicit confirmation. If the user says "just generate everything," still wait for their confirmation that they've looked at the list.

---

## Step 8. Scaffold the Storybook host

Storybook is scaffolded *before* the build, because the one command in Step 9 serves it as part of bringing the workspace up. Two stages.

### 8a. Scaffold

```
specs storybook init
```

Writes `storybook/` — a `package.json` declaring Storybook, the `.storybook/` config, and a seeded `content/` tree. It prints the install command and next steps rather than running them, and refuses if `.storybook/` already exists.

Read the port out of the scaffolded `storybook/package.json` dev script and record it. On a fresh workspace it is **6006**.

Its printed next-steps name the install and then `specs run`, which is Step 9 — so they match this flow.

### 8b. Install

The CLI never ships or installs Storybook itself — the install is the user's, in their own workspace:

```
cd storybook && npm install
```

Verify it exits 0. If it refuses on the Node version, the floor is 20.19 — back to P3.

---

## Step 9. Generate, then hand over to one command

### 9a. Generate the specs

```
specs generate
```

This is the first thing in the flow that is about *their* design system rather than about setup. Verify `specs/components/` holds a folder per selected component, each with `api` and `variants` files, and open one: it starts with the component's `title:` and `anatomy:`. **Show it to the user and say so** — it is the first output worth looking at.

### 9b. Hand over to `specs run`

From the workspace root:

```
specs run
```

It brings the workspace up to date and keeps it that way — **scan, generate, analyze, emit each platform whose tree exists, publish and serve Storybook** — then watches `specs/`, `data/` and `config/` and redoes only what a change affects.

Run it in the background, or in a second terminal, so you can keep talking to the user. Wait for it to report the paths it is watching, and for Storybook to report it is listening.

**From here, do not run `generate`, `analyze`, `react`, `webcomponents` or `storybook dev` by hand.** `run` owns them now. Two things it still does not cover: `fetch`, which is why Step 5 is its own command, and the first creation of a platform tree, which is why 9a exists.

### What to verify, and what to show the user

1. The command reports each step completing, and Storybook reports listening.
2. **Both platform trees are in the step list.** With no tree yet and no scoping flag, `run` emits every platform — the directories it creates are then the standing answer, and deleting one stops it emitting there.
3. Give them the URL, on its own line: **http://localhost:6006** (or the port from 8a).

Then tell them what the analysis reports answer, pointing at a number from their own reports rather than describing each in the abstract:

- **props** — the prop inventory across the library: which props exist, which components share them, where one concept is spelled two ways.
- **styling** — where design tokens are used, and which are used nowhere.
- **dependencies** — which components are built from which, so a change's blast radius is visible before it is made.
- **keys** — names the chosen key format cannot reconstruct. Expect this empty and say so: it measures round-tripping against a declared `naming` convention, which onboarding leaves undeclared. Empty here means the check did not run, not that the library is clean.
- **roles** — what each anatomy element *is*, and which concepts the library has never used. Expect every element bare; it is the before-snapshot for Step 10.

Two things to mention only if they apply:

- On the free tier, compositions are skipped and the run says so once. Components are emitted as normal.
- If a step failed with a license error and a key is present, the check could not be completed rather than the key being bad. Re-run.

### Leave it running

`run` stays up for the rest of this flow. Step 10's passes each change `config/` or `data/`, and the chain picks those changes up and re-emits on its own — so the user watches Storybook improve as each pass lands, with no further commands from you.

If the Storybook index returns a 500 after it was working, that is a cached per-file parse failure, not a dead server. The chain detects it, names the file, and re-triggers the parse. Fix and re-save the named file; never restart Storybook for this.

### 9c. **STOP — hand them the Storybook and wait**

**Setup is done. Stop here and let them look at it.** This is the first moment the work is theirs rather than yours, and the worst thing to do is keep talking while they want to click.

Give them the URL on its own line, then point at three things worth opening:

- a component's stories — their Figma variants, as working code
- the foundations pages, built from their own variables and styles
- the analysis reports, and one number from their own: how many components, how many props, where one prop name means two things

Then end with a short `Next steps` section naming what is still available, and **wait**:

> **Next steps**
>
> Three passes can improve what you're looking at: resolving your icons to named
> assets, classifying your states so the CSS uses `:disabled` instead of data
> attributes, and adding roles so a checkbox emits a real `<input>`.
>
> Reply **continue** when you want to go through them.

Do not start Step 10. Do not describe the three passes beyond that sentence each. Do not ask which they want — Step 10 does that, and asking twice is worse than asking once. If they reply with anything other than a request to continue, answer it and wait again.

---
---

## Step 10. **STOP — the improvement checklist**

They now have a working Storybook. This is the point to stop, show it to them, and let them choose what to improve — not before, when none of it would have meant anything yet.

Everything up to here was mechanical: the pipeline read Figma and wrote down what it found. Three facts about a library are **not** in Figma, so nothing upstream can supply them. Each one is a separate pass, each improves the code they are currently looking at, and each is theirs to choose.

**Present them as a checklist and ask which they want.** One question, three items, in this order:

```
Your Storybook is running. Three things I can improve from here —
tell me which you'd like, in any combination:

  [ ] Icons — resolve your icon components to named, reusable assets.
        Changes: your config, plus one more download of just the icons.

  [ ] States — make your CSS use real state selectors instead of data
        attributes, and drop browser-driven props from the generated API.
        Changes: one block in your config. Reversible.

  [ ] Roles — make a checkbox emit a real <input type="checkbox"> with
        the right ARIA, instead of a <div>.
        Changes: writes annotations into your Figma file.
```

Rules for this gate:

- **Adapt the list to the workspace.** Drop the icons line if there is no icons source. Keep the other two always.
- **Say what each changes, as above.** Roles is the only one that touches anything outside the workspace, and that has to be visible in the list itself rather than explained afterwards.
- **Take their answer as given.** All three, one, or none are all normal. "None" is a complete onboarding — say so once, go to Step 11, and do not re-offer.

### Propose in parallel, apply in sequence

When they pick more than one, **do not run the passes end to end.** Each spends minutes reading the library before it has anything to show, and run serially the user waits through all of it with nothing on screen.

**Propose concurrently.** Every pass splits into a read-only analysis that ends at a report, and a write that follows. The analyses touch nothing and do not conflict, so launch one subagent per chosen pass, in a single message so they run at once, each told to follow its skill *up to and including writing its report to `reports/`* and then stop without applying anything. Three multi-minute analyses become one.

**Apply in sequence, in the listed order**, after the user has reviewed the reports:

| Pass | Writes | Why it cannot overlap |
|---|---|---|
| Icons | `config/conventions/figma.yaml`, then refetches that source's glyphs | changes what `generate` produces, which is what states reads |
| States | `config/conventions/specs.yaml` | config only — the one pass that conflicts with nothing |
| Roles | the Figma file, then refetch and regenerate | two passes refetching and regenerating at once corrupt each other |

Icons and roles both end in a refetch and a regenerate into the same workspace. **Never have two of those running together**, and never apply anything while a subagent is still proposing.

`specs run` is still going from Step 9, and it watches `config/` and `data/`. **Every applied change lands in a live workspace: the chain re-emits on its own and the user watches Storybook change.** Do not re-run the pipeline by hand after any of them.

After each pass is applied, point at what actually changed in the output — a selector in the stylesheet, a tag in a scaffold, an icon name — rather than reporting that the pass completed.

### 10a. Reading a skill

Step 2a installed them in `.claude/skills/`. **Read the `SKILL.md` and follow its steps** — a skill installed mid-session cannot be invoked by name. If Step 2a was skipped, run `specs skills install` now.

| Pass | Read and follow |
|---|---|
| Icons | `.claude/skills/specs-cli.icons.setup/SKILL.md` |
| States | `.claude/skills/specs-cli.states.setup/SKILL.md` |
| Roles | `specs-cli.roles.propose/SKILL.md`, then `specs-cli.roles.apply/SKILL.md` |

### 10b. Icons, if they asked for it

Follow `specs-cli.icons.setup`. It decides which components are the icon set, writes the `glyphs` convention, refetches that source's glyphs, and confirms the names resolved.

Two facts it needs that only this flow knows: the icons source was registered with `fetch: [file]` in Step 3c, so its icons are not pulled yet, and the scan manifest from Step 6 is on disk.

When it finishes, show the user the named assets under `assets/icons/`.

**Run `specs generate` after it, even under a live `specs run`.** The chain watches the file, manifest, variables and styles payloads, but not the glyphs payload the refetch writes — so glyph elements stay untyped until a generate reads them. Everything downstream of generate then re-emits on its own.

If no convention can be established, say so plainly and move to the next item. Do not invent a pattern to get past the step.

### 10c. States, if they asked for it

The skill reads `specs/analysis/props.yaml` and the specs Step 9 produced, proposes a row per state concept with the evidence behind it, and stops at a report. **Show the user the report and let them clear any row they disagree with**, then paste the block into `config/conventions/specs.yaml`.

The chain picks the config change up and re-emits. Point at a selector that changed — `:disabled` where `[data-is-disabled]` used to be — rather than saying it worked.

If they dislike the outcome, deleting the block restores exactly what they had.

### 10d. Roles, if they asked for it

**This one edits the user's Figma file.** Treat it as the serious step it is.

Do not start it on an inferred yes. The user must have asked for roles specifically, after being told that applying them writes into their Figma file. "Yes, do the recommended thing" is not that. If there is any doubt, ask again in those words, and accept no as the answer.

What they are agreeing to:

- **Annotations are written into their Figma file.** The write is additive — existing notes, `action:` lines and prose all survive, and an element that already carries a role is skipped — but it is a real change to their source of truth, made across many components.
- Two gates are built in. `roles.propose` only writes a report, and `roles.apply` goes one Figma page at a time so they can watch it and stop.
- It needs the plugin bridge connected to **this user's file**. Run `specs bridge status` before proposing anything, and read the file key it prints:

  ```
  Bridge running (pid 36652). 1 plugin connected:
    043ln8eiOoivUN5FicuGCF (ADS Components) — connected
  ```

  **Compare that key against `data.sources` in `config/settings.yaml`.** If it does not match one of them, the bridge is attached to somebody else's file — stop, say which file it found, and ask them to open the plugin on theirs. "Connected" on its own is not the gate: a bridge left running from unrelated work answers exactly like the right one, and every annotation would land in that file instead, silently and unrecoverably.
- Generated specs carry what was written because `spec.roles` is `true` in the scaffold. Do not change it.
- `specs fetch` and `specs generate` both have to run again afterwards to pick the annotations up. Say this before they start, not after.

If the bridge is not connected, or is connected to a file that is not theirs, say what to open and stop there. Do not write roles into the specs by hand as a substitute, and do not continue to `roles.apply` without them having seen the proposal report.

`specs/analysis/roles.yaml` from Step 9 is the read-only way to answer a roles question with the bridge unavailable — it reports which elements carry a role and which concepts the library has never used, without touching Figma.

A user who starts roles and changes their mind mid-sweep has lost nothing: what was applied is valid, and the rest can be applied later or never.

---


## Step 11. Wrap up

Give them the URL, first and on its own line:

> **Your design system is running at http://localhost:6006**

(Use the port recorded in 8a if it is not 6006.)

Then tell them what to click: the foundations pages built from their variables and styles, a component's stories, and the analysis reports from Step 9.

Summarize what exists now:

| Path | What it is | Commit it? |
|---|---|---|
| `config/` | `conventions/` and `settings.yaml` — project config | **Yes** |
| `.gitignore` | contains `.env` | **Yes** |
| `.env` | secrets | **Never** |
| `data/` | raw Figma payloads | Usually ignored — ask if unsure |
| `data/<source>.manifest.md` | the curated component selection | **Yes** — see the note below |
| `specs/` | generated specs and analysis reports | **Yes** — so PRs show spec diffs when design changes |
| `react/`, `webcomponents/` | generated code | **Yes** — so PRs show code diffs too |
| `assets/` | icons, generated CSS, fonts | **Yes** |
| `storybook/` | the host — but not its `node_modules/` | **Yes** |
| `reports/` | proposals the setup skills wrote for review | **No** — working documents, ignored by the `.gitignore` written in Step 4 |

The `.gitignore` written in Step 4 already handles this: `data/` is ignored, `!data/*.manifest.md` is not, and `reports/` is ignored because the setup skills write working documents there rather than outputs.

Suggest immediate next steps:

- Set `author:` in `config/settings.yaml` — `specs init` scaffolds it as `<Your Name Here>`, and it is the only value in the file that needs them. It is in the config they are about to commit.
- Re-run `specs fetch` whenever the Figma file changes. `specs run` watches `data/` and carries it the rest of the way to the browser on its own — it is the only command they need day to day.
- See the [Workflows](https://spectacular.systems/cli/workflows/) guide for CI/CD automation.
- Enable Pro features later by adding `SPECS_LICENSE_KEY` to `.env`.
- When the library evolves, [`specs version`](https://spectacular.systems/cli/commands/version/) compares versions, classifies changes, and generates reports and changelogs; [`specs skills`](https://spectacular.systems/cli/commands/skills/) installs the AI orchestration skills that sequence those workflows.

Do **not** offer to `git init`, `git add`, or `git commit` unless the user asks.

---

## Forbidden actions

During this flow, never:

- Paste, repeat, or log the Figma PAT or license key back to the conversation.
- Run `git commit`, `git push`, `git add .`, or stage `.env`.
- Call `npm install ../specs/packages/schema` or any similar path — Specs CLI is installed from the npm registry only.
- Guess a Figma file key — always derive from a URL the user provides.
- Proceed past Step 7 without explicit user confirmation.
- Run `specs-cli.roles.apply`, or any other write to the user's Figma file, without them having asked for roles by name and seen the proposal report. Step 10 is optional; treat a vague yes, a silence, or an unrelated "sounds good" as a no.
- Write `FIGMA_TOKEN` or `SPECS_LICENSE_KEY` values into any file other than `.env`.
- Install Specs CLI into an existing `package.json` project's dependencies without asking whether they want that vs. a global install.
- Start Storybook with anything other than `specs run` — never `npm run storybook` or a raw `storybook dev`, including the command `specs storybook init` prints. The raw command prompts for telemetry consent and for a fallback port, and when those prompts go unanswered it exits without starting anything while a stale server keeps answering on the port.
- Run the pipeline steps individually once `specs run` is up. It owns scan, generate, analyze, both emits, and Storybook.
- Ask the user about a setting this procedure tells you to apply.

---

## Environment notes

This flow is UI-agnostic — it works whether the user is in terminal Claude Code or the VS Code panel.

- **VS Code panel users** can click file links you produce (e.g., `config/settings.yaml`) to open them in a tab. They can edit config or `.env` in place while you continue; just read the file again before your next tool call.
- **Terminal users** won't see files appear visually. After writing any config file, proactively offer to `cat` it so they can review without opening an editor.

Regardless of UI, for the `.env` step, prefer the "create stub file, user pastes secrets themselves" pattern. It's the one behavior difference worth emphasizing.

---

## See also

- [Getting Started](https://spectacular.systems/cli/getting-started/) — the manual walkthrough
- [Settings Reference](https://spectacular.systems/settings/) — full convention and setting docs
- [CLI Overview](https://spectacular.systems/cli/) — per-command flags and behavior
