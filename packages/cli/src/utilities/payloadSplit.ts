/**
 * Streaming page splitter for Figma file payloads.
 *
 * A file payload's bulk lives in `document.children` — the pages. Splitting the
 * payload at page boundaries while it streams to disk gives every consumer a
 * way to read only the pages it needs, without ever materializing the whole
 * payload as one string (impossible past V8's ~512MB limit).
 *
 * The splitter routes every source byte to exactly one destination:
 *
 *   <alias>.file/
 *     manifest.json   format version, page index (id, name, bytes, sha256),
 *                     separators, and the whole-payload sha256
 *     root.json       everything outside the pages: the payload with
 *                     `document.children` emptied. Valid JSON on its own.
 *     page-NNN.json   one raw byte slice per page. Valid JSON on its own.
 *
 * Reassembly is byte-perfect by construction (separators[i] is the raw byte
 * run BEFORE page i — normally '' for the first page and ',' for the rest):
 *   root.json[0..prefixBytes) + sep0 + page0 + sep1 + page1 + … + root.json[prefixBytes..)
 * and `sourceSha256` in the manifest is the hash of the original payload, so
 * the reconstruction is verifiable without the monolithic file.
 *
 * The scanner is a byte-level JSON state machine (string/escape/depth aware) —
 * it never parses the document, so a payload of any size splits in one pass.
 */

