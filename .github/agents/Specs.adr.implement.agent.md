---
description: Applies the changes described in an ADR to the specs-schema package only — types, schema, tests, docs, and changelog. Runs all validation gates. Author reviews the result as a normal code diff before merging.
handoffs:
  - label: Analyze downstream impact
    agent: Specs.adr.analyze
    prompt: Gates passed — assess downstream impact package by package and file the adoption issue
    send: true
  - label: Accept ADR
    agent: Specs.adr.accept
    prompt: All gates passed — mark the ADR as ACCEPTED
    send: true
---

**Territory: schema.** Before proceeding, read `CLAUDE.md` and `ARCHITECTURE.md` at the repo root if not already loaded this session — the Constitution digest and sync set there govern the implementation gates.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Scope — `packages/schema` only

**This command changes `packages/schema` and the docs site. It does not touch `packages/cli`, and it does not touch another repo.**

An ADR's Decision section names types and schema; its Downstream Impact table names consumers. This command implements the first and *records* the second. Implementing a consumer is separate work, in its own commit, against that consumer's own tests.

`specs-transforms` is a monorepo of several packages, not one — each is its own consumer with its own dependency position, confirmed against their actual `package.json`/source imports (not assumed from the package name alone):

1. **`specs-schema`** — types and schema. This command.
2. **The `specs-transforms` packages**, all of which depend on `specs-schema` directly at the source level: `specs-from-figma`, `figma-from-specs`, and `from-specs` (the shared core `react-from-specs`/`webcomponents-from-specs` build on). `react-from-specs` and `webcomponents-from-specs` depend on `from-specs`, not on each other or on `specs-from-figma`/`figma-from-specs` — so within this tier, `from-specs` goes first and the rest can follow in any order.
3. **`specs-cli`** — depends on `specs-schema`, `specs-from-figma`, `react-from-specs`, and `webcomponents-from-specs` (confirmed in its `package.json`), so it comes last. It does **not** depend on `figma-from-specs`.
4. **`specs-plugin-2`** compiles `specs-from-figma` and `figma-from-specs` from source — it moves with tier 2, not after `specs-cli`.

Do not reorder these, and do not fold two steps into one pass. A tier-3 or tier-4 package cannot be verified against types a tier-2 package has not yet adopted.

**When an ADR has no schema-package surface at all** — its Type changes table reads *(none)* and its changes are entirely a consumer's — implement whatever schema-side artifact it does name (a definition, a doc comment), then report the ADR as *not implemented here* and name the consumer that owns it. Do not follow it into that consumer.

**If the schema change leaves a consumer uncompilable, that is expected and is not a reason to widen scope.** Say so in the report. Widening it silently is the failure mode this section exists to prevent.

## Outline

1. **Setup**: Run `scripts/check-prerequisites.sh --json --paths-only` from repo root. Parse `REPO_ROOT`, `BRANCH`. All paths must be absolute.
   - Derive `ADR_NAME` from `BRANCH`:
     - The branch name must match an ADR name pattern (e.g., `009-color-values` — starts with a number sequence followed by a hyphen). If it does not, halt: "You must be on an ADR branch (format: `###-short-description`) to implement an ADR."
   - Derive `RELEASE_BRANCH`:
     - `RELEASE_BRANCH` is `release/next`. Confirm it exists with `git branch -a | grep 'release/next'` from `$REPO_ROOT`. If it does not, halt: "No release branch found — create one with `/start-next-release` before implementing an ADR." If other `release/*` branches exist (leftovers from the old versioned scheme), halt and ask which to target. The branch name carries no version — read the target version from the affected package's `package.json` on that branch.

2. **Load context**:
   - **REQUIRED**: Read `$REPO_ROOT/adr/$ADR_NAME.md` — source of truth for what changes and why
   - **REQUIRED**: Read `packages/schema/CONSTITUTION.md` — all six gates must pass
   - Read every `types/*.ts` file named in the ADR Decision section
   - Read every `schema/*.json` file named in the ADR Decision section
   - Read `package.json` for the current version
   - Read `CHANGELOG.md` for the existing format

3. **Verify ADR completeness**: The ADR must have a clear Decision section (type and schema changes listed) and a Semver Decision naming the **target version** and the **change class**. If either is missing or marked NEEDS CLARIFICATION, halt and ask the author to complete the ADR first.
   - The target version is the active release branch's version — an ADR ships inside a release that already has one. If the Semver section instead proposes a bump (`0.30.0 → 0.31.0`), treat the right-hand version as the target only if it matches `$RELEASE_BRANCH`; otherwise halt and ask the author to correct it.

