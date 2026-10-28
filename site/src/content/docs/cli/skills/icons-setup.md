---
title: "icons.setup"
description: "Work out how your library marks a component as an icon glyph, then prove the glyph names resolve"
---

<script>document.querySelector('#_top').insertAdjacentHTML('beforeend',' <span class="sl-badge experimental-badge">Experimental</span>')</script>

A skill that establishes the [`glyphs`](/settings/glyphs/) convention for your library: how a component is recognised as an icon glyph, so a placed icon resolves to a **name** rather than an anonymous vector.

Installed by [`specs skills install`](/cli/commands/skills/) as `.claude/skills/specs-cli.icons.setup/`, then invoked in Claude Code.

## Scope

Only when the name form is not obvious. Many libraries name their glyph components by a pattern — `DS Icon Glyph / search` — and a single line of config covers them:

```yaml
glyphs:
  match: 'DS Icon Glyph / {i}'
```

If reading your icons manifest shows a pattern like that, write it and move on. This skill is for the case where it does not: glyphs named plainly as the icon itself (`Cross`, `Chevron down`), or several generations of naming that no single pattern spans. There, membership has to come from what each component *contains*, and that is the [structural form](/settings/glyphs/#structure).

## Rationale

The shape of the evidence is mechanical — a name pattern or a child structure can be read off the file. What cannot be derived is **which components in the file are icons at all.**

An icon file usually holds more than icons: illustrations, logos, device frames, UI chrome, and parts that other components instance. Nothing in the data labels those populations. Pick the boundary wrongly and a convention claims hundreds of components that are not icons, each one acquiring a glyph name that is not an icon name.

That is also the one question the skill brings back to you. It proves what structure a population shares; you say whether a population is an icon set. Everything else it decides and shows its working for.

## Order and refetch

The `icons` fetch kind cannot run before the convention exists — [`specs fetch`](/cli/commands/fetch/) refuses to start without it. So:

1. The icons file is fetched with `fetch: [file]` and [scanned](/cli/commands/scan/).
2. The skill establishes the convention from that payload.
3. `icons` is added to the source's fetch list.
4. That source is refetched — which is when icons are actually pulled.

On a large icon file step 4 is the slowest single step in a setup. The skill says so before starting rather than after.

## Procedure

That sequence is the whole skill, and it exists because the cheap artifact cannot answer the question. `data/<alias>.manifest.md` states a component's name, id, node type and dev status — and **no parentage, no children, no size, no properties.** A `/` in a layer name is a naming convention, not containment.

So the skill takes candidates from names and then goes to the fetched payload, where `type`, `children`, `componentPropertyDefinitions` and `absoluteBoundingBox` are stated outright.

1. Searches the manifest for names containing `icon` — are there many, are they one pattern, is there more than one pattern? **Suggestion only; nothing is settled.**
2. **Proves each candidate population from the payload**, sampling several components rather than one. Two requirements decide it: a `COMPONENT` whose parent is not a `COMPONENT_SET` and which declares no component properties, and at least one `VECTOR` or a group that would export cleanly as an SVG.
3. Gathers corroborating evidence that is explicitly **not** conclusive — same size, square, small (16×16, 24×24), shallow structure — and states it, because a reviewer can check it instantly.
4. **Looks for the disproof.** Samples deliberately for components in the population that lack the uniformity. A handful of outliers is an icon set with outliers worth naming; outliers at half the population means it was never one population.
5. When no name pattern exists, finds the population by **page locality plus uniform shallow vector structure** — an icon set is almost always authored together on one page or a few — then runs the same proof against it.
6. **Confirms membership with you, once, after the proof** — never the pattern syntax or the matcher, which are derivable.
7. Writes the convention, refetches only that source's glyphs, and runs [`specs generate`](/cli/commands/generate/), reporting the population size, the glyphs resolved, and the elements now typed `glyph` with a name — side by side.

## Structural-form semantics

The structural form reads more simply than it behaves, and each of these is a way to be confidently wrong.

**`children` is a set of alternatives, not a positional list.** `children: [{type: VECTOR}]` means every child is a `VECTOR`, any number of them — not "exactly one child".

**Coverage is exhaustive.** A component holding anything the matchers do not cover is not a glyph. That is the protection against over-claiming, and it is why listing every node type you happened to see is worse than listing the types a glyph actually has.

**A matcher's `name` is literal, with `*` as the only wildcard**, matched whole against the whitespace-normalised node name. A matcher that is right about type and wrong about name matches nothing at all.

**`fill` tests leaves only** — the childless nodes that matched — and is skipped on placed instances, which context recolours. It constrains the stored component alone, and it is the member most likely to narrow a match to zero.

## Verification

A convention that matches nothing fails exactly like one that was never written: no error, no warning, and specs that look complete.

In a spec that places an icon, the element must be `type: glyph` **and** carry a `content` naming the icon. Both halves matter — `type: glyph` with no `content` means the component matched but the name capture produced nothing, which is a `{i}` in the wrong place or a `structure.name` that does not fit.

When nothing matches, the skill does not widen the convention blindly. It takes one component that is certainly an icon, compares it against the convention member by member, and reports which member excluded it.

---

**See Also:**

- [`glyphs` convention](/settings/glyphs/) — the two forms and their full semantics
- [Icon Glyphs](/guides/glyph-name-pattern/) — naming strategies and worked examples
- [`specs skills install`](/cli/commands/skills/) — how the skill reaches your project
- [`scan`](/cli/commands/scan/) and [`fetch`](/cli/commands/fetch/) — the manifest it reads, and the refetch it ends with
