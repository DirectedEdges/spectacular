---
title: About Spectacular
description: Why structured component specs exist, the principles behind them, and how they fit into design system workflows.
---

Design systems produce components — but the knowledge embedded in those components stays locked inside design tools. Anatomy, props, variants, token usage, layout rules: all of it lives as visual layers in Figma, invisible to the systems that need it most. Spectacular treats [components as data](https://nathanacurtis.substack.com/p/components-as-data-2be178777f21), extracting that knowledge into structured, portable specifications through a systematic [analysis of variants](https://nathanacurtis.substack.com/p/analysis-of-variants-9e440c30b93e). The result is a complete picture of every component — available as [specs on command](https://nathanacurtis.substack.com/p/figma-component-specs-on-command) from the terminal or from within Figma itself.

## What It Is

Spectacular is a deterministic engine that reads Figma components and produces complete, machine-readable specifications in YAML or JSON. A spec captures everything about a component: its **anatomy** (element hierarchy), **props** (types, enums, defaults), **styles** (values and token references), and **variants** (how prop combinations change styles across elements).

The output is compact. A Button component that spans 42,000+ lines and 26,000+ properties in raw Figma JSON compresses to ~400 lines of structured spec — a 99%+ reduction — while preserving every design decision.

## Why It Matters

Component specifications sit at the center of design-to-code workflows. Without them, teams either write documentation by hand (slow, always stale) or rely on AI to interpret raw Figma data (unpredictable, expensive, hallucination-prone).

Spectacular takes a different position: **never rely on a predictive model when you can count something directly.** At the specification layer, every property is enumerable, every variant combination is finite, every style override is computable. Computation wins over inference for problems with known, deterministic answers.

This matters practically because structured specs become the primary input for downstream work — code generation, documentation, quality audits, cross-platform parity — without requiring AI to rediscover component architecture on every run.

## Principles

**Deterministic.** Same input, same output, every time. No run-to-run variation, no renamed properties, no restructured data.

**Complete.** Every valid variant combination is analyzed — including multi-prop interactions that manual inspection misses. The spec captures the full component, not a sample.

**Compact.** Variants record only what changes. If a prop override affects one style on one element, only that difference is stored. No duplicated hierarchies or redundant property listings.

**Human-readable.** Specs are structured for people to scan: defaults first, grouped overrides, consistent naming. Designers review them for intent and correctness; developers read them as implementation guides.

**Platform-independent.** Specs describe components in neutral terms — token references, element types, layout rules — not Figma layer names or React prop signatures. The same spec serves iOS, Android, web, and documentation.

**Versionable.** Plain text files track in Git. When a component changes, the diff shows exactly what changed — a border radius, a new variant, a removed prop — not a binary blob.

## How It Works

Spectacular runs in two environments, both powered by the same processing engine ([`@directededges/specs-from-figma`](/)):

- **CLI** — The [`specs` command line tool](/cli/) fetches component data via Figma's REST API, then generates specs locally. Best for batch processing entire libraries, CI integration, and version-controlled output.
- **Figma Plugin** — Runs inside Figma using the Plugin API for real-time, single-component generation during design work.

Both produce identical output from the same input. The difference is context: the CLI operates on cached file data for efficiency at scale, while the plugin provides immediate feedback during design iteration.

## Where It Fits

Spectacular occupies the **extraction layer** between design tools and everything downstream:

1. **During design** — Generate a spec to validate that a component's props, variants, and tokens are complete and correct before handoff.
2. **At handoff** — Provide developers with precise, structured data instead of annotated screenshots or manual redlines.
3. **In code generation** — Feed specs to AI agents as pre-processed context, eliminating the need to crawl raw Figma data and reducing token costs by orders of magnitude.
4. **For documentation** — Auto-generate reference pages that stay synchronized with the source of truth.
5. **Across platforms** — Use a single spec to drive implementations on web, iOS, and Android without re-extracting from Figma.
6. **For quality audits** — Surface inconsistencies (raw hex values instead of tokens, missing variants, naming mismatches) that visual inspection misses.