---
description: Check consistency across adr/, packages/schema/, packages/cli/, and site/ for the current branch before merging.
---

**Territory: schema/cli/docs (cross-territory exit check).** Before proceeding, read the repo-root `ARCHITECTURE.md` if not already loaded — its sync-set section is the checklist this agent verifies.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Purpose

This skill checks that the four artifact areas touched by schema/CLI work are mutually consistent before a PR is merged. It is intentionally tolerant of *expected* gaps (e.g., docs not yet written) but flags *contradictions* and *missing required artifacts* that would cause drift post-merge.

The four areas and their relationships:

- **ADR** (`adr/`) — declares intent: what is changing, why, and what the semver impact is. Source of truth for this check.
- **Schema** (`packages/schema/`) — must reflect everything the ADR declares: new/changed types, fields, enums, JSON schema entries, and CHANGELOG entry.
- **CLI** (`packages/cli/`) — must expose or handle every schema change the ADR says the CLI is affected by. Commands, flags, output shape, help text.
- **Docs** (`site/`) — must document every user-facing change: new config values, command flags, behavioral changes, examples.

One coupling runs outside that frame and is checked separately in step 5: the CSS
transformer and the published style mapping appendix. It has no ADR to anchor it —
a refactor changing emitted CSS is not a schema change — so the ADR-driven checks
above never fire on it.

## Outline

### 1. Setup

Run `scripts/check-prerequisites.sh --json --paths-only` from repo root. Parse `REPO_ROOT` and `BRANCH`. All paths must be absolute.

### 2. Detect changed files

Run:
```bash
git diff --name-only main...HEAD
```

Collect all changed files. Categorize each into one or more areas:
- `adr/` → **ADR**
- `packages/schema/` → **Schema**
- `packages/cli/` → **CLI**
- `site/` → **Docs**

If no files fall into any of the four areas, halt: "No changes detected in adr/, packages/schema/, packages/cli/, or site/. Nothing to check."

Report the file count per area and total at the start of output.

### 3. Load the ADR

Identify which ADR file(s) changed under `adr/`. If exactly one, read it in full. If more than one, read all and note which are DRAFT vs ACCEPTED. If none changed, check whether the branch name matches an ADR pattern (starts with a number sequence and hyphen, e.g., `043-`) — if so, read `adr/{branch-name}.md`. If still no ADR found, note "No ADR detected — consistency check will be limited to cross-area drift only."

From the ADR extract:
- **Declared changes**: every new type, field, enum value, config key, command, flag, or behavioral change explicitly stated
- **Affected areas**: which of schema / CLI / docs the ADR says are affected
- **Semver decision**: patch / minor / major

### 4. Check each area

For each area that has changed files (or that the ADR says should be affected), read the relevant changed files and assess:

#### Schema (`packages/schema/`)
- Every type/field/enum the ADR declares exists in `src/types/` or `src/enums/`
- Every schema change is reflected in the JSON schema files under `schema/`
- `CHANGELOG.md` has an entry for this change under the correct semver bump
- No field mentioned in the ADR is absent from the types

#### CLI (`packages/cli/`)
- Every schema change the ADR says the CLI surfaces is handled (command updated, flag added, output adapted)
- Help text or command descriptions reference new fields/flags where expected
- No ADR-declared CLI change is missing from the diff
- `CHANGELOG.md` has an entry if CLI behavior changed

#### Docs (`site/`)
- Every user-facing change (new config value, new command flag, behavioral change) has a corresponding doc update
- Examples in docs match the new schema shape (no stale field names, no removed fields still shown)
- If the ADR declares a breaking change, a migration note or callout exists in the docs
- The stylesheet sync set holds — see the dedicated check in step 5, which runs whether or not an ADR exists

### 5. Cross-area drift check

Even without an ADR, check for drift between areas:
- A new type field in schema but no CLI handling and no docs update → flag
- A new CLI flag not reflected in docs → flag
- A doc example referencing a field name not present in the current types → flag

#### The stylesheet sync set

Run this whenever the diff touches `packages/cli/src/transforms/css/`, **with or
without an ADR**. A refactor that changes emitted CSS is not a schema change, so
nothing else in this check fires on it — which is exactly how the published style
mapping came to document three mechanisms the transformer had stopped using
(specs#691).

1. List the changed modules under `packages/cli/src/transforms/css/`.
2. For each, read the section of
   `site/src/content/docs/code/style-mapping.md` that **names that module** —
   every section names its owner, so the mapping is mechanical, not a judgement.
3. Compare the declarations the module now emits against what the section says.

Report as:

- **Gap** — the section states an output the module no longer produces, or omits
  one it now does. This is published, user-facing, and wrong.
- **Warning** — the module changed but you cannot tell from the diff whether its
  output did (a rename, a comment, a moved helper). Name the section to re-read
  rather than guessing.
- **Not flagged** — the change provably cannot alter output.

Also check the inventory: if a style key was added or removed, the *Mapping Specs
to CSS* table in `site/src/content/docs/code/styles.mdx` lists the keys per
family and must match. It carries keys only, never declarations, so it changes
far less often than the appendix — a key-level change that misses it is a gap.

### 6. Report

Produce a structured report:

```
## Consistency Check — {BRANCH}

**Files changed:** {N} across {areas}
**ADR:** {name or "none detected"}

### Gaps (action required)
- [ ] {area}: {description of gap}

### Warnings (review recommended)
- [ ] {area}: {description of potential issue}

### Looks good
- [x] {area}: {what was verified}

### Not checked
- {area}: {reason — e.g., "no changes in this area and ADR does not mention it"}
```

If there are no gaps and no warnings, say so explicitly: "No consistency gaps found. Ready to merge."

## Staleness note for the calling agent

After this skill completes successfully (even if gaps are found), the calling context should record that a consistency check was performed on this branch. Use this to decide whether to suggest running the check again on a subsequent push in the same conversation: only suggest if either (a) this skill has not been run yet in the conversation, or (b) significant new changes have landed since the last run (5+ new files changed, or changes now span an additional area).

## Key rules

- Read the ADR as the authority. If code contradicts the ADR, that is a gap. If the ADR is absent, check cross-area drift only.
- Flag contradictions as **gaps** (blocking). Flag missing-but-expected artifacts as **gaps**. Flag things that look inconsistent but may be intentional as **warnings**.
- Do not invent gaps. If an area is not touched and the ADR does not mention it, mark it "not checked" — do not flag it.
- Use absolute paths for all file reads.
