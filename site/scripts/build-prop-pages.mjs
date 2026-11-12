/**
 * Generates the prop reference pages as a tree mirroring the schema's own
 * shapes, the counterpart of build-style-pages.mjs for `props`.
 *
 * The structural difference from styles is the unit. Styles are a closed set
 * of 46 keys; props are seven KINDS with open names — `AnyProp`'s own union is
 * the page list, so an eighth kind added to the schema grows the tree with no
 * new vocabulary. A page's URL is still an access path: a prop definition in a
 * document is literally `props.<prop>.anyOf`, and `/schema/props/slot/any-of/`
 * is that path on a prop of the slot kind.
 *
 * Two things are deliberately flattened:
 *
 *   - **The `type` discriminator** gets no page per kind. It is the same fact
 *     seven times — the kind page states its own discriminator inline.
 *   - **The extension types** (`PropExtensions`, `FigmaPropExtension`,
 *     `FigmaCodeOnlySource`) are reachable from every kind, so nesting them
 *     would repeat three pages under all seven. They are one subject —
 *     provenance — documented once at `/schema/props/extensions/` and linked.
 *
 * Usage:  node scripts/build-prop-pages.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
// All page copy lives in content/ — this script holds structure only.
import {
  BANNER, PATH_ROOT, discriminatorGloss, EXTENSIONS_GLOSS,
  DECISIONS_NONE, CONSTRAINTS, absentMeans, fallbackMemberDescription,
  sourceSection, EXTENSIONS_PAGE,
} from './content/prop-pages.mjs';
import { loadAdrs, decisionBullets } from './lib/adr.mjs';
import { toYaml } from './lib/yaml.mjs';
import { frontmatter } from './lib/markdown.mjs';
import { createEmitter } from './lib/emit.mjs';
import { defName, deref } from './lib/schema.mjs';
import { loadBindings, platformBindingSections } from './lib/bindings.mjs';
import { BINDING_LABELS } from './content/common.mjs';
import { docsSchema, schemaDir, mappingsDir, bindingsDir, adrDir } from './lib/paths.mjs';
import { kebab, PLATFORMS, PLATFORM_TITLE } from './lib/naming.mjs';
import { join } from 'node:path';

const outRoot = join(docsSchema, 'props');

const defs = JSON.parse(readFileSync(join(schemaDir, 'component.schema.json'), 'utf8')).definitions;

const preservedFile = join(mappingsDir, '_prop-page-content.json');
const preserved = existsSync(preservedFile)
  ? JSON.parse(readFileSync(preservedFile, 'utf8'))
  : { kinds: {}, extensionsPage: {} };

const bindings = loadBindings();


/** kind id → its definition, read off AnyProp's own union. */
const KINDS = Object.fromEntries(
  defs.AnyProp.oneOf.map((b) => {
    const name = defName(b.$ref);
    return [name.replace(/Prop$/, '').toLowerCase(), name];
  })
);

const adrs = loadAdrs(adrDir);

const decisionSection = (key, path) => {
  const deciding = adrs.decidedBy(key, path);
  if (!deciding.length) return DECISIONS_NONE;
  return `${decisionBullets(deciding)}\n`;
};

/**
 * Members whose concept is the same on every kind that carries them. They get
 * no page of their own — seven near-identical `default` pages said nothing the
 * kind table's gloss and the hub's nullability table did not. A kind page's
 * Decisions therefore answers for these members' paths too, so an ADR deciding
 * `props.string.nullable` still surfaces.
 */
const SHARED_MEMBERS = new Set(['default', 'nullable', 'examples']);

/** Decisions for a kind page: its own path plus its pageless members' paths. */
const kindDecisionSection = (kind, memberNames) => {
  const seen = new Set();
  const out = [];
  const collect = (key, path) => {
    for (const a of adrs.decidedBy(key, path)) {
      if (seen.has(a.num)) continue;
      seen.add(a.num);
      out.push(a);
    }
  };
  collect(kind, `props.${kind}`);
  for (const m of memberNames.filter((n) => SHARED_MEMBERS.has(n))) collect(m, `props.${kind}.${m}`);
  if (!out.length) return DECISIONS_NONE;
  // Still sorted here: the merge runs several queries, so numeric order within
  // each one does not survive the concatenation.
  out.sort((a, b) => a.num.localeCompare(b.num));
  return `${decisionBullets(out)}\n`;
};

