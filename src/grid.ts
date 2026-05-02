export type GridConfig = {
  bgColor: string;
  dotColor: string;
  palette: string[];
  sectionsX: number;
  sectionsY: number;
  renderMode: "dots" | "lines";
  dotSize: number;
  spacing: number;
  cursorRadius: number;
  cursorStrength: number;
  pullRestDelay: number;
  colorRadius: number;
  scrollStrength: number;
  springStiffness: number;
  damping: number;
  paused: boolean;
};

type RGB = [number, number, number];

type Dot = {
  rx: number;
  ry: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  br: number;
  bg: number;
  bb: number;
};

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function anchorIndex(i: number, j: number, len: number): number {
  return ((i * 2 + j * 3) % len + len) % len;
}

export class DottedGrid {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dots: Dot[] = [];
  private gridCols = 0;
  private gridRows = 0;
  private width = 0;
  private height = 0;
  private mouseX = -9999;
  private mouseY = -9999;
  private hasMouse = false;
  private lastMoveTime = 0;
  private scrollVel = 0;
  private lastScrollY = 0;
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private cachedDotColorHex = "";
  private cachedDotColorRGB: RGB = [0, 0, 0];
  private colorStringCache = new Map<number, string>();
  private dotBuckets = new Map<string, number[]>();
  private segBuckets = new Map<string, number[]>();

  constructor(
    canvas: HTMLCanvasElement,
    public config: GridConfig,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
  }

  start() {
    this.resize();
    this.lastScrollY = window.scrollY;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(document.documentElement);

    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("scroll", this.onScroll, { passive: true });

    this.tick();
  }

