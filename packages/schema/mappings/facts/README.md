# Concept fact tables

**These files are the authoritative declaration of the role and action vocabularies' machine-readable facts** — the inversion ruled in the a2ui spike (DirectedEdges/spectacular#961), following the precedent the style mappings set in specs#691: facts live in data, prose lives in pages, and generation keeps them from drifting.

| File | Declares | Consumed by |
|---|---|---|
| `roles.json` | Per role concept: accepted element types and parts, native states, contract obligations, resolution flags | `site/scripts/build-concept-facts.mjs` (generated page blocks); `from-specs`' `ROLE_SPECS` must agree (parity test in that package) |
| `actions.json` | Per action concept: event name, payload plan, user message, activation requirement, status | Same generator; `from-specs`' `ACTION_SPECS` must agree |

The division of authority:

- **Facts** (everything these files hold): declared here. A docs page's fact tables are generated from this data and are not hand-edited; the TS tables in `from-specs` are typed copies pinned by a parity test.
- **Meaning** (what a concept is, the role-vs-action admission test, routing guidance, deliberate non-behaviors): the docs pages' hand-written prose remains the specification, exactly as before.

To change a fact: edit the JSON here, re-run the generator (`node site/scripts/build-concept-facts.mjs`), and update the TS table — the parity test fails until all three agree.
