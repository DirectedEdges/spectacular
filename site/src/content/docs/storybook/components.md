---
title: "Components"
description: "One sidebar entry per component, expanding to a view per platform and per spec document."
---

The sidebar lists each component once, under **Components** — not once per
framework. The component's name is a folder, and it expands to one entry per
view of that component.

## The views under a component

| View | Shows | Present when |
|---|---|---|
| **React** | The React docs page — a live example, a controls table generated from the props, and every emitted story | You ran `specs react` |
| **React — Testing (Fidelity)** | This component's variants diffed against its Figma exports | A fidelity report exists for React |
| **React — Testing (Changes)** | The same variants diffed against the renders you last accepted | A regression report exists for React |
| **Web component** | The same component's Lit output, same stories | You ran `specs webcomponents` |
| **Web component — Testing (Fidelity)** | The Lit output diffed against the Figma exports | A fidelity report exists for Web Components |
| **Web component — Testing (Changes)** | The Lit output diffed against the accepted renders | A regression report exists for Web Components |
| **API** | The authored `api.yaml`, formatted | **Always** |
| **Variants** | The authored `variants.yaml`, formatted | **Always** |

The set follows from what your workspace actually contains. A platform you never
emitted contributes no views, and a Testing view appears only once a report
exists for it to read — so a workspace that has never run a diff shows the four
views it can answer. API and Variants are always there because they do not depend
on a transform having run: a workspace that emits nothing still has a complete,
browsable component list.

The Testing views show one component's variants in full. The pages under
**Testing** in the sidebar do the opposite — they rank every component against
every other.

Only a component or a composition expands this way. A Foundations page has no
platform split, so it has no views.

## Subcomponents

A component with subcomponents (Alert with its Actions, say) nests them: the
component's own views sit directly under it, and each subcomponent is a folder
beside them with views of its own.

## Stories on the docs page

Every story down a platform's docs page carries **Show code** and **Open full
screen**. The stories themselves come from your specs — the examples and
variants you authored — via `specs react` / `specs webcomponents`, not from this
command.
