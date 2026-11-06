// The stylesheet transformer: one pass produces both platforms' CSS.
//
// This file is the transformer and the order its parts run in. The parts
// themselves live under `css/`, each answering one question (specs#691):
//
//   analyzeSpec      what the whole spec says about its elements
//   roleResets       neutralising what a role's emitted element brings with it
//   defaultBlock     the base rules, before any variant
//   variantSelectors what one variant's rule is written against
//   variantBlock     one rule set per variant
//   cursors          the press and disabled affordances
//
// Those were a single 600-line function, which is why the selector expansion —
// the subtlest step, and the one that fails silently — could only ever be
// exercised by generating a whole stylesheet and reading it.
import fs from 'fs-extra';
import { writeAtomic } from './writeAtomic.js';
import path from 'path';
import yaml from 'yaml';
import type { Transformer, TransformerContext } from '../transforms/transformer.js';
import { reportNameWarnings, withNameWarningsSuppressed } from './css/values/nameWarnings.js';
import { capitalize, subComponentKey, toKebab } from './naming.js';
import { dirNameFor } from '../utilities/specsLayout.js';
import { CONCEPT_TABLE, buildStateLookup, conceptsClaimedByNestedRoles } from './states.js';
import { resolveRules } from './css/rules/index.js';
import { loadExamples } from './examples.js';
import { analyzeSpec } from './css/analysis/analyzeSpec.js';
import { slotDirectionResolver } from './css/analysis/slotDirection.js';
import { resolveSpecsLayout } from '../utilities/specsLayout.js';
import { anatomyRoles, anatomyTypes, apiPropsOf } from './css/analysis/readApi.js';
import { disabledSelectorFor, focusSelectorFor, rootSelector } from './css/sheet/selectors.js';
import { roleResetLines } from './css/sheet/roleResets.js';
import { defaultBlockLines } from './css/sheet/defaultBlock.js';
import { variantBlockLines } from './css/sheet/variantBlock.js';
import { cursorLines } from './css/sheet/cursors.js';
import type { ImagesCssContext, RootForm } from './css/types.js';
// The filenames come from the packages that emit the scaffolds importing them,
// so a stylesheet can never be written under a name no scaffold reaches for.
import { REACT_FILES } from '@directededges/react-from-specs';
import { WEBCOMPONENT_FILES } from '@directededges/webcomponents-from-specs';

/**
 * The light-DOM companion sheet for a custom element.
 *
 * Content composed into a component arrives as light-DOM children and is styled
 * by the document, not by the shadow stylesheet — `:host *` cannot reach past
 * the boundary, and `::slotted()` reaches only the top level. The class form
 * gets this for free, because its composed content sits inside the block class
 * in the same document. Without it, composed content computes as `content-box`
 * and every padded element is larger than the spec says.
 */
function lightDomLines(tag: string): string[] {
  return [
    '/* Generated. Do not edit — regenerate with `specs webcomponents`. */',
    '',
    `${tag}, ${tag} * {`,
    '  box-sizing: border-box;',
    '}',
    '',
  ];
}

/**
 * Where a stylesheet reaches the shared image assets from.
 *
 * `specs generate --get-images` writes them to `<workspace>/assets/images/`, while a
 * stylesheet sits at `<workspace>/<tree>/src/components/<Component>/` — four levels
 * down, and five for a subcomponent. Stated as a depth rather than a literal so the
 * two cannot drift apart, and so a change to either tree moves both.
 *
 * A composition emits at `<tree>/src/compositions/<Name>/`, the same depth as a
 * component, so both kinds reach the assets at the same distance.
 */
const IMAGES_FROM_COMPONENT = '../'.repeat(4) + 'assets/images';
const IMAGES_FROM_SUBCOMPONENT = '../'.repeat(5) + 'assets/images';

/**
 * A component's directory inside a platform tree.
 *
 * The CSS transformer is the one emitter that writes for both targets, so it
 * cannot declare a single `outputTree` the way the platform transformers do — it
 * derives both. Its output is free, as it was when it lived beside the spec.
 */
