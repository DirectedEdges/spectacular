// Join a Figma variant's prop configuration to a Storybook story.
//
// Preference order:
//  1. A story whose scalar args produce exactly the variant's configuration —
//     use it as-is (its JSX slot children were emitted for that configuration).
//  2. The closest story, with the remainder forced via the iframe `args=` URL
//     parameter (scalars only; baked JSX children stay whatever the story
//     chose, so closeness is weighted toward children-selecting props).
//  3. No story at all → the caller records a coverage gap.
import fs from 'fs-extra';
import path from 'path';

export interface ParsedStory {
  exportName: string;
  args: Record<string, unknown>;
  own: Record<string, unknown>;
  composed: boolean;
  id?: string;
}

export interface IndexEntry {
  id: string;
  title: string;
  type: string;
  importPath?: string;
}

// First-level scalar entries inside a block's `args: { … }`.
//
// Scanning by depth rather than by line: a story emitted on one line puts
// every entry on the same line as the braces, and a per-line match reads it
// as having no args at all — which silently sends the variant to the Default
// story with a URL overlay instead of joining it to its own story.
function scalarArgsIn(block: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const argsStart = block.indexOf('args: {');
  if (argsStart === -1) return args;
  const argsBlock = balancedBlock(block, argsStart + 'args: '.length);

  // Keep only text directly inside the args braces: nested objects and JSX
  // slot content are not joinable, and their contents must not be mistaken
  // for top-level entries.
  let depth = 0;
  let top = '';
  for (const ch of argsBlock) {
    if (ch === '{' || ch === '(' || ch === '[' || ch === '<') {
      depth += 1;
      if (depth === 1) continue;
    } else if (ch === '}' || ch === ')' || ch === ']' || ch === '>') {
      depth -= 1;
      continue;
    }
    if (depth === 1) top += ch;
  }

  const entryRe = /(\w+)\s*:\s*("[^"]*"|'[^']*'|true|false|-?\d+(?:\.\d+)?)\s*(?:,|$)/g;
  let m;
  while ((m = entryRe.exec(top))) {
    const raw = m[2];
    args[m[1]] =
      raw === 'true' ? true
      : raw === 'false' ? false
      : /^["']/.test(raw) ? raw.slice(1, -1)
      : Number(raw);
  }
  return args;
}

/**
 * True when a story renders an INSTANCE EXAMPLE's content rather than the
 * component's own default slot content. Scalar args cannot tell the two
 * apart; the emitted provenance comment can — composed content names the
 * registry entry it came from.
 */
function rendersInstanceExample(block: string, metaIsExample: boolean): boolean {
  const composes = block.includes('slotContentExamples/') || block.includes('instanceExamples/');
  return composes ? block.includes('instanceExamples/') : metaIsExample;
}

// Extract effective scalar args per exported story from a generated stories
// file. Storybook resolves a story's args over the meta args — when instance
// examples exist, the meta args ARE the first example's configuration, and
// the empty Default story inherits all of them.
export function parseStories(storiesSource: string): ParsedStory[] {
  const metaStart = storiesSource.indexOf('const meta = {');
  const metaBlock =
    metaStart === -1 ? '' : balancedBlock(storiesSource, storiesSource.indexOf('{', metaStart));
  const metaArgs = metaStart === -1 ? {} : scalarArgsIn(metaBlock);
  const metaIsExample = metaBlock.includes('instanceExamples/');
  const stories: ParsedStory[] = [];
  const exportRe = /export const (\w+): Story = \{/g;
  let m: RegExpExecArray | null;
  while ((m = exportRe.exec(storiesSource))) {
    const block = balancedBlock(storiesSource, exportRe.lastIndex - 1);
    const own = scalarArgsIn(block);
    stories.push({
      exportName: m[1],
      args: { ...metaArgs, ...own },
      own,
      composed: rendersInstanceExample(block, metaIsExample),
    });
  }
  // Empty-object stories: `export const Default: Story = {};`
  const emptyRe = /export const (\w+): Story = \{\};/g;
  while ((m = emptyRe.exec(storiesSource))) {
    const name = m[1];
    if (!stories.some((s) => s.exportName === name)) {
      stories.push({ exportName: name, args: { ...metaArgs }, own: {}, composed: metaIsExample });
    }
  }
  return stories;
}

function balancedBlock(src: string, openBraceIndex: number): string {
  let depth = 0;
  for (let i = openBraceIndex; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(openBraceIndex, i + 1);
    }
  }
  return src.slice(openBraceIndex);
}

// Load a component's stories source through the live Storybook index: the
// entry's own importPath names the file, so this survives layout changes and
// covers nested subcomponent stories without path guessing. importPath is
// relative to the storybook package directory.
export function loadStoriesForTitle(
  indexEntries: IndexEntry[],
  storyTitle: string,
  storybookDir: string,
): ParsedStory[] {
  const entry = indexEntries.find(
    (e) => e.type === 'story' && e.title === storyTitle && e.importPath,
  );
  if (!entry) return [];
  const file = path.resolve(storybookDir, entry.importPath!);
  if (!fs.existsSync(file)) return [];
  return parseStories(fs.readFileSync(file, 'utf8'));
}

// Storybook derives a story's id from its export name by splitting it into
// words first, and a digit run is its own word — `Ratio34` becomes
// `ratio-34`. An id that misses leaves the story unmatched, and every variant
// it should have answered for falls back to Default with a URL overlay.
const kebab = (s: string): string =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .replace(/(\d)([a-zA-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

/** Map parsed stories onto the live Storybook index for one title. */
export function attachStoryIds(
  stories: ParsedStory[],
  indexEntries: IndexEntry[],
  storyTitle: string,
): ParsedStory[] {
  const entries = indexEntries.filter((e) => e.type === 'story' && e.title === storyTitle);
  const bySuffix = new Map(entries.map((e) => [e.id.split('--')[1], e]));
  const attached: ParsedStory[] = [];
  for (const story of stories) {
    const entry = bySuffix.get(kebab(story.exportName));
    if (entry) attached.push({ ...story, id: entry.id });
  }
  return attached;
}

export interface ResolvedStory {
  story: ParsedStory;
  overlay: Record<string, unknown>;
  exact: boolean;
}

// Resolve one variant (its non-default `args`) against the component's
// stories. `defaults` come from the contract; comparison happens on the
// completed configuration over arg-kind props only.
//
// Exact ties prefer the story authored for the variant: `ContractDefault`
// settles outright; a non-composed story beats an instance-example story;
// then fewest surplus pins, most explicit pins, fewest extra args.
export function resolveStory(
  variant: { args: Record<string, unknown> },
  stories: ParsedStory[],
  defaults: Record<string, unknown>,
  argProps: string[],
  weightedProps: Set<string>,
): ResolvedStory | null {
  const complete = (args: Record<string, unknown>) => {
    const full: Record<string, unknown> = {};
    for (const prop of argProps) {
      full[prop] = args[prop] !== undefined ? args[prop] : defaults[prop] ?? null;
    }
    return full;
  };
  const want = complete(variant.args);
  const extraArgs = (story: ParsedStory) =>
    Object.keys(story.args).filter((k) => !argProps.includes(k)).length;

  let bestExact: ParsedStory | null = null;
  let contractExact = false;
  let best: { story: ParsedStory; match: number } | null = null;
  for (const story of stories) {
    const have = complete(story.args);
    let match = 0;
    let exact = true;
    for (const prop of argProps) {
      if (have[prop] === want[prop]) {
        match += weightedProps.has(prop) ? 2 : 1;
      } else {
        exact = false;
      }
    }
    if (exact) {
      const surplus = (s: ParsedStory) =>
        Object.keys(s.own ?? {}).filter((p) => variant.args[p] === undefined).length;
      const pinned = (s: ParsedStory) =>
        Object.keys(s.own ?? {}).filter((p) => variant.args[p] !== undefined).length;
      // `ContractDefault` states the contract's own configuration and renders
      // the default variant's own slot content — an exact one settles it.
      if (story.exportName === 'ContractDefault') {
        bestExact = story;
        contractExact = true;
      }
      if (contractExact) continue;
      // A variant node shows the component's OWN content; a story rendering
      // an instance example loses to any story that does not.
      const better =
        !bestExact ||
        (!story.composed && bestExact.composed) ||
        (story.composed === bestExact.composed &&
          (surplus(story) < surplus(bestExact) ||
            (surplus(story) === surplus(bestExact) && pinned(story) > pinned(bestExact)) ||
            (surplus(story) === surplus(bestExact) &&
              pinned(story) === pinned(bestExact) &&
              extraArgs(story) < extraArgs(bestExact))));
      if (better) bestExact = story;
      continue;
    }
    if (
      !best ||
      match > best.match ||
      (match === best.match && extraArgs(story) < extraArgs(best.story))
    ) {
      best = { story, match };
    }
  }
  if (bestExact) return { story: bestExact, overlay: {}, exact: true };
  if (!best) return null;

  const overlay: Record<string, unknown> = {};
  const have = complete(best.story.args);
  for (const prop of argProps) {
    if (have[prop] !== want[prop]) overlay[prop] = want[prop];
  }
  return { story: best.story, overlay, exact: false };
}

/** Storybook URL args serialization: `key:value;key2:!true`. */
export function serializeArgs(overlay: Record<string, unknown>): string {
  return Object.entries(overlay)
    .map(([key, value]) => {
      if (value === true) return `${key}:!true`;
      if (value === false) return `${key}:!false`;
      if (value === null) return `${key}:!null`;
      return `${key}:${encodeURIComponent(String(value))}`;
    })
    .join(';');
}
