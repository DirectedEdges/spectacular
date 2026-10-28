// `specs testing visual shoot` — screenshot the Storybook render for every
// shootable manifest variant, on a pool of parallel pages. Writes
// render/<target>/<kind>/<key>/<nodeId>.png and a per-spec .shots.json
// describing exactly how each pair was produced (story id, URL, join kind).
//
// One Storybook instance serves every platform's stories, so the target
// selects a story-title prefix, not a server.
//
// Playwright is the customer's, resolved from testing/visual/ (deps.ts) —
// the CLI ships no browser.
import fs from 'fs-extra';
import path from 'path';
import type { VisualWorkspace } from './paths.js';
import { readJson, writeJson, sanitizeNodeId } from './paths.js';
import { resolveStorybookPort } from '../../storybook/port.js';
import { loadPlaywright } from './deps.js';
import {
  loadStoriesForTitle,
  attachStoryIds,
  resolveStory,
  serializeArgs,
  type IndexEntry,
} from './storyJoin.js';
import {
  manifestEntries,
  DEFAULT_TARGET,
  type Manifest,
  type SpecKind,
  type Target,
} from './types.js';

const SETTLE_MS = 150;
const WORKERS = 8;
// Scrollbars are hidden as well as motion frozen: once content exceeds the
// viewport, headless Chromium's classic scrollbar steals layout width and a
// 1900px-wide page measures 1892 — a dw the design never had (specs#718).
// Besides motion, this pins the page itself: scrollbars steal layout width
// once content exceeds the viewport, and Storybook's preview padding
// re-centers the root every time the viewport grows — both put the element
// somewhere the just-measured clip no longer covers (specs#718).
const FREEZE_CSS =
  '*{transition:none!important;animation:none!important;caret-color:transparent!important}' +
  'html,body{scrollbar-width:none}::-webkit-scrollbar{width:0;height:0;display:none}' +
  'html,body{margin:0!important;padding:0!important}#storybook-root{margin:0!important;padding:0!important}';

/** The platform prefixes a target's stories carry, in lookup order. */
export function titleCandidates(target: Target, kind: SpecKind, titlePath: string): string[] {
  if (target === 'react') {
    return kind === 'composition' ? [`Compositions/${titlePath}`] : [`Components/${titlePath}`];
  }
  // Web Components stories title under one platform root. A composition's
  // title is already group-prefixed before the emitter adds that root, so the
  // real title nests both — `Web Components/Compositions/Card`. Listing only
  // the other two spellings is why every Web Components composition reported
  // as no-story. The sidebar hides stories by matching the `Web Components/`
  // prefix, so the title is the emitter's to keep and this list's to match.
  return kind === 'composition'
    ? [
        `Web Components/Compositions/${titlePath}`,
        `Web Components/${titlePath}`,
        `Web Components Compositions/${titlePath}`,
      ]
    : [`Web Components/${titlePath}`];
}

interface ShootTask {
  url: string;
  dest: string;
  width?: number;
  height?: number;
  pinHeight?: boolean;
  interaction?: string;
  record: Record<string, unknown>;
  exact: boolean;
  shots: Array<Record<string, unknown>>;
}

