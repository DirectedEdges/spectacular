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

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
// All page copy lives in content/ — this script holds structure only.
import {
  BANNER, PATH_ROOT, JOINTLY_INTRO, CARRIES_INTRO, DECISIONS_NONE, SOURCE_SECTION,
} from './content/anatomy-pages.mjs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '..');
const repo = resolve(site, '..');
const pkg = join(repo, 'packages/schema');
const outRoot = join(site, 'src/content/docs/schema/anatomy');

const defs = JSON.parse(readFileSync(join(pkg, 'schema/component.schema.json'), 'utf8')).definitions;

const preservedFile = join(pkg, 'mappings/_anatomy-page-content.json');
const preserved = existsSync(preservedFile) ? JSON.parse(readFileSync(preservedFile, 'utf8')) : { types: {} };

const bindings = Object.fromEntries(
  ['figma', 'css', 'react', 'webcomponents']
    .filter((p) => existsSync(join(pkg, `mappings/bindings/${p}.json`)))
    .map((p) => [p, JSON.parse(readFileSync(join(pkg, `mappings/bindings/${p}.json`), 'utf8'))])
);
const PLATFORM = { figma: 'Figma', css: 'CSS', react: 'React', webcomponents: 'Web Components' };

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, '');

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
    `${repo}/../specs-transforms/packages/specs-from-figma/src/Component/Styles/style-bindings.json`,
    `${repo}/../specs-transforms/packages/figma-from-specs/src/Styles/style-bindings.json`,
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

// ── ADR decisions, same declaration contract as the style and prop pages ─────
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
  const re = new RegExp(`(?<![\\w-])${key}(?![\\w-])`);
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
    out.push({ num: f.slice(0, 3), title, file: f });
  }
  return out;
};

const emitted = new Set();
const writeIfChanged = (file, contents) => {
  emitted.add(file);
  if (existsSync(file) && readFileSync(file, 'utf8') === contents) return false;
  writeFileSync(file, contents);
  return true;
};

let written = 0;
for (const { type, description } of TYPES) {
  const kept = preserved.types?.[type] ?? {};

  const bindingRows = Object.entries(bindings)
    .map(([platform, b]) => {
      const v = b.concepts?.anatomy?.[type] ?? { disposition: 'unverified' };
      const realises = v.target
        ? `\`${v.target}\``
        : v.module
          ? (v.module.length ? v.module.map((m) => `\`${m}\``).join(', ') : '—')
          : (v.realises ?? '—');
      const rule = v.rule
        ? ` · rule [${v.rule}](/schema/mappings/${platform}/rules/${kebab(v.rule)}/)`
        : '';
      // One subheading per platform: the binding's notes live here, where each
      // is one paragraph about this type, not a wall on the platform page.
      const fields = `**Disposition**: ${v.disposition === 'unverified' ? '**unverified**' : v.disposition} · **Realised by**: ${realises}${rule}`;
      return `##### [${PLATFORM[platform]}](/schema/mappings/${platform}/)\n\n${fields}${v.notes ? `\n\n${v.notes}` : ''}`;
    })
    .join('\n\n');

  const jointly = (() => {
    const groups = [];
    for (const [platform, b] of Object.entries(bindings)) {
      for (const [name, c] of Object.entries(b.concepts?.anatomyRules ?? {})) {
        if (!(c.keys ?? []).includes(type)) continue;
        const others = c.keys.filter((k) => k !== type);
        groups.push(
          `- **[${name}](/schema/mappings/${platform}/rules/${kebab(name)}/)** — ${PLATFORM[platform]}${
            others.length ? `, with ${others.map((k) => `[\`${k}\`](/schema/anatomy/${k}/)`).join(', ')}` : ''
          }`
        );
      }
    }
    return groups.length ? groups.join('\n') : null;
  })();

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
    .map(([name, body]) => `\n### ${name}\n\n${body}\n`)
    .join('');

  const decisions = (() => {
    const adrs = adrsFor(type, `anatomy.${type}`);
    if (!adrs.length) return DECISIONS_NONE;
    return `${adrs.map((a) => `- [ADR-${a.num}](/adr/${a.file.replace(/\.md$/, '')}/) — ${a.title}`).join('\n')}\n`;
  })();

  const page = `---
title: "${type}"
description: "${description.replace(/"/g, '\\"').slice(0, 300)}"
---

${BANNER}

${description}${kept.intro ? ` ${kept.intro}` : ''}

### Path

${PATH_ROOT}.\`<element>\`.\`type: ${type}\`

${carries ? `### Styles\n\n${CARRIES_INTRO}\n\n${carries}\n` : ''}${keptSections}
### Platform bindings

${bindingRows}
${jointly ? `\n### Resolved jointly\n\n${JOINTLY_INTRO}\n\n${jointly}\n` : ''}
### Decisions

${decisions}
${SOURCE_SECTION}
`;

  mkdirSync(outRoot, { recursive: true });
  if (writeIfChanged(join(outRoot, `${type}.md`), page)) written++;
}

/** Pages from an earlier run that this one no longer emits. */
const removed = (() => {
  const out = [];
  if (!existsSync(outRoot)) return out;
  for (const entry of readdirSync(outRoot)) {
    const full = join(outRoot, entry);
    if (entry.endsWith('.md') && !emitted.has(full)) {
      rmSync(full);
      out.push(full);
    }
  }
  return out;
})();

console.log(
  `${emitted.size} pages under site/src/content/docs/schema/anatomy/ — ${written} changed, ${emitted.size - written} unchanged, ${removed.length} removed`
);
