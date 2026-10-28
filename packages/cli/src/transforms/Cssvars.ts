// cssvars — library-level transform emitting CSS variable definitions from
// fetched library data, so the css transform's var() references resolve
// without hand-maintained token files. Free capability (no license seam).
//
// Output: <workspace>/assets/cssvars/cssvars.css + modes.json, beside the
// images/ and icons/ folders fetch and generate drop at library level.
//
// Sources, all discovered in the workspace data directory:
//   *.variables.json  — variable definitions incl. subscribed (remote)
//                       collections; multi-mode collections get
//                       :root[data-<collection>="<mode>"] override blocks
//   *.file.json       — style TABLES carry no definitions (REST limitation),
//                       so text/effect/fill style values are recovered from
//                       nodes in the file document that consume each style
//   *.styles.json     — style metadata (names for published styles)
//
// Effect styles emit one var per role — <name>-shadows / -layer-blur /
// -background-blur — matching how styleToCSS applies them (none fallbacks).

import fs from 'fs-extra';
import path from 'path';
import { writeAtomic } from './writeAtomic.js';
import type { Transformer, TransformerContext } from '../transforms/transformer.js';
import { kebabizePath } from './css/values/tokens.js';
import { reportNameWarnings } from './css/values/nameWarnings.js';
import { recordExternalWrite } from './externalWrites.js';
import { loadFoundations, type FoundationsData } from '../utilities/loadFoundations.js';
import { SectionedFile } from '../utilities/sectionedFile.js';

type Json = Record<string, any>;

/**
 * Figma scopes that settle a FLOAT as a length. A variable scoped to one of
 * these is a dimension whatever it is called — `border weight/1x` is scoped
 * `STROKE_FLOAT`, and reading "weight" out of its name emitted `8` where CSS
 * needs `8px`, so every `border-width: var(…)` using it was dropped as invalid.
 */
const DIMENSION_SCOPES = new Set([
  'STROKE_FLOAT',
  'WIDTH_HEIGHT',
  'GAP',
  'CORNER_RADIUS',
  'FONT_SIZE',
  'LETTER_SPACING',
  'PARAGRAPH_SPACING',
  'PARAGRAPH_INDENT',
  'EFFECT_FLOAT',
]);

/** Figma scopes that settle a FLOAT as a bare number. */
const UNITLESS_SCOPES = new Set(['OPACITY', 'FONT_WEIGHT']);

/**
 * Last resort, for variables whose scopes settle nothing.
 *
 * It cannot be dropped: real font-weight variables in the validation libraries
 * carry `FONT_STYLE` or no scope at all, never `FONT_WEIGHT`, so this pattern is
 * the only thing keeping them unitless. It is consulted after the scopes, never
 * before, so a declared dimension can no longer be overridden by its name.
 */
const UNITLESS = /opacity|weight|z-index|line-height-multiplier/i;

const WEIGHTS: Record<string, number> = {
  thin: 100, extralight: 200, light: 300, regular: 400, normal: 400,
  medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900,
};

export class CssvarsTransformer implements Transformer {
  readonly name = 'cssvars';

  private dataDirectory?: string;
  private scoped = false;

  async run(_apiYaml: Record<string, unknown>, context: TransformerContext): Promise<void> {
    // Library-level transform: the per-component pass only captures context;
    // all output is produced once, in finalize().
    this.dataDirectory = context.dataDirectory ?? this.dataDirectory;
    this.scoped = context.scoped ?? false;
  }

