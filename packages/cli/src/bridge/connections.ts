// Tracks connected plugin sockets, keyed by Figma file key. Extracted from
// server.ts so the connection-resolution logic (ambiguous-file detection,
// stale-close handling) can be unit tested without binding real network ports.

export interface ConnectionLike {
  readyState: number;
}

export interface Connection<TSocket extends ConnectionLike> {
  ws: TSocket;
  fileKey: string;
  fileName?: string;
}

export class ConnectionRegistry<TSocket extends ConnectionLike> {
  private connections = new Map<string, Connection<TSocket>>();

  register(fileKey: string, ws: TSocket, fileName?: string): void {
    this.connections.set(fileKey, { ws, fileKey, fileName });
  }

  unregister(fileKey: string): void {
    this.connections.delete(fileKey);
  }

  get size(): number {
    return this.connections.size;
  }

  /**
   * Resolve which connection a request targets.
   * - Explicit fileKey: must match a connected plugin.
   * - No fileKey, exactly one connection: use it.
   * - No fileKey, zero or 2+ connections: throw — never guess.
   */
  resolve(fileKey?: string | null): Connection<TSocket> {
    if (fileKey) {
      const conn = this.connections.get(fileKey);
      if (!conn) {
        throw new Error(`No plugin connected for file "${fileKey}".`);
      }
      return conn;
    }

    if (this.connections.size === 0) {
      throw new Error('No plugin connected. Enable the CLI Bridge in the Figma plugin first.');
    }

    if (this.connections.size > 1) {
      const list = [...this.connections.values()]
        .map((c) => c.fileName ? `${c.fileKey} (${c.fileName})` : c.fileKey)
        .join(', ');
      throw new Error(`Multiple plugins connected — specify --file <fileKey>. Connected: ${list}`);
    }

    return [...this.connections.values()][0];
  }

  list(): Array<{ fileKey: string; fileName?: string; connected: boolean }> {
    return [...this.connections.values()].map((c) => ({
      fileKey: c.fileKey,
      fileName: c.fileName,
      connected: c.ws.readyState === 1,
    }));
  }
}
