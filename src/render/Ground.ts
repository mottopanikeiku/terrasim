import * as THREE from 'three';
import { W, D, V } from '../core/constants';
import { Mat, MAXS, World } from '../core/World';
import { PALETTE, RANGES, RangeName } from '../core/palette';
import { valueNoise2D } from '../core/random';

// The terrain as a single smooth heightfield sheet (one draw call, ~17k
// triangles, analytic normals) plus a cross-section "skirt" against the
// glass that shows the true strata stack — gravel, sand, soil bands —
// like looking at the side of a real terrarium.

const VX = W + 1; // corner lattice
const VZ = D + 1;
const NV = VX * VZ;

const MAT_RANGE: Record<number, RangeName> = {
  [Mat.GRAVEL]: 'gravel',
  [Mat.SAND]: 'sand',
  [Mat.SOIL]: 'soil',
};

// The palette was tuned for tiny voxel grains; big smooth sheets need the
// soil lifted toward warm umber or the plateau reads as a black mass.
const MAT_BRIGHT: Record<number, number> = {
  [Mat.GRAVEL]: 1.0,
  [Mat.SAND]: 1.08,
  [Mat.SOIL]: 1.6,
};

const MOSS_COL = new THREE.Color(0x6fae45).convertSRGBToLinear();
const MOSS_COL2 = new THREE.Color(0x569636).convertSRGBToLinear();

// Stable per-column material color (hash-picked shade, no flicker).
function colShade(range: RangeName, x: number, z: number): THREE.Color {
  const r = RANGES[range];
  let h = x * 374761393 + z * 668265263;
  h = (h ^ (h >> 13)) >>> 0;
  return PALETTE[r.start + (h % r.count)];
}

const SKIRT_MAX_QUADS = 6000;

export class Ground {
  private geo = new THREE.BufferGeometry();
  private pos: Float32Array;
  private nor: Float32Array;
  private col: Float32Array;
  private cornerH = new Float32Array(NV);
  private mottle = new Float32Array(NV);

  private skirtGeo = new THREE.BufferGeometry();
  private sPos = new Float32Array(SKIRT_MAX_QUADS * 4 * 3);
  private sNor = new Float32Array(SKIRT_MAX_QUADS * 4 * 3);
  private sCol = new Float32Array(SKIRT_MAX_QUADS * 4 * 3);
  private sIdx = new Uint32Array(SKIRT_MAX_QUADS * 6);
  private sQuads = 0;

