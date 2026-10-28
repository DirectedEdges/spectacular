import { describe, it, expect } from 'vitest';
import { chooseOption } from '../../../src/version/chooseOption.js';

describe('chooseOption', () => {
  it('returns the first (safe) option without prompting outside a TTY', async () => {
    expect(await chooseOption(['Keep', 'Remove'], { isTTY: false })).toBe(0);
  });

  it('returns the first option when there is nothing to choose between', async () => {
    expect(await chooseOption([], { isTTY: true })).toBe(0);
  });
});
