import { describe, it, expect } from 'vitest';
import {
  parseStories,
  attachStoryIds,
  resolveStory,
  serializeArgs,
} from '../../../src/testing/visual/storyJoin.js';

const SOURCE = `
const meta = {
  title: 'Components/Button',
  component: Button,
  args: {
    label: "Label",
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Primary: Story = {
  args: {
    appearance: "primary",
  },
};

export const Ratio34: Story = { args: { ratio: "3:4" } };
`;

describe('parseStories', () => {
  it('merges meta scalars under each story and reads one-line stories by depth', () => {
    const stories = parseStories(SOURCE);
    const byName = Object.fromEntries(stories.map((s) => [s.exportName, s]));
    expect(byName.Default.args).toEqual({ label: 'Label' });
    expect(byName.Primary.args).toEqual({ label: 'Label', appearance: 'primary' });
    // The one-line story must not read as having no args — that silently
    // sends its variant to Default with a URL overlay.
    expect(byName.Ratio34.args).toEqual({ label: 'Label', ratio: '3:4' });
  });
});

describe('attachStoryIds', () => {
  it('matches Storybook id word-splitting, digit runs included', () => {
    const stories = parseStories(SOURCE);
    const entries = [
      { id: 'components-button--default', title: 'Components/Button', type: 'story' },
      { id: 'components-button--ratio-34', title: 'Components/Button', type: 'story' },
    ];
    const attached = attachStoryIds(stories, entries, 'Components/Button');
    expect(attached.map((s) => s.id)).toEqual([
      'components-button--default',
      'components-button--ratio-34',
    ]);
  });
});

describe('resolveStory', () => {
  const stories = parseStories(SOURCE).map((s, i) => ({ ...s, id: `id-${i}` }));
  const defaults = { appearance: 'secondary', label: 'Label' };
  const argProps = ['appearance', 'label'];

  it('joins exactly when a story completes to the variant configuration', () => {
    const r = resolveStory({ args: { appearance: 'primary' } }, stories, defaults, argProps, new Set());
    expect(r?.exact).toBe(true);
    expect(r?.story.exportName).toBe('Primary');
  });

  it('overlays the remainder when no story matches exactly', () => {
    const r = resolveStory({ args: { appearance: 'danger' } }, stories, defaults, argProps, new Set());
    expect(r?.exact).toBe(false);
    expect(r?.overlay).toEqual({ appearance: 'danger' });
  });
});

describe('serializeArgs', () => {
  it('writes Storybook URL arg syntax', () => {
    expect(serializeArgs({ a: true, b: false, c: null, d: 'x y' })).toBe('a:!true;b:!false;c:!null;d:x%20y');
  });
});
