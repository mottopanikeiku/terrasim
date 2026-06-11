import * as THREE from 'three';
import { W, D, V } from '../core/constants';
import { World } from '../core/World';

// Water as a single glassy heightfield sheet. Where a corner touches no
// water it dips below the terrain, so the shoreline is the smooth curve
// where the two heightfields cross — a natural meniscus, never a sawtooth.
// Per-vertex depth tint, and a ripple weight attribute drives a gentle
// vertex-shader bob + normal shimmer on open water only.

const VX = W + 1;
const VZ = D + 1;
const NV = VX * VZ;

const SHALLOW = new THREE.Color(0xaadcec).convertSRGBToLinear();
const DEEP = new THREE.Color(0x3a7dab).convertSRGBToLinear();

const SKIRT_MAX = 1200; // glass-side quads

export class Water {
  private geo = new THREE.BufferGeometry();
  private pos: Float32Array;
  private col: Float32Array;
  private rip: Float32Array;

  private skirtGeo = new THREE.BufferGeometry();
  private sPos = new Float32Array(SKIRT_MAX * 4 * 3);
  private sCol = new Float32Array(SKIRT_MAX * 4 * 3);
  private sRip = new Float32Array(SKIRT_MAX * 4);
  private sIdx = new Uint32Array(SKIRT_MAX * 6);
  private sQuads = 0;

  private uTime = { value: 0 };

  constructor(scene: THREE.Scene, private world: World) {
    this.pos = new Float32Array(NV * 3);
    this.col = new Float32Array(NV * 3);
    this.rip = new Float32Array(NV);
    const nor = new Float32Array(NV * 3);
    for (let v = 0; v < NV; v++) nor[v * 3 + 1] = 1;

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
      }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aRip', new THREE.BufferAttribute(this.rip, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));

    const mat = this.makeMaterial();
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    scene.add(mesh);

