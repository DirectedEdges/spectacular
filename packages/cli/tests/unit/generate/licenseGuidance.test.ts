// Two problems hide under "the license check failed", and their remedies have
// nothing in common (specs#518).
import { describe, it, expect } from 'vitest';
import { TRANSIENT_FAILURES, transientFailureLines } from '../../../src/generate/licenseGuidance.js';

describe('transientFailureLines', () => {
  it('sends an unreachable server to the network, not to a retry', () => {
    // Offline, a DNS failure, a corporate TLS interception. "Retry in a few
    // seconds" is useless advice for any of them.
    const lines = transientFailureLines('network-error').join('\n');

    expect(lines).toContain('could not be reached');
    expect(lines).toContain('network connection');
    expect(lines).toContain('remove the key');
    expect(lines).not.toContain('Retry in a few seconds');
  });

  it('sends a failed check to a retry, not to the network', () => {
    const lines = transientFailureLines('error').join('\n');

    expect(lines).toContain('could not be completed');
    expect(lines).toContain('Retry in a few seconds');
    expect(lines).not.toContain('network connection');
  });

  it('sends a rate limit to a wait, not to the network or a quick retry', () => {
    // A rate limit clears by not sending requests; a quick retry feeds it and
    // network advice sends diagnosis to the wrong layer.
    const lines = transientFailureLines('rate-limited').join('\n');

    expect(lines).toContain('rate limited');
    expect(lines).toContain('Wait');
    expect(lines).not.toContain('network connection');
    expect(lines).not.toContain('Retry in a few seconds');
  });

  it('names an unrecognised status, so a report says which failure it was', () => {
    expect(transientFailureLines('some-new-status').join('\n')).toContain('some-new-status');
  });

  it('always says the key was not validated and nothing licensed was written', () => {
    for (const status of [...TRANSIENT_FAILURES]) {
      const lines = transientFailureLines(status).join('\n');
      expect(lines).toContain('was not validated');
      expect(lines).toContain('no licensed output');
    }
  });

  it('covers exactly the states that are not a verdict', () => {
    // invalid / removed / expired / wrong-runtime are answers; free is right for them.
    expect([...TRANSIENT_FAILURES].sort()).toEqual(['error', 'network-error', 'rate-limited']);
  });
});
