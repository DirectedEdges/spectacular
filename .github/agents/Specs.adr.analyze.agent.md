---
description: Assess an implemented ADR's downstream impact package by package — read each consumer's source against the new surface and write one adoption analysis carrying the depth the ADR cannot.
handoffs:
  - label: Accept ADR
    agent: Specs.adr.accept
    prompt: Downstream analysis written — mark the ADR as ACCEPTED
    send: true
---

**Territory: schema, read-only everywhere else.** Runs between `/specs.adr.implement` and `/specs.adr.accept`. Before proceeding, read `CLAUDE.md` and `ARCHITECTURE.md` at the repo root if not already loaded this session.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Purpose

An ADR's Downstream Impact table is deliberately shallow: Constitution III forbids an ADR from describing any consumer's internals, so the table names consumers and observable surface only. This command is where the depth goes — it reads each consumer package's actual source against the ADR's new surface and writes **one adoption analysis document** per ADR into the workspace: `specs-local-workspace/adr/NNN/plan.md`.

**The analysis is never published to GitHub** — no issue, no PR body, no repo file. It cites file paths and internals of packages that are published obfuscated to protect IP; the workspace is the only home that keeps that detail private while staying at hand for adoption work.

## Scope — read everywhere, write only the workspace analysis

- **Read-only outside the workspace.** Inspect `specs-transforms` packages and `spectacular-plugin` freely; never edit, build, branch, or commit in them.
- **No fixes.** This command assesses; adoption work happens later, per package, in dependency order.
- The only writes are the analysis document at `specs-local-workspace/adr/NNN/plan.md` and the one-line pointer in the ADR (step 7).

## Outline

1. **Setup**: Run `scripts/check-prerequisites.sh --json --paths-only` from repo root. Derive `ADR_NAME` from `BRANCH` (must match `###-short-description`; halt otherwise). Read `adr/$ADR_NAME.md` in full.

2. **Extract the surface**: From the ADR's Decision section, list every new or changed type, field, schema key, and convention — these are the search terms for step 4.

3. **Consumer roster** (the implement skill's dependency tiers; confirm against each package's `package.json` rather than assuming):
   - Tier 2 — `specs-from-figma`, `figma-from-specs`, `from-specs` (all in `specs-transforms`), and `spectacular-plugin` (compiles the first two from source)
   - Tier 2b — `react-from-specs`, `webcomponents-from-specs` (depend on `from-specs`)
   - Tier 3 — `specs-cli` (this repo)

4. **Per-package assessment**: For each package, locate where the changed surface is consumed — exhaustive switches over changed unions, reads of changed conventions/settings, handling of changed value shapes — and classify:
   - **Breaks compile** — the package cannot build against the new types until changed
   - **Silent pass-through** — compiles, but new data flows through unhandled (the dangerous class; name where it drops)
   - **Behavior gap** — compiles and flows, but the feature is inert until the package acts (name the observable behavior required)
   - **None** — genuinely unaffected; say why in one line
   For each non-None package, enumerate concrete work items in terms of that package's *observable behavior* (what it must read, emit, render, or surface — including UI affordances such as plugin settings controls), plus the verification method (which test suite, round-trip, or parity check proves it).

5. **Clarify requirements** — the assessment will surface questions the ADR does not answer: presentation behavior, interaction between the new surface and existing output, precedence and defaults. These are requirements decisions, not analysis findings. Collect them, then resolve each with `AskUserQuestion`, naming 2–4 concrete options with their consequences — never bury an open requirement in the document as a hedge or a "TBD". Example shape: *does each enum member of an object prop get its own output section, sweeping that member with every other prop — sibling members included — at its default?* Record each answer in the analysis under the owning package as a **Requirement** line the work items then honor.

6. **Write the adoption analysis** to `specs-local-workspace/adr/NNN/plan.md` (the format is the one ratified on `adr/111/plan.md` — match it):
   - Title: `ADR-NNN adoption: <topic>`, with an "Analyzed <date> against <branch>" line
   - A framing paragraph linking the ADR, then the impact-class legend table
   - A summary table: `Package | Impact | Work items | Verification`
   - One `##` section per package: an impact narrative, a checklist of work items phrased as observable behavior with `file:line` anchors, and a verification line; packages genuinely unaffected get one line saying why
   - An adoption-order section mapping work to the dependency tiers, naming anything that jumps the queue (a gate that blocks end-to-end verification goes first)
   - A cross-cutting risks section for patterns that only emerge from reading all packages together (recurring bug shapes, failures that surface in generated code, signature symptoms)

7. **Pointer in the ADR**: Append one line to the ADR's Downstream Impact section: `` Per-package adoption analysis: `specs-local-workspace/adr/NNN/plan.md` (maintained outside this repo). `` The path only — never any analysis content (Constitution III, and the IP rule above).

8. **Report**: A table — `Package | Impact class | Work items | Verification` — followed by the analysis file path. State that `/specs.adr.accept` is the next step and that acceptance does not require adoption to be complete.

## Key rules

- The ADR stays internals-free (Constitution III); the workspace analysis is where internals live. One document per ADR, not per package.
- **Never copy analysis content into GitHub** — not into the ADR, an issue, a PR body, or a repo file. The cited packages are published obfuscated; their internals stay in the workspace. The ADR's pointer line (step 7) is the one sanctioned mention: the path, nothing more.
- Classify honestly: a package that compiles but drops new data on the floor is **Silent pass-through**, not None — that class is the reason this command exists.
- If fanning out read-only subagents to cover packages in parallel, state the cost expectation before launching and report actuals.
- Use absolute paths for all file operations.