    // Glass-side skirt: water seen through the front/side panes.
    this.skirtGeo.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3).setUsage(THREE.DynamicDrawUsage));
    const sNor = new Float32Array(SKIRT_MAX * 4 * 3);
    for (let v = 0; v < SKIRT_MAX * 4; v++) sNor[v * 3 + 2] = 1;
    this.skirtGeo.setAttribute('normal', new THREE.BufferAttribute(sNor, 3));
    this.skirtGeo.setAttribute('color', new THREE.BufferAttribute(this.sCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.skirtGeo.setAttribute('aRip', new THREE.BufferAttribute(this.sRip, 1).setUsage(THREE.DynamicDrawUsage));
    this.skirtGeo.setIndex(new THREE.BufferAttribute(this.sIdx, 1));
    const skirt = new THREE.Mesh(this.skirtGeo, mat);
    skirt.renderOrder = 2;
    skirt.frustumCulled = false;
    skirt.raycast = () => {};
    scene.add(skirt);
  }

  private makeMaterial(): THREE.MeshPhysicalMaterial {
    const mat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      roughness: 0.05,
      metalness: 0,
      envMapIntensity: 1.4,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
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
            ) * 0.10;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            transformed.y += aRip * (
              sin(position.x * 7.0 + uTime * 1.8) * 0.5 +
              sin(position.z * 9.3 - uTime * 1.4) * 0.35 +
              sin((position.x + position.z) * 5.1 + uTime * 0.9) * 0.25
            ) * 0.012;`
          );
    };
    return mat;
  }

  setTime(time: number): void {
    this.uTime.value = time;
  }

  update(): void {
    const w = this.world;
    if (!w.waterDirty) return;
    w.waterDirty = false;

    for (let vz = 0; vz < VZ; vz++) {
      for (let vx = 0; vx < VX; vx++) {
        const v = vx + vz * VX;
        let surf = -1;
        let groundSum = 0, n = 0;
        for (let dz = -1; dz <= 0; dz++) {
          for (let dx = -1; dx <= 0; dx++) {
            const x = vx + dx, z = vz + dz;
            if (x < 0 || x >= W || z < 0 || z >= D) continue;
            const i = x + z * W;
            groundSum += w.groundH[i];
            n++;
            if (w.water[i] > 1e-3) {
              surf = Math.max(surf, w.groundH[i] + w.water[i]);
            }
          }
        }
        const ground = n > 0 ? groundSum / n : 0;
        if (surf < 0) {
          // No water near: tuck the sheet under the terrain.
          this.pos[v * 3 + 1] = ground - 0.12;
          this.rip[v] = 0;
          this.col[v * 3] = SHALLOW.r; this.col[v * 3 + 1] = SHALLOW.g; this.col[v * 3 + 2] = SHALLOW.b;
        } else {
          const y = surf - 0.008;
          this.pos[v * 3 + 1] = y;
          const depth = Math.max(0, y - ground);
          const t = Math.min(1, depth / 0.55);
          this.rip[v] = Math.min(1, depth / 0.06);
          this.col[v * 3] = SHALLOW.r + (DEEP.r - SHALLOW.r) * t;
          this.col[v * 3 + 1] = SHALLOW.g + (DEEP.g - SHALLOW.g) * t;
          this.col[v * 3 + 2] = SHALLOW.b + (DEEP.b - SHALLOW.b) * t;
        }
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.aRip.needsUpdate = true;

    this.refreshSkirt();
  }

  private skirtQuad(
    ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number, dx: number, dy: number, dz: number,
    t: number
  ): void {
    if (this.sQuads >= SKIRT_MAX) return;
    const v = this.sQuads * 4;
    const p = this.sPos, c = this.sCol;
    p[v * 3] = ax; p[v * 3 + 1] = ay; p[v * 3 + 2] = az;
    p[v * 3 + 3] = bx; p[v * 3 + 4] = by; p[v * 3 + 5] = bz;
    p[v * 3 + 6] = cx; p[v * 3 + 7] = cy; p[v * 3 + 8] = cz;
    p[v * 3 + 9] = dx; p[v * 3 + 10] = dy; p[v * 3 + 11] = dz;
    for (let k = 0; k < 4; k++) {
      c[(v + k) * 3] = SHALLOW.r + (DEEP.r - SHALLOW.r) * t;
      c[(v + k) * 3 + 1] = SHALLOW.g + (DEEP.g - SHALLOW.g) * t;
      c[(v + k) * 3 + 2] = SHALLOW.b + (DEEP.b - SHALLOW.b) * t;
      this.sRip[v + k] = 0;
    }
    const q = this.sQuads * 6;
    this.sIdx[q] = v; this.sIdx[q + 1] = v + 1; this.sIdx[q + 2] = v + 2;
    this.sIdx[q + 3] = v; this.sIdx[q + 4] = v + 2; this.sIdx[q + 5] = v + 3;
    this.sQuads++;
  }

  private refreshSkirt(): void {
    const w = this.world;
    this.sQuads = 0;
    const edge = (x: number, z: number, axis: 'x' | 'z', sign: number) => {
      const i = x + z * W;
      const depth = w.water[i];
      if (depth < 5e-3) return;
      const y0 = w.groundH[i];
      const y1 = y0 + depth - 0.008;
      const t = Math.min(1, depth / 0.55);
      const wx0 = (x - W / 2) * V, wx1 = wx0 + V;
      const wz0 = (z - D / 2) * V, wz1 = wz0 + V;
      if (axis === 'x') {
        const wx = sign < 0 ? wx0 : wx1;
        this.skirtQuad(wx, y0, wz0, wx, y0, wz1, wx, y1, wz1, wx, y1, wz0, t);
      } else {
        const wz = sign < 0 ? wz0 : wz1;
        this.skirtQuad(wx0, y0, wz, wx1, y0, wz, wx1, y1, wz, wx0, y1, wz, t);
      }
    };
    for (let z = 0; z < D; z++) {
      edge(0, z, 'x', -1);
      edge(W - 1, z, 'x', 1);
    }
    for (let x = 0; x < W; x++) {
      edge(x, 0, 'z', -1);
      edge(x, D - 1, 'z', 1);
    }
    this.skirtGeo.setDrawRange(0, this.sQuads * 6);
    this.skirtGeo.attributes.position.needsUpdate = true;
    this.skirtGeo.attributes.color.needsUpdate = true;
    this.skirtGeo.attributes.aRip.needsUpdate = true;
    this.skirtGeo.index!.needsUpdate = true;
  }
}
