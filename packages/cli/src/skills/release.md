---
name: specs-cli.release
description: Release a spec workspace — pre-release report and changelog from the ledgers, human review, then cut the version, tag, and publish sequence with a stop at every gate.
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

# Release

Accumulate what changed since the last release, put the report and itemized changelog in front of a human, then cut, tag, and publish — stopping at every gate.

All content is scripted. This skill sequences commands and stops; it never drafts or polishes report/changelog content and never invents version numbers.

## Steps

1. **Pre-release report and changelog** (from ledger diffs since the last release):

   ```bash
   specs version report
   ```

2. **GATE — human reviews.** Hand over the report and changelog and stop. The reader decides the release proceeds — or does not.

3. **Cut the version.** After an explicit go-ahead:

   ```bash
   specs version cut
   ```

   If the human directed an override, pass it with its reason, exactly as given: `--force-major "…"`, `--force-minor "…"`, or `--force-patch "…"`.

4. **Tag** only when the human asks for it:

   ```bash
   specs version tag
   ```

   (defaults to the newest cut version). Tags are never pushed by this skill — pushing is a manual act.

5. **GATE — publish sequence.** Whatever ships the release (npm publish, docs, announcements) happens outside this skill, after another explicit go-ahead.

