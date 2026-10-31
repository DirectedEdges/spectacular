/**
 * Checks the checked-in binding declarations against the implementations that
 * realise them, and reports drift.
 *
 * This is the mechanism `code/style-mapping.md` never had. That document drifted
 * into describing three mechanisms the transformer had stopped using (specs#691),
 * and the only defence added was a manual step in a review skill. A mapping
 * specification that cannot be checked becomes wrong silently, and five of them
 * become wrong five times as fast.
 *
 * Skips cleanly when an implementation is absent. `spectacular` is the open,
 * published repo; `specs-transforms` may not be checked out beside it, and a
 * missing sibling is not a failure. Exit code is 0 on skip, 0 on agreement,
 * 1 on drift.
 *
 * Usage:
 *   node scripts/verify-bindings.mjs                 # all platforms it can reach
 *   node scripts/verify-bindings.mjs --strict        # absent implementation is a failure
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const strict = process.argv.includes('--strict');

const styleProps = Object.keys(
  JSON.parse(readFileSync(join(pkg, 'schema/styles.schema.json'), 'utf8')).definitions.Styles.properties
);

const read = (p) => readFileSync(p, 'utf8');
const bindings = (platform) =>
  JSON.parse(read(join(pkg, `mappings/bindings/${platform}.json`)));

let drift = 0;
let checked = 0;
const skipped = [];

/**
 * Figma declares its coverage as data — `style-bindings.json`, shipped by
 * figma-from-specs and kept true by a test in that package. Reading the
 * declaration rather than parsing keys.ts is the point: the two transforms
 * write their tuples in different styles, and a regex that reads one misreads
 * the other.
 */
const verifyFigma = () => {
  const declaredFile = resolve(pkg, '../../../specs-transforms/packages/figma-from-specs/src/Styles/style-bindings.json');
  if (!existsSync(declaredFile)) return skipped.push('figma — figma-from-specs not checked out');
  checked++;

  const impl = JSON.parse(read(declaredFile));
  if (impl.direction !== 'spec-to-figma') {
    drift++;
    console.error(`DRIFT figma: implementation declares direction "${impl.direction}", expected "spec-to-figma"`);
  }
  const elements = impl.elements ?? {};
  const actual = {};
  for (const k of styleProps) {
    actual[k] = Object.entries(elements).filter(([, keys]) => keys.includes(k)).map(([t]) => t).sort();
  }

  const declared = bindings('figma').concepts.styles;
  for (const k of styleProps) {
    const d = (declared[k]?.elements ?? []).slice().sort();
    const a = actual[k];
    if (JSON.stringify(d) !== JSON.stringify(a)) {
      drift++;
      console.error(`DRIFT figma \`${k}\`:`);
      console.error(`  declared: ${d.join(', ') || '(none)'}`);
      console.error(`  actual:   ${a.join(', ') || '(none)'}`);
    }
    if (declared[k]?.disposition === 'bound' && a.length === 0) {
      drift++;
      console.error(`DRIFT figma \`${k}\`: declared bound but absent from every STYLE_KEYS list`);
    }
    if (declared[k]?.disposition === 'unsupported' && a.length > 0) {
      drift++;
      console.error(`DRIFT figma \`${k}\`: declared unsupported but the writer lists it on ${a.join(', ')}`);
    }
  }
};

/**
 * React declares nothing — 16 independent `'key' in styles` modules, deliberately not
 * a dispatch (specs#691). Coverage is recovered by scanning for key literals, which is
 * partial: a module reading its keys indirectly yields nothing. So a declared module
 * that the scan cannot see is reported as unconfirmable, not as drift.
 */
const verifyCss = () => {
  const dir = resolve(pkg, '../cli/src/transforms/css/style');
  if (!existsSync(dir)) return skipped.push('css — transform not found');
  checked++;

  const found = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const src = read(join(dir, file));
    for (const k of styleProps) {
      if (new RegExp(`['"\`]${k}['"\`]|\\.${k}\\b`).test(src)) (found[k] ??= []).push(file.replace(/\.ts$/, ''));
    }
  }

  const declared = bindings('css').concepts.styles;
  let unconfirmable = 0;
  for (const k of styleProps) {
    const d = (declared[k]?.module ?? []).slice().sort();
    const a = (found[k] ?? []).slice().sort();
    if (declared[k]?.disposition === 'bound' && a.length === 0) {
      unconfirmable++;
      console.error(`UNCONFIRMABLE css \`${k}\`: declared bound, but no module literal matched — confirm by hand or declare the module`);
    }
    if (declared[k]?.disposition === 'unsupported' && a.length > 0) {
      drift++;
      console.error(`DRIFT css \`${k}\`: declared unsupported but matched in ${a.join(', ')}`);
    }
    if (d.length && JSON.stringify(d) !== JSON.stringify(a) && a.length) {
      drift++;
      console.error(`DRIFT css \`${k}\`: declared ${d.join(', ')}, scan found ${a.join(', ')}`);
    }
  }
  if (unconfirmable) {
    console.error(`\ncss: ${unconfirmable} declared-bound keys the scan cannot confirm.`);
    console.error('This is the cost of a transform that declares no key table — contrast');
    console.error('figma-from-specs/src/Styles/keys.ts, which does and is checkable.\n');
  }
};

verifyFigma();
verifyCss();

for (const s of skipped) console.log(`skipped: ${s}`);

if (drift) {
  console.error(`\n${drift} drift${drift === 1 ? '' : 's'} between declaration and implementation.`);
  process.exit(1);
}
if (strict && skipped.length) {
  console.error('\n--strict: an implementation was unreachable.');
  process.exit(1);
}
console.log(`bindings verified against ${checked} implementation${checked === 1 ? '' : 's'}; no drift.`);
