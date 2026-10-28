---
name: specs-cli.icons.setup
description: Work out how a library marks its icon glyph components — by name pattern or by child structure — write the glyphs convention, refetch, and prove the glyph names resolve.
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

# Set up icon glyphs

Establish the [`glyphs` convention](https://spectacular.systems/settings/glyphs/) in `config/conventions/figma.yaml`: how this library marks a component as an icon glyph, so a placed icon resolves to a **name** rather than an anonymous vector.

With no `glyphs` block, glyph detection does not run at all. An icon layer is typed as an ordinary element, and the spec records its geometry but not which icon it is. With the block, the layer is typed `glyph` and the icon's name lands in the element's `content`.

This skill **authors a convention**, like `states.setup` and `roles.propose`. The shape of the evidence — a name pattern, a child structure — is mechanical and checkable. What is not mechanical is **which components in a file are icons at all.** An icon file usually also holds illustrations, logos, UI chrome, and parts other components instance. No rule separates those from the icon set; that is the judgment, and getting it wrong is how a convention claims 400 components that are not icons.

## Order matters, and it costs a refetch

The `icons` fetch kind **cannot run before this convention exists** — `specs fetch` refuses to start without it. So the sequence is:

1. the icons file is already fetched with `fetch: [file]`, and scanned
2. this skill establishes the convention from that payload
3. `icons` is added to the source's fetch list
4. **that source is refetched**, which is when icons are actually pulled

Say the refetch is coming before you start. On a large icon file it is the slowest step in the whole setup, and a user who is not expecting it will think something looped.

## Steps

1. **Know which artifact answers which question.** This is the whole discipline of this skill, and getting it wrong is the one failure that reliably produces a confident wrong answer:

   | Artifact | States | Does **not** state |
   |---|---|---|
   | `data/<alias>.manifest.md` | component name, node id, node type, dev status | **parentage, children, size, properties** |
   | `data/<alias>.file/page-*.json` | `type`, `children`, `componentPropertyDefinitions`, `absoluteBoundingBox` — explicitly | — |
   | an emitted `api.yaml` | the anatomy of a component that was generated | anything about a component that was not |

   **A `/` in a layer name is not containment.** `Icon / <Search>` tells you nothing about whether that component sits inside a set — Figma names are free text and the slash is a convention. The payload states the parent. Read it.

   So: **names suggest, structure decides, and the regenerate proves.** Never report a structural fact that came from the manifest.

   The source must already be fetched and scanned:

   ```bash
   specs scan --source <alias>
   ```

   If the manifest does not exist, stop — there is no candidate list to start from.

2. **Get candidates from the names. Suggestion only.** Search the manifest for components whose names contain `icon`, case-insensitively, and look at the shape of what comes back:

   - **Are there many?** An icon set is dozens to hundreds. Five components named "icon-something" are probably parts of other components.
   - **Are they all named the same way, in a pattern?** A fixed frame with the icon's own name varying inside it.
   - **Is there more than one such pattern?** Two prefixes with the same internal shape are two candidate populations, not one with exceptions. Keep them separate from here on and prove each one independently.

   Record the counts. Nothing about membership is settled yet.

   If nothing with `icon` in the name comes back in quantity, go to step 4.

3. **Prove each candidate population structurally, from the payload.** Sample several components from the population — not one — and read their actual nodes in `data/<alias>.file/page-*.json`. Two requirements must hold, and they are the test:

   | Must hold | Why | Where it is stated |
   |---|---|---|
   | The component is a `COMPONENT` whose parent is **not** a `COMPONENT_SET`, and it declares no component properties | A glyph is a static asset; a configurable component is not a glyph | the node's `type`, its parent's `type`, and `componentPropertyDefinitions` |
   | It contains at least one `VECTOR`, or a group of nodes that would export cleanly as an SVG | This is what makes it a glyph rather than a small composed component | the node's `children` |

   Then gather corroborating evidence. **None of it is conclusive on its own**, and all of it is worth stating because a reviewer can sanity-check it instantly:

   - Are they all the same size?
   - Are they all square?
   - Are they all small — 16×16, 24×24, that order of magnitude?
   - Is the structure shallow, rather than a deep tree of frames?

   **Then look for the disproof.** Deliberately sample for components in the population that do *not* share the uniformity — a different size, a deeper structure, properties, a set parent. Report what you find. A population with a handful of outliers is still an icon set with outliers worth naming; a population where the outliers are half of it was never one population, and the name pattern is doing the wrong work.

   When naming, structure and uniformity all align, the name form is justified — go to step 5. When the structure test fails, the population is not glyphs however it is named, and saying so is the correct outcome.

4. **When no name pattern exists, let structure find the population.** Some libraries name glyphs plainly as the icon itself — `Cross`, `Chevron down` — with nothing in the name marking them as icons at all. There, the population has to be found rather than filtered:

   - **Look for a large list of components concentrated on one page, or a few pages.** An icon set is almost always authored together. Page locality is the strongest signal available when names carry nothing.
   - **Within that list, look for the uniform shallow vector structure** from step 3 — same size, square, small, one or a few vectors, no properties, not in a set.
   - **Check whether the names are *just* the icon name.** If so, `structure.name` defaults to `'{i}'` and the whole component name becomes the glyph name.

   Then run step 3's proof and disproof against that population exactly as if a name had suggested it. The order of discovery changes; the standard of evidence does not.

5. **Confirm the populations with the user — once, after the proof.** Ask about *membership*, never about syntax. Which components are icons is the one thing they know and you cannot derive; the pattern and the structure matcher are derivable and asking about them is friction.

   Show them, per candidate population: the count, two or three example names, the structural facts that held, the uniformity, and any outliers. Then one question:

   > "I found two groups that look like icon sets: 364 components under `Icon /` and 38
   > under `Icon object /`. Both are standalone components, each a single vector, all
   > 24×24. Are both icon sets, or is one of them something else?"

   Their answer decides membership. Do not relitigate it with evidence afterwards — if they say a population is not icons, it is not icons.

6. **Write the name form.** It is one line, it is self-documenting, and it needs no payload read:

   ```yaml
   glyphs:
     match: 'DS Icon Glyph / {i}'
   ```

   `{i}` marks where the icon's name appears and becomes a `(.+)` capture — the captured text is the glyph name. The pattern must contain it, and it matches the component name whole.

   **`glyphs.match` is one string, not a list.** `subcomponents.match` and `instanceExamples.match` in the same file are lists, so the sequence form is the natural guess — and it is rejected with an error saying no glyphs convention is declared at all, which points nowhere near the real cause. If you need to cover two name patterns, see step 8.

   Prefer a pattern that is anchored by punctuation the icons carry and the other populations do not. A delimiter the set uses consistently does the excluding for free, where a bare prefix leaves `{i}` to swallow whatever follows it.

7. **Measure the pattern both ways.** A pattern is only right if it is both complete and clean, and the manifest is enough to check both without fetching anything:

   - **Recall** — of the components you called icons in step 2, how many does it match?
   - **Precision** — does it match anything you called *not* an icon?

   Report both as counts. A pattern that matches 612 of 639 is not a pass; name the 27 and say what they are. Usually they are a second naming generation, a deprecated set, or proof that step 2's grouping was wrong.

   **Do not widen a pattern to swallow misses.** `{i}` is greedy, so a loose pattern silently claims whole populations, and each wrongly-claimed component gets a glyph name that is not an icon name. A tight pattern with named exceptions beats a loose one.

8. **Write the structural form**, for the population step 4 found. Membership comes from what the component contains rather than what it is called:

   ```yaml
   glyphs:
     structure:
       children:
         - type: VECTOR
           name: 'Vector'
   ```

   Write the matcher from the nodes you already read in step 3 — do not re-derive it from one component, and do not widen it to cover an outlier step 3 told you about. The matcher has to hold for the whole population or the population was wrong.

   Four semantics to get right, because each one is easy to read the other way:

   - **`children` is a set of alternatives, not a positional list.** `children: [{type: VECTOR}]` means *every child is a VECTOR*, any number of them — not "exactly one child". A matcher never has to be used, but every child must be covered by some matcher.
   - **Coverage is exhaustive.** A component holding anything the matchers do not cover is not a glyph. This is the protection against over-claiming, and it is why a matcher that lists every node type you saw is worse than one that lists the types a glyph actually has.
   - **`name` on a matcher is literal, with `*` as the only wildcard**, matched whole against the whitespace-normalised node name. Add it only where the name is genuinely consistent; a matcher that is right about type and wrong about name silently matches nothing.
   - **`fill` tests leaves only** — the childless nodes the matchers matched — and every one of them must carry a visible solid fill in the accepted list. It is skipped on placed instances, which context recolours, so it constrains the stored component only. Declare it only if the set is genuinely monochrome and you have checked more than one component; it is the member most likely to narrow the match to nothing.

9. **Set `structure.name` when the component name is not the icon name.** It defaults to `'{i}'`, meaning the whole component name is the glyph name. Declare it when the names carry an affix the icon name should not keep — `name: '{i}Icon'` captures `Close` from `CloseIcon`.

10. **Re-check the disqualifiers against what you are about to declare.** Three kinds of component can never be a structural glyph, whatever their children look like:

   - a **component set**
   - a **variant** inside a component set
   - any component **declaring component properties** — variants, text props, instance swaps

   A glyph has no properties by definition: a component that can be configured is a configurable component. If the set you identified in step 2 is property-bearing, the structural form cannot claim it and the name form is your only option — say so rather than building a matcher that will match nothing.

11. **Two populations, and only one `match`.** A file often holds two patterned sets — `Icon / <{i}>` and `Icon object / <{i}>`, or a current generation beside a legacy one. `match` holds one pattern, so they cannot both be named that way.

   What is available:

   - **Both forms together.** `match` and `structure` may both be declared, and a component matching *either* is a glyph. If the second population shares a child structure the first one's non-icons do not, `structure` can cover it.
   - **Pick the larger population and report the rest.** Name every component in the uncovered set, say what it is, and say plainly that it stays undetected. A user who knows 38 icons are missing can decide what to do; a user told "icons are set up" cannot.

   **Do not widen `match` to span both.** A pattern loose enough to catch two populations catches whatever sits between them, and `{i}` is greedy. Two sets with one covered correctly beats both covered wrongly.

   If this is the case you are in, say so in the report as a limitation of the convention rather than a judgment you made — it is the config shape, not the library.

12. **Write the block, and write the report.** The `glyphs` block goes into `config/conventions/figma.yaml`. The reasoning behind it goes to `reports/<YYYY-MM-DD>.icons-setup.proposal.md`, creating the directory if it does not exist — not into `analysis/` or `specs/`, which are regenerated. Name that path when you hand it over.

   The report carries the counts and the reasoning:

   - the grouping from step 2, as counts
   - the form chosen, and why the other was rejected — for a structural match, the sampled components it was derived from
   - recall and precision, as numbers
   - every component you called an icon that the convention does **not** match, named
   - anything it matches that you did not call an icon, named — this list should be empty, and if it is not, say why you are accepting it

13. **Turn icons on and refetch that source.** The convention does nothing for the payload until the fetch kind is added:

    ```yaml
    sources:
      <alias>:
        fetch: [file, icons]
    ```

    ```bash
    specs fetch --only <alias>,icons
    ```

    `--only` takes aliases and fetch kinds, so naming both narrows the run to one source's glyphs. **Not `fetch --source`** — on `fetch` that flag names a file that is *not* in the config and takes a URL or key. (`scan --source` is different: there it does take an alias.)

    **The count it reports is the first real proof.** It should match the population size you proved in step 3, give or take the outliers you named. A number far below it means the convention is narrower than the population; far above means it is claiming components you never examined. Either way, say the two numbers side by side rather than reporting that the fetch succeeded.

14. **Regenerate, and confirm the names landed — this is what makes the claim true.** A convention that matches nothing fails exactly like one that was never written: no error, no warning, and specs that look complete.

    **Run this even under a live `specs run`.** The chain does not watch the glyphs payload the refetch just wrote — only the file, manifest, variables and styles — so nothing re-reads it until a generate does.

    ```bash
    specs generate
    ```

    In a spec that places an icon, the element must be `type: glyph` **and** resolve to a `content` naming the icon. **The two live in different files.** `api.yaml` carries `type: glyph` in the anatomy and no `content` at all; `content` is per-variant, in `variants.yaml` under `default.elements.<element>.content` — because one element can resolve to different icons across variants, as a checkbox indicator does for checked and indeterminate.

    Measure `content` in `variants.yaml`. Counting it in `api.yaml` returns zero on a working convention and reads as total failure: a real run measured 0 of 23 resolved that way, against a true 22 of 23.

    A glyph with no `content` anywhere can also be correct. An element whose icon the caller supplies — an icon button's `children` — is a glyph slot with nothing to resolve, so exclude those from the count rather than reporting them as misses.

    `type: glyph` with a `content` that is empty rather than absent means the component matched but the name capture produced nothing — a `{i}` in the wrong place, or a `structure.name` that does not fit.

    Report the three numbers together: the population you proved, the glyphs the fetch resolved, and the elements now typed `glyph` with a name. Nothing before this step establishes that the convention works; everything before it establishes only that it was plausible.

    If nothing is a glyph at all, the convention matched nothing. Do not widen it blindly:
    take one component you proved in step 3, compare it against the convention member by member, and report which member excluded it. For a structural match the usual culprits are `fill` and a matcher `name`, in that order.