  constructor(scene: THREE.Scene, private world: World) {
    this.pos = new Float32Array(NV * 3);
    this.nor = new Float32Array(NV * 3);
    this.col = new Float32Array(NV * 3);

    // Static lattice positions in x/z + static index buffer.
    const idx = new Uint32Array(W * D * 6);
    let q = 0;
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const a = x + z * VX, b = a + 1, c = a + VX, d = c + 1;
        idx[q++] = a; idx[q++] = c; idx[q++] = b;
        idx[q++] = b; idx[q++] = c; idx[q++] = d;
      }
    }
    for (let vz = 0; vz < VZ; vz++) {
      for (let vx = 0; vx < VX; vx++) {
        const v = vx + vz * VX;
        this.pos[v * 3] = (vx - W / 2) * V;
        this.pos[v * 3 + 2] = (vz - D / 2) * V;
        this.mottle[v] =
          1.0 + 0.09 * valueNoise2D(vx * 0.09, vz * 0.09, 17) +
          0.05 * valueNoise2D(vx * 0.4, vz * 0.4, 53);
      }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1.0,
      metalness: 0,
      envMapIntensity: 0.25,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    scene.add(mesh);

    this.skirtGeo.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.skirtGeo.setAttribute('normal', new THREE.BufferAttribute(this.sNor, 3).setUsage(THREE.DynamicDrawUsage));
    this.skirtGeo.setAttribute('color', new THREE.BufferAttribute(this.sCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.skirtGeo.setIndex(new THREE.BufferAttribute(this.sIdx, 1));
    const skirtMesh = new THREE.Mesh(this.skirtGeo, new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 0.18,
    }));
    skirtMesh.frustumCulled = false;
    skirtMesh.receiveShadow = true;
    skirtMesh.raycast = () => {};
    scene.add(skirtMesh);

    this.refresh();
  }

  private lastRefresh = 0;

  update(): void {
    const w = this.world;
    // Height changes remesh promptly (pours must feel live); pure tint
    // drift (moisture, moss) batches at 4 Hz — invisible, and it keeps the
    // idle frame cost at zero.
    const now = performance.now();
    if (w.terrainDirty && now - this.lastRefresh > 30) {
      w.terrainDirty = false;
      w.tintDirty = false;
      this.lastRefresh = now;
      this.refresh();
    } else if (!w.terrainDirty && w.tintDirty && now - this.lastRefresh > 250) {
      w.tintDirty = false;
      this.lastRefresh = now;
      this.refresh();
    }
  }

  private refresh(): void {
    const w = this.world;
    const tmp = new THREE.Color();

    // Corner heights + colors from the (up to) 4 adjacent columns.
    for (let vz = 0; vz < VZ; vz++) {
      for (let vx = 0; vx < VX; vx++) {
        const v = vx + vz * VX;
        let h = 0, n = 0;
        let r = 0, g = 0, b = 0;
        let mossSum = 0;
        for (let dz = -1; dz <= 0; dz++) {
          for (let dx = -1; dx <= 0; dx++) {
            const x = vx + dx, z = vz + dz;
            if (x < 0 || x >= W || z < 0 || z >= D) continue;
            const i = x + z * W;
            h += w.groundH[i];
            mossSum += w.moss[i];
            const top = w.topMat(i);
            const range = MAT_RANGE[top] ?? 'soil';
            const base = colShade(range, x, z);
            // Damp ground darkens — the wet ring around the pond.
            const damp = (1 - Math.min(0.42, w.wet[i] * 0.46)) * (MAT_BRIGHT[top] ?? 1);
            r += base.r * damp; g += base.g * damp; b += base.b * damp;
            n++;
          }
        }
        if (n === 0) n = 1;
        const moss = Math.min(1, mossSum / n);
        this.cornerH[v] = h / n + moss * 0.06;
        // Blend toward moss green by coverage; clumpy noise keeps the
        // carpet from looking airbrushed.
        tmp.setRGB(r / n, g / n, b / n);
        const clump = 0.75 + 0.5 * valueNoise2D(vx * 0.55, vz * 0.55, 91);
        const mc = (vx + vz) % 2 === 0 ? MOSS_COL : MOSS_COL2;
        tmp.lerp(mc, Math.min(1, Math.pow(moss, 1.4) * 1.5 * clump));
        const tone = this.mottle[v];
        this.col[v * 3] = tmp.r * tone;
        this.col[v * 3 + 1] = tmp.g * tone;
        this.col[v * 3 + 2] = tmp.b * tone;
        this.pos[v * 3 + 1] = this.cornerH[v];
      }
    }

    // Analytic normals + cavity shading from the corner height lattice:
    // hollows pick up soft contact shadow, crests catch a little extra
    // light — cheap ambient occlusion that makes the relief readable.
    const ch = this.cornerH;
    for (let vz = 0; vz < VZ; vz++) {
      for (let vx = 0; vx < VX; vx++) {
        const v = vx + vz * VX;
        const hl = ch[Math.max(0, vx - 1) + vz * VX];
        const hr = ch[Math.min(VX - 1, vx + 1) + vz * VX];
        const hd = ch[vx + Math.max(0, vz - 1) * VX];
        const hu = ch[vx + Math.min(VZ - 1, vz + 1) * VX];
        let nx = hl - hr, ny = 2 * V, nz = hd - hu;
        const len = Math.hypot(nx, ny, nz);
        this.nor[v * 3] = nx / len;
        this.nor[v * 3 + 1] = ny / len;
        this.nor[v * 3 + 2] = nz / len;

        const cavity = ch[v] - (hl + hr + hd + hu) * 0.25;
        const ao = Math.min(1.06, Math.max(0.88, 1 + cavity * 1.1));
        this.col[v * 3] *= ao;
        this.col[v * 3 + 1] *= ao;
        this.col[v * 3 + 2] *= ao;
      }
    }

    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;

    this.refreshSkirt();
  }

  private skirtQuad(
    ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number, dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number, c: THREE.Color
  ): void {
    if (this.sQuads >= SKIRT_MAX_QUADS) return;
    const v = this.sQuads * 4;
    const p = this.sPos, n = this.sNor, cc = this.sCol;
    p[v * 3] = ax; p[v * 3 + 1] = ay; p[v * 3 + 2] = az;
    p[v * 3 + 3] = bx; p[v * 3 + 4] = by; p[v * 3 + 5] = bz;
    p[v * 3 + 6] = cx; p[v * 3 + 7] = cy; p[v * 3 + 8] = cz;
    p[v * 3 + 9] = dx; p[v * 3 + 10] = dy; p[v * 3 + 11] = dz;
    for (let k = 0; k < 4; k++) {
      n[(v + k) * 3] = nx; n[(v + k) * 3 + 1] = ny; n[(v + k) * 3 + 2] = nz;
      cc[(v + k) * 3] = c.r; cc[(v + k) * 3 + 1] = c.g; cc[(v + k) * 3 + 2] = c.b;
    }
    const q = this.sQuads * 6;
    this.sIdx[q] = v; this.sIdx[q + 1] = v + 1; this.sIdx[q + 2] = v + 2;
    this.sIdx[q + 3] = v; this.sIdx[q + 4] = v + 2; this.sIdx[q + 5] = v + 3;
    this.sQuads++;
  }

  // Strata bands against the glass, slightly darkened like a cut face.
  private refreshSkirt(): void {
    const w = this.world;
    this.sQuads = 0;
    const tmp = new THREE.Color();

    const wall = (x: number, z: number, axis: 'x' | 'z', sign: number) => {
      const i = x + z * W;
      const b = i * MAXS;
      let y0 = 0;
      const wx0 = (x - W / 2) * V, wx1 = wx0 + V;
      const wz0 = (z - D / 2) * V, wz1 = wz0 + V;
      const damp = 1 - Math.min(0.4, w.wet[i] * 0.42);
      for (let s = 0; s < w.stratN[i]; s++) {
        const h = w.stratH[b + s];
        if (h < 1e-4) continue;
        // The top stratum overlaps up into the terrain sheet, so steep
        // slopes never show a sliver of gap at the glass.
        const y1 = y0 + h + (s === w.stratN[i] - 1 ? 0.055 : 0);
        const r = RANGES[MAT_RANGE[w.stratMat[b + s]] ?? 'soil'];
        // One mid shade per material with smooth brightness drift along
        // the wall — strata bands, not pinstripes or patch blocks.
        const drift = 0.82 + 0.26 * valueNoise2D((x + z) * 0.11, s * 3.7, 31);
        const lift = MAT_BRIGHT[w.stratMat[b + s]] ?? 1;
        tmp.copy(PALETTE[r.start + (r.count >> 1)]).multiplyScalar(0.95 * drift * lift * (s === w.stratN[i] - 1 ? damp : 1));
        if (axis === 'x') {
          const wx = sign < 0 ? wx0 : wx1;
          if (sign < 0) this.skirtQuad(wx, y0, wz0, wx, y0, wz1, wx, y1, wz1, wx, y1, wz0, -1, 0, 0, tmp);
          else this.skirtQuad(wx, y0, wz1, wx, y0, wz0, wx, y1, wz0, wx, y1, wz1, 1, 0, 0, tmp);
        } else {
          const wz = sign < 0 ? wz0 : wz1;
          if (sign < 0) this.skirtQuad(wx1, y0, wz, wx0, y0, wz, wx0, y1, wz, wx1, y1, wz, 0, 0, -1, tmp);
          else this.skirtQuad(wx0, y0, wz, wx1, y0, wz, wx1, y1, wz, wx0, y1, wz, 0, 0, 1, tmp);
        }
        y0 = y1;
      }
    };

    for (let z = 0; z < D; z++) {
      wall(0, z, 'x', -1);
      wall(W - 1, z, 'x', 1);
    }
    for (let x = 0; x < W; x++) {
      wall(x, 0, 'z', -1);
      wall(x, D - 1, 'z', 1);
    }

    this.skirtGeo.setDrawRange(0, this.sQuads * 6);
    this.skirtGeo.attributes.position.needsUpdate = true;
    this.skirtGeo.attributes.normal.needsUpdate = true;
    this.skirtGeo.attributes.color.needsUpdate = true;
    this.skirtGeo.index!.needsUpdate = true;
  }
}
