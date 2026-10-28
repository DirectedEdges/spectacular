---
title: "roles"
description: "Report which anatomy elements declare a role, which do not, and where a declaration disagrees with itself"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge experimental-badge">Experimental</span>')</script>

Reads every component's `api.yaml` and produces `analysis/roles.yaml`: which elements declare a [role](/roles/), which are bare, which concepts the library uses and which it has never reached for, and the declarations that disagree with themselves.

[Roles](/roles/) are the one input in the vocabulary with no acquisition path. Every other fact about a component is observable in Figma; a role is a human judgment, annotated one layer at a time in Dev Mode. So a library adopting them needs a measure before it starts — and the same report, run again, is what shows a sweep landed.

## What it reports, and what it does not

This reads specs and nothing else. It reports what they **carry**, never what they should carry. Which role belongs on an element is a judgment, and a report that guessed would be confidently wrong often enough to cost you your trust in the rest of it.

Two consequences worth knowing up front:

- **An unrecognized concept is reported, not rejected.** `anatomy.role` is an open string and transforms ignore concepts they do not know, so `chekbox` is a likely typo rather than a broken spec. It is listed as a finding and still counted as a use, because the spec does carry it.
- **A part role on a component with no control is not a finding.** A label component carrying `label` declares that it *provides* that part; it emits the element and an id and no wiring, because it has nothing to wire to. The wiring arrives when it is composed.

Reading roles out of Figma requires [`settings.spec.roles`](/schema/settings/). With it off, specs carry no roles and this report correctly shows none.

## Use When

- You are about to adopt roles across an existing library and want the starting measure.
- You want the list of bare elements, with their types, as the candidates to work through.
- You want to confirm an annotation sweep landed, by diffing the aggregate between runs.
- You want to find a concept your library uses that no transform emits yet, so the annotation is inert.
- You want to catch a routed part that its provider does not actually offer.

## Invocation

```bash
specs analyze roles
```

## Output

Writes a single file to `analysis/` after all components are processed.

```
specs/
  analysis/
    roles.yaml   # cross-library aggregate
```

Compositions are not read: a composition declares no anatomy of its own, so rows for it would be empty by construction and would dilute every per-component figure.

## Sections

### summary

The shape of the library's adoption.

```yaml
summary:
  components: 69
  componentsAnnotated: 0
  elements: 412
  elementsAnnotated: 0
  conceptsInUse: {}
  conceptsUnused:
    - alert
    - button
    - checkbox
    # … every concept nothing references
  conceptsInertInUse: {}
  findings: 0
```

`conceptsInUse` is ordered most-used first, so the shape of adoption is the first thing you read. `conceptsUnused` is the other half of the same picture: what is available and untouched.

`conceptsInertInUse` names concepts the library annotates that emit nothing yet, with their status from the [Inventory](/roles/inventory/) — `specified` where a page is the specification, `none` where no page describes it in detail. Inert is not invalid: the spec carries the role and every transform ignores it, so nothing breaks and nothing changes. It is listed so that annotating a `spinbutton` and seeing no change in the output is not a surprise.

### byComponent

Per component, what is declared and what is bare.

```yaml
byComponent:
  checkbox:
    annotated: 0
    unannotated: 6
    bare:
      root: container
      control: container
      text: container
      fieldLabel: text
      fieldDescription: text
      indicator: glyph
```

`bare` carries each unannotated element's `type`, because the type is the first thing that narrows which role could apply — a `glyph` that appears in some variants is a different candidate from a `text` element beside a control. Once elements are annotated, `roles` appears alongside it.

### findings

Declarations that disagree with themselves. Omitted entirely when there are none.

```yaml
findings:
  - kind: multiple-roles-on-owned-element
    component: checkbox
    element: control
    detail: declares 2 roles (checkbox, switch) on an element the component owns, where …
```

| Kind | Means |
|---|---|
| `multiple-roles-on-owned-element` | An element the component owns carries more than one role, where the question of what it *is* has one answer. A list is meaningful only on an `instance`, where it routes rather than claims |
| `routed-concept-not-provided` | An `instance` routes a concept the component it instantiates does not ascribe. The consumer asserts and the provider declares, and the two must agree |
| `unknown-concept` | A value outside the documented vocabulary — almost always a typo |
| `malformed-role-value` | A value no reader would recover at all, such as `Role: Button`. A concept is a single lowercase alphanumeric token |

`routed-concept-not-provided` is the finding only a library-wide pass can reach, because it needs both sides. Nothing reads across the component boundary at emit time to resolve a routed concept — the agreement is checked rather than discovered — so a mismatch is otherwise invisible until the generated code is wrong. It is reported only when the provider is part of the same run; a scoped run that excludes the provider stays quiet rather than reporting a disagreement it cannot see.

---

**See Also:**

- [Roles](/roles/) — what a role is, how one is authored, and the vocabulary
- [Choosing a role](/roles/choosing/) — which of two plausible roles an element takes
- [Inventory](/roles/inventory/) — every concept and whether anything emits for it yet
- [`analyze`](/cli/commands/analyze/) — the command reference: arguments, options, exit codes
