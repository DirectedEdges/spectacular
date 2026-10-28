// Scaffolded by `specs storybook init`. Yours after that — publish never
// touches it.
//
// The docs page for a component: React (the standard autodocs page), Web
// Components (the same component's Lit output), and Specs (the authored spec
// itself) as in-page tabs — ordinary React, no Storybook manager APIs
// involved. Every other kind of page supplies its own docs.page and never
// sees this component.
//
// The two platform tabs each carry subtabs: Docs (what the tab has always
// shown) and two Testing views — this component's visual diffs against Figma,
// and against the renders you last accepted. The Testing views read the same
// report JSON the sidebar report pages read, served live at /baselines, so a
// re-diff updates them on reload. The sidebar pages rank every component
// against each other; these show one component's variants in full.
import * as React from 'react';
import { DocsContext, DocsPage } from '@storybook/addon-docs/blocks';
import tabsJson from '../content/components/tabs.json';
type TabId = 'react' | 'webcomponents' | 'specs';
const TABS: TabId[] = (tabsJson as { tabs: TabId[] }).tabs ?? ['specs'];
const LABELS: Record<TabId, string> = { react: 'React', webcomponents: 'Web Components', specs: 'Specs' };

/** The two spec kinds a story can belong to, and the sidebar prefix each uses. */
type Kind = 'components' | 'compositions';

/** The platform tabs — the ones that carry Docs and Testing subtabs. */
type Platform = 'react' | 'webcomponents';

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 16px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: active ? 700 : 400,
  borderBottom: active ? '2px solid currentColor' : '2px solid transparent',
  opacity: active ? 1 : 0.7,
});

const tabRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  borderBottom: '1px solid rgba(0,0,0,0.1)',
  marginBottom: 24,
};

/** Spec directory names differ in shape between libraries; try the shapes a slug can take. */
function specDirCandidates(slug: string): string[] {
  const parts = slug.split('-');
  const camel = parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return [...new Set([camel, parts.join(''), slug])];
}

const SPEC_FILES = ['api', 'variants', 'examples'] as const;

function SpecFile({ slug, file, kind }: { slug: string; file: string; kind: Kind }) {
  const [text, setText] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    (async () => {
      // The kind comes from which section the story is in — never assumed, because the
      // two kinds live in sibling directories under specs/ and a composition fetched
      // from the components directory silently resolves to nothing.
      for (const dir of specDirCandidates(slug)) {
        const res = await fetch(`/specs/${kind}/${dir}/${file}.yaml`).catch(() => null);
        if (!live) return;
        if (res?.ok) return setText(await res.text());
      }
      if (live) setText(`# No ${file}.yaml for ${slug} in this workspace.`);
    })();
    return () => { live = false; };
  }, [slug, file, kind]);
  if (text === null) return <p>Loading {file}.yaml…</p>;
  return (
    <pre style={{ overflow: 'auto', maxHeight: '70vh', padding: 16, fontSize: 12, lineHeight: 1.5, background: 'rgba(0,0,0,0.03)', borderRadius: 4 }}>
      {text}
    </pre>
  );
}

