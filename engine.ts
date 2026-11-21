import { createSimplex, type Noise3 } from "@/lib/flow/noise";
import { getPalette, inkCss, type Palette } from "@/lib/flow/palettes";
import type { Settings } from "@/lib/flow/settings";

const SPACING = 28;
const MAX_PARTICLES = 6500;
const MIN_PARTICLES = 900;

/**
 * Full-canvas flow field. Particles follow a seeded simplex angle field that
 * slowly morphs through the noise's third dimension. The bitmap itself is the
 * trail — each frame only fades it — so export is just the canvas.
 */
export class FlowEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly getSettings: () => Settings;

  private raf = 0;
  private dead = false;
  private last = -1;
  private dpr = 1;
  private width = 1;
  private height = 1;

  private seed = -1;
  private paletteId = "";
  private palette: Palette = getPalette("ember");
  private z = 0;
  private noise: Noise3 = createSimplex(1);
  private noiseDetail: Noise3 = createSimplex(2);
  private forceSolid = true;

  private cols = 2;
  private rows = 2;
  private field = new Float32Array(8);

  private count = 0;
  private xs = new Float32Array(0);
  private ys = new Float32Array(0);
  private ox = new Float32Array(0);
  private oy = new Float32Array(0);
  private jitter = new Float32Array(0);
  private life = new Float32Array(0);
  private color = new Uint8Array(0);
  private buckets: number[][] = [];
  private coreColors: string[] = [];
  private glowColors: string[] = [];

  private countNode: HTMLElement | null = null;

  private rand: () => number = Math.random;

  constructor(canvas: HTMLCanvasElement, getSettings: () => Settings) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas is unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.getSettings = getSettings;
  }

  setCountNode(node: HTMLElement | null): void {
    this.countNode = node;
    this.publishCount();
  }

  start(): void {
    this.dead = false;
    this.last = -1;
    this.resize();
    const tick = (time: number) => {
      if (this.dead) return;
      this.frame(time);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.dead = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  exportPng(filename: string): void {
    this.canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  private frame(time: number): void {
    if (this.last < 0) this.last = time;
    const dt = Math.min(0.05, (time - this.last) / 1000);
    this.last = time;

    this.resize();
    const settings = this.getSettings();
    if (settings.seed !== this.seed || settings.paletteId !== this.paletteId) {
      this.applyIdentity(settings);
      this.preroll(settings, 80);
      return;
    }
    if (settings.paused) return;
    this.advance(settings, dt);
  }

  private applyIdentity(settings: Settings): void {
    this.seed = settings.seed >>> 0;
    this.paletteId = settings.paletteId;
    this.palette = getPalette(settings.paletteId);
    this.noise = createSimplex(this.seed);
    this.noiseDetail = createSimplex((Math.imul(this.seed, 1664525) + 1013904223) >>> 0);
    this.rand = mulberry32(this.seed ^ 0xa5a5a5a5);
    this.z = ((this.seed % 997) / 997) * 40;
    this.rebuildColors();
    this.allocate();
    this.forceSolid = true;
  }

  private rebuildColors(): void {
    const { inks, alpha, glow } = this.palette;
    this.coreColors = inks.map((ink) => inkCss(ink, alpha));
    this.glowColors = glow ? inks.map((ink) => inkCss(ink, alpha * 0.34)) : [];
    this.buckets = inks.map(() => []);
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const cssW = Math.max(1, parent.clientWidth);
    const cssH = Math.max(1, parent.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bufW = Math.max(1, Math.round(cssW * dpr));
    const bufH = Math.max(1, Math.round(cssH * dpr));
    const sizeChanged = cssW !== this.width || cssH !== this.height;
    if (!sizeChanged && dpr === this.dpr && this.canvas.width === bufW) return;

    this.width = cssW;
    this.height = cssH;
    this.dpr = dpr;
    this.canvas.width = bufW;
    this.canvas.height = bufH;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.forceSolid = true;
    if (this.seed >= 0) {
      this.allocate();
      const settings = this.getSettings();
      this.preroll(settings, 48);
    }
  }

  private allocate(): void {
    const area = this.width * this.height;
    const count = Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, Math.round(area / 145)));
    this.count = count;
    this.xs = new Float32Array(count);
    this.ys = new Float32Array(count);
    this.ox = new Float32Array(count);
    this.oy = new Float32Array(count);
    this.jitter = new Float32Array(count);
    this.life = new Float32Array(count);
    this.color = new Uint8Array(count);
    this.spawnAll();
    this.publishCount();
  }

  private publishCount(): void {
    if (!this.countNode) return;
    this.countNode.textContent = this.count.toLocaleString();
  }

  private spawnAll(): void {
    for (let i = 0; i < this.count; i++) this.spawn(i, true);
  }

  private spawn(i: number, initial: boolean): void {
    const x = this.rand() * this.width;
    const y = this.rand() * this.height;
    this.xs[i] = x;
    this.ys[i] = y;
    this.ox[i] = x;
    this.oy[i] = y;
    this.jitter[i] = 0.55 + this.rand() * 0.9;
    this.life[i] = initial ? 2 + this.rand() * 10 : 4 + this.rand() * 9;
  }

  private preroll(settings: Settings, steps: number): void {
    const dt = 1 / 60;
    for (let i = 0; i < steps; i++) this.advance(settings, dt);
  }

  private advance(settings: Settings, dt: number): void {
    const zRate = 0.018 + settings.speed * 0.16;
    this.z += dt * zRate;
    this.rebuildField(settings);

    const pxPerSec = 26 + settings.speed * 250;
    const margin = 12;
    const w = this.width;
    const h = this.height;
    const inkCount = this.palette.inks.length;

    for (const bucket of this.buckets) bucket.length = 0;

    for (let i = 0; i < this.count; i++) {
      const ox = this.xs[i] ?? 0;
      const oy = this.ys[i] ?? 0;
      this.ox[i] = ox;
      this.oy[i] = oy;

      const sample = this.sample(ox, oy);
      let x = ox + sample.x * pxPerSec * (this.jitter[i] ?? 1) * dt;
      let y = oy + sample.y * pxPerSec * (this.jitter[i] ?? 1) * dt;
      this.life[i] = (this.life[i] ?? 0) - dt;

      const expired =
        (this.life[i] ?? 0) <= 0 || x < -margin || y < -margin || x > w + margin || y > h + margin;
      if (expired) {
        this.spawn(i, false);
        continue;
      }

      this.xs[i] = x;
      this.ys[i] = y;
      const turn = (Math.atan2(sample.y, sample.x) + Math.PI) / (Math.PI * 2);
      const ci = Math.min(inkCount - 1, Math.max(0, Math.floor(turn * inkCount)));
      this.color[i] = ci;
      this.buckets[ci]?.push(i);
    }

    this.paint(settings, dt);
  }

  private rebuildField(settings: Settings): void {
    const cols = Math.max(2, Math.ceil(this.width / SPACING) + 1);
    const rows = Math.max(2, Math.ceil(this.height / SPACING) + 1);
    if (cols !== this.cols || rows !== this.rows || this.field.length < cols * rows * 2) {
      this.cols = cols;
      this.rows = rows;
      this.field = new Float32Array(cols * rows * 2);
    }

    const features = 1.7 + settings.scale * 7.2;
    const minSide = Math.min(this.width, this.height);
    const swirl = (((this.seed >>> 3) % 100) / 100 - 0.42) * 0.7;
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    const z = this.z;
    const noise = this.noise;
    const detail = this.noiseDetail;

    for (let j = 0; j < rows; j++) {
      const y = j * SPACING;
      const ny = (y / minSide) * features;
      for (let i = 0; i < cols; i++) {
        const x = i * SPACING;
        const nx = (x / minSide) * features;
        const n =
          noise(nx, ny, z) * 0.68 + detail(nx * 2.05 + 8, ny * 2.05 - 3, z * 1.65 + 2.5) * 0.32;
        let vx = Math.cos(n * Math.PI * 2.35);
        let vy = Math.sin(n * Math.PI * 2.35);
        if (swirl !== 0) {
          const tangent = Math.atan2(y - cy, x - cx) + Math.PI / 2;
          vx += Math.cos(tangent) * swirl;
          vy += Math.sin(tangent) * swirl;
        }
        const len = Math.hypot(vx, vy) || 1;
        const idx = (j * cols + i) * 2;
        this.field[idx] = vx / len;
        this.field[idx + 1] = vy / len;
      }
    }
  }

  private sample(x: number, y: number): { x: number; y: number } {
    const gx = x / SPACING;
    const gy = y / SPACING;
    const x0 = Math.min(this.cols - 2, Math.max(0, Math.floor(gx)));
    const y0 = Math.min(this.rows - 2, Math.max(0, Math.floor(gy)));
    const tx = gx - x0;
    const ty = gy - y0;
    const cols = this.cols;
    const i00 = (y0 * cols + x0) * 2;
    const i10 = i00 + 2;
    const i01 = i00 + cols * 2;
    const i11 = i01 + 2;
    const field = this.field;
    const vx0 = (field[i00] ?? 1) + ((field[i10] ?? 1) - (field[i00] ?? 1)) * tx;
    const vx1 = (field[i01] ?? 1) + ((field[i11] ?? 1) - (field[i01] ?? 1)) * tx;
    const vy0 = (field[i00 + 1] ?? 0) + ((field[i10 + 1] ?? 0) - (field[i00 + 1] ?? 0)) * tx;
    const vy1 = (field[i01 + 1] ?? 0) + ((field[i11 + 1] ?? 0) - (field[i01 + 1] ?? 0)) * tx;
    return { x: vx0 + (vx1 - vx0) * ty, y: vy0 + (vy1 - vy0) * ty };
  }

  private paint(settings: Settings, dt: number): void {
    const ctx = this.ctx;
    const [br, bg, bb] = this.palette.backgroundRgb;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";

    if (this.forceSolid) {
      ctx.fillStyle = this.palette.background;
      ctx.fillRect(0, 0, this.width, this.height);
      this.forceSolid = false;
    } else {
      const seconds = 0.4 + Math.pow(settings.trail, 1.28) * 15;
      const fade = 1 - Math.exp((-3.2 * dt) / seconds);
      ctx.fillStyle = `rgba(${br}, ${bg}, ${bb}, ${fade})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    ctx.lineCap = "round";
    ctx.globalCompositeOperation = this.palette.blend;
    if (this.palette.glow) {
      ctx.lineWidth = this.palette.lineWidth * 2.35;
      this.strokeBuckets(this.glowColors);
    }
    ctx.lineWidth = this.palette.lineWidth;
    this.strokeBuckets(this.coreColors);
    ctx.globalCompositeOperation = "source-over";
  }

  private strokeBuckets(colors: string[]): void {
    const ctx = this.ctx;
    const ox = this.ox;
    const oy = this.oy;
    const xs = this.xs;
    const ys = this.ys;
    for (let b = 0; b < this.buckets.length; b++) {
      const bucket = this.buckets[b];
      if (!bucket || bucket.length === 0) continue;
      ctx.beginPath();
      for (let k = 0; k < bucket.length; k++) {
        const i = bucket[k] ?? 0;
        ctx.moveTo(ox[i] ?? 0, oy[i] ?? 0);
        ctx.lineTo(xs[i] ?? 0, ys[i] ?? 0);
      }
      ctx.strokeStyle = colors[b] ?? colors[0] ?? "#fff";
      ctx.stroke();
    }
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