// ── Member typing ────────────────────────────────────────────────────────────
/** The display type of one property node, in the schema's own names. */
const typeOf = (node) => {
  if (!node) return '—';
  if (node.$ref) {
    const t = defName(node.$ref);
    return t === 'PropExtensions' ? '[`PropExtensions`](/schema/props/extensions/)' : `\`${t}\``;
  }
  if (node.const !== undefined) return `\`'${node.const}'\``;
  if (node.type === 'array') {
    const item = node.items?.$ref ? defName(node.items.$ref) : node.items?.type ?? 'unknown';
    return `\`${item}[]\``;
  }
  if (Array.isArray(node.type)) return node.type.map((t) => `\`${t}\``).join(' · ');
  if (node.additionalProperties?.oneOf) {
    const kinds = node.additionalProperties.oneOf.map((b) => defName(b.$ref));
    return `map of ${kinds.map((k) => `[\`${k}\`](/schema/props/${k.replace(/Prop$/, '').toLowerCase()}/)`).join(' · ')}`;
  }
  return `\`${node.type ?? 'unknown'}\``;
};

/** First sentence of a description — the member table wants a gloss, not the essay. */
const gloss = (s) => {
  if (!s) return '';
  const first = s.split(/(?<=\.)\s+/)[0] ?? s;
  return first.length > 220 ? `${first.slice(0, 217)}…` : first;
};

const emit = createEmitter({ root: outRoot, label: 'site/src/content/docs/schema/props/' });

const header = (title, description) => `${frontmatter({ title, description })}\n\n${BANNER}\n`;

// ── Kind pages and their member pages ────────────────────────────────────────
for (const [kind, typeName] of Object.entries(KINDS)) {
  const def = defs[typeName];
  const required = new Set(def.required ?? []);
  const kept = preserved.kinds?.[kind] ?? {};
  const members = Object.entries(def.properties ?? {});
  const discriminator = def.properties?.type?.const;

  const memberRows = members.map(([m, node]) => {
    const hasPage = m !== 'type' && m !== '$extensions' && !SHARED_MEMBERS.has(m);
    const name = hasPage
      ? `[\`${m}\`](/schema/props/${kind}/${kebab(m)}/)`
      : m === '$extensions'
        ? `[\`$extensions\`](/schema/props/extensions/)`
        : m === 'nullable'
          // The per-kind variation — what absence means — is one cell of the
          // hub's cross-kind table, so the row links there, not to a page.
          ? `[\`nullable\`](/schema/props/#nullability)`
          : `\`${m}\``;
    const g = m === 'type'
      ? discriminatorGloss(discriminator)
      : m === '$extensions'
        ? EXTENSIONS_GLOSS
        : gloss(node.description);
    return `| ${name} | ${typeOf(node)} | ${required.has(m) ? 'Yes' : 'No'} | ${g} |`;
  });

  const examples = Array.isArray(def.examples)
    ? def.examples.map((ex) => `\`\`\`yaml\n${toYaml(ex)}\n\`\`\``).join('\n\n')
    : '';

  /**
   * One subheading per platform, carrying the whole per-platform story: the
   * binding's fields, EVERY rule the kind participates in on that platform —
   * declared on its row or reached only through a rule's key list — with the
   * sibling kinds, and the notes. The former Resolved jointly section split
   * these facts across two places, and neither was complete.
   */
  const bindingRows = platformBindingSections({
    bindings,
    unit: kind,
    conceptKey: 'props',
    rulesKey: 'propRules',
    siblingBase: '/schema/props/',
    labels: BINDING_LABELS,
  });

  const keptSections = Object.entries(kept.sections ?? {})
    .map(([name, body]) => `\n## ${name}\n\n${body}\n`)
    .join('');

  const rules = [];
  if (def.properties?.nullable) {
    rules.push('| [DSPEC-12](/schema/specification/#9-rule-catalogue) | `null` is meaningful only under a nullable prop |');
  }
  if (kind === 'object') {
    rules.push('| [DSPEC-13](/schema/specification/#9-rule-catalogue) | A member name must not begin with `$` and must not contain the declared separator |');
  }

  const page = `${header(typeName, def.description ?? `The ${typeName} prop kind`)}
${def.description ?? ''}${kept.intro ? ` ${kept.intro}` : ''}

## Path

${PATH_ROOT}.\`<prop>\`

## Members

| Member | Type | Required | Description |
|---|---|---|---|
${memberRows.join('\n')}
${examples ? `\n## Example${(def.examples?.length ?? 0) > 1 ? 's' : ''}\n\n${examples}\n` : ''}
${keptSections}
## Platform bindings

${bindingRows}

## Decisions

${kindDecisionSection(kind, members.map(([m]) => m))}${
    rules.length ? `\n## Rules\n\n| Rule | Statement |\n|---|---|\n${rules.join('\n')}\n` : ''
  }${sourceSection(kind)}`;

  emit.write(join(outRoot, `${kind}.md`), page);

  // Member pages — every property except the discriminator and `$extensions`.
  for (const [m, node] of members) {
    if (m === 'type' || m === '$extensions' || SHARED_MEMBERS.has(m)) continue;
    const dir = join(outRoot, kind);

    const desc = node.description ?? '';
    const hasFieldDefault = Object.prototype.hasOwnProperty.call(node, 'default');

    /**
     * Bounds ride the type they qualify, on one line — `minimum` is a fact
     * about the declared `integer`, and a detached "Constraints:" line read
     * as a separate mechanism when it is the same schema keyword away.
     */
    const constraints = [];
    if (node.minimum !== undefined) constraints.push(CONSTRAINTS.minimum(node.minimum));
    if (node.minItems !== undefined) constraints.push(CONSTRAINTS.minItems(node.minItems));
    if (node.minProperties !== undefined) constraints.push(CONSTRAINTS.minProperties(node.minProperties));

    const valueLine = `${typeOf(node)}${constraints.length ? `, ${constraints.join(', ')}` : ''}${required.has(m) ? ' · required' : ''}${
      hasFieldDefault ? ` · ${absentMeans(node.default)}` : ''
    }`;

    /**
     * Property-level `examples`, written as the member appears in a document.
     * A one-line value becomes a bullet; a composite gets its own block.
     */
    const memberExamples = Array.isArray(node.examples) && node.examples.length
      ? node.examples
          .map((ex) => {
            const body = toYaml({ [m]: ex });
            return body.includes('\n') ? `\`\`\`yaml\n${body}\n\`\`\`` : `- \`${body}\``;
          })
          .join(node.examples.every((ex) => !toYaml({ [m]: ex }).includes('\n')) ? '\n' : '\n\n')
      : '';

    // Narrative carried from the replaced pages, homed on the member it
    // documents rather than on the kind page — the kind page stays a map.
    const memberSections = Object.entries(preserved.members?.[`${kind}.${m}`]?.sections ?? {})
      .map(([name, body]) => `\n## ${name}\n\n${body}\n`)
      .join('');

    const memberPage = `${header(m, desc || fallbackMemberDescription(m, typeName))}
${desc}

## Path

${PATH_ROOT}.[\`<${typeName} prop>\`](/schema/props/${kind}/).\`${m}\`

## Value

${valueLine}
${memberExamples ? `\n## Example${node.examples.length > 1 ? 's' : ''}\n\n${memberExamples}\n` : ''}${memberSections}
## Decisions

