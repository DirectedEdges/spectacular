// PNG utilities: load/save, pad-to-union (top-left anchor), backdrop
// detection, crop, and the baseline | render | diff triptych composite.
//
// pngjs comes from the customer install (deps.ts), so this is a factory over
// the loaded constructor rather than a module with its own import.
import fs from 'fs-extra';
import path from 'path';

type Png = { width: number; height: number; data: Buffer };
type PngCtor = new (opts: { width: number; height: number }) => Png;

export interface PngKit {
  readPng(file: string): Png;
  writePng(file: string, png: Png): void;
  parseHexColor(hex: string | null | undefined): [number, number, number];
  detectBackdrop(figma: Png, render: Png, fallback: [number, number, number]): [number, number, number];
  padToUnion(a: Png, b: Png, backdrop?: [number, number, number]): { a: Png; b: Png; width: number; height: number };
  triptych(figma: Png, render: Png, diff: Png): Png;
  crop(png: Png, rect: [number, number, number, number]): Png;
  makePng(width: number, height: number): Png;
}

export function createPngKit(PNGmod: { sync: { read(b: Buffer): Png; write(p: Png): Buffer } } & PngCtor): PngKit {
  const PNG = PNGmod;

  function blit(dest: Png, src: Png, dx: number, dy: number): void {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = ((y + dy) * dest.width + (x + dx)) * 4;
        dest.data[di] = src.data[si];
        dest.data[di + 1] = src.data[si + 1];
        dest.data[di + 2] = src.data[si + 2];
        dest.data[di + 3] = src.data[si + 3];
      }
    }
  }

  // Alpha-composite src over an opaque dest region. Diffing compares
  // flattened images: Figma exports and Playwright omitBackground shots
  // disagree about alpha wherever a surface is white vs transparent, and
  // raw RGBA comparison would flag every such pixel.
  function blitFlattened(dest: Png, src: Png, dx: number, dy: number): void {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = ((y + dy) * dest.width + (x + dx)) * 4;
        const alpha = src.data[si + 3] / 255;
        dest.data[di] = Math.round(src.data[si] * alpha + dest.data[di] * (1 - alpha));
        dest.data[di + 1] = Math.round(src.data[si + 1] * alpha + dest.data[di + 1] * (1 - alpha));
        dest.data[di + 2] = Math.round(src.data[si + 2] * alpha + dest.data[di + 2] * (1 - alpha));
        dest.data[di + 3] = 255;
      }
    }
  }

  function colorCanvas(width: number, height: number, [r, g, b]: [number, number, number]): Png {
    const png = new PNG({ width, height });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
    return png;
  }

  const GUTTER = 12;

  return {
    makePng: (width, height) => new PNG({ width, height }),

    readPng: (file) => PNG.sync.read(fs.readFileSync(file)),

    writePng(file, png) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, PNG.sync.write(png));
    },

    parseHexColor(hex) {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
      if (!m) return [255, 255, 255];
      return [0, 2, 4].map((o) => parseInt(m[1].slice(o, o + 2), 16)) as [number, number, number];
    },

    // Figma exports sometimes composite the page canvas behind a node and
    // sometimes leave it transparent — it varies by node shape. Detect the
    // effective backdrop per pair: the modal baseline color exactly where the
    // render is transparent but the baseline is opaque. A dominant single
    // color there is the composited canvas; anything else falls back.
    detectBackdrop(figma, render, fallback) {
      const w = Math.min(figma.width, render.width);
      const h = Math.min(figma.height, render.height);
      const counts = new Map<number, number>();
      let region = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const fi = (y * figma.width + x) * 4;
          const ri = (y * render.width + x) * 4;
          if (render.data[ri + 3] < 10 && figma.data[fi + 3] > 245) {
            region++;
            const key = (figma.data[fi] << 16) | (figma.data[fi + 1] << 8) | figma.data[fi + 2];
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
      }
      if (region < 16) return fallback;
      const [key, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (n / region < 0.9) return fallback;
      return [(key >> 16) & 255, (key >> 8) & 255, key & 255];
    },

    // Flatten both images onto a shared opaque union canvas, anchored
    // top-left, so backgrounds compare equal. Returns same-size copies + dims.
    padToUnion(a, b, backdrop = [255, 255, 255]) {
      const width = Math.max(a.width, b.width);
      const height = Math.max(a.height, b.height);
      const pa = colorCanvas(width, height, backdrop);
      const pb = colorCanvas(width, height, backdrop);
      blitFlattened(pa, a, 0, 0);
      blitFlattened(pb, b, 0, 0);
      return { a: pa, b: pb, width, height };
    },

    // Horizontal baseline | render | diff composite on a neutral background —
    // the unit of diagnosis for a human or an agent.
    triptych(figma, render, diff) {
      const panels = [figma, render, diff];
      const width = panels.reduce((sum, p) => sum + p.width, 0) + GUTTER * 4;
      const height = Math.max(...panels.map((p) => p.height)) + GUTTER * 2;
      const out = new PNG({ width, height });
      for (let i = 0; i < out.data.length; i += 4) {
        out.data[i] = 238;
        out.data[i + 1] = 238;
        out.data[i + 2] = 238;
        out.data[i + 3] = 255;
      }
      let x = GUTTER;
      for (const panel of panels) {
        blit(out, panel, x, GUTTER);
        x += panel.width + GUTTER;
      }
      return out;
    },

    // Crop to [x, y, w, h], clamped. Brings a Figma export — which covers the
    // node's render bounds — back to the node's own box.
    crop(png, [x, y, w, h]) {
      const sx = Math.max(0, Math.min(x, png.width));
      const sy = Math.max(0, Math.min(y, png.height));
      const width = Math.max(1, Math.min(w, png.width - sx));
      const height = Math.max(1, Math.min(h, png.height - sy));
      const out = new PNG({ width, height });
      for (let row = 0; row < height; row++) {
        const from = ((row + sy) * png.width + sx) * 4;
        png.data.copy(out.data, row * width * 4, from, from + width * 4);
      }
      return out;
    },
  };
}
