import { W, H, D, V } from '../core/constants';
import { CS, Grid } from '../core/Grid';

// Chunked binary surface nets over the voxel field — the graphics overhaul.
// Instead of drawing half a million jittered cubes, each render chunk
// extracts ONE smooth surface: the cell field is box-blurred (radius 1) so
// iso-crossings land between cells, a vertex is placed at the crossing
// centroid of every straddling dual cell, and normals come from the field
// gradient, so the terrain reads as soft sculpted clay rather than crumbs.
//
// Chunks are CS x CS columns (full height) with a 1-dual-cell overlap; the
// blur makes shared vertices identical on both sides, so seams are
// invisible. A chunk rebuild is ~1ms, so pours update incrementally.

export interface MeshConfig {
  // Per-Cell-type density (0 or 1), indexed by type byte.
  density: Float32Array;
  // If set, the chunk is skipped (empty mesh) unless at least one cell of
  // this type exists in the window — cheap early-out for waterless chunks.
  requireType?: number;
  // Optional dual-cell gate: a quad is emitted only if at least one of its
  // four dual cells passes (used to clip the water field to actual water).
  mask?: (i: number, j: number, k: number) => boolean;
  // If set, a second blurred field of just this cell type is built, and
  // its value at each vertex (0..1 "proximity") is passed to color() and
  // sinkY(). Lets the water clip itself along a smooth contour.
  auxType?: number;
  // Optional vertex y-offset from aux proximity (e.g. sink the skirt of
  // the water sheet under the banks instead of clipping it in the open).
  sinkY?: (aux: number) => number;
  // Vertex color writer: receives the dual cell's min-corner cell coords
  // and the vertex's fractional cell position; writes r,g,b into out.
  color: (i: number, j: number, k: number, fx: number, fy: number, fz: number, out: Float32Array, aux: number) => void;
}

export interface MeshResult {
  pos: Float32Array;
  nor: Float32Array;
  col: Float32Array;
  idx: Uint32Array;
  vCount: number;
  iCount: number;
}

// Window sizes in lattice (cell-center) coordinates, with blur margin.
const RLX = CS + 4;
const RLY = H + 4;
const RLZ = CS + 4;
const RN = RLX * RLY * RLZ;
const SX = 1;
const SZ = RLX;
const SY = RLX * RLZ;

const raw = new Float32Array(RN);
const rawB = new Float32Array(RN);
const tmpA = new Float32Array(RN);
const tmpB = new Float32Array(RN);
const fld = new Float32Array(RN);
const fldB = new Float32Array(RN);
const imap = new Int32Array(RN);
const mflag = new Uint8Array(RN);

const MAXV = 24000;
const MAXT = 48000;
const outPos = new Float32Array(MAXV * 3);
const outNor = new Float32Array(MAXV * 3);
const outCol = new Float32Array(MAXV * 3);
const outIdx = new Uint32Array(MAXT * 3);
const colScratch = new Float32Array(3);

// Corner offsets, bit i: (x, y, z) = (b0, b1, b2).
const COFF = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
const CSTEP = COFF.map(([x, y, z]) => x * SX + y * SY + z * SZ);
const EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

// Trilinear sample of a blurred field at fractional local coords.
function sample(f: Float32Array, fx: number, fy: number, fz: number): number {
  const x = Math.min(Math.max(fx, 0), RLX - 1.001);
  const y = Math.min(Math.max(fy, 0), RLY - 1.001);
  const z = Math.min(Math.max(fz, 0), RLZ - 1.001);
  const x0 = x | 0, y0 = y | 0, z0 = z | 0;
  const tx = x - x0, ty = y - y0, tz = z - z0;
  const b = x0 + y0 * SY + z0 * SZ;
  const c00 = f[b] + (f[b + SX] - f[b]) * tx;
  const c10 = f[b + SY] + (f[b + SY + SX] - f[b + SY]) * tx;
  const c01 = f[b + SZ] + (f[b + SZ + SX] - f[b + SZ]) * tx;
  const c11 = f[b + SZ + SY] + (f[b + SZ + SY + SX] - f[b + SZ + SY]) * tx;
  const c0 = c00 + (c10 - c00) * ty;
  const c1 = c01 + (c11 - c01) * ty;
  return c0 + (c1 - c0) * tz;
}