  stop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("scroll", this.onScroll);
  }

  rebuild() {
    this.buildDots();
  }

  private getDotColorRGB(): RGB {
    if (this.config.dotColor !== this.cachedDotColorHex) {
      this.cachedDotColorHex = this.config.dotColor;
      this.cachedDotColorRGB = hexToRgb(this.config.dotColor);
    }
    return this.cachedDotColorRGB;
  }

  private quantizedColorString(cr: number, cg: number, cb: number): string {
    const qr = cr & 0xf0;
    const qg = cg & 0xf0;
    const qb = cb & 0xf0;
    const key = (qr << 16) | (qg << 8) | qb;
    let str = this.colorStringCache.get(key);
    if (!str) {
      str = `rgb(${qr},${qg},${qb})`;
      this.colorStringCache.set(key, str);
    }
    return str;
  }

  private onPointerMove = (e: PointerEvent) => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    this.hasMouse = true;
    this.lastMoveTime = performance.now();
  };

  private onPointerLeave = () => {
    this.hasMouse = false;
    this.mouseX = -9999;
    this.mouseY = -9999;
  };

  private onScroll = () => {
    const y = window.scrollY;
    const delta = y - this.lastScrollY;
    this.lastScrollY = y;
    this.scrollVel += delta;
  };

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Read CSS-resolved box (100lvh) rather than window.innerHeight, so
    // iOS Safari's collapsing URL bar doesn't leave a gap below the grid.
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.buildDots();
  }

  private buildDots() {
    const { spacing, palette, sectionsX, sectionsY } = this.config;
    const cols = Math.ceil(this.width / spacing) + 1;
    const rows = Math.ceil(this.height / spacing) + 1;
    const offsetX = (this.width - (cols - 1) * spacing) / 2;
    const offsetY = (this.height - (rows - 1) * spacing) / 2;

    const stops: RGB[] = palette.map(hexToRgb);
    const sx = Math.max(1, Math.floor(sectionsX));
    const sy = Math.max(1, Math.floor(sectionsY));
    const cellW = this.width / sx;
    const cellH = this.height / sy;

    const anchors: RGB[][] = [];
    for (let j = 0; j <= sy; j++) {
      const row: RGB[] = [];
      for (let i = 0; i <= sx; i++) {
        row.push(stops[anchorIndex(i, j, stops.length)] ?? [0, 0, 0]);
      }
      anchors.push(row);
    }

    this.gridCols = cols;
    this.gridRows = rows;

    const next: Dot[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const rx = offsetX + c * spacing;
        const ry = offsetY + r * spacing;

        const cxRaw = rx / cellW;
        const cyRaw = ry / cellH;
        const cx = Math.max(0, Math.min(Math.floor(cxRaw), sx - 1));
        const cy = Math.max(0, Math.min(Math.floor(cyRaw), sy - 1));
        const fx = Math.max(0, Math.min(1, cxRaw - cx));
        const fy = Math.max(0, Math.min(1, cyRaw - cy));

        const c00 = anchors[cy][cx];
        const c10 = anchors[cy][cx + 1];
        const c01 = anchors[cy + 1][cx];
        const c11 = anchors[cy + 1][cx + 1];

        const r0 = c00[0] + (c10[0] - c00[0]) * fx;
        const g0 = c00[1] + (c10[1] - c00[1]) * fx;
        const b0 = c00[2] + (c10[2] - c00[2]) * fx;
        const r1 = c01[0] + (c11[0] - c01[0]) * fx;
        const g1 = c01[1] + (c11[1] - c01[1]) * fx;
        const b1 = c01[2] + (c11[2] - c01[2]) * fx;

        const br = r0 + (r1 - r0) * fy;
        const bg = g0 + (g1 - g0) * fy;
        const bb = b0 + (b1 - b0) * fy;

        next.push({ rx, ry, x: rx, y: ry, vx: 0, vy: 0, br, bg, bb });
      }
    }
    this.dots = next;
  }

  private tick = () => {
    this.rafId = requestAnimationFrame(this.tick);
    if (!this.config.paused) this.step();
    this.draw();
  };

  private step() {
    const {
      cursorRadius,
      cursorStrength,
      pullRestDelay,
      scrollStrength,
      springStiffness,
      damping,
    } = this.config;

    const restMs = Math.max(0, pullRestDelay * 1000);
    const fadeMs = Math.min(120, restMs);
    const sinceMove = performance.now() - this.lastMoveTime;
    let pullFactor: number;
    if (restMs === 0 || sinceMove >= restMs) pullFactor = 0;
    else if (sinceMove > restMs - fadeMs) pullFactor = (restMs - sinceMove) / fadeMs;
    else pullFactor = 1;

    const r2 = cursorRadius * cursorRadius;
    const mx = this.mouseX;
    const my = this.mouseY;
    const cursorActive = this.hasMouse && pullFactor > 0;

    const scrollKick = this.scrollVel * scrollStrength * 0.01;
    this.scrollVel *= 0.85;

    for (let i = 0; i < this.dots.length; i++) {
      const d = this.dots[i];

      if (cursorActive) {
        const dx = d.x - mx;
        const dy = d.y - my;
        const distSq = dx * dx + dy * dy;
        if (distSq < r2 && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const falloff = 1 - dist / cursorRadius;
          const force = falloff * falloff * cursorStrength * pullFactor;
          const nx = dx / dist;
          const ny = dy / dist;
          d.vx -= nx * force;
          d.vy -= ny * force;
        }
      }

      if (scrollKick !== 0) d.vy += scrollKick;

      d.vx += (d.rx - d.x) * springStiffness;
      d.vy += (d.ry - d.y) * springStiffness;
      d.vx *= damping;
      d.vy *= damping;
      d.x += d.vx;
      d.y += d.vy;
    }
  }

  private draw() {
    const ctx = this.ctx;
    ctx.fillStyle = this.config.bgColor;
    ctx.fillRect(0, 0, this.width, this.height);
    if (this.config.renderMode === "lines") this.drawLines();
    else this.drawDots();
  }

  private drawDots() {
    const { dotColor, dotSize, colorRadius } = this.config;
    const ctx = this.ctx;
    const r = dotSize / 2;

    ctx.fillStyle = dotColor;
    ctx.beginPath();
    for (let i = 0; i < this.dots.length; i++) {
      const d = this.dots[i];
      ctx.moveTo(d.x + r, d.y);
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
    }
    ctx.fill();

    if (!this.hasMouse) return;

    const [gr, gg, gb] = this.getDotColorRGB();
    const mx = this.mouseX;
    const my = this.mouseY;
    const r2 = colorRadius * colorRadius;
    if (r2 <= 0) return;

    this.dotBuckets.clear();
    for (let i = 0; i < this.dots.length; i++) {
      const d = this.dots[i];
      const dx = d.x - mx;
      const dy = d.y - my;
      const distSq = dx * dx + dy * dy;
      if (distSq >= r2) continue;
      const t = 1 - Math.sqrt(distSq) / colorRadius;
      const k = t * t;
      const cr = Math.round(gr + (d.br - gr) * k);
      const cg = Math.round(gg + (d.bg - gg) * k);
      const cb = Math.round(gb + (d.bb - gb) * k);
      const key = this.quantizedColorString(cr, cg, cb);
      let bucket = this.dotBuckets.get(key);
      if (!bucket) {
        bucket = [];
        this.dotBuckets.set(key, bucket);
      }
      bucket.push(d.x, d.y);
    }

    for (const [color, coords] of this.dotBuckets) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < coords.length; i += 2) {
        const x = coords[i];
        const y = coords[i + 1];
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  private drawLines() {
    const { dotColor, dotSize, colorRadius } = this.config;
    const ctx = this.ctx;
    const cols = this.gridCols;
    const rows = this.gridRows;

    ctx.lineWidth = dotSize;
    ctx.lineCap = "butt";

    ctx.strokeStyle = dotColor;
    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const d = this.dots[idx];
        if (c < cols - 1) {
          const right = this.dots[idx + 1];
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(right.x, right.y);
        }
        if (r < rows - 1) {
          const down = this.dots[idx + cols];
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(down.x, down.y);
        }
      }
    }
    ctx.stroke();

    if (!this.hasMouse) return;

    const [gr, gg, gb] = this.getDotColorRGB();
    const mx = this.mouseX;
    const my = this.mouseY;
    const r2 = colorRadius * colorRadius;
    if (r2 <= 0) return;

    this.segBuckets.clear();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const d = this.dots[idx];
        if (c < cols - 1) {
          this.maybeBucketSegment(d, this.dots[idx + 1], mx, my, r2, colorRadius, gr, gg, gb);
        }
        if (r < rows - 1) {
          this.maybeBucketSegment(d, this.dots[idx + cols], mx, my, r2, colorRadius, gr, gg, gb);
        }
      }
    }

    for (const [color, coords] of this.segBuckets) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (let i = 0; i < coords.length; i += 4) {
        ctx.moveTo(coords[i], coords[i + 1]);
        ctx.lineTo(coords[i + 2], coords[i + 3]);
      }
      ctx.stroke();
    }
  }

  private maybeBucketSegment(
    a: Dot,
    b: Dot,
    mx: number,
    my: number,
    r2: number,
    colorRadius: number,
    gr: number,
    gg: number,
    gb: number,
  ) {
    const midX = (a.x + b.x) * 0.5;
    const midY = (a.y + b.y) * 0.5;
    const dx = midX - mx;
    const dy = midY - my;
    const distSq = dx * dx + dy * dy;
    if (distSq >= r2) return;
    const t = 1 - Math.sqrt(distSq) / colorRadius;
    const k = t * t;
    const br = (a.br + b.br) * 0.5;
    const bg = (a.bg + b.bg) * 0.5;
    const bb = (a.bb + b.bb) * 0.5;
    const cr = Math.round(gr + (br - gr) * k);
    const cg = Math.round(gg + (bg - gg) * k);
    const cb = Math.round(gb + (bb - gb) * k);
    const key = this.quantizedColorString(cr, cg, cb);
    let bucket = this.segBuckets.get(key);
    if (!bucket) {
      bucket = [];
      this.segBuckets.set(key, bucket);
    }
    bucket.push(a.x, a.y, b.x, b.y);
  }
}
