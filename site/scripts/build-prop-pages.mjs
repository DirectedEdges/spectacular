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

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
// All page copy lives in content/ — this script holds structure only.
import {
  BANNER, PATH_ROOT, discriminatorGloss, EXTENSIONS_GLOSS, JOINTLY_INTRO,
  DECISIONS_NONE, CONSTRAINTS, absentMeans, fallbackMemberDescription,
  sourceSection, EXTENSIONS_PAGE,
} from './content/prop-pages.mjs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '..');
const repo = resolve(site, '..');
const pkg = join(repo, 'packages/schema');
const docsSchema = join(site, 'src/content/docs/schema');
const outRoot = join(docsSchema, 'props');

const defs = JSON.parse(readFileSync(join(pkg, 'schema/component.schema.json'), 'utf8')).definitions;

const preservedFile = join(pkg, 'mappings/_prop-page-content.json');
const preserved = existsSync(preservedFile)
  ? JSON.parse(readFileSync(preservedFile, 'utf8'))
  : { kinds: {}, extensionsPage: {} };

const bindings = Object.fromEntries(
  ['figma', 'css', 'react', 'webcomponents']
    .filter((p) => existsSync(join(pkg, `mappings/bindings/${p}.json`)))
    .map((p) => [p, JSON.parse(readFileSync(join(pkg, `mappings/bindings/${p}.json`), 'utf8'))])
);
const PLATFORM = { figma: 'Figma', css: 'CSS', react: 'React', webcomponents: 'Web Components' };

const kebab = (s) => s.replace(/^\$/, '').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, '');
const DEF_PREFIX = /^.*#\/definitions\//;

/** kind id → its definition, read off AnyProp's own union. */
const KINDS = Object.fromEntries(
  defs.AnyProp.oneOf.map((b) => {
    const name = b.$ref.replace(DEF_PREFIX, '');
    return [name.replace(/Prop$/, '').toLowerCase(), name];
  })
);

// ── YAML rendering, same contract as build-style-pages ──────────────────────
const yamlScalar = (v) => {
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return JSON.stringify(v);
  const s = String(v);
  const needsQuote =
    s === '' ||
    /^[#&*!|>%@`\-?:,[\]{}'"]/.test(s) ||
    /^(true|false|null|~|yes|no|on|off)$/i.test(s) ||
    /^[+-]?(\d|\.\d)/.test(s) ||
    /: |\s#|\n|\t/.test(s) ||
    s !== s.trim();
  return needsQuote ? JSON.stringify(s) : s;
};

const toYaml = (value, indent = 0) => {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}[]`;
    if (value.length <= 4 && value.every((x) => x === null || typeof x !== 'object')) {
      return `${pad}[${value.map(yamlScalar).join(', ')}]`;
    }
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          const body = toYaml(item, indent + 2);
          return `${pad}- ${body.slice(indent + 2)}`;
        }
        return `${pad}- ${yamlScalar(item)}`;
      })
      .join('\n');
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return `${pad}{}`;
    return entries
      .map(([k, v]) => {
        const key = yamlScalar(k);
        if (v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length : Object.keys(v).length)) {
          const body = toYaml(v, indent + 2);
          // Only an ARRAY body may join the key's line — a flow list is one
          // value. A single-entry map body is one line too, but inlining it
          // chains the keys into `$extensions: com.figma: visibilityProp: x`,
          // which is not YAML.
          if (!body.includes('\n') && Array.isArray(v)) return `${pad}${key}: ${body.trimStart()}`;
          return `${pad}${key}:\n${body}`;
        }
        return `${pad}${key}: ${toYaml(v, 0)}`;
      })
      .join('\n');
  }
  return `${pad}${yamlScalar(value)}`;
};

// ── ADR decisions, same declaration contract as the style pages ─────────────
const isAccepted = (src) =>
  (src.match(/^\*\*Status\*\*:\s*(\S+)/m)?.[1]?.replace(/[^A-Za-z]/g, '').toUpperCase() ?? '') === 'ACCEPTED';

const declaredDecides = (src) => {
  const line = src.match(/^\*\*Decides\*\*:\s*(.+)$/m)?.[1]?.trim();
  if (!line) return null;
  if (/^(none|—|-|\*\(none\)\*)$/i.test(line)) return [];
  return line.replace(/`/g, '').split(',').map((s) => s.trim()).filter(Boolean);
};