async function shootOne(page: any, task: ShootTask): Promise<void> {
  const { url, dest, width } = task;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: FREEZE_CSS });
  // Pin the render to the Figma variant's authored width. A FILL root has no
  // width of its own — in Figma the frame it sits in supplies one, and
  // without an equivalent here it stretches to the preview viewport — and a
  // hug root's natural width drifts with the fallback fonts, so the pin
  // normalizes both. `pinWidth: false` opts a component out.
  if (width) {
    await page.addStyleTag({
      content:
        `#storybook-root{width:${width}px;max-width:${width}px}` +
        `#storybook-root>*{width:${width}px !important}`,
    });
  }
  // A composition frame with FIXED vertical sizing pins its height too, so
  // vertical overflow becomes visible pixels instead of a dimension mismatch.
  // A hugging frame keeps its natural height.
  if (task.pinHeight && task.height) {
    await page.addStyleTag({
      content: `#storybook-root>*{height:${task.height}px !important;overflow:hidden}`,
    });
  }
  await page.evaluate(() => (document as any).fonts.ready);
  await page.waitForTimeout(SETTLE_MS);
  const el = page.locator('#storybook-root > *').first();
  // Pose the pseudo-state the variant names before measuring: hover and
  // press change the box as well as the paint.
  let released: (() => Promise<void>) | null = null;
  if (task.interaction === 'focus') {
    // `:focus-visible` is what the emitter targets, and Chromium grants it on
    // keyboard focus, not a programmatic one that follows pointer input.
    await page.keyboard.press('Tab');
    const focused = await el
      .evaluate((node: any) => node === (node.ownerDocument as any).activeElement)
      .catch(() => false);
    if (!focused) await el.evaluate((node: any) => node.focus());
    await page.waitForTimeout(SETTLE_MS);
  } else if (task.interaction) {
    await el.hover({ timeout: 5000 });
    if (task.interaction === 'pressed') {
      await page.mouse.down();
      released = () => page.mouse.up();
    }
    await page.waitForTimeout(SETTLE_MS);
  }
  let box = await el.boundingBox({ timeout: 5000 });
  // Content-less overlay roots collapse to zero height and a zero-size
  // screenshot times out. Retry at the authored height — only on collapse.
  if ((!box || box.height === 0) && task.height) {
    await page.addStyleTag({
      content: `#storybook-root>*{min-height:${task.height}px !important}`,
    });
    box = await el.boundingBox({ timeout: 2000 }).catch(() => null);
  }
  // A clip beyond the viewport is silently truncated to it — a pinned
  // 876px composition came back 784px tall (the viewport minus the body
  // margin) with the pin correctly applied. Grow the viewport to fit the
  // measured box and re-measure — in a loop, because the first resize can
  // move the element (Storybook re-centers in the wider viewport, x 16 →
  // 24) and a box sized to the old position still hangs past the edge.
  for (let round = 0; box && round < 3; round++) {
    const vp = page.viewportSize();
    const needW = Math.ceil(box.x + box.width);
    const needH = Math.ceil(box.y + box.height);
    if (!vp || (needW <= vp.width && needH <= vp.height)) break;
    await page.setViewportSize({
      width: Math.max(vp.width, needW),
      height: Math.max(vp.height, needH),
    });
    await page.waitForTimeout(SETTLE_MS);
    box = (await el.boundingBox({ timeout: 2000 }).catch(() => null)) ?? box;
  }
  // omitBackground: Figma exports carry alpha; without it every
  // transparent-background component diffs on the page background.
  try {
    if (box && box.width > 0 && box.height > 0) {
      await page.screenshot({ path: dest, clip: box, omitBackground: true });
    } else {
      await page
        .locator('#storybook-root')
        .screenshot({ path: dest, timeout: 5000, omitBackground: true });
    }
  } finally {
    // Release the button on the shared page, or every later shot in this
    // worker renders with the mouse still down.
    if (released) await released();
  }
}

