/**
 * Generates mappings/<PLATFORM>.md from mappings/bindings/<platform>.json plus the
 * JSON Schema itself.
 *
 * No dependency on any sibling checkout: the binding files are checked in and are
 * the source of truth, so this runs in the open repo alone. That is deliberate —
 * the mapping specification is published from `spectacular`, while the transforms
 * that implement it may live elsewhere.
 *
 * Completeness is enforced, not reported. Every property of `Styles` must appear in
 * every binding file; a key in the schema and absent from a binding file fails the
 * build. This mirrors the AssertNoMissingKeys guard in figma-from-specs/src/Styles/keys.ts,
 * which exists because a new StyleKey once landed in the schema, the reader began
 * emitting it, and the renderer silently dropped it (specs#689). A mapping document
 * without this guard is how code/style-mapping.md came to describe three mechanisms
 * the transformer had stopped using (specs#691).
 *
 * Usage:  node scripts/build-mappings.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const bindingsDir = join(pkg, 'mappings/bindings');

const schema = JSON.parse(readFileSync(join(pkg, 'schema/styles.schema.json'), 'utf8'));
const styleProps = Object.keys(schema.definitions.Styles.properties);
const styleDescription = (key) =>
  schema.definitions.Styles.properties[key]?.description ?? '';

const TITLES = { figma: 'Figma', react: 'React' };
const DISPOSITION_ORDER = ['bound', 'approximated', 'unsupported', 'unverified'];

const badge = (d) =>
  ({ bound: 'bound', approximated: 'approximated', unsupported: 'unsupported', unverified: '**unverified**' }[d] ?? d);

const failures = [];

const renderPlatform = (file) => {
  const platform = file.replace(/\.json$/, '');
  const b = JSON.parse(readFileSync(join(bindingsDir, file), 'utf8'));
  const styles = b.concepts?.styles ?? {};
  const title = TITLES[platform] ?? platform;

  const missing = styleProps.filter((k) => !(k in styles));
  const extra = Object.keys(styles).filter((k) => !styleProps.includes(k));
  if (missing.length) failures.push(`${file}: missing style keys — ${missing.join(', ')}`);
  if (extra.length) failures.push(`${file}: style keys not in the schema — ${extra.join(', ')}`);

  const counts = {};
  for (const v of Object.values(styles)) counts[v.disposition] = (counts[v.disposition] ?? 0) + 1;
  const tally = DISPOSITION_ORDER
    .filter((d) => counts[d])
    .map((d) => `${counts[d]} ${d}`)
    .join(', ');

  const isFigma = platform === 'figma';
  const col = isFigma ? 'Figma target' : 'CSS module';
  const cell = (v) =>
    isFigma
      ? v.target ? `\`${v.target}\`` : '—'
      : v.module?.length ? v.module.map((m) => `\`${m}\``).join(', ') : '—';

  const rows = styleProps.map((k) => {
    const v = styles[k] ?? { disposition: 'unverified' };
    const scope = isFigma
      ? (v.elements?.length === 12 ? 'all' : (v.elements?.length ? v.elements.join(', ') : '—'))
      : '';
    return `| \`${k}\` | ${badge(v.disposition)} | ${cell(v)} | ${isFigma ? scope + ' | ' : ''}${v.notes ?? ''} |`;
  });

  const header = isFigma
    ? `| Style key | Disposition | ${col} | Element types | Notes |\n|---|---|---|---|---|`
    : `| Style key | Disposition | ${col} | Notes |\n|---|---|---|---|`;

  return `# ${title} binding

**Platform binding for the Specs document format — draft.**

Normative frame: [\`SPECIFICATION.md\`](../SPECIFICATION.md) §11. This document states how
the ${title} binding realises the schema; it does not restate what the members mean —
that is the reference at \`/schema\`.

Generated from \`mappings/bindings/${platform}.json\` by \`scripts/build-mappings.mjs\`.
Edit the binding file, never this page.

## Disposition

Every style key carries one of four dispositions:

| Disposition | Meaning |
|---|---|
| \`bound\` | Realised, and confirmed against the implementation |
| \`approximated\` | Realised with loss, and the loss is stated |
| \`unsupported\` | Declared as not realised, with the resulting behaviour stated |
| \`unverified\` | Coverage detected, mapping not yet confirmed by a human — **work, not a claim** |

A reader may rely on \`bound\`, \`approximated\` and \`unsupported\` rows. An \`unverified\`
row asserts nothing.

Current state: ${tally}, of ${styleProps.length} style keys.

## Value forms

${b.valueForms?.summary ?? ''}

| Form | Disposition |
|---|---|
| Literal | ${b.valueForms?.literal ?? 'unverified'} |
| \`TokenReference\` | ${b.valueForms?.tokenReference ?? 'unverified'} |
| \`PropBinding\` | ${b.valueForms?.propBinding ?? 'unverified'} |
| \`Conditional\` | ${b.valueForms?.conditional ?? 'unverified'} |

## Styles

${header}
${rows.join('\n')}

## Concepts not yet bound

Props, anatomy and elements, and layout have no declared binding yet. They are named
here so their absence is visible rather than implied:

| Concept | State |
|---|---|
| Props | not declared |
| Anatomy and elements | not declared |
| Layout | not declared |
`;
};

const files = readdirSync(bindingsDir).filter((f) => f.endsWith('.json'));
for (const file of files) {
  const platform = file.replace(/\.json$/, '');
  const out = join(pkg, `mappings/${platform.toUpperCase()}.md`);
  const page = renderPlatform(file);
  if (failures.length) continue;
  writeFileSync(out, page);
  console.log(`mappings: wrote mappings/${platform.toUpperCase()}.md`);
}

if (failures.length) {
  console.error('\nBinding completeness check FAILED:\n');
  for (const f of failures) console.error(`  ${f}`);
  console.error('\nA style key in the schema with no row in a binding file is a mapping');
  console.error('nobody has decided. Add it to the binding file — as `unsupported` with a');
  console.error('stated behaviour if the platform cannot realise it.\n');
  process.exit(1);
}