function componentOutDir(context: TransformerContext, tree: string, prefix: string): string {
  return path.join(context.workspaceDir, tree, 'src', dirNameFor(context.kind), prefix);
}

export class CssTransformer implements Transformer {
  readonly name = 'css';

  /**
   * Which platform's stylesheets to write, when only one is being emitted.
   *
   * One pass produces both — React's `styles.css` targets the component's class,
   * the custom element's `host.css`/`light.css` target its shadow root — because
   * both are derived from the same resolved styling. `specs react` must not leave a
   * `webcomponents/` tree behind it, so the command that knows its target says so.
   * Absent means both, which is what the pipeline has always done.
   */
  constructor(private readonly only?: 'react' | 'webcomponents') {}

  private writes(tree: 'react' | 'webcomponents'): boolean {
    return this.only === undefined || this.only === tree;
  }

  async run(apiYaml: Record<string, unknown>, context: TransformerContext): Promise<void> {
    const { specDir, componentKey, tokensFormat } = context;

    const variantsPath = path.join(specDir, 'variants.yaml');
    if (!fs.existsSync(variantsPath)) {
      console.warn(`  [css] skipping ${componentKey}: no variants.yaml found`);
      return;
    }

    const raw = await fs.readFile(variantsPath, 'utf-8');
    const variantsYaml = yaml.parse(raw) as Record<string, unknown>;

    const componentClass = toKebab(componentKey);
    const prefix = capitalize(componentKey);
    // Images registry (ADR-063): backgroundImage fills resolve against it;
    // urls are emitted relative to each stylesheet's location.
    const examples = loadExamples(specDir);
    const images: ImagesCssContext = { examples, relPrefix: IMAGES_FROM_COMPONENT };
    const elemTypes = anatomyTypes(apiYaml);
    const elemRoles = anatomyRoles(apiYaml);
    const apiProps = apiPropsOf(apiYaml);

    const sheet = (rootAs: RootForm) =>
      buildCssLines({ componentClass, variantsYaml, tokensFormat, context, elemTypes, images, rootAs, elemRoles, apiProps });

    const lines = sheet('class');
    // Each platform's stylesheet lands in that platform's tree beside the scaffold
    // that imports it (project 024). `styles.css` is React's — it targets the
    // component's own class — and `host.css`/`light.css` are the custom element's.
    const reactDir = componentOutDir(context, 'react', prefix);
    const wcDir = componentOutDir(context, 'webcomponents', prefix);
    if (this.writes('react')) {
      await fs.ensureDir(reactDir);
      await writeAtomic(path.join(reactDir, REACT_FILES.styles), lines.join('\n'));
    }

    // The same rules written for a shadow tree, where the custom element itself
    // is the root: root rules target `:host`, so a caller can size and place the
    // component by styling the element, exactly as it would any other. Element
    // rules are identical — they match inside the shadow tree either way.
    const hostLines = withNameWarningsSuppressed(() => sheet('host'));
    if (this.writes('webcomponents')) {
      await fs.ensureDir(wcDir);
      await writeAtomic(path.join(wcDir, WEBCOMPONENT_FILES.hostCss), hostLines.join('\n'));
      await writeAtomic(path.join(wcDir, WEBCOMPONENT_FILES.lightCss), lightDomLines(componentClass).join('\n'));
    }

    // Subcomponents — each gets its own stylesheets in its own subfolder
    const subcomponents = (variantsYaml.subcomponents ?? {}) as Record<string, unknown>;
    const apiSubs = (apiYaml.subcomponents ?? {}) as Record<string, unknown>;
    for (const [subKey, subRaw] of Object.entries(subcomponents)) {
      const subVariantsYaml = subRaw as Record<string, unknown>;
      // Namespaced by the parent, matching the class the react and web-component
      // emitters put on the subcomponent's root. The two are written by different
      // packages; if only one composes the parent, nothing selects.
      const subClass = toKebab(subComponentKey(componentKey, subKey));
      const subFilePrefix = capitalize(subKey);
      const subTypes = anatomyTypes((apiSubs[subKey] ?? {}) as Record<string, unknown>);
      const subSheet = (rootAs: RootForm) =>
        buildCssLines({
          componentClass: subClass,
          variantsYaml: subVariantsYaml,
          tokensFormat,
          context,
          elemTypes: subTypes,
          images: { examples, relPrefix: IMAGES_FROM_SUBCOMPONENT },
          rootAs,
        });
      const subLines = subSheet('class');
      const subReactDir = path.join(reactDir, subFilePrefix);
      const subWcDir = path.join(wcDir, subFilePrefix);
      if (this.writes('react')) {
        await fs.ensureDir(subReactDir);
        await writeAtomic(path.join(subReactDir, REACT_FILES.styles), subLines.join('\n'));
      }
      const subHostLines = withNameWarningsSuppressed(() => subSheet('host'));
      if (this.writes('webcomponents')) {
        await fs.ensureDir(subWcDir);
        await writeAtomic(path.join(subWcDir, WEBCOMPONENT_FILES.hostCss), subHostLines.join('\n'));
        await writeAtomic(path.join(subWcDir, WEBCOMPONENT_FILES.lightCss), lightDomLines(subClass).join('\n'));
      }
    }
  }

