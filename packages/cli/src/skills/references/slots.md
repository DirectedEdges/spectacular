<!--
  Reference shipped beside specs-cli.authoring.primer — not an invokable skill.
  Canonical; `specs skills install` overwrites it on every refresh.
-->

# Reference: slots across the three files

Load with the **api pack**, before `api.yaml`. Assumes `specs-cli.authoring.primer` is read.

A slot is a prop the component exposes for content it does not define. Authoring one touches all three concern files, and this traversal is what the reference carries — the schema describes each node, and `rules/slots.yaml` beside this skill carries every judgment about declaring, constraining, filling, and sizing one. Where this file and that one seem to overlap, the rules file governs.

## One relationship, three files

| Step | File | What is written |
|---|---|---|
| 1. Declare the slot | `api.yaml` | `props.<slot>: {type: slot}` — optionally `defaultSlot: true` (at most one), `anyOf`, `minChildren`/`maxChildren` |
| 2. Bind an element to it | `variants.yaml` | the slot-bearing element's `children: {$binding: '#/props/<slot>', examples: [{$slotContent: …}, …]}` — a `SlotBinding`; `examples[0]` is the authored default fill |
| 3. Author the fills | `examples.yaml` | `slotContentExamples.<name>` — an anatomy + elements + layout triplet, complete in itself |

Step 2 cannot validate before step 3 exists. That is expected, and `rules/slots.yaml · authoringOrder` says what to do about it.

## The two ways a fill arrives

| Form | How it is written | Can it name which slot? |
|---|---|---|
| Default slot | the filling instance is nested as an ordinary child element; the nesting *is* the fill | No — there is at most one `defaultSlot` |
| Named slot | the fill is authored in `slotContentExamples` and bound through a `$slotContent` pointer | Yes |

Nothing points between levels in the default-slot form. Which form applies when is `rules/slots.yaml · fills`.

## The pointer grammar

| Pointer | Resolves to |
|---|---|
| `#/components/<key>/slotContentExamples/<name>` | a named fill in that spec's examples file |
| `#/components/<key>/subcomponents/<sub>/slotContentExamples/<name>` | a named fill owned by a subcomponent slice |

`<key>` is the spec folder key, and the `components` segment names the whole spec-key space — a composition addresses other specs' fills *and its own* through the same form. These two are the only forms the emitters resolve; `rules/slots.yaml · pointers` carries the prohibition on the third form the schema documents.

`specs validate` resolves every pointer, and a dangling one is an error.

## A fill is a self-contained triplet

A `slotContentExamples` entry declares its **own** anatomy, describes every one of its own elements, and arranges them with its own layout tree. Each is checked against that triplet's anatomy, never against the host component's.

An element inside a triplet may be `type: instance` with `instanceOf` naming any workspace component. That is how composed content nests real components, and how a fill can itself contain a component that has slots — see `references/layout.md` for arranging a hierarchy that deep.

## Filling another component's slot

When an `instanceExamples` entry or a nested instance's `propConfigurations` sets a slot prop, the value is a `$slotContent` pointer:

```yaml
instanceExamples:
  items:
    withActions:
      propConfigurations:
        children: {$slotContent: '#/components/tooltip/slotContentExamples/tooltip__children__rich'}
```

Never inline content and never a `$binding` there — `rules/examples.yaml · instanceExamples` carries why.

## Where to go deeper

| Question | Goes to |
|---|---|
| Should this be a slot at all, and how is it constrained and sized? | `rules/slots.yaml` |
| What shape does `SlotBinding` or `SlotProp` take? | `Props.ts`, `Element.ts`, and the schema's property descriptions |
| How do I arrange and nest the fill's own contents? | `references/layout.md` |
| The part only exists inside this component | `references/subcomponents.md` |
