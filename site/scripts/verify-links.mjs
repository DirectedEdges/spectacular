/**
 * Internal link check over the built site.
 *
 * Every `href` and `src` pointing at this site must resolve to something the
 * build produced — a page directory with an `index.html`, a file, or, for a
 * fragment, an `id` or `name` that exists on the target page. A link that does
 * not is a 404 a reader finds before we do, which is how `/cli/generate/`,
 * `/schema/content/`, `/schema/instances/` and `/schema/slot-content-examples/`
 * shipped: all four were plausible paths, and nothing ever resolved them.
 *
 * This runs against `dist/`, so it sees the generated pages exactly as the
 * deploy serves them — which is why it can run locally and be trusted for
 * production. It is only trustworthy while every generator's inputs are
 * in-repo: a page built from a sibling checkout renders differently here than
 * in CI, and that is why `build-element-style-keys.mjs` snapshots its data
 * instead of reading sideways.
 *
 * Usage:
 *   node scripts/verify-links.mjs            check dist/, exit 1 on any break
 *   node scripts/verify-links.mjs --quiet     one summary line plus failures
 *
 * External links (http, mailto, tel) are not fetched — this is a build check,
 * not a crawler.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { site } from './lib/paths.mjs';

const DIST = join(site, 'dist');
const QUIET = process.argv.includes('--quiet');

/** Every built HTML page, as a route → file map. */
function pages(dir, out = new Map()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) pages(path, out);
    else if (entry.name.endsWith('.html')) {
      const rel = path.slice(DIST.length);
      out.set(rel.endsWith('/index.html') ? `${rel.slice(0, -'index.html'.length)}` : rel, path);
    }
  }
  return out;
}

/** Does this site-root-relative path resolve to something the build emitted? */
function resolves(path) {
  const clean = decodeURIComponent(path.split('?')[0]).replace(/\/$/, '');
  const target = join(DIST, clean);
  if (!existsSync(target)) return existsSync(`${target}.html`);
  return statSync(target).isDirectory() ? existsSync(join(target, 'index.html')) : true;
}

/** The anchor targets a page offers — `id` and `name` attributes alike. */
const anchorCache = new Map();
function anchors(path) {
  if (anchorCache.has(path)) return anchorCache.get(path);
  const file = existsSync(join(DIST, path, 'index.html'))
    ? join(DIST, path, 'index.html')
    : existsSync(join(DIST, `${path}.html`))
      ? join(DIST, `${path}.html`)
      : null;
  const set = new Set();
  if (file) {
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(/\s(?:id|name)="([^"]+)"/g)) set.add(m[1]);
  }
  anchorCache.set(path, set);
  return set;
}

if (!existsSync(DIST)) {
  console.error('verify-links: no dist/ — run the content scripts and `npx astro build` first.');
  process.exit(1);
}

const all = pages(DIST);
const broken = new Map();
const note = (target, source) => {
  if (!broken.has(target)) broken.set(target, new Set());
  broken.get(target).add(source);
};

/**
 * A link printed inside a code sample is documentation of markup, not a link
 * this site offers — `href="#section"` on the link role's page is an example of
 * shadow-DOM fragment behaviour, and resolving it against the page is wrong.
 */
const withoutCode = (html) => html.replace(/<(code|pre)\b[\s\S]*?<\/\1>/g, '');

/**
 * Starlight's own skip link targets `#_top`, which it emits on its standard
 * page layout and not on a custom-layout page. Ours to neither fix nor report.
 */
const IGNORED_FRAGMENTS = new Set(['_top']);

for (const [route, file] of all) {
  const html = withoutCode(readFileSync(file, 'utf8'));
  const refs = new Set([
    ...[...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]),
  ]);

  for (const ref of refs) {
    if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(ref)) {
      // A bare fragment is checked against the page's own anchors.
      const own = ref.slice(1);
      if (
        ref.startsWith('#') &&
        own &&
        !IGNORED_FRAGMENTS.has(own) &&
        !anchors(route.replace(/\/$/, '')).has(own)
      ) {
        note(`${route}${ref}`, route);
      }
      continue;
    }
    if (!ref.startsWith('/')) continue; // relative refs are rare here and resolve per-page

    const [path, fragment] = ref.split('#');
    if (!resolves(path)) {
      note(path, route);
      continue;
    }
    if (fragment && !IGNORED_FRAGMENTS.has(fragment) && !anchors(path.replace(/\/$/, '')).has(fragment)) {
      note(`${path}#${fragment}`, route);
    }
  }
}

if (broken.size === 0) {
  console.log(`verify-links: ${all.size} pages, no broken internal links`);
  process.exit(0);
}

console.error(`verify-links: ${broken.size} broken target(s) across ${all.size} pages\n`);
for (const target of [...broken.keys()].sort()) {
  const sources = [...broken.get(target)].sort();
  const shown = QUIET ? sources.slice(0, 3) : sources;
  console.error(`  ${target}`);
  console.error(
    `    linked from ${sources.length} page(s): ${shown.join(', ')}${sources.length > shown.length ? ' …' : ''}`,
  );
}
process.exit(1);
