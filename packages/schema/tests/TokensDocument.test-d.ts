/**
 * Type-level tests for the tokens document (ADR-118).
 * These files are intentionally never executed — they are compiled with tsc
 * to assert that the type shape is correct.
 */
import type {
  TokenPointer,
  TokenRef,
  TokenRefRelationship,
  TokenSubject,
  TokensDocument,
  TokensMeta,
  TokensStatus,
} from '../types/index.js';

const meta: TokensMeta = {
  concern: 'color',
  status: 'proposed',
  author: 'Nathan Curtis',
  updated: '2026-11-06',
  sources: ['analysis/foundations.yaml', 'analysis/styling.byToken.yaml'],
};

/** A token path as the library spells it — spaces and capitals included. */
const purpose: TokenSubject = {
  $token: 'DE Color/Action/Hover background',
  $description: 'the wash layered behind a control while the pointer is over it',
};

/** An off-limits token with a replacement to point at. */
const replaced: TokenSubject = {
  $token: 'DE Palette/Red/44',
  $description: 'a raw ramp step — styling from a ramp bypasses the layer carrying intent',
  alternatives: [{ to: 'DE Color/Alert/Error/Background' }],
};

/** And one with none: its absence says nothing replaces this token. */
const unreplaceable: TokenSubject = {
  $token: 'DE Color/Utility/Figma/Panel',
  $description: 'Figma plugin and panel chrome, not product surfaces',
};

const crossScope: TokenSubject = {
  $token: 'DE Color/Text/Primary',
  $description: 'default body and label text on any light surface',
  refs: [{ to: 'foundations/brand/tokens.yaml', rel: 'same-as' }],
};

const document: TokensDocument = {
  meta,
  useWhen: [purpose, crossScope],
  dontUseWhen: [replaced, unreplaceable],
};

/** A document carrying only a header is valid. */
const headerOnly: TokensDocument = { meta: { status: 'ratified' } };

const status: TokensStatus = 'deprecated';
const pointer: TokenPointer = { href: 'https://example.test/tokens' };
const ref: TokenRef = { to: 'DE Color/Text/Primary', rel: 'relates-to' };
const relationships: TokenRefRelationship[] = ['same-as', 'relates-to', 'source', 'design', 'demo'];

// @ts-expect-error — a subject says what it is for, so `$description` is required.
const undescribed: TokenSubject = { $token: 'DE Color/Text/Primary' };

// @ts-expect-error — and it must say which token, so `$token` is required.
const unidentified: TokenSubject = { $description: 'default body text' };

// @ts-expect-error — `$name` was the component-scope form; this document is tokens only.
const named: TokenSubject = { $name: 'color', $description: 'the status reported' };

// @ts-expect-error — a ref states its relationship; `rel` is required.
const unrelated: TokenRef = { to: 'DE Color/Text/Primary' };

// @ts-expect-error — rules belong in the guidelines document, never here.
const rule: TokensDocument = { styles: [{ statement: 'x', level: 'must' }] };

// @ts-expect-error — the tables are flat lists of tokens, not keyed by subject kind.
const keyed: TokensDocument = { useWhen: { tokens: [purpose] } };

export {
  document,
  headerOnly,
  status,
  pointer,
  ref,
  relationships,
  undescribed,
  unidentified,
  named,
  unrelated,
  rule,
  keyed,
};