export async function runShoot(
  vw: VisualWorkspace,
  opts: {
    components?: string[];
    workers?: number;
    port?: number;
    target?: Target;
  },
): Promise<Record<string, number> | null> {
  const manifest = readJson<Manifest>(vw.manifestPath);
  const only = opts.components?.length ? new Set(opts.components) : null;
  const workers = Math.max(1, Number(opts.workers ?? WORKERS));
  const target = opts.target ?? DEFAULT_TARGET;
  const { port } = resolveStorybookPort(vw.ws, opts.port);
  const host = `http://localhost:${port}`;

  let index: { entries: Record<string, IndexEntry> };
  try {
    index = (await (await fetch(`${host}/index.json`)).json()) as typeof index;
  } catch {
    console.error(`✗ Storybook unreachable at ${host} — start it with \`specs storybook dev\`.`);
    process.exitCode = 1;
    return null;
  }
  const indexEntries = Object.values(index.entries);

  const stats: Record<string, number> = { exact: 0, overlay: 0, noStory: 0, shot: 0, failed: 0, staleIndex: 0 };

  // Resolve every variant's story join up front (no browser involved), so the
  // pool works from a flat task list and results land per spec.
  const tasks: ShootTask[] = [];
  const shotsByKey = new Map<string, { kind: SpecKind; total: number; shots: Array<Record<string, unknown>> }>();
  for (const [kind, key, entry] of manifestEntries(manifest, only)) {
    const title = titleCandidates(target, kind, entry.storyTitle).find((t) =>
      indexEntries.some((e) => e.type === 'story' && e.title === t),
    );
    const parsed = title ? loadStoriesForTitle(indexEntries, title, vw.ws.storybookDir) : [];
    const stories = title ? attachStoryIds(parsed, indexEntries, title) : [];
    // A manifest naming stories the running index does not have is a stale
    // Storybook — a scoped shoot against it measures the old code and reads
    // as a pass, so say so instead of shooting quietly.
    if (!title) stats.staleIndex += 1;

    const argProps = [
      ...new Set(
        Object.values(entry.propMap)
          .filter((m) => m.kind === 'arg')
          .map((m) => m.prop),
      ),
    ];
    const defaults = Object.fromEntries(
      Object.values(entry.propMap)
        .filter((m) => m.kind === 'arg')
        .map((m) => [m.prop, m.default]),
    );
    // Slot children are baked JSX; prefer joins that agree on the props most
    // likely to have selected them.
    const weighted = new Set(['size', 'appearance'].filter((p) => argProps.includes(p)));

    const shots: Array<Record<string, unknown>> = [];
    shotsByKey.set(`${kind}/${key}`, { kind, total: entry.children.length, shots });
    for (const variant of entry.children) {
      if (variant.status !== 'shootable') {
        shots.push({ nodeId: variant.nodeId, status: variant.status });
        continue;
      }
      const resolved = stories.length
        ? resolveStory(variant, stories, defaults, argProps, weighted)
        : null;
      if (!resolved) {
        stats.noStory += 1;
        shots.push({ nodeId: variant.nodeId, status: 'no-story', config: variant.config });
        continue;
      }
      // Variant overlay wins; content resets neutralize instance-example meta
      // args so the comparison renders the variant over the same content the
      // design's variant nodes show.
      const args = { ...(entry.resets ?? {}), ...resolved.overlay };
      // Storybook's args URL has no escape for its own separators. An overlay
      // carrying one is silently dropped and the story renders its own value —
      // a large diff that says nothing about the transform. Record it as a gap.
      const unrepresentable = Object.entries(args)
        .filter(([, v]) => typeof v === 'string' && /[:;,]/.test(v))
        .map(([k]) => k);
      if (unrepresentable.length > 0) {
        stats.unrepresentable = (stats.unrepresentable ?? 0) + 1;
        shots.push({
          nodeId: variant.nodeId,
          status: 'deferred-unrepresentable',
          config: variant.config,
          note: `no story pins ${unrepresentable.join(', ')}; the value cannot travel in a Storybook args URL`,
        });
        continue;
      }

      const overlayQs = serializeArgs(args);
      const url =
        `${host}/iframe.html?id=${resolved.story.id}&viewMode=story` +
        (overlayQs ? `&args=${overlayQs}` : '');
      tasks.push({
        url,
        width: variant.pinWidth ? variant.size?.[0] : undefined,
        height: variant.size?.[1],
        pinHeight: variant.pinHeight,
        interaction: variant.interaction,
        dest: path.join(
          vw.dirFor('render', kind, key, target),
          `${sanitizeNodeId(variant.nodeId)}.png`,
        ),
        record: {
          nodeId: variant.nodeId,
          status: 'shot',
          storyId: resolved.story.id,
          join: resolved.exact ? 'exact' : 'overlay',
          ...(variant.interaction ? { interaction: variant.interaction } : {}),
          overlay: resolved.overlay,
          url,
        },
        exact: resolved.exact,
        shots,
      });
    }
  }

  const { chromium } = await loadPlaywright(vw);
  const browser = await chromium.launch();
  let cursor = 0;
  const worker = async () => {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
      deviceScaleFactor: 2,
    });
    for (;;) {
      const task = tasks[cursor++];
      if (!task) break;
      try {
        await shootOne(page, task);
        stats.shot += 1;
        if (task.exact) stats.exact += 1;
        else stats.overlay += 1;
        task.shots.push(task.record);
      } catch (err) {
        stats.failed += 1;
        task.shots.push({
          nodeId: (task.record as any).nodeId,
          status: 'shoot-failed',
          storyId: (task.record as any).storyId,
          url: task.url,
          error: String(err).split('\n')[0],
        });
      }
    }
    await page.close();
  };
  await Promise.all(Array.from({ length: Math.min(workers, tasks.length || 1) }, worker));
  await browser.close();

  for (const [pair, { kind, total, shots }] of shotsByKey) {
    const key = pair.split('/')[1];
    writeJson(path.join(vw.dirFor('render', kind, key, target), '.shots.json'), {
      shotAt: new Date().toISOString(),
      target,
      shots,
    });
    console.log(`${pair}: ${shots.filter((s) => s.status === 'shot').length}/${total} shot`);
  }

  if (stats.staleIndex) {
    console.warn(
      `! ${stats.staleIndex} spec(s) have no stories in the running Storybook's index — ` +
        `its content may predate the last regeneration. Restart it before trusting these rows.`,
    );
  }
  console.log(
    `✓ shoot (${target}): ${stats.shot} shot (${stats.exact} exact join, ${stats.overlay} overlay), ` +
      `${stats.noStory} no-story, ${stats.failed} failed [${workers} workers]`,
  );
  return stats;
}