${decisionSection(m, `props.${kind}.${m}`)}${sourceSection(kind)}`;

    emit.write(join(dir, `${kebab(m)}.md`), memberPage);
  }
}

// ── The extensions page — provenance, documented once ────────────────────────
{
  const sections = ['PropExtensions', 'FigmaPropExtension', 'FigmaCodeOnlySource'].map((name) => {
    const def = defs[name];
    const required = new Set(def.required ?? []);
    const rows = Object.entries(def.properties ?? {}).map(([m, node]) => {
      const target = defName(node.$ref);
      const linked = target && ['FigmaPropExtension', 'FigmaCodeOnlySource'].includes(target)
        ? `[\`${target}\`](#${target.toLowerCase()})`
        : typeOf(node);
      return `| \`${m}\` | ${linked} | ${required.has(m) ? 'Yes' : 'No'} | ${gloss(node.description)} |`;
    });
    const example = Array.isArray(def.examples) && def.examples.length
      ? `\n\`\`\`yaml\n${toYaml(def.examples[0])}\n\`\`\`\n`
      : '';
    return `## ${name}

${def.description ?? ''}

| Member | Type | Required | Description |
|---|---|---|---|
${rows.join('\n')}
${example}`;
  });

  const page = `${header(EXTENSIONS_PAGE.title, EXTENSIONS_PAGE.description)}
${preserved.extensionsPage?.intro ?? defs.PropExtensions.description ?? ''}

## Path

${PATH_ROOT}.\`<prop>\`.\`$extensions\` ${EXTENSIONS_PAGE.pathSuffix}

${sections.join('\n')}${Object.entries(preserved.extensionsPage?.sections ?? {})
    .map(([name, body]) => `## ${name}\n\n${body}\n\n`)
    .join('')}## Decisions

${decisionSection('$extensions', 'props.$extensions')}${sourceSection()}`;

  emit.write(join(outRoot, 'extensions.md'), page);
}

console.log(emit.summary(emit.commit()));
