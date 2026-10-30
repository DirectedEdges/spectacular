# Specs Schema Constitution

## Core Principles

### I. Types and Schema Are the Same Contract (NON-NEGOTIABLE)
`@directededges/specs-schema` publishes two interlinked artifacts: TypeScript types in `types/` and JSON schemas in `schema/`. They MUST describe the same structure at all times.

- Parity runs **both ways**. Every type in `types/` has a corresponding definition (direct or via reference) in `schema/component.schema.json` or its siblings, **and every named definition in those files has a named type**. Changes to one MUST be reflected in the other before publishing.
- A named definition is a name consumers read and cite. Leaving one without a type says the contract has a concept TypeScript cannot name — so extracting a definition for documentation's sake creates a type obligation, it does not escape one.
- The JSON schemas are the authoritative validation contract for serialized output. The TypeScript types are the authoritative compile-time contract for code consuming that output.
- Neither artifact may drift ahead of the other. Misalignment is a bug.

Rationale: Every consumer (`specs-from-figma`, `specs-cli`, `specs-plugin-2`) relies on both the TypeScript types for compilation and the JSON schemas for runtime validation. Drift between the two causes silent contract violations across all downstream packages.

### II. No Logic — Types and Schema Only
This package MUST NOT contain transformation logic, processing algorithms, or runtime behavior beyond:
- `DEFAULT_SETTINGS` exported from `Settings.ts`, `DEFAULT_PIPELINE` from `Pipeline.ts`, and `DEFAULT_CONVENTIONS` from `Conventions.ts`

All other exports MUST be pure type declarations (`type`, `interface`) or static schema files. No classes, no functions, no async operations.

Rationale: `@directededges/specs-schema` is the shared language definition for the Specs ecosystem. Embedding logic couples all consumers to implementation decisions that belong in `specs-from-figma` or `specs-cli`. If logic is needed, it belongs in a downstream package.

### III. Minimal, Stable, Intentional Public API
The exports from `types/index.ts` are the full public API. Every exported type is a contract with every consumer.

- New types require explicit justification: they MUST represent a genuine, shared concept in the Specs schema — not an internal implementation detail of any one package.
- Removing or renaming an exported type or a named field within a type is a breaking change and MUST follow semantic versioning.
- Schema exports (via `exports` in `package.json`) are equally contractual — adding, removing, or restructuring a schema file is a breaking change.
- The permitted runtime exports are `DEFAULT_SETTINGS`, `DEFAULT_PIPELINE`, and `DEFAULT_CONVENTIONS` — one defaults constant per configuration artifact (ADR-071). Adding a runtime export for anything else requires constitutional amendment.
- **ADRs and spec decisions MUST be justified by the shared contract's own coherence and the needs of all consumers equally. No single downstream package's internal model, class structure, or implementation detail may be cited as a decision driver or rationale. ADRs inform downstream packages; they are not driven by them.**

Rationale: All downstream packages compile against these types. Any change has a multiplied impact across `specs-from-figma`, `specs-cli`, and `specs-plugin-2` simultaneously. Allowing one package's internals to steer the spec contract creates an implicit ownership hierarchy that undermines the shared-language role of this package.

### IV. Schema Validity Must Be Mechanically Verifiable
The JSON schemas in `schema/` MUST be valid JSON Schema (Draft 7 or the declared draft).

- Schemas MUST be linted or validated as part of any change that touches `schema/`.
- `component.schema.json` is the primary schema and MUST match the `Component` type tree rooted in `types/Component.ts`.
- `styles.schema.json`, `components.schema.json`, and `root.schema.json` MUST remain internally consistent with `component.schema.json`.
- `reference/styles.yaml` is a reference data file, not a schema. Do not conflate the two.

Rationale: Downstream tools perform runtime validation against these schemas. An invalid or inconsistent schema silently passes TypeScript compilation but breaks all runtime validation consumers.

### V. Type Safety — No Implicit Any, Strict Mode
All TypeScript in `types/` MUST compile under strict mode with zero errors.

- `any` is forbidden without an inline justification comment.
- All type relationships must be explicit; structural `any`-escape hatches erode the schema contract.
- `tsconfig.build.json` governs compilation; it MUST NOT weaken `strict` settings.

Rationale: These types are a published contract. Loose typing undermines compilation safety for every consumer and masks schema drift.

### VI. Naming Governance — Code Platforms First
When naming types, fields, schema properties, enum members, or any other public identifier, follow this preference order:

1. Favor code platforms when 2+ agree on a term, convention, or shape.
2. When no code-platform consensus exists, favor a single code platform (commonly React or iOS) even if Figma differs.
3. Defer to Figma's vocabulary or model only when no code platform expresses a strong opinion *and* deviating from Figma's model would be substantially costly (data-faithfulness loss, transformer complexity, round-trip fidelity).

ADRs proposing new types, field names, or naming changes MUST cite which rule applies and, for rules 1 and 2, name the relevant code platforms.

