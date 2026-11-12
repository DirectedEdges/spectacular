// Scaffolded by `specs storybook init`. Yours after that — publish never
// touches it.
//
// Storybook's own autodocs page, with one change: the heading names the
// component, not just the view.
//
// A component is a folder in the sidebar and each platform's docs page is a leaf
// inside it, so the leaf is labelled `React` and the page inherited that as its
// whole heading — three components open in three tabs all said "React". The
// `<Title>` block takes the last segment of the meta title and accepts no
// parameter to override it; only children. So the page is rebuilt from the same
// blocks `DocsPage` composes, with the title supplied.
//
// Everything else here mirrors `DocsPage` exactly, including the single-story
// branch. Keep it that way: a block added to Storybook's version is a block
// missing from this one, and the symptom is a docs page quietly short a section.
import * as React from 'react';
import {
  Controls,
  Description,
  Primary,
  Stories,
  Subtitle,
  Title,
  useOf,
} from '@storybook/addon-docs/blocks';

/**
 * `Components/EGDS Block (Beta)/React` → `EGDS Block (Beta) / React`.
 *
 * The section is dropped — it is the branch the reader navigated through, not
 * part of the component's name. A title with no folder above it (a Foundations
 * page, the Testing reports) is left to Storybook's own derivation.
 */
function heading(title: string): string | undefined {
  const segments = title.split('/').map((s) => s.trim());
  if (segments.length < 3) return undefined;
  return segments.slice(1).join(' / ');
}

export function PlatformDocs() {
  const resolved = useOf('meta', ['meta']);
  const { stories } = resolved.csfFile;
  const isSingleStory = Object.keys(stories).length === 1;
  const custom = heading(resolved.preparedMeta?.title ?? '');
  return (
    <>
      {custom ? <Title>{custom}</Title> : <Title />}
      <Subtitle />
      <Description of="meta" />
      {isSingleStory ? <Description of="story" /> : null}
      <Primary />
      <Controls />
      {isSingleStory ? null : <Stories />}
    </>
  );
}
