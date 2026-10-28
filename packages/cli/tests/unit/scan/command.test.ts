import { describe, it, expect } from 'vitest';
import { Scan } from '../../../src/commands/scan.js';

describe('ScanCommand', () => {
  it('registers name and description', () => {
    expect(Scan.name()).toBe('scan');
    expect(Scan.description()).toContain('component manifest');
  });

  it('registers expected options', () => {
    const options = Scan.options.map(option => option.long).filter(Boolean);

    expect(options).toContain('--output');
    expect(options).toContain('--source');
    expect(options).toContain('--include-all');
    expect(options).toContain('--keep-checks');
    expect(options).toContain('--reset-checks');
    expect(options).toContain('--variables');
    expect(options).toContain('--verbose');
  });
});
