// Rewrites the generated facts block in every role and action concept page from
// the authoritative data in packages/schema/mappings/facts/ — the same
// authority inversion build-mappings.mjs performs for the style mapping pages
// (specs#691): the data declares, the page block renders, and hand-edits to the
// block are overwritten by design.
//
// A page's hand-written prose outside the markers is never touched: meaning
// stays authored, facts stay generated. A page whose concept has no facts entry
// gets a block saying so, which is itself a statement (the prose is the whole
// specification for that concept today).
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const factsDir = path.resolve(site, '../packages/schema/mappings/facts');
const roles = JSON.parse(readFileSync(path.join(factsDir, 'roles.json'), 'utf8'));
const actions = JSON.parse(readFileSync(path.join(factsDir, 'actions.json'), 'utf8'));

const OPEN = '<!-- facts:generated -->';
const CLOSE = '<!-- facts:end -->';
const NON_CONCEPT = new Set(['index', 'inventory', 'precedence', 'choosing']);
// A concept family shares one page; the filename names the family's first member.
const FAMILY = { open: ['open', 'close'] };

const code = (s) => '`' + s + '`';
const list = (items) => (items.length ? items.map(code).join(', ') : '—');

function obligationType(type) {
  switch (type.kind) {
    case 'eventHandler': return `event handler (${code(type.event)})`;
    case 'stateChange': return `state-change callback (${code(type.valueType)}) reporting ${code(type.state)}`;
    case 'enum': return type.values.map((v) => code(`'${v}'`)).join(' \\| ');
    default: return code(type.kind);
  }
}

function roleBlock(concept) {
  const spec = roles[concept];
  if (!spec) {
    return ['_No machine-readable facts are declared for this concept yet — the prose on this page is its whole specification._'];
  }
  const lines = [];
  lines.push('### Resolution facts');
  lines.push('');
  lines.push('| Fact | Value |');
  lines.push('|---|---|');
  lines.push(`| Accepted element types | ${list(spec.acceptedElementTypes)} |`);
  lines.push(`| Accepted parts | ${list(spec.acceptedParts)} |`);
  lines.push(`| Native states | ${list(spec.nativeStates)} |`);
  lines.push(`| Re-hosted element types | ${list(spec.rehostedElementTypes)} |`);
  lines.push(`| Phrasing content only | ${spec.phrasingOnly ? 'yes' : 'no'} |`);
  lines.push(`| Requires an accessible name | ${spec.requiresAccessibleName ? 'yes' : spec.namePreferred ? 'preferred — takes one if present, correct without' : 'no'} |`);
  if (spec.collapses) lines.push('| Collapses its subtree | yes |');
  if (spec.hidesSubtree) lines.push('| Hides its subtree from assistive technology | yes |');
  if (spec.proxyLabel) lines.push('| Visual proxy emits as a click-target label | yes |');
  if (spec.obligations.length) {
    lines.push('');
    lines.push('### Contract obligations');
    lines.push('');
    lines.push('| Prop | Type | Tier | Notes |');
    lines.push('|---|---|---|---|');
    for (const o of spec.obligations) {
      const notes = [];
      if (o.wired) notes.push('wired');
      if (o.requiresState) notes.push(`requires a states entry for ${[].concat(o.requiresState).map(code).join(' or ')}`);
      if (o.suppressedByName) notes.push('suppressed where a name resolved at build time');
      if (o.comment) notes.push(o.comment);
      lines.push(`| ${code(o.name)} | ${obligationType(o.type)} | ${o.tier} | ${notes.join('; ') || '—'} |`);
    }
  }
  return lines;
}

function payloadSource(source) {
  switch (source.from) {
    case 'componentId': return 'the dispatching component\'s id';
    case 'prop': return `the ${code(source.prop)} contract prop's current value`;
    case 'state': return `the prop the states convention binds to ${code(source.concept)}`;
    case 'args': return `the annotation's ${code(source.arg)} argument`;
    default: return code(source.from);
  }
}

function actionBlock(concepts) {
  const lines = [];
  for (const concept of concepts) {
    const spec = actions[concept];
    if (!spec) {
      lines.push(`_No machine-readable facts are declared for ${code(concept)} yet._`);
      continue;
    }
    if (concepts.length > 1) {
      lines.push(`### ${code(concept)}`);
      lines.push('');
    }
    lines.push('| Fact | Value |');
    lines.push('|---|---|');
    lines.push(`| Status | ${spec.status} |`);
    lines.push(`| Event name | ${code(spec.event ?? concept)} |`);
    if (spec.userMessage) lines.push(`| User message | ${spec.userMessage} |`);
    lines.push(`| Requires user activation | ${spec.requiresUserActivation ? 'yes' : 'no'} |`);
    lines.push('');
    lines.push('| Payload member | Source |');
    lines.push('|---|---|');
    for (const [member, source] of Object.entries(spec.payload)) {
      lines.push(`| ${code(member)} | ${payloadSource(source)} |`);
    }
    lines.push('');
  }
  while (lines.at(-1) === '') lines.pop();
  return lines;
}

function renderBlock(kind, concepts) {
  const body = kind === 'roles' ? roleBlock(concepts[0]) : actionBlock(concepts);
  return [
    OPEN,
    `<!-- Generated by site/scripts/build-concept-facts.mjs from packages/schema/mappings/facts/${kind}.json — edit the data, never this block. -->`,
    '',
    ...body,
    '',
    CLOSE,
  ].join('\n');
}

let rewritten = 0;
for (const kind of ['roles', 'actions']) {
  const dir = path.join(site, 'src/content/docs', kind);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.md')) continue;
    const base = file.replace(/\.md$/, '');
    if (NON_CONCEPT.has(base)) continue;
    const concepts = FAMILY[base] ?? [base];
    const full = path.join(dir, file);
    const text = readFileSync(full, 'utf8');
    const block = renderBlock(kind, concepts);
    let next;
    if (text.includes(OPEN) && text.includes(CLOSE)) {
      const before = text.slice(0, text.indexOf(OPEN));
      const after = text.slice(text.indexOf(CLOSE) + CLOSE.length);
      next = before + block + after;
    } else {
      // First adoption: the block lands before the page's first section heading,
      // after the hand-written intro and status line.
      const at = text.search(/^## /m);
      next = at === -1 ? `${text.trimEnd()}\n\n${block}\n` : `${text.slice(0, at)}${block}\n\n${text.slice(at)}`;
    }
    if (next !== text) {
      writeFileSync(full, next);
      rewritten += 1;
      console.log(`✓ ${kind}/${file}`);
    }
  }
}
console.log(`${rewritten} page(s) rewritten`);