function SpecsTab({ slug, kind }: { slug: string; kind: Kind }) {
  const [file, setFile] = React.useState<string>(SPEC_FILES[0]);
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(0,0,0,0.1)', marginBottom: 12 }}>
        {SPEC_FILES.map((f) => (
          <button key={f} style={tabStyle(f === file)} onClick={() => setFile(f)}>{f}</button>
        ))}
      </div>
      <SpecFile slug={slug} file={file} kind={kind} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Testing subtabs
// ---------------------------------------------------------------------------

/** One manifest variant's result. The subset of the report's pair shape this page shows. */
type Pair = {
  nodeId: string;
  config: Record<string, string>;
  storyId: string | null;
  status: string;
  pass: boolean | null;
  dims?: { dw: number; dh: number };
  diffPct?: number;
  triptychPng?: string;
  note?: string;
  error?: string;
};

type Entry = {
  /** The story title the manifest recorded, e.g. `Components/EGDS Button`. */
  title?: string;
  summary: {
    passPct: number;
    variants: number;
    pass: number;
    fail: number;
    deferred: number;
    ignored?: number;
  };
  pairs: Pair[];
};

type Report = {
  generatedAt: string;
  settings: { passPct: number; scale: number };
  components: Record<string, Entry>;
  compositions?: Record<string, Entry>;
};

/**
 * The two questions a diff can answer, and the report each writes. Mirrors the
 * modes the visualtesting concern publishes pages for — same report basenames,
 * same baseline wording, same flag in the empty state.
 */
const MODES = {
  fidelity: { label: 'Testing (Fidelity)', report: 'fidelity', baseline: 'Figma exports', flag: '' },
  changes: { label: 'Testing (Changes)', report: 'regression', baseline: 'last accepted renders', flag: ' --against accepted' },
} as const;

type ModeId = keyof typeof MODES;
type SubId = 'docs' | ModeId;

const SUBS: SubId[] = ['docs', 'fidelity', 'changes'];
const SUB_LABELS: Record<SubId, string> = {
  docs: 'Docs',
  fidelity: MODES.fidelity.label,
  changes: MODES.changes.label,
};

/**
 * The selected tabs, held outside React. Storybook re-renders the docs
 * container once after the page first settles, which remounts this component
 * and would otherwise throw away a click made in that window — the tab
 * highlighted itself and then silently reverted. Module state survives the
 * remount; the subtab is per platform, so each platform keeps its own view.
 */
let lastTab: TabId | null = null;
const lastSub: Record<Platform, SubId> = { react: 'docs', webcomponents: 'docs' };

/**
 * Reports written before the platform split carry no target and held React
 * results, so React falls back to the untargeted name. Web Components never
 * had an untargeted report and must not read React's.
 */
function reportCandidates(mode: ModeId, target: Platform): string[] {
  const base = MODES[mode].report;
  return target === 'react' ? [`${base}.${target}`, base] : [`${base}.${target}`];
}

/** Storybook's story-id derivation, enough of it to match a title to a slug. */
function titleToPrefix(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * This component's entry in the report. Matched on a pair's own storyId first —
 * that is the join the diff already made, so it needs no guessing. A component
 * whose every variant is missing a story has no storyId to match, so the
 * manifest's story title is the fallback: it is recorded with or without its
 * section prefix depending on the library, so both spellings count.
 */
function findEntry(entries: Record<string, Entry>, kind: Kind, slug: string): Entry | null {
  const want = `${kind}-${slug}`;
  const all = Object.values(entries);
  const byStory = all.find((e) => e.pairs.some((p) => p.storyId?.startsWith(`${want}--`)));
  if (byStory) return byStory;
  return all.find((e) => {
    const prefix = e.title ? titleToPrefix(e.title) : '';
    return prefix === want || prefix === slug;
  }) ?? null;
}

const PASS_COLOR = '#2e9960';
const FAIL_COLOR = '#d64545';
const MUTED = '#666';

function pairColor(p: Pair): string {
  return p.pass === true ? PASS_COLOR : p.pass === false ? FAIL_COLOR : MUTED;
}

function pairGlyph(p: Pair): string {
  return p.pass === true ? '✓' : p.pass === false ? '✗' : '–';
}

/** The variant's identity: its props, or `default` when it has none. */
function configLabel(config: Record<string, string>): string {
  return Object.entries(config).map(([k, v]) => `${k}=${v}`).join(', ') || 'default';
}

function PairRow({ pair }: { pair: Pair }) {
  const parts: string[] = [configLabel(pair.config)];
  if (pair.status === 'diffed') {
    parts.unshift(`${pair.diffPct}%`);
    if (pair.dims && (pair.dims.dw !== 0 || pair.dims.dh !== 0)) {
      parts.splice(1, 0, `dw ${pair.dims.dw} dh ${pair.dims.dh}`);
    }
  } else {
    parts.push(pair.status);
  }
  const aside = pair.note ?? pair.error;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: pairColor(pair), fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ marginRight: 6 }}>{pairGlyph(pair)}</span>
        {parts.join(' · ')}
      </div>
      {aside ? <div style={{ color: MUTED, marginTop: 2 }}>{aside}</div> : null}
      {pair.triptychPng ? (
        <img
          src={`/baselines/${pair.triptychPng}`}
          alt={`${configLabel(pair.config)} — baseline, render, diff`}
          style={{ maxWidth: '100%', marginTop: 6, border: '1px solid #ddd', borderRadius: 4 }}
        />
      ) : null}
    </div>
  );
}