  /** End-of-run summary of name warnings collected across all components. */
  async finalize(): Promise<void> {
    reportNameWarnings('css');
  }
}

interface SheetInput {
  componentClass: string;
  variantsYaml: Record<string, unknown>;
  tokensFormat: string | undefined;
  context: TransformerContext;
  elemTypes?: Record<string, string>;
  images?: ImagesCssContext;
  rootAs?: RootForm;
  elemRoles?: Record<string, string>;
  apiProps?: Record<string, Record<string, unknown>>;
}

/**
 * One stylesheet, in the order its parts have to appear.
 *
 * Order is not arrangement: a role reset must land before any spec declaration,
 * the default block before the variants that override it, and the cursor
 * affordances last because nothing overrides them. Everything else about each
 * part lives in that part's own module.
 */
function buildCssLines(input: SheetInput): string[] {
  const {
    componentClass, context, tokensFormat,
    elemTypes = {}, images, rootAs = 'class', elemRoles = {}, apiProps = {},
  } = input;
  const rootSel = rootSelector(componentClass, rootAs);

  // Configured rules are pre-passes on the structured variants data, so every
  // part below reads the same already-transformed spec.
  let variantsYaml = input.variantsYaml;
  for (const rule of resolveRules((context.transformerOptions?.rules as string[] | undefined) ?? [])) {
    variantsYaml = rule.apply(variantsYaml, { tokensFormat });
  }

  const lines: string[] = [
    `/* Generated. Do not edit — regenerate with \`specs ${rootAs === 'host' ? 'webcomponents' : 'react'}\`. */`,
    '',
    // Everything generated sits in one cascade layer, so an unlayered consumer
    // rule beats it regardless of specificity. Without this a consumer retheming
    // a state has to match selectors like
    // `.x[data-appearance="outline"]:hover:not(:disabled) .x__label` exactly, for
    // every state, in the right order — a specificity race the generator wins by
    // accident of how many guards it emitted.
    '@layer specs {',
    '',
    // A Figma frame's width and height INCLUDE its padding; the CSS default,
    // content-box, excludes it. Without this, every element carrying both a
    // fixed dimension and padding renders larger than the spec by exactly its
    // padding — a 24px frame with 4px padding measures 32px.
    `${rootSel()}, ${rootSel()} * {`,
    '  box-sizing: border-box;',
    '}',
    '',
  ];

  // A role may have replaced an element's tag with an interactive one (ADR-067).
  // These come first: the spec's declarations were authored against the plain
  // box, so what the new tag brings has to be neutralized before any of them.
  lines.push(...roleResetLines(componentClass, rootAs, elemRoles));

  // Built per component rather than cached for the process: `specs run` keeps a
  // watcher alive across edits, and a resolver that outlived one would answer from
  // the spec a component had before it was regenerated. Each resolver caches within
  // its own component, which is where the repetition actually is — one composition
  // asks about the same few layout components for every element it holds.
  const facts = analyzeSpec(
    variantsYaml,
    elemRoles,
    slotDirectionResolver(resolveSpecsLayout(input.context.specsRoot).dirFor('component')),
  );

  const base = defaultBlockLines({ componentClass, rootAs, tokensFormat, elemTypes, elemRoles, images, facts, apiProps });
  lines.push(...base.lines);

  // ── Which selector carries which state ─────────────────────────────────────
  // Each concept maps a (prop, value) pair to a canonical CSS selector. Props in
  // classifiedProps use real CSS selectors instead of data attributes.
  const { lookup: stateLookup, classifiedProps } = buildStateLookup(context.processingStates ?? {});

  // A concept claimed by a role on a nested element is announced there, not on
  // the root, so the root's rules key off the variant prop's data attribute —
  // which the scaffold always emits — instead of an aria selector the root no
  // longer carries. Dropping the classification routes these through the
  // ordinary data-attribute path.
  const nestedClaimed = conceptsClaimedByNestedRoles(elemRoles);
  // The (prop, value) pairs this removal declassified. A prop keeps its
  // classification when another concept still uses it — `validation` mapping both
  // `invalid` (claimed by a nested textbox) and `valid` (not claimed) — and then
  // the claimed value would look unnamed to the variant loop, which would drop
  // the whole variant and warn about a states entry the config already has.
  const nestedClaimedPairs = new Set<string>();
  for (const [pair, concept] of [...stateLookup]) {
    if (!nestedClaimed.has(concept)) continue;
    stateLookup.delete(pair);
    nestedClaimedPairs.add(pair);
    const prop = pair.split('::')[0];
    // The prop stays classified only if another still-classified concept uses it.
    const stillUsed = [...stateLookup.entries()].some(([k]) => k.split('::')[0] === prop);
    if (!stillUsed) classifiedProps.delete(prop);
  }

  /**
   * A value of a classified prop that no concept names, reported once per
   * (prop, value) pair.
   *
   * Skipping such a variant is correct for the prop's *resting* value — the base
   * block already covers it. Every other unnamed value is styling the spec
   * declares and the stylesheet drops, and it drops silently: the value still
   * reaches the generated contract and the stories, so the state looks supported
   * and simply renders as the default. Every comparable drop in this pipeline
   * warns; this one did not.
   */
  const warnedUnnamed = new Set<string>();
  const warnUnnamedValue = (prop: string, value: string): void => {
    const def = apiProps[prop] as { default?: unknown } | undefined;
    const resting = def?.default;
    if (resting !== undefined && String(resting).toLowerCase() === value.toLowerCase()) return;
    const key = `${prop}::${value}`;
    if (warnedUnnamed.has(key)) return;
    warnedUnnamed.add(key);
    console.warn(
      `  [css] ${context.componentKey}: '${prop}' is classified by the states convention, ` +
        `but no concept names the value '${value}' — the styling declared for it is not emitted. ` +
        `Add a states entry mapping a concept to this value, or rename the value to one a concept names.`
    );
  };

  // A concept's selector, narrowed to what can actually match this target and
  // this root. Only `disabled` and the focus heuristic differ; every other
  // concept is target-neutral.
  const selectorFor = (concept: string): string | undefined =>
    concept === 'disabled'
      ? disabledSelectorFor(rootAs, elemRoles.root)
      : concept === 'focus' || concept === 'focus-visible'
        ? focusSelectorFor(rootAs, elemRoles.root)
        : CONCEPT_TABLE[concept]?.selector;

  lines.push(...variantBlockLines({
    componentClass, rootAs, tokensFormat, elemTypes, images, context, facts, apiProps,
    displayedInDefault: base.displayedInDefault,
    classifiedProps, stateLookup, nestedClaimedPairs, selectorFor, warnUnnamedValue,
  }));

  lines.push(...cursorLines({ componentClass, rootAs, context, apiProps, elemRoles, nestedClaimed }));

  lines.push('}');
  lines.push('');
  return lines;
}