import { createHash, type Hash } from 'crypto';
import { WriteStream, createWriteStream, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

/** Bump when the on-disk layout changes shape. Consumers refuse unknown versions. */
export const SPLIT_FORMAT_VERSION = 1;

export interface SplitPageEntry {
  index: number;
  id: string;
  name: string;
  file: string;
  bytes: number;
  sha256: string;
}

export interface SplitManifest {
  formatVersion: number;
  /** Total bytes of the original payload. */
  sourceBytes: number;
  /** sha256 of the original payload — the reassembly verification target. */
  sourceSha256: string;
  /** Byte offset inside root.json where the suffix begins (prefix ends with the
   *  `[` of document.children; the suffix starts with its `]`). */
  prefixBytes: number;
  /** Raw byte run before each page: separators[i] precedes pages[i] (normally
   *  '' for the first page and a single comma for the rest). */
  separators: string[];
  pages: SplitPageEntry[];
}

const QUOTE = 0x22, BACKSLASH = 0x5c, COLON = 0x3a, COMMA = 0x2c;
const LBRACE = 0x7b, RBRACE = 0x7d, LBRACKET = 0x5b, RBRACKET = 0x5d;
const PAGE_HEAD_CAPTURE = 400;

/** Write one stream's bytes while hashing and counting them. */
class Sink {
  bytes = 0;
  private readonly hash = createHash('sha256');
  private readonly stream: WriteStream;
  private readonly pending: Promise<void>[] = [];

  constructor(path: string) {
    this.stream = createWriteStream(path);
    // Errors surface through close(); after destroy() they are expected noise.
    this.stream.on('error', () => {});
    // Backpressure adds a once-drain listener per stall; large payloads stall often.
    this.stream.setMaxListeners(0);
  }

  destroy(): void {
    this.stream.destroy();
  }

  write(chunk: Buffer): void {
    this.bytes += chunk.length;
    this.hash.update(chunk);
    if (!this.stream.write(chunk)) {
      this.pending.push(new Promise(resolve => this.stream.once('drain', resolve)));
    }
  }

  async close(): Promise<string> {
    await Promise.all(this.pending);
    await new Promise<void>((resolve, reject) => {
      this.stream.end(() => resolve());
      this.stream.once('error', reject);
    });
    return this.hash.digest('hex');
  }
}

export class PayloadSplitter {
  private readonly dir: string;
  private readonly rootSink: Sink;
  private readonly sourceHash: Hash = createHash('sha256');
  private sourceBytes = 0;

  // JSON scanner state
  private depth = 0;
  private inString = false;
  private escaped = false;
  private strBuf: string | null = null;
  private lastString: string | null = null;
  private keyAtDepth: (string | null)[] = [];

  // Routing state
  private childrenDepth = -1;      // depth of the document.children array, once seen
  private childrenDone = false;    // the array closed — everything after is suffix
  private pageSink: Sink | null = null;
  private pageHead: number[] = [];
  private separatorBuf: number[] = [];
  private prefixBytes = -1;

  private readonly separators: string[] = [];
  private readonly pages: SplitPageEntry[] = [];
  private readonly pageClosers: Promise<void>[] = [];

  constructor(dir: string) {
    this.dir = dir;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    this.rootSink = new Sink(join(dir, 'root.json'));
  }

  /** Feed the next chunk of the payload, in arrival order. */
  write(chunk: Buffer): void {
    this.sourceBytes += chunk.length;
    this.sourceHash.update(chunk);

    let runStart = 0; // start of the byte run destined for the current sink
    const flushRun = (end: number) => {
      if (end > runStart) this.routeRun(chunk.subarray(runStart, end));
      runStart = end;
    };

    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];

      if (this.inString) {
        if (this.strBuf !== null && this.strBuf.length < 200 && c !== QUOTE) {
          this.strBuf += String.fromCharCode(c);
        }
        if (this.escaped) this.escaped = false;
        else if (c === BACKSLASH) this.escaped = true;
        else if (c === QUOTE) {
          this.inString = false;
          this.lastString = this.strBuf;
          this.strBuf = null;
        }
        continue;
      }

      switch (c) {
        case QUOTE:
          this.inString = true;
          this.strBuf = '';
          break;
        case COLON:
          if (this.lastString !== null) {
            this.keyAtDepth[this.depth] = this.lastString;
            this.lastString = null;
          }
          break;
        case LBRACE:
        case LBRACKET:
          this.depth++;
          if (
            c === LBRACKET && this.childrenDepth === -1 && !this.childrenDone &&
            this.depth === 3 && this.keyAtDepth[1] === 'document' && this.keyAtDepth[2] === 'children'
          ) {
            // Everything up to and including this '[' is prefix — flush it
            // BEFORE marking the children array open, or routeRun would treat
            // the prefix as separator bytes. The suffix begins at this offset.
            flushRun(i + 1);
            this.prefixBytes = this.rootSink.bytes;
            this.childrenDepth = this.depth;
          } else if (c === LBRACE && this.childrenDepth !== -1 && !this.childrenDone && this.depth === this.childrenDepth + 1) {
            // A page begins. Bytes since the last boundary are separator bytes.
            flushRun(i);
            this.openPage();
            runStart = i;
          }
          break;
        case RBRACE:
        case RBRACKET:
          if (this.pageSink && c === RBRACE && this.depth === this.childrenDepth + 1) {
            // The page ends with this byte.
            flushRun(i + 1);
            this.closePage();
          } else if (this.childrenDepth !== -1 && !this.childrenDone && c === RBRACKET && this.depth === this.childrenDepth) {
            // The children array closes: suffix starts here.
            flushRun(i);
            this.childrenDone = true;
            this.flushSeparatorAsFinal();
          }
          this.depth--;
          break;
      }
    }
    flushRun(chunk.length);
  }

  private routeRun(run: Buffer): void {
    if (this.pageSink) {
      if (this.pageHead.length < PAGE_HEAD_CAPTURE) {
        for (let i = 0; i < run.length && this.pageHead.length < PAGE_HEAD_CAPTURE; i++) this.pageHead.push(run[i]);
      }
      this.pageSink.write(run);
      return;
    }
    if (this.childrenDepth !== -1 && !this.childrenDone) {
      // Between pages inside the children array: separator bytes (commas).
      for (const b of run) this.separatorBuf.push(b);
      return;
    }
    this.rootSink.write(run);
  }

  private openPage(): void {
    // Bytes gathered since the '[' (or the previous page's close) are the
    // separator run that precedes this page.
    this.separators.push(Buffer.from(this.separatorBuf).toString('utf8'));
    this.separatorBuf = [];
    this.pageHead = [];
    this.pageSink = new Sink(join(this.dir, pageFileName(this.pages.length)));
  }

  private closePage(): void {
    const sink = this.pageSink!;
    this.pageSink = null;
    const index = this.pages.length;
    const head = Buffer.from(this.pageHead).toString('utf8');
    const idMatch = head.match(/"id"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const nameMatch = head.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const entry: SplitPageEntry = {
      index,
      id: idMatch ? unescapeJsonString(idMatch[1]) : '',
      name: nameMatch ? unescapeJsonString(nameMatch[1]) : '',
      file: pageFileName(index),
      bytes: sink.bytes,
      sha256: '',
    };
    this.pages.push(entry);
    this.pageClosers.push(sink.close().then(hash => { entry.sha256 = hash; }));
  }

  /**
   * The scanner's own state is the only evidence that the payload arrived whole.
   * Figma sends the file payload chunked with no `content-length`, so a body that
   * stops early without a transport error is indistinguishable by length from a
   * complete one, and a split built from it would be written and reported as a
   * real artifact.
   *
   * Balanced depth is the signal, not a finished `document.children`: a payload
   * carrying no `document.children` at all is legal and ends at depth 0.
   */
  private assertComplete(): void {
    if (this.sourceBytes === 0) throw new Error('payload was empty — nothing to split');
    // Pages hold nearly every byte, so this is the likeliest cut point by a wide
    // margin and worth naming on its own.
    if (this.pageSink) throw new Error('payload ended inside a page — truncated or malformed JSON');
    if (this.inString) throw new Error('payload ended inside a string — truncated or malformed JSON');
    if (this.depth !== 0) throw new Error(`payload ended at JSON depth ${this.depth}, expected 0 — truncated or malformed JSON`);
  }

  private flushSeparatorAsFinal(): void {
    // Whitespace between the last page and the closing ']' (rare) belongs to no
    // gap; append it to the suffix instead so no byte is lost.
    if (this.separatorBuf.length > 0) {
      this.rootSink.write(Buffer.from(this.separatorBuf));
      this.separatorBuf = [];
    }
  }

  /** Close all sinks and write manifest.json. Throws unless the payload ended on
   *  a structural boundary — see `assertComplete`. */
  async finish(): Promise<SplitManifest> {
    this.assertComplete();
    if (this.separatorBuf.length > 0) this.flushSeparatorAsFinal();
    await Promise.all(this.pageClosers);
    await this.rootSink.close();

    const manifest: SplitManifest = {
      formatVersion: SPLIT_FORMAT_VERSION,
      sourceBytes: this.sourceBytes,
      sourceSha256: this.sourceHash.digest('hex'),
      prefixBytes: this.prefixBytes === -1 ? this.rootSink.bytes : this.prefixBytes,
      separators: this.separators,
      pages: this.pages,
    };
    writeFileSync(join(this.dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return manifest;
  }

  /** Best-effort cleanup after a failure — the split directory must never be
   *  left half-written where a consumer could mistake it for a real artifact. */
  abort(): void {
    this.pageSink?.destroy();
    this.pageSink = null;
    this.rootSink.destroy();
    try { rmSync(this.dir, { recursive: true, force: true }); } catch { /* already gone */ }
  }
}

function pageFileName(index: number): string {
  return `page-${String(index).padStart(3, '0')}.json`;
}

function unescapeJsonString(escaped: string): string {
  try {
    return JSON.parse(`"${escaped}"`) as string;
  } catch {
    return escaped;
  }
}

/** The split directory path for an alias's file payload. */
export function splitDirFor(outDir: string, alias: string): string {
  return join(outDir, `${alias}.file`);
}