Rationale: Figma is the data source for the schema, not the naming authority. The schema is consumed primarily by code generators, design-system tooling, and component documentation pipelines whose audiences think in code-platform terms. Defaulting to code-platform terms forces only the transformer (`specs-from-figma`) to translate; defaulting to Figma's terms forces every consumer to translate at its own boundary.

## Additional Constraints & Standards

- **Naming — no abbreviations**: Type names, field names, schema properties, and API identifiers MUST use full, unabbreviated words. Prefer `Operation` over `Op`, `Button` over `Btn`, `Configuration` over `Config`. Clarity takes priority over brevity in the public contract. Accepted exceptions: `Config` (grandfathered), `args` (universally understood shorthand for arguments).
- **Naming — enum casing in Styles**: String literal union types used as enum values in `Styles` and its child types (`Typography`, `Gradient`, `Effects`) MUST use `SCREAMING_CASE` (e.g., `'NONE'`, `'HORIZONTAL'`, `'SPACE_BETWEEN'`). Exception: values defined by external standards (e.g., DTCG `$type` values like `'color'`, CSS Color Level 4 color spaces like `'srgb'`) preserve their standard's casing.
- **Typing — structural enums vs. `Style`**: When a `Styles` property has a closed, known set of values and is **not token-bindable** (i.e., the value is structural or computed — never a `TokenReference`, `PropBinding`, or `Conditional`), it MUST be typed as a named type rather than `Style`. For string enums, define a string literal union (e.g., `LayoutMode`, `Position`) and type the property as `TypeName | null`. For non-string structural values, define a named narrow type (e.g., `PositionOffset` as `number | string | null`). Conversely, properties whose values may be token-bound, prop-bound, or conditional MUST use `Style` (or a domain-specific type like `ColorStyle`). Established examples: `LayoutMode`, `MainAxisAlignment`, `CrossAxisAlignment`, `WrapAlignment`, `Position`, `PositionOffset`.
- **Language/Tooling**: TypeScript strict mode (`tsconfig.build.json`); ESM only; no runtime dependencies permitted (devDependencies: `typescript` only).
- **Build**: `tsc -p tsconfig.build.json` emits `.js` shims into `dist/`. The source of truth is `types/*.ts` — `dist/` is a compatibility artifact only.
- **No test framework required** for a pure types/schema package, but schema consistency checks and type compilation serve as the quality gate.
- **Published files**: `dist/`, `types/`, `schema/`, `LICENSE`, `README.md`, `CHANGELOG.md`. Do not add files to the `files` array without justification.
- **Versioning**: `MAJOR` for any breaking change to a type signature, field name, field presence, or schema structure. `MINOR` for additive types or new optional fields. `PATCH` for documentation, comments, or formatting.
- **CHANGELOG.md** MUST be updated for every publish. Downstream consumers use it to evaluate upgrade cost.
- **`specs/` directory**: Feature work tracked under `specs/` follows the Spec Kit workflow. No spec output should be committed to `types/` or `schema/` without passing the Constitution Check.

## Development Workflow & Quality Gates

- Intent-First Flow: Use Spec Kit commands to structure work:
  - `/speckit.constitution` → uphold/modify these rules as the project evolves
  - `/speckit.specify` → define the feature's user intents and acceptance scenarios
  - `/speckit.plan` → capture architecture choices respecting this constitution
  - `/speckit.tasks` → generate actionable tasks honoring gates below
  - `/speckit.implement` → execute tasks in alignment with plan and constraints

- Constitution Check (MUST PASS before implementation):
  1. Change introduces only types, type-guards, constants, or schema — no algorithms or async logic.
  2. Every type added or changed has a corresponding schema update (or a documented, justified exception).
  3. Every schema change has a corresponding type update.
  4. `tsc -p tsconfig.build.json` exits with zero errors after the change.
  5. No new runtime dependencies added to `package.json`.
  6. Breaking changes are versioned `MAJOR`; additive changes `MINOR`; non-semantic changes `PATCH`. CHANGELOG updated.

- Reviews MUST verify each gate; violations require written justification and an explicit follow-up task.

## Governance

- **Authority**: This constitution governs development of `@directededges/specs-schema` and supersedes conflicting ad-hoc practices.
- **Amendments**: Propose changes via PR with: rationale, impact analysis (which downstream packages are affected and how), and migration plan.
- **Versioning Policy (for this constitution)**:
  - MAJOR: Backward-incompatible governance/principle changes or removals.
  - MINOR: New principle/section or materially expanded guidance.
  - PATCH: Clarifications, wording, formatting; no semantic change.
- **Compliance**: Reviewers MUST check Constitution Check items at every feature milestone and before any `MAJOR` or `MINOR` package version bump.

**Version**: 1.4.0 | **Ratified**: 2026-02-18 | **Last Amended**: 2026-05-11
