---
description: Release @directededges/specs-schema to npm. Verifies by script, builds, and publishes with one ship gate.
---

## User Input

```text
$ARGUMENTS
```

The argument is the version to release (e.g., `0.16.0`). You **MUST** have a version before proceeding.

## Working Directory

All commands in this agent run from the **schema package directory**: `packages/schema` (relative to repo root). Use absolute paths for file reads, but run shell commands from `packages/schema`.

`$WORKSPACE_ROOT` below is the specs-local-workspace directory (typically `../specs-local-workspace` relative to this repo). **Running this agent directly, outside the orchestrator?** Run the workspace preflight first — it carries the npm-auth and scope checks the orchestrator normally provides: `bash "$WORKSPACE_ROOT/.claude/scripts/release-preflight.sh" specs-schema`.

## Outline

0. **Ensure a tracking PR exists for this release branch** — do this FIRST, before any other step, every time this agent runs. An in-flight release must always be discoverable in `gh pr list` so a release branch can never be silently abandoned.
   1. Confirm the current branch matches `release/*`. If not, STOP and report — this agent only runs from a release branch.
   2. Check for an existing PR:
      ```bash
      gh pr list --repo DirectedEdges/specs --head "$(git branch --show-current)" --state all --json number,state,isDraft --jq '.[0]'
      ```
   3. If no PR exists, push the branch (if not already pushed) and create a **draft** PR immediately, even if the version/CHANGELOG isn't finalized yet:
      ```bash
      git push -u origin "$(git branch --show-current)" 2>/dev/null || true
      gh pr create --draft --base main --head "$(git branch --show-current)" \
        --title "release: $(git branch --show-current)" \
        --body "Draft release PR — opened automatically by Schema.release agent so the in-flight release is visible. Versions, CHANGELOG, build, tests, and publish will be finalized before this is marked ready."
      ```
   4. Report the PR URL and continue.

1. **Mechanical verification** — version match, CHANGELOG mechanics (entry exists, dated, sections non-empty, no stale `- Unreleased`), and working-tree state, in one script call:
   ```bash
   bash "$WORKSPACE_ROOT/.claude/scripts/release-repo-verify.sh" specs-schema [version]
   ```
   - Relay the output. **Any FAIL stops the release** — fix it or ask, don't work around it.
   - A WARN that the entry is undated is expected: replace its `- Unreleased` with today's date now.
   - CHANGELOG **prose quality is not checked here** — entries, the Summary paragraph, and the ADRs section are authored and reviewed during the cycle (the `changelog` skill owns the voice rules). If the entry is missing entirely, STOP: that is a cycle gap to fix via `/changelog`, not something to improvise at release time.

2. **Build** — the build-posture hook denies `npm run build*` here; run the script's underlying command directly:
   ```bash
   cd packages/schema && npx tsc -p tsconfig.build.json
   ```
   If build fails, STOP.

3. **Run type-level tests**:
   ```bash
   cd packages/schema && npx tsc --noEmit --strict tests/*.test-d.ts
   ```
   If tests fail, report errors and ask the user whether to proceed or abort.

4. **Present setup summary**:
   ```
   @directededges/specs-schema v[version] — Setup Summary
     ✓ Mechanical checks: passed (release-repo-verify.sh)
     ✓ Build: passed
     ✓ Type tests: passed (or ⚠ with note)
   ```

5. **Ship gate** — the one gate. Use `AskUserQuestion` with Yes/No options: **"Ready to commit, tag, publish, and finalize @directededges/specs-schema v[version]?"**
   On Yes, run the whole sequence below without further gates; stop only on a failure.
   1. Commit (if there are uncommitted changes):
      ```bash
      git add -A && git commit -m "release: @directededges/specs-schema v[version]"
      ```
   2. Tag (scoped for monorepo):
      ```bash
      git tag -a "specs-schema@[version]" -m "release: @directededges/specs-schema v[version]"
      ```
   3. Publish from the package directory, passing the automation token by env var (never `--userconfig` — the workspace has no `package.json`, so npm loads `~/.npmrc` as the *project* config and it outranks `--userconfig`):
      ```bash
      TOK=$(grep -oE '_authToken=.*' "$WORKSPACE_ROOT/.npmrc.public" | cut -d= -f2-)
      cd packages/schema && env "npm_config_//registry.npmjs.org/:_authToken=$TOK" npm publish --access public
      ```
      If publish fails with "previously published version", report and ask the user whether to bump the patch version or skip.
      If publish fails **403 "Two-factor authentication is required ... automation token was specified"**, this package has been locked to 2FA like `specs-cli`. Switch to the local-2FA flow: the user runs it themselves (`npm whoami || npm login`, then `cd packages/schema && npm publish --access public` — npm prompts for the OTP); you then verify from the registry. See `CLI.release.agent.md`.
   4. Verify the publish from the registry: `npm view @directededges/specs-schema version` must report `[version]`. **Only a verified publish continues.**
   5. Push, including the tag:
      ```bash
      git push --follow-tags
      ```
   6. Post-commit check — no undated heading survived:
      ```bash
      bash "$WORKSPACE_ROOT/.claude/scripts/release-repo-verify.sh" specs-schema [version] --post-commit
      ```
   7. Collect issue references for the PR body:
      ```bash
      bash "$WORKSPACE_ROOT/.claude/scripts/release-collect-closes.sh" . DirectedEdges/specs
      ```
      Append the printed `Closes <ref>` lines to the PR body, one per line, so issues auto-close when this PR merges to main.
   8. Finalize the tracking PR — mark it ready and update title/body:
      ```bash
      PR_NUM=$(gh pr list --repo DirectedEdges/specs --head "$(git branch --show-current)" --state open --json number --jq '.[0].number')
      gh pr ready "$PR_NUM"
      gh pr edit "$PR_NUM" --title "release: @directededges/specs-schema v[version]" --body "$(cat <<'EOF'
      ## Summary
      - Release @directededges/specs-schema v[version]
      - See packages/schema/CHANGELOG.md for details

      [collected Closes #N lines, one per line]
      EOF
      )"
      ```
      If no PR exists at this point (step 0 was skipped), create one with `gh pr create --base main --head <branch> --title "release: @directededges/specs-schema v[version]" --body "..."`.
   9. Create the GitHub Release (scoped tag), with notes extracted by script:
      ```bash
      node "$WORKSPACE_ROOT/.claude/scripts/release-notes-extract.mjs" packages/schema/CHANGELOG.md "[version]" > /tmp/notes-specs-schema.md
      gh release create "specs-schema@[version]" --title "@directededges/specs-schema v[version]" --notes-file /tmp/notes-specs-schema.md
      gh release view "specs-schema@[version]" --json url --jq '.url'
      ```
   10. Report the PR URL and release URL. The PR itself is handed over after the CLI finishes — it is shared with the CLI release in this repo.

## Key rules

- Use absolute paths for all file operations.
- All shell commands run from `packages/schema` unless they are git or gh commands (which run from repo root).
- **Tag format**: `specs-schema@[version]` — scoped to distinguish from CLI releases in the same repo.
- **One gate: ship.** Everything after a verified publish (push, PR ready, GitHub release) runs automatically — a publish is already public, so there is nothing left to decide.
- If any verification step fails, halt immediately — do not skip to later steps. For test failures, ask the user whether to proceed.
- This package has no @directededges dependencies, so no reference swapping is needed.
- Cleanup (branch deletion after PR merge) is handled by the release orchestrator, not this agent.