function TestingTab({ mode, target, slug, kind }: { mode: ModeId; target: Platform; slug: string; kind: Kind }) {
  const [report, setReport] = React.useState<Report | null>(null);
  const [missing, setMissing] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    setReport(null);
    setMissing(false);
    (async () => {
      for (const name of reportCandidates(mode, target)) {
        const res = await fetch(`/baselines/report/${name}.json`).catch(() => null);
        if (!live) return;
        if (res?.ok) return setReport(await res.json());
      }
      if (live) setMissing(true);
    })();
    return () => { live = false; };
  }, [mode, target]);

  const note = { color: MUTED, font: '13px system-ui' } as React.CSSProperties;
  if (missing) {
    return (
      <p style={note}>
        No results yet — run <code>specs testing visual diff{MODES[mode].flag} --target {target}</code>,
        then reload.
      </p>
    );
  }
  if (!report) return <p style={note}>Loading results…</p>;

  const entries = kind === 'compositions' ? report.compositions : report.components;
  const entry = entries ? findEntry(entries, kind, slug) : null;
  if (!entry) {
    return <p style={note}>This {kind === 'compositions' ? 'composition' : 'component'} isn’t in the visual manifest.</p>;
  }

  const s = entry.summary;
  return (
    <div style={{ font: '13px system-ui' }}>
      <p style={{ color: MUTED, margin: '0 0 16px' }}>
        {new Date(report.generatedAt).toLocaleString()} · baseline: {MODES[mode].baseline} · scale{' '}
        {report.settings.scale} · <b style={{ color: PASS_COLOR }}>{s.pass} pass</b> ·{' '}
        <b style={{ color: s.fail ? FAIL_COLOR : undefined }}>{s.fail} fail</b> of {s.variants} variants
        {s.deferred ? ` · ${s.deferred} deferred` : ''}
        {s.ignored ? ` · ${s.ignored} ignored` : ''} · pass at {s.passPct}%
      </p>
      {entry.pairs.map((p) => (
        <PairRow key={p.nodeId} pair={p} />
      ))}
      <p style={{ color: '#999', margin: '8px 0 24px' }}>
        Every variant the manifest lists, in its order. Each image is baseline, render, diff.
      </p>
    </div>
  );
}

/**
 * A platform tab's body: Docs as it has always been, plus the two Testing
 * views. Mounted with a key per platform, so the subtab resets to Docs when the
 * platform changes rather than carrying a selection across.
 */
function PlatformTabs({ target, slug, kind }: { target: Platform; slug: string; kind: Kind }) {
  const [sub, setSub] = React.useState<SubId>(lastSub[target]);
  const choose = (s: SubId) => { lastSub[target] = s; setSub(s); };
  return (
    <>
      <div style={{ ...tabRowStyle, marginBottom: 16 }}>
        {SUBS.map((s) => (
          <button key={s} style={tabStyle(s === sub)} onClick={() => choose(s)}>{SUB_LABELS[s]}</button>
        ))}
      </div>
      {sub === 'docs' && target === 'react' && <DocsPage />}
      {sub === 'docs' && target === 'webcomponents' && (
        <iframe
          title="Web Components"
          src={`iframe.html?id=web-components-${kind === 'compositions' ? 'compositions-' : ''}${slug}--overview&viewMode=docs`}
          style={{ width: '100%', height: '75vh', border: 0, background: 'transparent' }}
        />
      )}
      {sub !== 'docs' && <TestingTab mode={sub} target={target} slug={slug} kind={kind} />}
    </>
  );
}

export function ComponentDocs() {
  const context = React.useContext(DocsContext as React.Context<any>);
  let id = '';
  try {
    id = context?.componentStories?.()[0]?.id ?? '';
  } catch {
    id = '';
  }
  const [tab, setTab] = React.useState<TabId>(lastTab ?? TABS[0] ?? 'specs');
  const chooseTab = (t: TabId) => { lastTab = t; setTab(t); };

  // Both spec kinds get this page; every other section renders the standard one
  // untouched. The prefix is what says which kind, so nothing has to assume.
  const kind: Kind | undefined =
    id.startsWith('components-') ? 'components'
    : id.startsWith('compositions-') ? 'compositions'
    : undefined;
  if (!kind) return <DocsPage />;
  const slug = id.slice(`${kind}-`.length).split('--')[0];

  return (
    <>
      <div style={tabRowStyle}>
        {TABS.map((t) => (
          <button key={t} style={tabStyle(t === tab)} onClick={() => chooseTab(t)}>{LABELS[t]}</button>
        ))}
      </div>
      {tab === 'specs' ? (
        <SpecsTab slug={slug} kind={kind} />
      ) : (
        <PlatformTabs key={tab} target={tab} slug={slug} kind={kind} />
      )}
    </>
  );
}
