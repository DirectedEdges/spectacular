---
description: Confirms the implementation is clean, then marks the ADR as ACCEPTED. Run this after reviewing the diff from /specs.adr.implement.
---

**Territory: schema.** Before proceeding, read `CLAUDE.md` and `ARCHITECTURE.md` at the repo root if not already loaded this session.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

1. **Setup**: Run `scripts/check-prerequisites.sh --json --paths-only` from repo root. Parse `REPO_ROOT`, `BRANCH`. All paths must be absolute.
   - Derive `ADR_NAME` from `BRANCH`:
     - Use `BRANCH` directly as `ADR_NAME` (e.g., `011-icon-glyph-as-content`).
   - The branch name must match an ADR name pattern (starts with a number sequence followed by a hyphen, e.g., `011-`). If no ADR number is found, halt: "Branch does not appear to be an ADR branch."

2. **Check for an existing PR — do this before any other work.** An ADR branch may already be in review from an earlier session; this command must never open a second PR for the same branch.

   ```bash
   gh pr list --head "$BRANCH" --state all --json number,title,state,baseRefName,url
   ```

   - **An OPEN PR exists** → set `EXISTING_PR` to its number and `$RELEASE_BRANCH` to its `baseRefName`. This run is an *update*, not a creation. Skip step 7 (release-branch determination) — the existing PR's base is authoritative. Report the PR number and base to the user before continuing.
   - **A MERGED PR exists** → halt: "This ADR branch was already merged in PR #N. Accepting again would need a new branch."
   - **A CLOSED (unmerged) PR exists** → do not reopen or replace it silently. Report it and ask the user whether to open a new PR or reopen that one.
   - **No PR exists** → the branch has none of its own, but it may still be in review. Run the containment check below before treating this as the normal path.

   **2a. The branch may be in review without having a PR.** An ADR branch is routinely merged forward into the feature branch that implements it, so its commits reach review through *that* branch's PR. `gh pr list --head` only finds PRs whose head **is** this branch, so it reports "no PR" for a branch whose every commit is already under review.

   Ask whether any open PR's head contains this branch's tip:

   ```bash
   for head in $(gh pr list --state open --json headRefName --jq '.[].headRefName'); do
     [ "$head" = "$BRANCH" ] && continue   # a branch trivially contains itself
     git merge-base --is-ancestor HEAD "origin/$head" 2>/dev/null \
       && echo "contained by: $head"
   done
   ```

   - **Something is listed** → set `CARRIED_BY` to that PR and leave `EXISTING_PR` unset. Do **not** open a PR in step 8: the commits are already in review, and a second PR would put the same changes under two reviews into the same base. Name the carrying PR in the report instead.
   - **Nothing is listed** → normal path; `EXISTING_PR` and `CARRIED_BY` are both unset.

   The check is `--is-ancestor HEAD`, not a diff: a branch whose tip is an ancestor of an open PR's head has nothing outstanding, where a branch that has moved since the forward-merge does and needs its own PR.

3. **Load context**:
   - **REQUIRED**: Read `$REPO_ROOT/adr/$ADR_NAME.md` — confirm Status is `DRAFT`.
     - If already `ACCEPTED` **and** `EXISTING_PR` is set with no uncommitted changes, halt: "ADR is already accepted and PR #N is open — nothing to do."
     - If already `ACCEPTED` and there *are* uncommitted changes, this is a follow-up edit: skip the status flip in step 5, and continue so the changes are validated, committed, and pushed to the existing PR.
   - Confirm that `types/`, `schema/`, `package.json`, and `CHANGELOG.md` have been modified by the implement agent (check git status or file timestamps)
   - If no changes are detected **and** `EXISTING_PR` is unset, halt: "Run the implement agent first."

4. **Re-run validation gates**:
   - Run: `tsc -p tsconfig.build.json --noEmit`
     - If exit code ≠ 0: halt and display errors. Do not set ACCEPTED.
   - Run: `scripts/validate-schema.sh`
     - If any schema fails: halt and report. Do not set ACCEPTED.
   - Run: `tsc --noEmit --strict tests/*.test-d.ts` (if `tests/*.test-d.ts` files exist)
     - If exit code ≠ 0: halt and display errors. Do not set ACCEPTED.

5. **Mark ADR ACCEPTED**: In `$REPO_ROOT/adr/$ADR_NAME.md` header, change `Status: DRAFT` to `Status: ACCEPTED`. Skip if step 3 determined the ADR is already `ACCEPTED`.