const adrsFor = (key, path) => {
  const dir = join(repo, 'adr');
  if (!existsSync(dir)) return [];
  const codeSpans = (text) => (text.match(/`[^`\n]+`/g) ?? []).join(' ');
  const re = new RegExp(`(?<![\\w-])${key.replace(/\$/g, '\\$')}(?![\\w-])`);
  const mentionsKey = (text) => re.test(codeSpans(text));
  const out = [];
  for (const f of readdirSync(dir).filter((n) => /^\d{3}-.*\.md$/.test(n))) {
    const src = readFileSync(join(dir, f), 'utf8');
    if (!isAccepted(src)) continue;
    const title = (src.match(/^#\s+(?:ADR[\s-]*\d*\s*:\s*)?(.+)$/m)?.[1] ?? f).trim();
    const declared = declaredDecides(src);
    const derivedDecides = () => {
      const summary = src.match(/^\*\*Summary\*\*:\s*(.+)$/m)?.[1] ?? '';
      const decision = src.match(/^## Decision[ \t]*\r?\n[\s\S]*?(?=^## |(?![\s\S]))/m)?.[0] ?? '';
      return mentionsKey(title) || mentionsKey(summary) || mentionsKey(decision);
    };
    const decides = declared ? declared.includes(path) : derivedDecides();
    if (!decides) continue;
    out.push({ num: f.slice(0, 3), title, file: f, declared: Boolean(declared) });
  }
  return out;
};

const decisionSection = (key, path) => {
  const adrs = adrsFor(key, path);
  if (!adrs.length) return DECISIONS_NONE;
  return `${adrs.map((a) => `- [ADR-${a.num}](/adr/${a.file.replace(/\.md$/, '')}/) — ${a.title}`).join('\n')}\n`;
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
    for (const a of adrsFor(key, path)) {
      if (seen.has(a.num)) continue;
      seen.add(a.num);
      out.push(a);
    }
  };
  collect(kind, `props.${kind}`);
  for (const m of memberNames.filter((n) => SHARED_MEMBERS.has(n))) collect(m, `props.${kind}.${m}`);
  if (!out.length) return DECISIONS_NONE;
  out.sort((a, b) => a.num.localeCompare(b.num));
  return `${out.map((a) => `- [ADR-${a.num}](/adr/${a.file.replace(/\.md$/, '')}/) — ${a.title}`).join('\n')}\n`;
};

// ── Member typing ────────────────────────────────────────────────────────────
/** The display type of one property node, in the schema's own names. */
const typeOf = (node) => {
  if (!node) return '—';
  if (node.$ref) {
    const t = node.$ref.replace(DEF_PREFIX, '');
    return t === 'PropExtensions' ? '[`PropExtensions`](/schema/props/extensions/)' : `\`${t}\``;
  }
  if (node.const !== undefined) return `\`'${node.const}'\``;
  if (node.type === 'array') {
    const item = node.items?.$ref ? node.items.$ref.replace(DEF_PREFIX, '') : node.items?.type ?? 'unknown';
    return `\`${item}[]\``;
  }
  if (Array.isArray(node.type)) return node.type.map((t) => `\`${t}\``).join(' · ');
  if (node.additionalProperties?.oneOf) {
    const kinds = node.additionalProperties.oneOf.map((b) => b.$ref.replace(DEF_PREFIX, ''));
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

// ── Emission bookkeeping, same contract as build-style-pages ────────────────
const emitted = new Set();
const writeIfChanged = (file, contents) => {
  emitted.add(file);
  if (existsSync(file) && readFileSync(file, 'utf8') === contents) return false;
  writeFileSync(file, contents);
  return true;
};

const header = (title, description) => `---
title: "${title}"
description: "${description.replace(/"/g, '\\"').slice(0, 300)}"
---

${BANNER}
`;

let written = 0;

// ── Kind pages and their member pages ────────────────────────────────────────
for (const [kind, defName] of Object.entries(KINDS)) {
  const def = defs[defName];
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

  const bindingRows = Object.entries(bindings)
    .map(([platform, b]) => {
      const v = b.concepts?.props?.[kind] ?? { disposition: 'unverified' };
      const realises = v.target
        ? `\`${v.target}\``
        : v.module
          ? (v.module.length ? v.module.map((m) => `\`${m}\``).join(', ') : '—')
          : (v.realises ?? '—');
      const rule = v.rule
        ? ` · rule [${v.rule}](/schema/mappings/${platform}/rules/${kebab(v.rule)}/)`
        : '';
      // One subheading per platform: the binding's notes live here, where each
      // is one paragraph about this kind, not a wall on the platform page.
      const fields = `**Disposition**: ${v.disposition === 'unverified' ? '**unverified**' : v.disposition} · **Realised by**: ${realises}${rule}`;
      return `##### [${PLATFORM[platform]}](/schema/mappings/${platform}/)\n\n${fields}${v.notes ? `\n\n${v.notes}` : ''}`;
    })
    .join('\n\n');

  /**
   * Rules this kind participates in, grouped per platform — same shape as
   * the style pages' "Resolved jointly with", except a kind keeps its own row
   * too: a kind is a population of props, and only some of it is governed by a rule.
   */
  const jointly = (() => {
    const groups = [];
    for (const [platform, b] of Object.entries(bindings)) {
      for (const [name, c] of Object.entries(b.concepts?.propRules ?? {})) {
        if (!(c.keys ?? []).includes(kind)) continue;
        const others = c.keys.filter((k) => k !== kind);
        groups.push(
          `**[${name}](/schema/mappings/${platform}/rules/${kebab(name)}/)** — ${PLATFORM[platform]}${
            others.length ? `, with ${others.map((k) => `[\`${k}\`](/schema/props/${k}/)`).join(', ')}` : ''
          }`
        );
      }
    }
    return groups.length ? groups.map((g) => `- ${g}`).join('\n') : null;
  })();

  const keptSections = Object.entries(kept.sections ?? {})
    .map(([name, body]) => `\n### ${name}\n\n${body}\n`)
    .join('');

  const rules = [];
  if (def.properties?.nullable) {
    rules.push('| [DSPEC-12](/schema/specification/#9-rule-catalogue) | `null` is meaningful only under a nullable prop |');
  }
  if (kind === 'object') {
    rules.push('| [DSPEC-13](/schema/specification/#9-rule-catalogue) | A member name must not begin with `$` and must not contain the declared separator |');
  }

  const page = `${header(defName, def.description ?? `The ${defName} prop kind`)}
${def.description ?? ''}${kept.intro ? ` ${kept.intro}` : ''}

### Path

${PATH_ROOT}.\`<prop>\`

### Members

| Member | Type | Required | Description |
|---|---|---|---|
${memberRows.join('\n')}
${examples ? `\n### Example${(def.examples?.length ?? 0) > 1 ? 's' : ''}\n\n${examples}\n` : ''}
### Platform bindings

${bindingRows}
${jointly ? `\n### Resolved jointly\n\n${JOINTLY_INTRO}\n\n${jointly}\n` : ''}${keptSections}
### Decisions

${kindDecisionSection(kind, members.map(([m]) => m))}${
    rules.length ? `\n### Rules\n\n| Rule | Statement |\n|---|---|\n${rules.join('\n')}\n` : ''
  }${sourceSection(kind)}`;

  mkdirSync(outRoot, { recursive: true });
  if (writeIfChanged(join(outRoot, `${kind}.md`), page)) written++;

  // Member pages — every property except the discriminator and `$extensions`.
  for (const [m, node] of members) {
    if (m === 'type' || m === '$extensions' || SHARED_MEMBERS.has(m)) continue;
    const dir = join(outRoot, kind);
    mkdirSync(dir, { recursive: true });

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
      .map(([name, body]) => `\n### ${name}\n\n${body}\n`)
      .join('');

    const memberPage = `${header(m, desc || fallbackMemberDescription(m, defName))}
${desc}

### Path

${PATH_ROOT}.[\`<${defName} prop>\`](/schema/props/${kind}/).\`${m}\`

### Value

${valueLine}
${memberExamples ? `\n### Example${node.examples.length > 1 ? 's' : ''}\n\n${memberExamples}\n` : ''}${memberSections}
### Decisions

${decisionSection(m, `props.${kind}.${m}`)}${sourceSection(kind)}`;

    if (writeIfChanged(join(dir, `${kebab(m)}.md`), memberPage)) written++;
  }
}

// ── The extensions page — provenance, documented once ────────────────────────
{
  const sections = ['PropExtensions', 'FigmaPropExtension', 'FigmaCodeOnlySource'].map((name) => {
    const def = defs[name];
    const required = new Set(def.required ?? []);
    const rows = Object.entries(def.properties ?? {}).map(([m, node]) => {
      const target = node.$ref?.replace(DEF_PREFIX, '');
      const linked = target && ['FigmaPropExtension', 'FigmaCodeOnlySource'].includes(target)
        ? `[\`${target}\`](#${target.toLowerCase()})`
        : typeOf(node);
      return `| \`${m}\` | ${linked} | ${required.has(m) ? 'Yes' : 'No'} | ${gloss(node.description)} |`;
    });
    const example = Array.isArray(def.examples) && def.examples.length
      ? `\n\`\`\`yaml\n${toYaml(def.examples[0])}\n\`\`\`\n`
      : '';
    return `### ${name}

${def.description ?? ''}

| Member | Type | Required | Description |
|---|---|---|---|
${rows.join('\n')}
${example}`;
  });

  const page = `${header(EXTENSIONS_PAGE.title, EXTENSIONS_PAGE.description)}
${preserved.extensionsPage?.intro ?? defs.PropExtensions.description ?? ''}

### Path

${PATH_ROOT}.\`<prop>\`.\`$extensions\` ${EXTENSIONS_PAGE.pathSuffix}

${sections.join('\n')}${Object.entries(preserved.extensionsPage?.sections ?? {})
    .map(([name, body]) => `### ${name}\n\n${body}\n\n`)
    .join('')}### Decisions

${decisionSection('$extensions', 'props.$extensions')}${sourceSection()}`;

  if (writeIfChanged(join(outRoot, 'extensions.md'), page)) written++;
}

/** Pages from an earlier run that this one no longer emits. */
const removed = (() => {
  const out = [];
  const sweep = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) sweep(full);
      else if (entry.name.endsWith('.md') && !emitted.has(full)) {
        rmSync(full);
        out.push(full);
      }
    }
  };
  sweep(outRoot);
  return out;
})();

console.log(
  `${emitted.size} pages under site/src/content/docs/schema/props/ — ${written} changed, ${emitted.size - written} unchanged, ${removed.length} removed`
);