4. **Constitution gate check**: Evaluate all six gates against the ADR's stated changes. If any gate fails without a documented exception in the ADR, halt and report the violation before touching any file.

5. **Apply type changes**: For each type file listed in the ADR Decision:
   - Edit the file directly — add, remove, or rename the fields as described
   - Additive changes only for MINOR; structural changes require MAJOR
   - Add JSDoc comments for every new exported type member
   - Preserve all existing exports and comments not mentioned in the ADR

6. **Apply schema changes**: For each schema file listed in the ADR Decision:
   - Edit the file directly — add, remove, or update the property definitions as described
   - New optional field → add to `"properties"` only; leave `"required"` array unchanged
   - New required field → add to both `"properties"` and `"required"` (MAJOR bump)
   - Add `"description"` for every new schema property
   - Validate JSON syntax before saving (malformed JSON must not be written)

7. **Gate 4 — TypeScript compilation**:
   - Run: `tsc -p tsconfig.build.json --noEmit`
   - If exit code ≠ 0: display errors, revert the files changed in steps 5–6, and halt. Report the specific errors for the author to resolve in the ADR before re-running.

8. **Gate — JSON Schema validation**:
   - Run: `scripts/validate-schema.sh`
   - If any schema fails: revert steps 5–6 changes and halt. Report which file failed and why.

9. **Write or update tests**:
   - Tests live in `tests/` at the repo root (create directory if absent)
   - For a pure types package, tests are TypeScript compilation assertions: files that import the changed types and confirm the expected shape compiles correctly
   - Create or update `tests/[type-name].test-d.ts` for each changed type using `tsd`-style assertions or `@ts-expect-error` patterns
   - Run: `tsc --noEmit --strict tests/*.test-d.ts` to confirm test files compile
   - If tests fail: halt and report
   - **All gates have now passed. Steps 10–13 are REQUIRED before reporting completion. Do not skip to step 14.**

10. **Write the ADR summary**: Add or update the `**Summary**:` line in the ADR's metadata block, directly beneath `**Status**`. Write it now rather than at draft time — it must describe what was actually implemented, which often differs from the original draft.
    - **One sentence, present tense, roughly 15–18 words.** The new property, type, or config option is the grammatical subject.
    - Anchor the addition to the neighbouring fields it joins, not to the gap it filled.
    - Never open with "The schema", and never include a past-tense problem clause ("could not", "was dropped", "had nowhere to land").
    - Keep identifiers in backticks.
    - Examples of the target voice:
      - A `strokeDashPattern` property adds dashes to strokes already supported with color, weight and alignment.
      - A `glyph` element type, `IconProp` and `glyphNamePattern` emit icons as first-class by applying Figma conventions.
      - Images are supported by `backgroundImage` style, `ImageProp` and binding in components and examples.
    - **Gate**: read the ADR back and confirm the `**Summary**:` line is present and no longer a placeholder. The docs site publishes this line verbatim with no fallback — a missing summary leaves a blank row in the published index.

11. **Update docs**:
    - Docs live in `site/src/content/docs/`. Schema type pages are under `site/src/content/docs/schema/` (e.g., `schema/styles.md` for `Styles`, `schema/config.md` for `Config`). Individual config option pages are under `site/src/content/docs/config/` (e.g., `config/tokens.md`, `config/keys.md`).
    - For each property added, removed, or renamed in the ADR: update the relevant doc page's Properties table, Values table, and "Relating properties to values" section to reflect the new state.
    - For new dedicated types (e.g., `LayoutMode`, `WrapAlignment`, `ItemSpacing`): add a row to the Values table describing the type and its valid values.
    - For new config options: check if an individual config option page should be created under `config/` following the pattern of existing pages (e.g., `config/tokens.md`, `config/keys.md`).
    - Do not create new doc pages for types that are only used as field values on an existing documented type — document them inline in the parent type's page.
    - If no doc file exists for the changed type, skip this step.

