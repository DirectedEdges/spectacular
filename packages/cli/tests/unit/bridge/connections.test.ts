import { describe, it, expect } from 'vitest';
import { ConnectionRegistry } from '../../../src/bridge/connections.js';

function fakeSocket(readyState = 1) {
  return { readyState };
}

describe('ConnectionRegistry', () => {
  it('resolve() throws when nothing is connected', () => {
    const registry = new ConnectionRegistry();
    expect(() => registry.resolve()).toThrow('No plugin connected. Enable the CLI Bridge in the Figma plugin first.');
  });

  it('resolve() returns the sole connection when exactly one is registered', () => {
    const registry = new ConnectionRegistry();
    const ws = fakeSocket();
    registry.register('fileA', ws, 'Design System');

    const conn = registry.resolve();
    expect(conn.fileKey).toBe('fileA');
    expect(conn.fileName).toBe('Design System');
    expect(conn.ws).toBe(ws);
  });

  it('resolve() throws an ambiguity error listing all connections when 2+ are registered and no fileKey given', () => {
    const registry = new ConnectionRegistry();
    registry.register('fileA', fakeSocket(), 'Design System');
    registry.register('fileB', fakeSocket(), 'Prototype');

    expect(() => registry.resolve()).toThrow(
      'Multiple plugins connected — specify --file <fileKey>. Connected: fileA (Design System), fileB (Prototype)'
    );
  });

  it('resolve(fileKey) returns the matching connection even when multiple are registered', () => {
    const registry = new ConnectionRegistry();
    const wsA = fakeSocket();
    const wsB = fakeSocket();
    registry.register('fileA', wsA, 'Design System');
    registry.register('fileB', wsB, 'Prototype');

    expect(registry.resolve('fileB').ws).toBe(wsB);
  });

  it('resolve(fileKey) throws when the requested fileKey is not connected', () => {
    const registry = new ConnectionRegistry();
    registry.register('fileA', fakeSocket());

    expect(() => registry.resolve('nonexistent')).toThrow('No plugin connected for file "nonexistent".');
  });

  it('unregister() removes only the specified connection, not others', () => {
    // Regression test for the original single-activeSocket bug: an older
    // connection's close handler used to null out a newer connection's
    // reference. Confirms unregister is scoped to its own fileKey.
    const registry = new ConnectionRegistry();
    registry.register('fileA', fakeSocket());
    registry.register('fileB', fakeSocket());

    registry.unregister('fileA');

    expect(registry.size).toBe(1);
    expect(() => registry.resolve('fileA')).toThrow();
    expect(registry.resolve('fileB').fileKey).toBe('fileB');
  });

  it('unregister() of an unknown fileKey is a no-op', () => {
    const registry = new ConnectionRegistry();
    registry.register('fileA', fakeSocket());

    expect(() => registry.unregister('nonexistent')).not.toThrow();
    expect(registry.size).toBe(1);
  });

  it('register() with an already-used fileKey overwrites the prior entry (reconnect)', () => {
    const registry = new ConnectionRegistry();
    const wsOld = fakeSocket();
    const wsNew = fakeSocket();
    registry.register('fileA', wsOld);
    registry.register('fileA', wsNew);

    expect(registry.size).toBe(1);
    expect(registry.resolve('fileA').ws).toBe(wsNew);
  });

  it('list() reports connected state per readyState and includes fileName when present', () => {
    const registry = new ConnectionRegistry();
    registry.register('fileA', fakeSocket(1), 'Design System');
    registry.register('fileB', fakeSocket(3)); // 3 = CLOSED

    const list = registry.list().sort((a, b) => a.fileKey.localeCompare(b.fileKey));
    expect(list).toEqual([
      { fileKey: 'fileA', fileName: 'Design System', connected: true },
      { fileKey: 'fileB', fileName: undefined, connected: false },
    ]);
  });
});
