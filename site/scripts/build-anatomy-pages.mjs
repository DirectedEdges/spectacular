/**
 * Generates the element-type reference pages, the anatomy counterpart of
 * build-prop-pages.mjs.
 *
 * The unit is `ElementType` — eleven closed values off the schema's own union,
 * while element NAMES stay the library's (the same open-names/closed-shapes
 * move the props tree makes with kinds). A page's URL is the type:
 * `/schema/anatomy/glyph/` documents what a glyph element is, which style keys
 * an element of that type carries, and how each platform realises it.
 *
 * Members of `AnatomyElement` and `Element` are NOT paged here — they are the
 * hand-written anatomy and elements pages' tables, and a type page documents a
 * classification, not a structure.
 *
 * Usage:  node scripts/build-anatomy-pages.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
// All page copy lives in content/ — this script holds structure only.
import {
  BANNER, PATH_ROOT, CARRIES_INTRO, DECISIONS_NONE, SOURCE_SECTION,
} from './content/anatomy-pages.mjs';
import { loadAdrs, decisionBullets } from './lib/adr.mjs';
import { frontmatter } from './lib/markdown.mjs';
import { createEmitter } from './lib/emit.mjs';
import { loadBindings, platformBindingSections } from './lib/bindings.mjs';
import { BINDING_LABELS } from './content/common.mjs';
import { docsSchema, schemaDir, mappingsDir, bindingsDir, adrDir, transforms } from './lib/paths.mjs';
import { kebab, PLATFORMS, PLATFORM_TITLE } from './lib/naming.mjs';
import { join } from 'node:path';

const outRoot = join(docsSchema, 'anatomy');

const defs = JSON.parse(readFileSync(join(schemaDir, 'component.schema.json'), 'utf8')).definitions;

const preservedFile = join(mappingsDir, '_anatomy-page-content.json');
const preserved = existsSync(preservedFile) ? JSON.parse(readFileSync(preservedFile, 'utf8')) : { types: {} };

const bindings = loadBindings();


/** The eleven types, each with the gloss its own union branch declares. */
const TYPES = defs.ElementType.oneOf.map((b) => ({ type: b.const, description: b.description ?? '' }));

/**
 * The transforms' declared per-element-type style key tables, where checked
 * out. Their vocabulary is NOT the schema's: they speak `frame` and
 * `component` where the contract says `container` — the root `component` is
 * the component itself, not an anatomy element, and `frame` folds to
 * `container`. The mapping is applied here; the Figma binding's `container`
 * entry declares it.
 */
const TABLE_TYPE_OF = { frame: 'container', component: null };
const styleKeysByType = (() => {
  const paths = [
    join(transforms, 'packages/specs-from-figma/src/Component/Styles/style-bindings.json'),
    join(transforms, 'packages/figma-from-specs/src/Styles/style-bindings.json'),
  ];
  const out = {};
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const table = JSON.parse(readFileSync(p, 'utf8')).elements;
    for (const [raw, keys] of Object.entries(table)) {
      const type = raw in TABLE_TYPE_OF ? TABLE_TYPE_OF[raw] : raw;
      if (!type) continue;
      (out[type] ??= new Set());
      for (const k of keys) out[type].add(k);
    }
  }
  return out;
})();

const adrs = loadAdrs(adrDir);

const emit = createEmitter({ root: outRoot, label: 'site/src/content/docs/schema/anatomy/' });

for (const { type, description } of TYPES) {
  const kept = preserved.types?.[type] ?? {};

  /**
   * One subheading per platform, carrying the whole per-platform story: the
   * binding's fields, EVERY rule the type participates in on that platform —
   * declared on its row or reached only through a rule's key list — with the
   * sibling types, and the notes. The former Resolved jointly section split
   * these facts across two places, and neither was complete.
   */
  const bindingRows = platformBindingSections({
    bindings,
    unit: type,
    conceptKey: 'anatomy',
    rulesKey: 'anatomyRules',
    siblingBase: '/schema/anatomy/',
    labels: BINDING_LABELS,
  });

  /**
   * Which style keys an element of this type carries — the inverse of the
   * style pages' "Supported on" section, from the same declared tables, with
   * the same capture/render union: a reader wants what a text can carry, not
   * which of two codebases agrees.
   */
  const carries = (() => {
    const keys = styleKeysByType[type];
    if (!keys?.size) return null;
    return [...keys].sort().map((k) => `[\`${k}\`](/schema/styles/${kebab(k)}/)`).join(' · ');
  })();

  const keptSections = Object.entries(kept.sections ?? {})
    .map(([name, body]) => `\n## ${name}\n\n${body}\n`)
    .join('');

  const decisions = (() => {
    const deciding = adrs.decidedBy(type, `anatomy.${type}`);
    if (!deciding.length) return DECISIONS_NONE;
    return `${decisionBullets(deciding)}\n`;
  })();

  const page = `${frontmatter({ title: type, description })}

${BANNER}

${description}${kept.intro ? ` ${kept.intro}` : ''}

## Path

${PATH_ROOT}.\`<element>\`.\`type: ${type}\`

${carries ? `## Styles\n\n${CARRIES_INTRO}\n\n${carries}\n` : ''}${keptSections}
## Platform bindings

${bindingRows}

## Decisions

${decisions}
${SOURCE_SECTION}
`;

  emit.write(join(outRoot, `${type}.md`), page);
}

console.log(emit.summary(emit.commit()));