export function buildChunk(grid: Grid, cx: number, cz: number, cfg: MeshConfig): MeshResult {
  const { type } = grid;
  const den = cfg.density;

  // Dual-cell range (global): core plus one margin cell on the low side.
  const dx0 = Math.max(-1, cx * CS - 1);
  const dx1 = Math.min(cx * CS + CS, W) - 1;
  const dz0 = Math.max(-1, cz * CS - 1);
  const dz1 = Math.min(cz * CS + CS, D) - 1;
  // Local-window origin: lattice global -> local is g - o.
  const ox = dx0 - 1, oy = -2, oz = dz0 - 1;

  // 1) Raw density for the window (out-of-grid = 0: open air / glass).
  raw.fill(0);
  const aux = cfg.auxType ?? -1;
  if (aux >= 0) rawB.fill(0);
  const req = cfg.requireType ?? -1;
  let found = req < 0;
  for (let gy = Math.max(0, oy); gy < H; gy++) {
    const ly = gy - oy;
    if (ly >= RLY) break;
    for (let gz = Math.max(0, oz); gz < D; gz++) {
      const lz = gz - oz;
      if (lz >= RLZ) break;
      let gx = Math.max(0, ox);
      let lx = gx - ox;
      let gi = gx + W * (gz + D * gy);
      let li = lx + ly * SY + lz * SZ;
      for (; gx < W && lx < RLX; gx++, lx++, gi++, li++) {
        const t = type[gi];
        raw[li] = den[t];
        if (t === aux) rawB[li] = 1;
        if (t === req) found = true;
      }
    }
  }
  if (!found) {
    return { pos: outPos, nor: outNor, col: outCol, idx: outIdx, vCount: 0, iCount: 0 };
  }

  // 2) Separable 3-tap box blur (radius 1) -> fld (and fldB for the aux).
  const third = 1 / 3;
  for (let i = SX; i < RN - SX; i++) tmpA[i] = (raw[i - SX] + raw[i] + raw[i + SX]) * third;
  for (let i = SY; i < RN - SY; i++) tmpB[i] = (tmpA[i - SY] + tmpA[i] + tmpA[i + SY]) * third;
  for (let i = SZ; i < RN - SZ; i++) fld[i] = (tmpB[i - SZ] + tmpB[i] + tmpB[i + SZ]) * third;
  if (aux >= 0) {
    for (let i = SX; i < RN - SX; i++) tmpA[i] = (rawB[i - SX] + rawB[i] + rawB[i + SX]) * third;
    for (let i = SY; i < RN - SY; i++) tmpB[i] = (tmpA[i - SY] + tmpA[i] + tmpA[i + SY]) * third;
    for (let i = SZ; i < RN - SZ; i++) fldB[i] = (tmpB[i - SZ] + tmpB[i] + tmpB[i + SZ]) * third;
  }

  // 3) Vertex pass: one vertex per dual cell straddling the iso surface.
  imap.fill(-1);
  let vCount = 0;
  const halfW = W / 2 - 0.5;
  const halfD = D / 2 - 0.5;
  for (let j = -1; j <= H - 1; j++) {
    const lb = j - oy;
    for (let k = dz0; k <= dz1; k++) {
      const lc = k - oz;
      let l = (dx0 - ox) + lb * SY + lc * SZ;
      for (let i = dx0; i <= dx1; i++, l++) {
        const c0 = fld[l], c1 = fld[l + CSTEP[1]], c2 = fld[l + CSTEP[2]], c3 = fld[l + CSTEP[3]];
        const c4 = fld[l + CSTEP[4]], c5 = fld[l + CSTEP[5]], c6 = fld[l + CSTEP[6]], c7 = fld[l + CSTEP[7]];
        const mask =
          (c0 >= 0.5 ? 1 : 0) | (c1 >= 0.5 ? 2 : 0) | (c2 >= 0.5 ? 4 : 0) | (c3 >= 0.5 ? 8 : 0) |
          (c4 >= 0.5 ? 16 : 0) | (c5 >= 0.5 ? 32 : 0) | (c6 >= 0.5 ? 64 : 0) | (c7 >= 0.5 ? 128 : 0);
        if (mask === 0 || mask === 255) continue;
        if (vCount >= MAXV) continue;

        const cv = [c0, c1, c2, c3, c4, c5, c6, c7];
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let e = 0; e < 12; e++) {
          const a = EDGES[e][0], b = EDGES[e][1];
          const va = cv[a], vb = cv[b];
          if ((va >= 0.5) === (vb >= 0.5)) continue;
          const t = (0.5 - va) / (vb - va);
          const A = COFF[a], B = COFF[b];
          sx += A[0] + (B[0] - A[0]) * t;
          sy += A[1] + (B[1] - A[1]) * t;
          sz += A[2] + (B[2] - A[2]) * t;
          n++;
        }
        const fx = sx / n, fy = sy / n, fz = sz / n;
        const la = i - ox;

        // Normal from the field gradient at the vertex.
        const e = 0.85;
        let nx = sample(fld, la + fx + e, lb + fy, lc + fz) - sample(fld, la + fx - e, lb + fy, lc + fz);
        let ny = sample(fld, la + fx, lb + fy + e, lc + fz) - sample(fld, la + fx, lb + fy - e, lc + fz);
        let nz = sample(fld, la + fx, lb + fy, lc + fz + e) - sample(fld, la + fx, lb + fy, lc + fz - e);
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= -len; ny /= -len; nz /= -len;

        const auxV = aux >= 0 ? sample(fldB, la + fx, lb + fy, lc + fz) : 0;
        cfg.color(i, j, k, fx, fy, fz, colScratch, auxV);
        if (cfg.mask) mflag[l] = cfg.mask(i, j, k) ? 1 : 0;

        const vb3 = vCount * 3;
        outPos[vb3] = (i + fx - halfW - 0.5) * V;
        outPos[vb3 + 1] = (j + fy + 0.5) * V + (cfg.sinkY ? cfg.sinkY(auxV) : 0);
        outPos[vb3 + 2] = (k + fz - halfD - 0.5) * V;
        outNor[vb3] = nx; outNor[vb3 + 1] = ny; outNor[vb3 + 2] = nz;
        outCol[vb3] = colScratch[0]; outCol[vb3 + 1] = colScratch[1]; outCol[vb3 + 2] = colScratch[2];
        imap[l] = vCount++;
      }
    }
  }

  // 4) Quad pass: one quad per owned lattice edge crossing the surface,
  // connecting the four dual-cell vertices around that edge. Winding is
  // fixed numerically against the expected face direction.
  let iCount = 0;
  const qx0 = cx * CS, qx1 = Math.min(cx * CS + CS, W);
  const qz0 = cz * CS, qz1 = Math.min(cz * CS + CS, D);
  for (let qy = -1; qy <= H - 1; qy++) {
    const lb = qy - oy;
    for (let qz = qz0; qz < qz1; qz++) {
      const lc = qz - oz;
      let l = (qx0 - ox) + lb * SY + lc * SZ;
      for (let qx = qx0; qx < qx1; qx++, l++) {
        const v0 = fld[l];
        const s0 = v0 >= 0.5;
        for (let axis = 0; axis < 3; axis++) {
          const step = axis === 0 ? SX : axis === 1 ? SY : SZ;
          const v1 = fld[l + step];
          if (s0 === v1 >= 0.5) continue;
          // The four dual cells around this edge (vary the two other axes).
          let m1: number, m2: number, m3: number, m4: number;
          if (axis === 0) {
            m1 = l - SY - SZ; m2 = l - SZ; m3 = l; m4 = l - SY;
          } else if (axis === 1) {
            m1 = l - SX - SZ; m2 = l - SZ; m3 = l; m4 = l - SX;
          } else {
            m1 = l - SX - SY; m2 = l - SY; m3 = l; m4 = l - SX;
          }
          const a = imap[m1], b = imap[m2], c = imap[m3], d = imap[m4];
          if (a < 0 || b < 0 || c < 0 || d < 0) continue;
          if (cfg.mask && !(mflag[m1] | mflag[m2] | mflag[m3] | mflag[m4])) continue;
          if (iCount + 6 > MAXT * 3) break;

          // Expected face direction: +axis when the solid side is at v0.
          const dir = s0 ? 1 : -1;
          const a3 = a * 3, b3 = b * 3, c3 = c * 3;
          const ux = outPos[b3] - outPos[a3], uy = outPos[b3 + 1] - outPos[a3 + 1], uz = outPos[b3 + 2] - outPos[a3 + 2];
          const wx = outPos[c3] - outPos[a3], wy = outPos[c3 + 1] - outPos[a3 + 1], wz = outPos[c3 + 2] - outPos[a3 + 2];
          const cross = axis === 0 ? uy * wz - uz * wy : axis === 1 ? uz * wx - ux * wz : ux * wy - uy * wx;
          if (cross * dir >= 0) {
            outIdx[iCount++] = a; outIdx[iCount++] = b; outIdx[iCount++] = c;
            outIdx[iCount++] = a; outIdx[iCount++] = c; outIdx[iCount++] = d;
          } else {
            outIdx[iCount++] = a; outIdx[iCount++] = c; outIdx[iCount++] = b;
            outIdx[iCount++] = a; outIdx[iCount++] = d; outIdx[iCount++] = c;
          }
        }
      }
    }
  }

  return { pos: outPos, nor: outNor, col: outCol, idx: outIdx, vCount, iCount };
}
