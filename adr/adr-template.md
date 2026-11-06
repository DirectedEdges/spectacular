# ADR: [TITLE]

**Branch**: `[###-short-name]`
**Created**: [DATE]
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Deciders**: [Author] (author), [name], [name]
**Supersedes**: *(none, or link to prior ADR)*

---

## Context

<!--
  What is the situation forcing this decision?
  Include: current state of types/schema, what consumer behaviour or gap drives this,
  and any external constraints (downstream packages, semver commitments, etc.)
-->

[Describe the current state and the problem or opportunity being addressed]

---

## Decision Drivers

<!--
  What forces are shaping this? Enumerate the constraints and goals that any
  acceptable solution must satisfy. These become the evaluation criteria for
  options considered below.
-->

- **[Driver 1]**: [e.g., additive-only change to avoid MAJOR bump on downstream consumers]
- **[Driver 2]**: [e.g., type and schema must remain in sync — no drift permitted]
- **[Driver 3]**: [e.g., no runtime logic may be added to this package]

---

## Options Considered

<!--
  If the decision was made prior to this ADR (pre-decided), replace the options
  below with a single entry: *(Pre-decided — no alternatives evaluated)* and a
  brief note explaining where or how the decision was reached.

  Otherwise: describe each option, evaluate it against the Decision Drivers above,
  and state why it was accepted or rejected.
-->

### Option A: [Name] *(Selected)*

[Description of the approach]

**Pros**:
- [Reason it satisfies driver X]
- [Reason it satisfies driver Y]

**Cons / Trade-offs**:
- [Any downside or limitation]

---

### Option B: [Name] *(Rejected)*

[Description of the approach]

**Rejected because**: [Specific driver it violates or problem it introduces]

---

### Option C: [Name] *(Rejected)*

[Description of the approach]

**Rejected because**: [Specific driver it violates or problem it introduces]

---

## Decision

<!--
  State precisely what is changing: which types, which fields, which schema files.
  Use the tables for the change inventory and YAML examples to show the new shape.
  This section is the authoritative record of what was decided.
-->

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `[Filename].ts` | [Added / Removed / Renamed field `x`] | MAJOR / MINOR / PATCH |

**Example — new shape** (`types/[Filename].ts`):
```yaml
# Before
[TypeName]:
  existingField: string

# After
[TypeName]:
  existingField: string
  newField?: string   # optional — MINOR
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `[filename].schema.json` | [Added / Removed / Renamed property `x`] | MAJOR / MINOR / PATCH |

**Example — new shape** (`schema/[filename].schema.json`):
```yaml
# New property under #/definitions/[TypeName]/properties
newField:
  type: string
  description: "[What this field represents]"
  # not in required[] — optional field
```

### Notes

[Any additional detail, e.g., why a field is optional vs required, naming rationale, etc.]

---

## Type ↔ Schema Impact

<!--
  Confirm the change is symmetric: every type change has a schema counterpart
  and vice versa. Flag any intentional asymmetries and justify them.
-->

- **Symmetric**: [Yes / No — if No, explain why]
- **Parity check**: [Describe which type maps to which schema property]

---

## Downstream Impact

<!--
  Which packages consume the types/schema being changed?
  What do they need to do after this ADR is accepted and published?
-->

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-cli` | [None / Recompile / Update usage] | [e.g., the new config field reaches the engine] |

---

## Semver Decision

**Target version**: `[VERSION]` — the version of the active release branch this ADR merges into.

**Change class**: `MAJOR` / `MINOR` / `PATCH` — for CHANGELOG placement, not a version bump.

**Justification**: [State which constitution rule applies — e.g., "All changes are additive optional fields → MINOR-class per constitution III"]

---

## Consequences

<!--
  What becomes true after this ADR is accepted and implemented?
  Include both positive outcomes and any new constraints or risks introduced.
-->

- [e.g., Consumers can now represent X in the spec output]
- [e.g., Any tool validating against schema/* must update to the new version]
- [e.g., Old optional field Y is now deprecated — will be removed in next MAJOR]
