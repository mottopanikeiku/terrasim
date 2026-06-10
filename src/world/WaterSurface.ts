import * as THREE from 'three';
import { W, H, D, V } from '../core/constants';
import { Cell, Grid } from '../core/Grid';

// Water as one continuous mesh instead of stacked transparent cubes.
// Only boundary faces are emitted (no internal grid lines), the top
// surface is smoothed across neighboring columns into a gentle sheet,
// and vertices are tinted by depth so pools read deeper in the middle.

const MAX_QUADS = 90000;

const SHALLOW = new THREE.Color(0x86c8e8).convertSRGBToLinear();
const DEEP = new THREE.Color(0x3e88b8).convertSRGBToLinear();

export class WaterSurface {
  private mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX_QUADS * 4 * 3);
  private nor = new Float32Array(MAX_QUADS * 4 * 3);
  private col = new Float32Array(MAX_QUADS * 4 * 3);
  private idx = new Uint32Array(MAX_QUADS * 6);
  // Per-column water surface height (world y), or -1.
  private surf = new Float32Array(W * D);
  private quads = 0;

  constructor(scene: THREE.Scene) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(this.idx, 1));

    const mat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      roughness: 0.05,
      metalness: 0,
      envMapIntensity: 1.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.raycast = () => {};
    scene.add(this.mesh);
  }

  private quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number,
    depth: number
  ): void {
    if (this.quads >= MAX_QUADS) return;
    const v = this.quads * 4;
    const p = this.pos, n = this.nor, c = this.col;
    p[v * 3] = ax; p[v * 3 + 1] = ay; p[v * 3 + 2] = az;
    p[v * 3 + 3] = bx; p[v * 3 + 4] = by; p[v * 3 + 5] = bz;
    p[v * 3 + 6] = cx; p[v * 3 + 7] = cy; p[v * 3 + 8] = cz;
    p[v * 3 + 9] = dx; p[v * 3 + 10] = dy; p[v * 3 + 11] = dz;
    const t = Math.min(1, depth / 5);
    const r = SHALLOW.r + (DEEP.r - SHALLOW.r) * t;
    const g = SHALLOW.g + (DEEP.g - SHALLOW.g) * t;
    const b = SHALLOW.b + (DEEP.b - SHALLOW.b) * t;
    for (let i = 0; i < 4; i++) {
      n[(v + i) * 3] = nx; n[(v + i) * 3 + 1] = ny; n[(v + i) * 3 + 2] = nz;
      c[(v + i) * 3] = r; c[(v + i) * 3 + 1] = g; c[(v + i) * 3 + 2] = b;
    }
    const q = this.quads * 6;
    this.idx[q] = v; this.idx[q + 1] = v + 1; this.idx[q + 2] = v + 2;
    this.idx[q + 3] = v; this.idx[q + 4] = v + 2; this.idx[q + 5] = v + 3;
    this.quads++;
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

  rebuild(grid: Grid): void {
    const { type } = grid;
    this.quads = 0;

    // Column surface heights (with a slight dip below the cell top).
    this.surf.fill(-1);
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        for (let y = H - 1; y >= 0; y--) {
          const i = grid.idx(x, y, z);
          if (type[i] !== Cell.WATER) continue;
          const above = y < H - 1 ? type[i + W * D] : Cell.EMPTY;
          if (above === Cell.EMPTY) {
            this.surf[x + z * W] = (y + 1) * V - V * 0.28;
            break;
          }
        }
      }
    }

    const wx0 = -W / 2 * V;
    const wz0 = -D / 2 * V;

    for (let y = 0; y < H; y++) {
      for (let z = 0; z < D; z++) {
        let i = grid.idx(0, y, z);
        for (let x = 0; x < W; x++, i++) {
          if (type[i] !== Cell.WATER) continue;

          const xm = x > 0 ? type[i - 1] : Cell.EMPTY;
          const xp = x < W - 1 ? type[i + 1] : Cell.EMPTY;
          const zm = z > 0 ? type[i - W] : Cell.EMPTY;
          const zp = z < D - 1 ? type[i + W] : Cell.EMPTY;
          const ym = y > 0 ? type[i - W * D] : Cell.EMPTY;
          const yp = y < H - 1 ? type[i + W * D] : Cell.EMPTY;
          if (xm !== Cell.EMPTY && xp !== Cell.EMPTY && zm !== Cell.EMPTY && zp !== Cell.EMPTY && ym !== Cell.EMPTY && yp !== Cell.EMPTY) continue;

          // Depth below this cell for tinting.
          let depth = 0;
          for (let dy = 1; dy <= 5; dy++) {
            if (y - dy < 0) break;
            if (type[i - W * D * dy] === Cell.WATER) depth++;
            else break;
          }

          const x0 = wx0 + x * V, x1 = x0 + V;
          const z0 = wz0 + z * V, z1 = z0 + V;
          const y0 = y * V;
          const isSurface = yp === Cell.EMPTY;
          const refH = (y + 1) * V - V * 0.28;

          // Corner heights: smoothed for the surface sheet, flat otherwise.
          const h00 = isSurface ? this.cornerH(x, z, refH) : (y + 1) * V;
          const h10 = isSurface ? this.cornerH(x + 1, z, refH) : (y + 1) * V;
          const h11 = isSurface ? this.cornerH(x + 1, z + 1, refH) : (y + 1) * V;
          const h01 = isSurface ? this.cornerH(x, z + 1, refH) : (y + 1) * V;

          if (isSurface) {
            this.quad(x0, h00, z0, x1, h10, z0, x1, h11, z1, x0, h01, z1, 0, 1, 0, depth);
          }
          if (xm === Cell.EMPTY) {
            this.quad(x0, y0, z0, x0, y0, z1, x0, h01, z1, x0, h00, z0, -1, 0, 0, depth);
          }
          if (xp === Cell.EMPTY) {
            this.quad(x1, y0, z1, x1, y0, z0, x1, h10, z0, x1, h11, z1, 1, 0, 0, depth);
          }
          if (zm === Cell.EMPTY) {
            this.quad(x1, y0, z0, x0, y0, z0, x0, h00, z0, x1, h10, z0, 0, 0, -1, depth);
          }
          if (zp === Cell.EMPTY) {
            this.quad(x0, y0, z1, x1, y0, z1, x1, h11, z1, x0, h01, z1, 0, 0, 1, depth);
          }
          if (ym === Cell.EMPTY) {
            this.quad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, depth);
          }
        }
      }
    }

    this.geo.setDrawRange(0, this.quads * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.index!.needsUpdate = true;
  }
}
