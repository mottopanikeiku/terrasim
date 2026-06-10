import { W, H, D } from './constants';

export enum Cell {
  EMPTY = 0,
  SAND = 1,
  SOIL = 2,
  GRAVEL = 3,
  ROCK = 4,
  WATER = 5,
  STEM = 6,
  LEAF = 7,
  FLOWER = 8,
  MUSHROOM = 9,
  MOSS = 10,
}

// flags bits
export const F_SETTLED = 2;

// wet[] thresholds
export const WET_VISIBLE = 48;  // soil starts to look damp
export const WET_SOAKED = 150;  // dark, saturated

export function isGranular(t: Cell): boolean {
  return t === Cell.SAND || t === Cell.SOIL || t === Cell.GRAVEL;
}

export function isStatic(t: Cell): boolean {
  return t >= Cell.ROCK && t !== Cell.WATER;
}

export function isSolid(t: Cell): boolean {
  return t !== Cell.EMPTY && t !== Cell.WATER;
}

// Render-chunk layout: the tank is split into CS x CS columns (full height).
// Renderers watch chunkSeq and rebuild only chunks whose counter moved.
export const CS = 16;
export const NCX = Math.ceil(W / CS);
export const NCZ = Math.ceil(D / CS);

export class Grid {
  readonly type = new Uint8Array(W * H * D);
  readonly shade = new Uint8Array(W * H * D);
  readonly flags = new Uint8Array(W * H * D);
  // Graded soil moisture (0..255). Lives outside flags so it can dry out,
  // percolate and be consumed by plants.
  readonly wet = new Uint8Array(W * H * D);
  // Per-chunk change counters (monotonic). Bumped by touch/set/wake so
  // renderers know which chunks to remesh.
  readonly chunkSeq = new Uint32Array(NCX * NCZ);

  // Mark render chunks near (x,z) dirty. Margin of 2 covers the smoothing
  // window of the surface-nets mesher across chunk seams.
  touchXZ(x: number, z: number): void {
    const c0x = Math.max(0, ((x - 2) / CS) | 0);
    const c1x = Math.min(NCX - 1, ((x + 2) / CS) | 0);
    const c0z = Math.max(0, ((z - 2) / CS) | 0);
    const c1z = Math.min(NCZ - 1, ((z + 2) / CS) | 0);
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        this.chunkSeq[cx + cz * NCX]++;
      }
    }
  }

  touchIndex(i: number): void {
    const y = (i / (W * D)) | 0;
    const r = i - y * W * D;
    this.touchXZ(r - ((r / W) | 0) * W, (r / W) | 0);
  }

  touchAll(): void {
    for (let c = 0; c < this.chunkSeq.length; c++) this.chunkSeq[c]++;
  }

  idx(x: number, y: number, z: number): number {
    return x + W * (z + D * y);
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D;
  }

  get(x: number, y: number, z: number): Cell {
    if (!this.inBounds(x, y, z)) return Cell.ROCK; // out of bounds = wall
    return this.type[this.idx(x, y, z)] as Cell;
  }

  set(x: number, y: number, z: number, t: Cell, shade: number, wet = 0): void {
    if (!this.inBounds(x, y, z)) return;
    const i = this.idx(x, y, z);
    this.type[i] = t;
    this.shade[i] = shade;
    this.flags[i] = 0;
    this.wet[i] = wet;
    this.touchXZ(x, z);
  }

  clearCell(x: number, y: number, z: number): void {
    this.set(x, y, z, Cell.EMPTY, 0, 0);
  }

  isEmpty(x: number, y: number, z: number): boolean {
    return this.get(x, y, z) === Cell.EMPTY;
  }

  // Wake simulation cells in a small neighborhood (clears SETTLED).
  wake(x: number, y: number, z: number): void {
    this.touchXZ(x, z);
    for (let dy = -1; dy <= 2; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, nz = z + dz;
          if (!this.inBounds(nx, ny, nz)) continue;
          this.flags[this.idx(nx, ny, nz)] &= ~F_SETTLED;
        }
      }
    }
  }

  // Highest non-empty cell in column, or -1.
  top(x: number, z: number): number {
    for (let y = H - 1; y >= 0; y--) {
      if (this.type[this.idx(x, y, z)] !== Cell.EMPTY) return y;
    }
    return -1;
  }

  countFilled(): number {
    let n = 0;
    for (let i = 0; i < this.type.length; i++) if (this.type[i] !== Cell.EMPTY) n++;
    return n;
  }

  clear(): void {
    this.type.fill(0);
    this.shade.fill(0);
    this.flags.fill(0);
    this.wet.fill(0);
    this.touchAll();
  }
}