  async finalize(outputDir: string): Promise<void> {
    if (this.scoped) {
      console.warn('  [cssvars] skipped — library-level output is unchanged by a --components run');
      return;
    }
    const dataDir = this.dataDirectory;
    if (!dataDir || !fs.existsSync(dataDir)) {
      console.warn('  [cssvars] no data directory found — skipping (run `specs fetch` first)');
      return;
    }
    const entries = fs.readdirSync(dataDir);
    const variablePaths = entries.filter(f => f.endsWith('.variables.json')).map(f => path.join(dataDir, f));
    const stylePaths = entries.filter(f => f.endsWith('.styles.json')).map(f => path.join(dataDir, f));
    const filePaths = entries.filter(f => f.endsWith('.file.json')).map(f => path.join(dataDir, f));
    // Page-split payloads (specs#563): assemble every page — style-definition
    // recovery walks the whole document by design.
    const splitAliases = entries
      .filter(f => f.endsWith('.file') && fs.existsSync(path.join(dataDir, f, 'manifest.json')))
      .map(f => f.replace(/\.file$/, ''));
    if (variablePaths.length === 0 && filePaths.length === 0 && splitAliases.length === 0) {
      console.warn(`  [cssvars] no *.variables.json, *.file.json, or *.file/ in ${dataDir} — skipping`);
      return;
    }

    const fileJsons: Json[] = await Promise.all(filePaths.map(p => fs.readJSON(p)));
    for (const alias of splitAliases) {
      const sectioned = SectionedFile.open(dataDir, alias);
      if (!sectioned) continue;
      fileJsons.push(sectioned.assembleDocument(sectioned.pageEntries().map(e => e.id)).json as Json);
    }
    const foundations = await loadFoundations(variablePaths, stylePaths, fileJsons[0]);
    // Seed style tables from any additional file JSONs (loadFoundations takes one).
    for (const fj of fileJsons.slice(1)) {
      for (const [styleId, s] of Object.entries<Json>(fj.styles ?? {})) {
        const type = s?.styleType || s?.type;
        if (!styleId || !type || foundations.styles.has(styleId)) continue;
        foundations.styles.set(styleId, { id: styleId, name: s?.name || styleId, type });
      }
    }

    const defs = collectStyleDefs(fileJsons);
    const varName = (name: string) => `--${kebabizePath(name)}`;

    // ── Variables (including subscribed/remote collections) ─────────────────
    const varLines: string[] = [];
    const seen = new Set<string>();
    // Names, not just a count: a skipped variable is still referenced by name in
    // the stylesheets, so knowing which ones were skipped is what turns an
    // unexplained transparent surface into a traceable one.
    const skipped: string[] = [];
    for (const v of foundations.variables.values()) {
      const name = varName(fullName(v, foundations));
      if (seen.has(name)) continue;
      const rendered = renderValue(v, defaultModeValue(v, foundations), foundations, varName);
      if (rendered === null) {
        skipped.push(name);
        continue;
      }
      seen.add(name);
      varLines.push(`  ${name}: ${rendered};`);
    }

    // ── Collection modes (local multi-mode collections) ──────────────────────
    // Each non-default mode gets an attribute-scoped override block the
    // consumer switches by stamping data attributes on the root element.
    const modeBlocks: string[] = [];
    const modesManifest: Json = {};
    for (const coll of foundations.collections.values()) {
      if (coll.remote) continue;
      if (!Array.isArray(coll.modes) || coll.modes.length < 2) continue;
      const attr = `data-${kebabizePath(coll.name)}`;
      const defaultMode = coll.modes.find((m: Json) => m.modeId === coll.defaultModeId);
      modesManifest[coll.name] = {
        attr,
        modes: coll.modes.map((m: Json) => m.name),
        default: defaultMode?.name ?? coll.modes[0].name,
      };
      for (const mode of coll.modes) {
        if (mode.modeId === coll.defaultModeId) continue;
        const overrides: string[] = [];
        for (const vid of coll.variableIds ?? []) {
          const v = foundations.variables.get(vid);
          if (!v || v.remote) continue;
          const value = v.valuesByMode?.[mode.modeId];
          if (value === undefined) continue;
          const rendered = renderValue(v, value, foundations, varName);
          if (rendered === null) continue;
          overrides.push(`  ${varName(fullName(v, foundations))}: ${rendered};`);
        }
        if (overrides.length) {
          modeBlocks.push(`:root[${attr}="${kebabizePath(mode.name)}"] {\n${overrides.sort().join('\n')}\n}`);
        }
      }
    }

    // ── Text styles → font shorthands ────────────────────────────────────────
    const fontLines: string[] = [];
    const missingText: string[] = [];
    const textEntries = [...foundations.styles.values()].filter(s => s.type === 'TEXT');
    const defByName = new Map<string, Json>();
    for (const s of textEntries) {
      const def = defs.text.get(s.id);
      if (def) defByName.set(s.name, def);
    }
    const emittedText = new Set<string>();
    for (const s of textEntries) {
      const name = varName(s.name);
      if (emittedText.has(name)) continue;
      let def = defs.text.get(s.id);
      if (!def) {
        // Fallback: borrow metrics from a sibling style differing only by a
        // trailing weight word, then swap the weight.
        const m = s.name.match(/^(.*?)[\s/]*(\w+)$/);
        const weightWord = m && WEIGHTS[m[2].toLowerCase()] !== undefined ? m[2].toLowerCase() : 'regular';
        const base = m && WEIGHTS[m[2].toLowerCase()] !== undefined ? m[1].replace(/[\s/]+$/, '') : s.name;
        const sibling = [...defByName.entries()].find(([n]) => n.startsWith(base) && n !== s.name);
        if (sibling) def = { ...sibling[1], fontWeight: WEIGHTS[weightWord] };
      }
      if (!def) {
        missingText.push(s.name);
        continue;
      }
      emittedText.add(name);
      const family = def.fontFamily ? `"${def.fontFamily}", sans-serif` : 'sans-serif';
      const weight = def.fontWeight ?? 400;
      const size = round2(def.fontSize ?? 16);
      const lh = def.lineHeightPx ? `/${round2(def.lineHeightPx)}px` : '';
      const italic = def.italic || /italic/i.test(def.fontPostScriptName || '') ? 'italic ' : '';
      fontLines.push(`  ${name}: ${italic}${weight} ${size}px${lh} ${family};`);
      if (def.letterSpacing) {
        fontLines.push(`  ${name}-letter-spacing: ${round2(def.letterSpacing)}px;`);
      }
    }

    // ── Effect styles → per-role vars (-shadows / -layer-blur / -background-blur)
    const effectLines: string[] = [];
    const missingEffects: string[] = [];
    const emittedEffect = new Set<string>();
    const boundVar = (bv: Json | undefined): string | null => {
      if (!bv?.id) return null;
      const target = foundations.variables.get(bv.id);
      return target ? `var(${varName(fullName(target, foundations))})` : null;
    };
    for (const s of [...foundations.styles.values()].filter(x => x.type === 'EFFECT')) {
      const name = varName(s.name);
      if (emittedEffect.has(name)) continue;
      const effects = defs.effect.get(s.id);
      if (!effects) {
        missingEffects.push(s.name);
        continue;
      }
      emittedEffect.add(name);
      const shadows = effects.filter((e: Json) => (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.visible !== false);
      if (shadows.length) {
        const parts = shadows.map((e: Json) => {
          const bv = e.boundVariables ?? {};
          const x = boundVar(bv.offsetX) ?? px(e.offset?.x);
          const y = boundVar(bv.offsetY) ?? px(e.offset?.y);
          const r = boundVar(bv.radius) ?? px(e.radius);
          const sp = boundVar(bv.spread) ?? px(e.spread);
          const c = boundVar(bv.color) ?? colorToCss(e.color);
          return `${e.type === 'INNER_SHADOW' ? 'inset ' : ''}${x} ${y} ${r} ${sp} ${c}`;
        });
        effectLines.push(`  ${name}-shadows: ${parts.join(', ')};`);
      }
      for (const [type, suffix] of [['LAYER_BLUR', 'layer-blur'], ['BACKGROUND_BLUR', 'background-blur']] as const) {
        const blur = effects.find((e: Json) => e.type === type && e.visible !== false);
        if (blur) {
          effectLines.push(`  ${name}-${suffix}: blur(${boundVar(blur.boundVariables?.radius) ?? px(blur.radius)});`);
        }
      }
    }

    // ── Fill styles → colors / gradient functions ────────────────────────────
    const fillLines: string[] = [];
    const emittedFill = new Set<string>();
    for (const s of [...foundations.styles.values()].filter(x => x.type === 'FILL')) {
      const name = varName(s.name);
      if (emittedFill.has(name)) continue;
      const fills = defs.fill.get(s.id);
      if (!fills) continue;
      // Topmost visible paint is what renders (Figma paints bottom→top).
      const paint = [...fills].reverse().find((p: Json) => p.visible !== false);
      if (!paint) continue;
      const value = paint.type === 'SOLID' ? colorToCss(paint.color) : gradientCss(paint, boundVar);
      if (value) {
        emittedFill.add(name);
        fillLines.push(`  ${name}: ${value};`);
      }
    }

    const css = `/* Generated. Do not edit — regenerate with \`specs react\` or \`specs webcomponents\`. */
:root {
${varLines.sort().join('\n')}

  /* Text styles (font shorthands recovered from file document usage) */
${fontLines.sort().join('\n')}

  /* Effect styles (role vars: -shadows / -layer-blur / -background-blur) */
${effectLines.sort().join('\n')}

  /* Fill styles (colors / gradient functions recovered from file document usage) */
${fillLines.sort().join('\n')}
}

/* ── Collection modes (switch by stamping the data attribute on :root) ── */
${modeBlocks.join('\n\n')}
`;

    // Library-level, platform-neutral CSS custom properties: an asset by the test
    // that it would be byte-identical in a React-only and a Lit-only world
    // (project 024). `outputDir` here is the specs root, so assets/ is its sibling.
    const cssvarsDir = path.join(outputDir, '..', 'assets', 'cssvars');
    await fs.ensureDir(cssvarsDir);
    await writeAtomic(path.join(cssvarsDir, 'cssvars.css'), css);
    await writeAtomic(path.join(cssvarsDir, 'modes.json'), JSON.stringify(modesManifest, null, 2) + '\n');
    recordExternalWrite('cssvars', {
      path: 'assets/cssvars/cssvars.css',
      note:
        'Every emitted stylesheet reads these custom properties. Load it once, globally — ' +
        'without it components render unstyled.',
    });
    recordExternalWrite('cssvars', {
      path: 'assets/cssvars/modes.json',
      note: 'The collections and modes the stylesheet defines, for whatever switches between them.',
    });

    const skippedAliases = skipped.length;
    if (skippedAliases) {
      const shown = [...new Set(skipped)].sort();
      console.warn('');
      console.warn(
        `⚠ [cssvars] ${skippedAliases} variable${skippedAliases === 1 ? '' : 's'} alias a variable outside this ` +
        `workspace's payload and have no definition. Stylesheets still reference them by name; each reference ` +
        `falls back to the value the spec cached for it, where it has one.`
      );
      for (const n of shown.slice(0, 12)) console.warn(`    ${n}`);
      if (shown.length > 12) console.warn(`    …and ${shown.length - 12} more`);
    }

    const missing = missingText.length + missingEffects.length;
    console.log(
      `  [cssvars] ${varLines.length} variables, ${fontLines.length} text-style lines, ${effectLines.length} effect-style lines, ` +
      `${fillLines.length} fill-style lines, ${modeBlocks.length} mode blocks` +
      (skippedAliases ? `, ${skippedAliases} unresolvable aliases skipped` : '') +
      (missing ? `, ${missing} styles without usage (no definition recoverable)` : '')
    );
    reportNameWarnings('cssvars');
  }
}

// ---------------------------------------------------------------------------
// Style definition recovery — the REST styles endpoint carries no definitions,
// so they are recovered from nodes in the file document that consume each
// style (node.styles.text/effect/fill → node.style/effects/fills).
// ---------------------------------------------------------------------------

interface StyleDefs {
  text: Map<string, Json>;
  effect: Map<string, Json[]>;
  fill: Map<string, Json[]>;
}

function collectStyleDefs(fileJsons: Json[]): StyleDefs {
  const defs: StyleDefs = { text: new Map(), effect: new Map(), fill: new Map() };
  const walk = (node: Json | undefined): void => {
    if (!node) return;
    const styles = node.styles ?? {};
    if (styles.text && node.style && !defs.text.has(styles.text)) defs.text.set(styles.text, node.style);
    if (styles.effect && Array.isArray(node.effects) && node.effects.length && !defs.effect.has(styles.effect)) {
      defs.effect.set(styles.effect, node.effects);
    }
    if (styles.fill && Array.isArray(node.fills) && node.fills.length && !defs.fill.has(styles.fill)) {
      defs.fill.set(styles.fill, node.fills);
    }
    (node.children ?? []).forEach(walk);
  };
  for (const fj of fileJsons) walk(fj.document);
  return defs;
}

// ---------------------------------------------------------------------------
// Value rendering
// ---------------------------------------------------------------------------

/** Spec token paths are "<collection name>/<variable name>" — mirror that. */
function fullName(v: Json, foundations: FoundationsData): string {
  const coll = foundations.collections.get(v.variableCollectionId);
  return coll ? `${coll.name}/${v.name}` : v.name;
}

function defaultModeValue(v: Json, foundations: FoundationsData): unknown {
  const coll = foundations.collections.get(v.variableCollectionId);
  const modeId = coll?.defaultModeId ?? Object.keys(v.valuesByMode ?? {})[0];
  return v.valuesByMode?.[modeId] ?? Object.values(v.valuesByMode ?? {})[0];
}

function renderValue(
  v: Json,
  value: unknown,
  foundations: FoundationsData,
  varName: (name: string) => string,
): string | null {
  if (value && typeof value === 'object' && (value as Json).type === 'VARIABLE_ALIAS') {
    const target = foundations.variables.get((value as Json).id);
    if (target) return `var(${varName(fullName(target, foundations))})`;
    return null; // alias to a variable outside this workspace's payload
  }
  switch (v.resolvedType) {
    case 'COLOR':
      return colorToCss(value as Json);
    case 'FLOAT': {
      // Declared scope first, name only when the scopes settle nothing.
      const scopes = v.scopes ?? [];
      if (scopes.some((s: string) => DIMENSION_SCOPES.has(s))) return `${value}px`;
      if (scopes.some((s: string) => UNITLESS_SCOPES.has(s))) return String(value);
      return UNITLESS.test(v.name) ? String(value) : `${value}px`;
    }
    default:
      return String(value);
  }
}

function colorToCss(c: Json | undefined): string {
  if (!c) return 'transparent';
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  const a = c.a === undefined ? 1 : c.a;
  if (a >= 1) {
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(4))})`;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const px = (n: number | undefined): string => (n ? `${round2(n)}px` : '0');
const pct = (n: number): string => `${round2(n * 100)}%`;

/**
 * REST gradient paint → CSS gradient function. Angle from handles in Y-down
 * screen space: θ = atan2(dx, −dy). Angular sweeps start at Figma's 3 o'clock
 * (CSS `from 90deg`); rotation is an accepted limitation (no schema support).
 */
function gradientCss(p: Json, boundVar: (bv: Json | undefined) => string | null): string | null {
  const h = p.gradientHandlePositions;
  if (!h || !Array.isArray(p.gradientStops) || p.gradientStops.length < 2) return null;
  const stops = p.gradientStops
    .map((s: Json) => `${boundVar(s.boundVariables?.color) ?? colorToCss(s.color)} ${pct(s.position)}`)
    .join(', ');
  if (p.type === 'GRADIENT_LINEAR') {
    const raw = Math.atan2(h[1].x - h[0].x, -(h[1].y - h[0].y)) * 180 / Math.PI;
    const angle = round2(((raw % 360) + 360) % 360);
    return `linear-gradient(${angle}deg, ${stops})`;
  }
  const at = `at ${pct(h[0].x)} ${pct(h[0].y)}`;
  if (p.type === 'GRADIENT_RADIAL') return `radial-gradient(${at}, ${stops})`;
  // CSS conic and Figma's angular sweep both start at 12 o'clock, so no
  // conversion is applied. The rotation an angular gradient appears at comes
  // from the node, which the spec records as `rotation` and the element
  // applies as a transform — the gradient value itself carries centre and
  // stops and no angle at all (ADR-003), in both capture and render. Adding a
  // 90-degree constant here turned the arc a second time.
  if (p.type === 'GRADIENT_ANGULAR') return `conic-gradient(from 0deg ${at}, ${stops})`;
  return null;
}
