---
name: specs-cli.roles.apply
description: Apply the approved roles from reports/<YYYY-MM-DD>.roles.proposal.md to the Figma file as Dev Mode annotations, one page at a time, then prove the round trip.
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

# Apply roles

Add the approved roles from `reports/<YYYY-MM-DD>.roles.proposal.md` to the live Figma file as Dev Mode annotations, page by page, then regenerate and measure.

This skill decides nothing. Every role it writes came from a Decision cell a human edited, and it never reinterprets one.

## Steps

1. **Check the preflight.**

   ```bash
   specs bridge status
   ```

   One plugin must be connected — **and you must check which file it is connected to.** The status line prints the connected file's key and name:

   ```
   Bridge running (pid 36652). 1 plugin connected:
     043ln8eiOoivUN5FicuGCF (ADS Components) — connected
   ```

   **A key match is a fast path, not the gate.** When that key equals a `key` under `data.sources` in `config/settings.yaml`, you are in the right file and can continue.

   A mismatch does **not** mean the wrong file. An unsaved Figma document reports an id like `unsaved-1uzd9salubn (DE Library)`, which can never equal a published file key, so key-equality alone would block a correctly-opened file outright.

   **When the key does not match, prove identity by reading before you write anything.** Pick one component from the proposal and `/inspect` it with its `pageId` and `nodeId`:

   - The returned name matches the spec's `title`, and the anatomy keys match the spec's anatomy → **this is the right file.** Continue.
   - The ids do not resolve, or something else comes back → **this is the wrong file.** Stop and say which file the bridge reported. Write nothing.

   That is a stronger proof than a key string in both directions: it is one read-only call, it fails closed, and it confirms the file actually contains the components you are about to annotate rather than that someone typed the same key into a config.

   "Connected" on its own is not the gate, and treating it as the gate is how a sweep ends up in the wrong Figma file. A bridge left running from earlier work answers exactly like the right one, every request succeeds, the report says `applied`, and the write lands in a file nobody was looking at. Nothing downstream detects it, because the file you meant to annotate is unchanged and still looks like it simply has no roles yet.

2. **Parse the decisions.** `[x]` applies the row's role, `[ ]` skips it. There is no third answer to interpret — if a reviewer wanted a different role, the row says so.

   Two rows are not applied even when checked:

   - **Marked `✏️ Figma change`.** The element does not exist yet; the row records the intent for after the asset change. Report it as `deferred` and carry on. Treating it as a missing element would halt the sweep on a row that is working exactly as designed.
   - **Marked `(Not yet supported)`.** These *are* applied — the concept is real vocabulary and the annotation is the point. Nothing emits for it, so expect no change in generated output, and say so rather than letting it read as a failed write.

3. **Group by page.** Each component's page comes from its spec's `metadata.source.pageId`. One `POST /annotate` per page, because a page is the unit a reviewer can watch and stop at.

   The body, literally — do not infer it:

   ```json
   {
     "pageId": "42:2",
     "components": [
       {
         "nodeId": "43:2",
         "title": "Checkbox",
         "elements": [
           { "key": "control", "lines": ["role:checkbox"] },
           { "key": "fieldLabel", "lines": ["role:label"] }
         ]
       }
     ],
     "conventions": {},
     "settings": {}
   }
   ```

   - `conventions` and `settings` come from `specs/latest.metadata.yaml`, the same pair `/inspect` takes. Omitting them fails the whole request.
   - `key` is the anatomy key, never a node id or a layer name.
   - `lines` is an **array of strings**, one per signal line, joined into a single annotation entry. A role alone is one element: `["role:button"]`. The role is the bare concept, unquoted.
   - `title` fills the messages that come back, including the `unresolved` detail. Send it.

   **A malformed body is refused by field name, before anything is resolved.** The error names the position and the field — `components[1].elements[0].lines is required and must be a non-empty array of strings` — so fix the request and send it again. It is not an `unresolved`, and it is not a reason to redo the review.

4. **Apply, one page at a time.** Print the page's component list before writing, then the result table after. Elements are named by anatomy key; the plugin resolves each against the live component at write time, so nothing depends on a node id recorded earlier.

   Each element reports one of:

   - `applied` — the annotation was appended. Nothing already on the layer was read for content, rewritten, or reordered
   - `conflict` — the element already carries a role, on this variant or another. Left alone. **Report and continue.** It means *something already wrote this*, not that a human authored it: the check re-inspects the live component at write time, so it also fires on an earlier or interrupted run of this same sweep. **Resuming a partial sweep is expected to report `conflict` for every row already applied** — a wall of them is the sweep working, not the designer having got there first
   - `unresolved` — nothing in the live component keys to that name. **Halt.** The component changed since the proposal was reviewed, so every later page is suspect and the review needs redoing rather than overriding
   - `unsupported` — the element resolved to a node type that cannot hold an annotation. Report and continue

5. **GATE — confirm in Dev Mode.** Before sweeping the rest, have a human open one annotated layer in Figma and confirm two things: the role is there, and anything that was there before still is. The write is additive by construction, but it is a designer's file and the check costs one look.

6. **Prove the round trip.**

   ```bash
   specs fetch --only <alias>,file
   ```
   ```bash
   specs generate
   ```
   ```bash
   specs analyze roles
   ```

   Name the alias. `--only` takes `<alias>,<kind>` pairs elsewhere, and a bare kind is unambiguous only while there is one source.

   **Figma's REST payload lags the editor, and the lag is indistinguishable from a failed sweep.** A fetch run straight after the writes can return the file as it was — a live run saw `elementsAnnotated` unchanged at 4 while `/inspect` showed every annotation present, and a second fetch about 90 seconds later returned all 68.

   So an unchanged count is **not** evidence of failure. You know the expected delta before you start: it is the number of rows that reported `applied`. If the count has not moved, wait and refetch, up to about three minutes, before concluding anything. Only a count that stays wrong after that is a finding.

   Reading annotations back needs no bridge — the REST payload carries annotation labels. Diff `analysis/roles.yaml` against the copy from before the sweep: the roles that moved are exactly the rows that said so, or something went wrong that no individual page result showed.

7. **Emit, and read the output.** The point of a role is the code it changes, and the sweep proves only that the annotation landed.

   ```bash
   specs react
   ```

   **Read `summary.conceptsInertInUse` in `analysis/roles.yaml` first.** It lists every concept you applied that emits nothing, with why — `{group: specified, radio: specified, slider: none}`. Those components cannot have changed, so a `<div>` on one of them is the correct outcome and not a finding. Without this the two indistinguishable cases are "the role did nothing because the concept is inert" and "the role did nothing because it failed to land", and you are left inferring which from the markup.

   Then spot-check one component per concept family **among the rest**: a checkbox should hold a real `<input type="checkbox">` with `htmlFor` and `aria-describedby` wiring, a disclosure an `aria-expanded` button paired by `aria-controls`, a button a real `<button>`. A `<div>` on a concept that is *not* in `conceptsInertInUse` is a real failure, and this is the only check that catches it.

