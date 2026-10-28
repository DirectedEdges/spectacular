---
description: Release @directededges/specs-cli to npm. Swaps file: refs to versioned, verifies by script, builds, tests, publishes (user-run 2FA) with one ship gate.
---

## User Input

```text
$ARGUMENTS
```

Arguments: `<version> <schema-version> <specs-from-figma-version> [react-from-specs-version] [webcomponents-from-specs-version]`
- First argument: the CLI version to release (e.g., `0.6.0`)
- Second argument: the @directededges/specs-schema version to reference (e.g., `0.16.0`)
- Third argument: the @directededges/specs-from-figma version to reference (e.g., `0.7.0`)
- Fourth and fifth (optional): the closed transform versions to reference (e.g. `0.1.0 0.1.0`). Pass them whenever those packages were released in this cycle; omit to keep the ranges already committed.

You **MUST** have the first three values before proceeding. If any are missing, ask for them.

**The CLI depends on two closed transform packages.** `@directededges/react-from-specs` and `@directededges/webcomponents-from-specs` are imported at the top level of the CLI's target commands, so a published CLI that names a version not on the registry is broken on install — `npm i @directededges/specs-cli` fails to resolve, before any command runs. Two consequences this agent enforces:

- They must already be **published** when the CLI publishes. The orchestrator releases them first; the verify script checks the registry rather than trusting it.
- Unlike every other cross-repo dependency, these carry a **version range even during development** (local resolution comes from forced symlinks, not from the manifest). So the committed range is the only thing pointing at them, and a stale range is invisible locally while being fatal for consumers.

## Working Directory

All commands in this agent run from the **CLI package directory**: `packages/cli` (relative to repo root). Use absolute paths for file reads, but run shell commands from `packages/cli`.

`$WORKSPACE_ROOT` below is the specs-local-workspace directory (typically `../specs-local-workspace` relative to this repo). **Running this agent directly, outside the orchestrator?** Run the workspace preflight first: `bash "$WORKSPACE_ROOT/.claude/scripts/release-preflight.sh" specs-cli`.

## Outline

0. **Ensure a tracking PR exists for this release branch** — do this FIRST, before any other step, every time this agent runs. An in-flight release must always be discoverable in `gh pr list` so a release branch can never be silently abandoned.
   1. Confirm the current branch matches `release/*`. If not, STOP and report — this agent only runs from a release branch.
   2. Check for an existing PR:
      ```bash
      gh pr list --repo DirectedEdges/specs --head "$(git branch --show-current)" --state all --json number,state,isDraft --jq '.[0]'
      ```
   3. If no PR exists, push the branch and create a **draft** PR immediately:
      ```bash
      git push -u origin "$(git branch --show-current)" 2>/dev/null || true
      gh pr create --draft --base main --head "$(git branch --show-current)" \
        --title "release: $(git branch --show-current)" \
        --body "Draft release PR — opened automatically by CLI.release agent so the in-flight release is visible. Versions, CHANGELOG, build, tests, and publish will be finalized before this is marked ready."
      ```
   4. Report the PR URL and continue.

1. **Verify dependency references** in `packages/cli/package.json`:
   - `@directededges/specs-schema` matches `^[schema-version]`
   - `@directededges/specs-from-figma` matches `^[specs-from-figma-version]`
   - `@directededges/react-from-specs` and `@directededges/webcomponents-from-specs` match the versions passed (when passed)
   If any is a `file:` path or a mismatched version, run the workspace ref swap (or ask, if the mismatch looks intentional):
   ```bash
   bash "$WORKSPACE_ROOT/.claude/scripts/set-references-publish.sh" [schema-version] [specs-from-figma-version] [rfs-version] [wcfs-version]
   ```