6. **Update INDEX**: Read `adr/INDEX.md` and move this ADR's row from **Draft** to **Accepted**. Treat this as two discrete edits, not one "move" — every stale row in this file got there because the accepted row was added and the draft row was left behind.

   1. **Delete** the ADR's row from the **Draft** table. Skip only if it genuinely has no draft row (older ADRs created before INDEX tracking).
   2. **Insert** its row into the **Accepted** table, in descending number order, with:
      - the **Title** matching the final ADR heading (it may have changed during implementation)
      - a **Highlights** summary (max 144 characters) describing the key change as accepted
   3. **Verify**: the ADR number must now appear exactly once in the file. Run
      `grep -c "^| <NNN> |" adr/INDEX.md` and confirm it returns `1`. If it returns `2`, step 1 did not happen — delete the draft row before continuing.

   A draft row left in place is not cosmetic: the draft table is how a reader finds unfinished work, and a stale row carries the pre-acceptance title, so the same ADR appears twice under two different names.

   The file also has a **Superseded** table, for an ADR closed in favour of a later decision rather than accepted. Move the row there instead, and name what replaced it in the "Superseded by" column — an ADR abandoned without that pointer reads as merely unfinished.

   Re-check this after any merge or rebase. A draft row claimed on the release branch while the ADR branch was in flight will reappear when the branches reconcile, leaving a duplicate that neither side authored.

7. **Determine release branch** *(skip entirely if `EXISTING_PR` is set — use that PR's base)*: Every repo's release branch is **`release/next`**, covering whichever packages are in the cycle. Do **not** invent a versioned branch name — the version lives in `package.json`, the CHANGELOG and the tag.
   1. Find active in-flight release branches with `git branch -r --list 'origin/release/*'`.
   2. **Default: use the existing active release branch.** ADR branches are started from the current release branch, so the active branch is the correct target. Do not cross-reference the ADR's semver version against the branch name — the branch name reflects where the release *started*, not the final published version.
   3. If exactly one release branch exists, use it as `$RELEASE_BRANCH` without asking.
   4. If multiple release branches exist, pick the one the ADR branch was based on (`git merge-base --fork-point` or ask the user).
   5. Only if **no** release branch exists at all, create one from `main` following the `release/<pkg>-<version>` convention, naming every package the release will publish.

8. **Push, and create the PR only if the branch is not already in review**: Commit any uncommitted changes (the status flip and INDEX update) and push `$BRANCH`.
   - **`EXISTING_PR` set** → the push updates that PR. Do **not** run `gh pr create`. Read the PR's current body (`gh pr view $EXISTING_PR --json body`) and, if it no longer describes what is on the branch, offer to update it with `gh pr edit $EXISTING_PR --body-file <path>` — ask first, since the user may have written it by hand.
   - **`CARRIED_BY` set** → push `$BRANCH`, then **merge it forward into the carrying branch and push that too**, so the acceptance reaches the PR that is actually in review. Do **not** run `gh pr create`. A status flip that stops at the ADR branch leaves the reviewed PR carrying a DRAFT.
   - **Both unset** → open a PR into the release branch with `gh pr create --base $RELEASE_BRANCH`.
   - Pass long PR bodies via `--body-file`, not an inline heredoc — bodies containing backticks and quotes break shell parsing.

9. **Report**: Confirm all gates passed, the ADR is ACCEPTED, and state whether the PR was **created**, an **existing PR was updated**, or **no PR was opened because another already carries the branch** — naming its number in each case. List the next steps:
   - Review and merge the PR into the release branch
   - When all ADRs for the release are complete, merge `$RELEASE_BRANCH` into `main` and `npm publish`

## Key rules

- This command only flips the ADR status — it does not apply any code changes.
- Status MUST only move to `ACCEPTED` after all three validation gates pass in step 4.
- **Never open a second PR for work that is already in review.** Step 2 runs before everything else for this reason, and it asks two questions, not one: does this branch have a PR, and is this branch *contained by* one. An ADR branch merged forward into its implementing feature branch has no PR of its own and nothing outstanding — opening one there puts the same commits under two reviews into the same base. This command is re-runnable: re-running must update or defer to the PR that exists, never duplicate it.
- Verify repo and PR state by querying it — never infer from the conversation or assume a branch is fresh.
- **An ADR appears in exactly one INDEX table.** Accepting means deleting the draft row as well as adding the accepted one; verify with the grep in step 6 rather than assuming the edit landed.
- Use absolute paths for all file operations.
