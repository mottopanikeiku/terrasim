import * as THREE from 'three';
import { W, H, D, V } from '../core/constants';
import { Cell, Grid } from '../core/Grid';

// Water as one continuous mesh instead of stacked transparent cubes.
// Only boundary faces are emitted (no internal grid lines), the top
// surface is smoothed across neighboring columns into a gentle sheet,
// every vertex is tinted by its own depth (so pools fade smoothly from
// pale rims to deep teal middles instead of flat per-cell tiles), the
// sheet ripples gently via a vertex-shader time uniform, and isolated
// cells (falling pour streams, stranded specks) render as small round
// droplets rather than full-size slabs.

const MAX_QUADS = 90000;

const SHALLOW = new THREE.Color(0xaadcec).convertSRGBToLinear();
const DEEP = new THREE.Color(0x39759e).convertSRGBToLinear();

// Scratch per-vertex tint / ripple-weight arrays (avoid per-quad allocs).
const T4 = [0, 0, 0, 0];
const R4 = [0, 0, 0, 0];

export class WaterSurface {
  private mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX_QUADS * 4 * 3);
  private nor = new Float32Array(MAX_QUADS * 4 * 3);
  private col = new Float32Array(MAX_QUADS * 4 * 3);
  private rip = new Float32Array(MAX_QUADS * 4);
  private idx = new Uint32Array(MAX_QUADS * 6);
  // Per-column water surface height (world y), or -1.
  private surf = new Float32Array(W * D);
  // Per-column count of water cells (depth proxy for tinting).
  private colDepth = new Float32Array(W * D);
  private quads = 0;
  private uTime = { value: 0 };

  constructor(scene: THREE.Scene) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aRip', new THREE.BufferAttribute(this.rip, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(this.idx, 1));

    // FrontSide + depthWrite: only the nearest water surface is visible, so
    // pools read as one clean sheet instead of layered transparency murk.
    const mat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      roughness: 0.06,
      metalness: 0,
      envMapIntensity: 1.35,
      depthWrite: true,
      side: THREE.FrontSide,
    });
    // Gentle living ripple: waterline vertices (aRip=1) bob, and their
    // normals wobble so the sky reflection shimmers. Deep verts stay put,
    // so the sheet never cracks away from its own side walls.
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader =
        'uniform float uTime;\nattribute float aRip;\n' +
        sh.vertexShader
          .replace(
            '#include <beginnormal_vertex>',
            `#include <beginnormal_vertex>
            objectNormal.xz += aRip * vec2(
              cos(position.x * 7.0 + uTime * 1.8),
              cos(position.z * 9.3 - uTime * 1.4)
            ) * 0.09;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            transformed.y += aRip * (
              sin(position.x * 7.0 + uTime * 1.8) * 0.5 +
              sin(position.z * 9.3 - uTime * 1.4) * 0.35 +
              sin((position.x + position.z) * 5.1 + uTime * 0.9) * 0.25
            ) * 0.014;`
          );
    };
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.raycast = () => {};
    scene.add(this.mesh);
  }

  update(time: number): void {
    this.uTime.value = time;
  }

  // t* are per-vertex depth tints (0 = pale shallow, 1 = deep), r* are
  // ripple weights (1 = waterline vertex that bobs with the shader).
  private quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number,
    t: number[], r: number[]
  ): void {
    if (this.quads >= MAX_QUADS) return;
    const v = this.quads * 4;
    const p = this.pos, n = this.nor, c = this.col, rp = this.rip;
    p[v * 3] = ax; p[v * 3 + 1] = ay; p[v * 3 + 2] = az;
    p[v * 3 + 3] = bx; p[v * 3 + 4] = by; p[v * 3 + 5] = bz;
    p[v * 3 + 6] = cx; p[v * 3 + 7] = cy; p[v * 3 + 8] = cz;
    p[v * 3 + 9] = dx; p[v * 3 + 10] = dy; p[v * 3 + 11] = dz;
    for (let i = 0; i < 4; i++) {
      const ti = Math.min(1, Math.max(0, t[i]));
      n[(v + i) * 3] = nx; n[(v + i) * 3 + 1] = ny; n[(v + i) * 3 + 2] = nz;
      c[(v + i) * 3] = SHALLOW.r + (DEEP.r - SHALLOW.r) * ti;
      c[(v + i) * 3 + 1] = SHALLOW.g + (DEEP.g - SHALLOW.g) * ti;
      c[(v + i) * 3 + 2] = SHALLOW.b + (DEEP.b - SHALLOW.b) * ti;
      rp[v + i] = r[i];
    }
    const q = this.quads * 6;
    this.idx[q] = v; this.idx[q + 1] = v + 1; this.idx[q + 2] = v + 2;
    this.idx[q + 3] = v; this.idx[q + 4] = v + 2; this.idx[q + 5] = v + 3;
    this.quads++;
  }

  // Small floating droplet for isolated cells: a falling pour stream reads
  // as beads of water, and a stranded speck is a dewdrop, not a slab.
  private droplet(cx: number, cy: number, cz: number): void {
    const h = V * 0.3;
    const x0 = cx - h, x1 = cx + h;
    const y0 = cy - h, y1 = cy + h;
    const z0 = cz - h, z1 = cz + h;
    T4[0] = T4[1] = T4[2] = T4[3] = 0.18;
    R4[0] = R4[1] = R4[2] = R4[3] = 0;
    this.quad(x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1, 0, 1, 0, T4, R4);
    this.quad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, T4, R4);
    this.quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, T4, R4);
    this.quad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, T4, R4);
    this.quad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, T4, R4);
    this.quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, T4, R4);
  }

  // Smoothed waterline height at a grid corner, relative to a reference
  // surface height (so separate pools at different levels don't bridge).
  private cornerH(cx: number, cz: number, refH: number): number {
    let sum = refH;
    let n = 1;
    for (let dx = -1; dx <= 0; dx++) {
      for (let dz = -1; dz <= 0; dz++) {
        const x = cx + dx, z = cz + dz;
        if (x < 0 || x >= W || z < 0 || z >= D) continue;
        const s = this.surf[x + z * W];
        if (s >= 0 && Math.abs(s - refH) < V * 2.2) {
          sum += s;
          n++;
        }
      }
    }
    return sum / n;
  }

  // Smoothed depth tint at a grid corner: average water-column depth of
  // the (up to 4) columns meeting there. Pale rims, deep teal middles.
  private cornerT(cx: number, cz: number): number {
    let sum = 0;
    let n = 0;
    for (let dx = -1; dx <= 0; dx++) {
      for (let dz = -1; dz <= 0; dz++) {
        const x = cx + dx, z = cz + dz;
        if (x < 0 || x >= W || z < 0 || z >= D) continue;
        const d = this.colDepth[x + z * W];
        if (d > 0) {
          sum += d;
          n++;
        }
      }
    }
    return n === 0 ? 0 : Math.min(1, sum / n / 6);
  }

  private waterCells = new Uint32Array(140000);

  rebuild(grid: Grid): void {
    const { type } = grid;
    this.quads = 0;

    // Phase 1: one linear pass — collect water cells, record each column's
    // surface height (cells are y-major, so later hits are higher) and its
    // water-cell count for depth tinting.
    this.surf.fill(-1);
    this.colDepth.fill(0);
    const WD = W * D;
    const n = type.length;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (type[i] !== Cell.WATER) continue;
      if (count < this.waterCells.length) this.waterCells[count++] = i;
      const y = (i / WD) | 0;
      const col = i - y * WD;
      this.colDepth[col]++;
      const above = i + WD < n ? type[i + WD] : Cell.EMPTY;
      if (above === Cell.EMPTY) {
        this.surf[col] = (y + 1) * V - V * 0.28;
      }
    }

    const wx0 = -W / 2 * V;
    const wz0 = -D / 2 * V;
    const invDeep = 1 / (V * 6);

    // Phase 2: emit faces for the (few) water cells only.
    for (let k = 0; k < count; k++) {
      const i = this.waterCells[k];
      const y = (i / WD) | 0;
      const rem = i - y * WD;
      const z = (rem / W) | 0;
      const x = rem - z * W;

      const xm = x > 0 ? type[i - 1] : Cell.EMPTY;
      const xp = x < W - 1 ? type[i + 1] : Cell.EMPTY;
      const zm = z > 0 ? type[i - W] : Cell.EMPTY;
      const zp = z < D - 1 ? type[i + W] : Cell.EMPTY;
      const ym = y > 0 ? type[i - WD] : Cell.EMPTY;
      const yp = y < H - 1 ? type[i + WD] : Cell.EMPTY;

      // Isolated cell (no water neighbors at all): render as a droplet.
      if (
        xm !== Cell.WATER && xp !== Cell.WATER &&
        zm !== Cell.WATER && zp !== Cell.WATER &&
        ym !== Cell.WATER && yp !== Cell.WATER
      ) {
        this.droplet(wx0 + (x + 0.5) * V, (y + 0.45) * V, wz0 + (z + 0.5) * V);
        continue;
      }

      if (xm !== Cell.EMPTY && xp !== Cell.EMPTY && zm !== Cell.EMPTY && zp !== Cell.EMPTY && ym !== Cell.EMPTY && yp !== Cell.EMPTY) continue;

      const x0 = wx0 + x * V, x1 = x0 + V;
      const z0 = wz0 + z * V, z1 = z0 + V;
      const y0 = y * V;
      const isSurface = yp === Cell.EMPTY;
      const col = rem;
      const refH = (y + 1) * V - V * 0.28;
      // Waterline of this column (for vertical depth gradients on sides).
      const sTop = this.surf[col] >= 0 ? this.surf[col] : (y + 1) * V;
      const surfRip = isSurface ? 1 : 0;

      // Corner heights: smoothed for the surface sheet, flat otherwise.
      const h00 = isSurface ? this.cornerH(x, z, refH) : (y + 1) * V;
      const h10 = isSurface ? this.cornerH(x + 1, z, refH) : (y + 1) * V;
      const h11 = isSurface ? this.cornerH(x + 1, z + 1, refH) : (y + 1) * V;
      const h01 = isSurface ? this.cornerH(x, z + 1, refH) : (y + 1) * V;

      if (isSurface) {
        T4[0] = this.cornerT(x, z);
        T4[1] = this.cornerT(x + 1, z);
        T4[2] = this.cornerT(x + 1, z + 1);
        T4[3] = this.cornerT(x, z + 1);
        R4[0] = R4[1] = R4[2] = R4[3] = 1;
        this.quad(x0, h00, z0, x1, h10, z0, x1, h11, z1, x0, h01, z1, 0, 1, 0, T4, R4);
      }

      // Side/bottom faces: vertical gradient — pale at the waterline,
      // deep teal toward the floor of the pool.
      const tBot = (sTop - y0) * invDeep;
      if (xm === Cell.EMPTY) {
        T4[0] = tBot; T4[1] = tBot; T4[2] = (sTop - h01) * invDeep; T4[3] = (sTop - h00) * invDeep;
        R4[0] = 0; R4[1] = 0; R4[2] = surfRip; R4[3] = surfRip;
        this.quad(x0, y0, z0, x0, y0, z1, x0, h01, z1, x0, h00, z0, -1, 0, 0, T4, R4);
      }
      if (xp === Cell.EMPTY) {
        T4[0] = tBot; T4[1] = tBot; T4[2] = (sTop - h10) * invDeep; T4[3] = (sTop - h11) * invDeep;
        R4[0] = 0; R4[1] = 0; R4[2] = surfRip; R4[3] = surfRip;
        this.quad(x1, y0, z1, x1, y0, z0, x1, h10, z0, x1, h11, z1, 1, 0, 0, T4, R4);
      }
      if (zm === Cell.EMPTY) {
        T4[0] = tBot; T4[1] = tBot; T4[2] = (sTop - h00) * invDeep; T4[3] = (sTop - h10) * invDeep;
        R4[0] = 0; R4[1] = 0; R4[2] = surfRip; R4[3] = surfRip;
        this.quad(x1, y0, z0, x0, y0, z0, x0, h00, z0, x1, h10, z0, 0, 0, -1, T4, R4);
      }
      if (zp === Cell.EMPTY) {
        T4[0] = tBot; T4[1] = tBot; T4[2] = (sTop - h11) * invDeep; T4[3] = (sTop - h01) * invDeep;
        R4[0] = 0; R4[1] = 0; R4[2] = surfRip; R4[3] = surfRip;
        this.quad(x0, y0, z1, x1, y0, z1, x1, h11, z1, x0, h01, z1, 0, 0, 1, T4, R4);
      }
      if (ym === Cell.EMPTY) {
        T4[0] = T4[1] = T4[2] = T4[3] = tBot;
        R4[0] = R4[1] = R4[2] = R4[3] = 0;
        this.quad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, T4, R4);
      }
    }

    this.geo.setDrawRange(0, this.quads * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.aRip.needsUpdate = true;
    this.geo.index!.needsUpdate = true;
  }
}