2. **Mechanical verification** — version match, CHANGELOG mechanics, working-tree state, `file:`-ref detection, and registry resolution of both closed transform deps, in one script call:
   ```bash
   bash "$WORKSPACE_ROOT/.claude/scripts/release-repo-verify.sh" specs-cli [version]
   ```
   - Relay the output. **Any FAIL stops the release.** A `cli-deps` FAIL means a closed transform is not on the registry — release it first (the orchestrator's dependency order exists for this); publishing the CLI against a missing dependency ships a package nobody can install.
   - A WARN that the entry is undated is expected: replace its `- Unreleased` with today's date now.
   - CHANGELOG **prose quality is not checked here** — entries and the Summary paragraph are authored during the cycle (the `changelog` skill owns the voice rules). If the entry is missing entirely, STOP: fix via `/changelog`, don't improvise at release time.

3. **Write the Dependency updates subsection** (the one authoring step that can only happen at release, because only now are the upstream versions final). In the `[version]` CHANGELOG entry, add or update a **Dependency updates** subsection:
   1. Extract each upstream entry by script rather than reading whole files:
      ```bash
      node "$WORKSPACE_ROOT/.claude/scripts/release-notes-extract.mjs" packages/schema/CHANGELOG.md "[schema-version]"
      node "$WORKSPACE_ROOT/.claude/scripts/release-notes-extract.mjs" "$WORKSPACE_ROOT/../specs-transforms/packages/specs-from-figma/CHANGELOG.md" "[specs-from-figma-version]"
      ```
   2. Summarize in plain language what these upstream changes mean for CLI users — user-visible behavior (new output fields, changed data shapes, corrected values), written from the CLI user's perspective ("Specs now include..." not "The transformer refactored..."). Skip it only when both upstream versions are unchanged from the last CLI release.

4. **Build** — the build-posture hook denies `npm run build*` here; run the script's underlying commands directly, substituting the release version for `$npm_package_version` (which only exists under `npm run`):
   ```bash
   cd packages/cli
   npx esbuild src/bin/specs.ts --bundle --platform=node --target=node18 --format=esm --packages=external \
     --define:__SPECS_CLI_VERSION__='"[version]"' --loader:.md=text --loader:.yaml=text \
     --outfile=dist/specs.js --banner:js='#!/usr/bin/env node'
   chmod +x dist/specs.js
   rm -rf dist/storybook-templates && cp -R src/storybook/templates dist/storybook-templates
   cp ../../README.md README.md
   npx esbuild src/bridge/server.ts --bundle --platform=node --target=node18 --format=esm --packages=external --outfile=dist/bridge-server.js
   chmod +x dist/bridge-server.js
   ```
   **Never skip the bridge-server build** — it is a second bundle, and a stale `dist/bridge-server.js` silently drops render payload fields. If the `build` script in `packages/cli/package.json` has changed since this was written, its commands win — mirror them.
   If the build fails, STOP.

5. **Run tests**:
   ```bash
   cd packages/cli && npm test
   ```
   If tests fail, report the failures and ask the user whether to proceed or abort.

6. **Present setup summary**:
   ```
   @directededges/specs-cli v[version] — Setup Summary
     ✓ Mechanical checks: passed (release-repo-verify.sh, incl. closed transforms on registry)
     ✓ Dependencies: specs-schema → ^[schema-version], specs-from-figma → ^[fts-version]
     ✓ Dependency updates subsection: written
     ✓ Build: passed (specs.js + bridge-server.js)
     ✓ Tests: passed (or ⚠ with note)
   ```

7. **Ship gate** — the one gate. Use `AskUserQuestion` with Yes/No options: **"Ready to commit, tag, publish (your 2FA step), and finalize @directededges/specs-cli v[version]?"**
   On Yes, run the whole sequence below without further gates; stop only on a failure.
   1. Commit (if there are uncommitted changes):
      ```bash
      git add -A && git commit -m "release: @directededges/specs-cli v[version]"
      ```
   2. Tag (scoped for monorepo):
      ```bash
      git tag -a "specs-cli@[version]" -m "release: @directededges/specs-cli v[version]"
      ```
   3. **Publish — local, 2FA, user-run (GO-FORWARD DEFAULT).**

      `@directededges/specs-cli` is configured on npm to **require 2FA and disallow automation tokens**, so the `.npmrc.public` token path fails with 403 and CI OIDC Trusted Publishing is not used. The package owner (Nathan) publishes it himself with his personal login + a one-time password. **You (the agent) cannot run this step — you can't enter the OTP.** Print the exact commands for the user to copy-paste, then wait for his word.

      Present this block verbatim (paths are absolute):
      ```bash
      # 1. One-time per session: log in as yourself (NOT the automation token)
      npm whoami || npm login
      # 2. Publish (npm will prompt for your 2FA OTP)
      cd "/Users/nathanacurtis/Github Desktop/spectacular/packages/cli" && npm publish --access public
      ```
      Do **not** pass `--userconfig .npmrc.public` here — that forces the rejected automation token. Tell the user to look for npm's `+ @directededges/specs-cli@[version]` success line.

      When he says it's done, verify from the registry — one check, no polling loop:
      ```bash
      npm view @directededges/specs-cli version   # must report [version]
      ```
      **Only a verified publish continues.** If publish failed with "previously published version", report and ask whether to bump the patch or skip.

      > **CI Trusted Publishing (`release-cli.yml`) is NOT the go-forward path.** It remains in the repo but is not used: the 2FA-required package plus an unresolved `setup-node`/OIDC token-fallback issue made it unreliable, and Nathan prefers per-release local 2FA (cheaper than debugging CI). Details in [Trusted Publishing (CI)](#trusted-publishing-ci--alternative-publish-path) below.
   4. Push, including the tag:
      ```bash
      git push --follow-tags
      ```
   5. Post-commit check — no undated heading survived:
      ```bash
      bash "$WORKSPACE_ROOT/.claude/scripts/release-repo-verify.sh" specs-cli [version] --post-commit
      ```
   6. Collect issue references for the PR body:
      ```bash
      bash "$WORKSPACE_ROOT/.claude/scripts/release-collect-closes.sh" . DirectedEdges/specs
      ```
      Append the printed `Closes <ref>` lines to the PR body, one per line, so issues auto-close when this PR merges to main.
   7. Finalize the tracking PR — mark it ready and update title/body:
      ```bash
      PR_NUM=$(gh pr list --repo DirectedEdges/specs --head "$(git branch --show-current)" --state open --json number --jq '.[0].number')
      gh pr ready "$PR_NUM"
      gh pr edit "$PR_NUM" --title "release: @directededges/specs-cli v[version]" --body "$(cat <<'EOF'
      ## Summary
      - Release @directededges/specs-cli v[version]
      - Compatible with @directededges/specs-schema ^[schema-version] and @directededges/specs-from-figma ^[fts-version]
      - See packages/cli/CHANGELOG.md for details

      [collected Closes #N lines, one per line]
      EOF
      )"
      ```
      If no PR exists at this point (step 0 was skipped), create one with `gh pr create --base main --head <branch> --title "..." --body "..."`.
   8. Create the GitHub Release (scoped tag), with notes extracted by script:
      ```bash
      node "$WORKSPACE_ROOT/.claude/scripts/release-notes-extract.mjs" packages/cli/CHANGELOG.md "[version]" > /tmp/notes-specs-cli.md
      gh release create "specs-cli@[version]" --title "@directededges/specs-cli v[version]" --notes-file /tmp/notes-specs-cli.md
      gh release view "specs-cli@[version]" --json url --jq '.url'
      ```
   9. Report the PR URL and release URL, and say plainly that the shared specs PR is ready to merge.

## Trusted Publishing (CI) — alternative publish path

There are **two ways** to publish `@directededges/specs-cli`, and they are mutually exclusive **per version** (publishing once makes the version immutable):

| | Local 2FA publish (default) | CI Trusted Publishing |
|---|---|---|
| Where | Your machine, this agent's ship gate | GitHub Actions (`.github/workflows/release-cli.yml`) |
| Auth | Personal login + OTP | Short-lived OIDC token minted per run (no stored secret) |
| Provenance | No | Yes (signed attestation, public repo + public package) |
| Trigger | Interactive (ship gate here) | `workflow_dispatch` with the tag, gated by the `npm-publish` environment |

This workflow exists **in addition to** the local flow and does not retire it. Trusted Publishing cannot run from a laptop — only from GitHub-hosted runners — so the local path remains the fallback (and the only option for any urgent hotfix you can't route through CI).

**To release a version via CI instead of locally:**

1. Run this agent through the ship gate's commit + tag (steps 7.1–7.2), but **skip the local `npm publish`** (step 7.3).
2. `git push --follow-tags` so the `specs-cli@<version>` tag reaches GitHub.
3. Trigger the workflow on that tag:
   ```bash
   gh workflow run release-cli.yml --repo DirectedEdges/specs -f tag=specs-cli@[version]
   ```
4. Approve the run if the `npm-publish` environment requires it, then continue the finalize sequence (PR ready + GitHub Release) as usual.

**One-time setup (must be done before CI publish works):**

- On npmjs.com → `@directededges/specs-cli` → Settings → **Trusted Publisher**: register owner `DirectedEdges`, repository `specs`, workflow filename `release-cli.yml`.
- (Recommended) Create a GitHub **Environment** named `npm-publish` with required reviewers, for a manual-approval gate equivalent to the ship gate.

## Key rules

- Use absolute paths for all file operations.
- All shell commands run from `packages/cli` unless they are git or gh commands (which run from repo root).
- **Tag format**: `specs-cli@[version]` — scoped to distinguish from schema releases in the same repo.
- **One gate: ship.** The agent commits + tags; the **user** runs the 2FA `npm publish`; the agent verifies via one `npm view`, then push, PR ready, and GitHub release run automatically.
- If any verification step fails, halt immediately — do not skip to later steps. For test failures, ask the user whether to proceed.
- The committed state has **versioned** dependency references (not `file:` paths). This is intentional — `file:` paths are a local development convenience, not committed to GitHub.
- If any step fails after refs were swapped, run `git restore packages/cli/package.json` before reporting the error.
- Cleanup (branch deletion after PR merge) is handled by the release orchestrator, not this agent.