11a. **Update the specification** — `packages/schema/SPECIFICATION.md`:
    - This is the normative document, distinct from the reference pages in step 11. It states requirements; those pages describe members. The site renders it at `/schema/specification` from this file, so edit the package file and never the generated page.
    - **Decide whether the ADR touches it at all.** §1.5 declares a normativity gradient: document kinds and identity, identifiers, values and layering, pointers, slots, roles, extensions and versioning are specified there; the leaf style vocabularies (`styles`, `effects`, `typography`, gradients, corners, sides) are governed by the JSON Schema and the reference pages alone. An ADR that only adds or changes a leaf style member needs **no** specification change — say so in the report and move on.
    - **If the ADR introduces a semantic rule** — a requirement draft-07 JSON Schema cannot express (cross-member consistency, reference existence, value semantics conditioned on a sibling, open-vocabulary consumer behaviour, a producer or consumer obligation) — add a row to the §9 rule catalogue: next free `DSPEC-nn`, the rule in one RFC-2119 sentence, the class it binds (`document` / `producer` / `consumer` / `validator` / `package`), and a `Source` citation of the section plus this ADR. Never renumber or reuse an existing ID; IDs are stable citation targets.
    - **If the ADR changes a structure §2–§8 specifies**, update that section's prose, and give every requirement an enforcement note from §1.2 (`schema: <file>`, `DSPEC-nn`, `producer`, `consumer`, `unenforced`). A requirement that cannot be given one does not belong in the document.
    - Keep the ADR as provenance, not authority: §1.6 says an ADR is not normative, so state the rule here rather than pointing at the ADR for it.
    - **Gate**: if the ADR declares a rule nothing in the schema can enforce and §9 gained no row, halt and report — the requirement would otherwise exist only in an ADR, where §1.6 says no consumer is bound by it.

12. **Update CHANGELOG.md**:
    - The release branch scaffolds an `## [X.Y.Z] - Unreleased` heading with empty sections. Add entries into the existing scaffold — do **not** replace `Unreleased` with a date (the date is set at release time). If no scaffold heading exists, prepend one using `Unreleased` as the date.
    - **Format**: one top-level bullet per user-visible change; no sub-bullets; no bold; no code blocks; no wrapping prose paragraphs
    - **Entry line**: `` `Parent.field` `` — one-phrase description; aim for ≤ 12 words; omit implementation detail (class names, file paths, method names)
    - **Names**: `<Parent>.<field>` in backticks, em dash separator — e.g. `Styles.cornerSmoothing` — corner smoothing factor (0–1)
    - **Consolidation**: When a new type exists only to serve a property, merge into one property-first bullet — e.g. `` `Styles.mainAxisAlignment` — typed as `MainAxisAlignment` (`'START' | 'END' | 'CENTER' | 'SPACE_BETWEEN'`) or `null`; description ``. Do not list the type as a separate bullet.
    - **Sections**: use `### Added`, `### Changed`, `### Removed` as needed; add `### Migration` (MAJOR or rename only)
    - **Migration line**: `` `Parent.old` → `Parent.new` ``: one sentence; imperative; describe what to read instead and how to handle the new type
    - **Gate**: After writing, verify the new entry is present in the file. If CHANGELOG.md does not contain the new version heading, halt and report — do not proceed to step 13.

13. **Confirm the version in `package.json`**: It must equal the ADR's **target version** — the one the release branch already carries, normally set by `/start-next-release`. Write it only if it differs; do not invent a bump beyond the release branch's version.
    - **Gate**: After writing, read `package.json` back and confirm the `"version"` field matches the ADR's target version. If it does not match, halt and report — do not proceed to step 14.

14. **Report**: List every file modified (with one-line description each) — all of which must be under `packages/schema/`, `adr/`, or `site/`. Name any ADR that had no schema-package surface, and any consumer left uncompilable, as outstanding work rather than doing it. The list **must** include the ADR file, `CHANGELOG.md`, and `package.json` — if any is absent from the list, halt: steps 10, 12, or 13 were not completed. State either the `SPECIFICATION.md` change or the reason the ADR needed none (§1.5 gradient, or no semantic rule introduced) — silence on it is not an acceptable report. State that the author should review the diff and accept the ADR once satisfied. Remind the author that this ADR branch (`$BRANCH`) targets the release branch (`$RELEASE_BRANCH`), not `main`.

## Key rules

- Apply changes directly — do not produce a description document.
- **Never edit `packages/cli`, any `specs-transforms` package, or `specs-plugin-2` from this command**, even when the ADR's Downstream Impact table names them and even when the schema change breaks their build. Those are separate passes, in the order given under Scope.
- Halt and revert on any gate failure. Do not partially apply a change set.
- Never modify type or schema files not listed in the ADR Decision section. Doc files (`docs/schema/`) corresponding to changed types are always in scope.
- If the actual change required is a higher semver bump than the ADR states, halt and report before touching any file.
- Use absolute paths for all file operations.
