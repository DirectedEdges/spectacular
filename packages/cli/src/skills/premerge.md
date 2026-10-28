---
name: specs-cli.premerge
description: Pre-merge impact report for a Figma feature branch — one command fetches both sides, generates both spec trees, and diffs them; stop for a human read of the report before any merge proceeds.
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

# Pre-merge report

Compare the specs a Figma feature branch produces against the specs main produces, and put the graded impact report in front of a human before the merge.

All content is scripted. This skill only sequences commands and stops at the gates — it never writes or edits report content, never summarizes the diff in its own words, and never decides whether the merge proceeds.

## Steps

1. **Run the pipeline** from the workspace (it needs `config/` and a `FIGMA_TOKEN` in the workspace `.env`), passing the Figma branch URL:

   ```bash
   specs version figmapremerge "<figma branch URL>"
   ```

   The command fetches both sides in parallel, generates both spec trees, diffs them, and writes the run under `versions/diffs/<date>-<branch>/` — the report is `report.md` in that folder, and it also prints to stdout. By default only the report and the impacted components' specs are kept; pass `--keep-data` to retain both full spec trees and the fetched payloads.

2. **GATE — human reads the report.** Hand over the report path and stop. Do not summarize it, grade it, or soften it. The reader decides whether the merge proceeds.

3. Only after an explicit go-ahead does the merge continue, outside this skill.

