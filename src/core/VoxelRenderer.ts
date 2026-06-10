import * as THREE from 'three';
import { W, H, D, V, cellToWorld } from './constants';
import { Cell, Grid, WET_VISIBLE, WET_SOAKED } from './Grid';
import { PALETTE } from './palette';

const MAX_FINE = 260000;
const MAX_PEBBLE = 140000;
const MAX_TUFT = 30000;

// 24 precomputed jittered orientations (rotation+scale baked into a 3x3),
// picked per-cell by position hash, so grains look like tumbled crumbs and
// pebbles instead of aligned blocks — without per-instance math at rebuild.
function makeJitterBasis(count: number, maxAngle: number, sMin: number, sMax: number): Float32Array[] {
  const out: Float32Array[] = [];
  const e = new THREE.Euler();
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    e.set(
      (Math.random() - 0.5) * 2 * maxAngle,
      Math.random() * Math.PI,
      (Math.random() - 0.5) * 2 * maxAngle
    );
    m.makeRotationFromEuler(e);
    const s = sMin + Math.random() * (sMax - sMin);
    const a = new Float32Array(9);
    const el = m.elements;
    a[0] = el[0] * s; a[1] = el[1] * s; a[2] = el[2] * s;
    a[3] = el[4] * s; a[4] = el[5] * s; a[5] = el[6] * s;
    a[6] = el[8] * s; a[7] = el[9] * s; a[8] = el[10] * s;
    out.push(a);
  }
  return out;
}

function cellHash(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 1274126177;
  h = (h ^ (h >> 13)) >>> 0;
  return h;
}

// Renders the voxel grid as three instanced meshes: fine grains (sand/soil),
// pebbles (gravel/rock/moss clumps), and transparent water.
export class VoxelRenderer {
  private fine: THREE.InstancedMesh;
  private pebble: THREE.InstancedMesh;
  private tuft: THREE.InstancedMesh;
  // Gentle jitter for fine grains (heavy rotation made surfaces look noisy),
  // chunky jitter for pebbles, soft for moss cushions.
  private fineJitter = makeJitterBasis(24, 0.07, 1.02, 1.1);
  private pebbleJitter = makeJitterBasis(24, 0.6, 0.92, 1.25);
  private tuftJitter = makeJitterBasis(24, 0.15, 0.95, 1.2);
  private tmpColor = new THREE.Color();

  constructor(scene: THREE.Scene, private grid: Grid) {
    const makeMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, max: number, shadows: boolean) => {
      const mesh = new THREE.InstancedMesh(geo, mat, max);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.raycast = () => {}; // picking uses grid DDA instead
      scene.add(mesh);
      return mesh;
    };

    this.fine = makeMesh(
      new THREE.BoxGeometry(V, V, V),
      // Fully matte: sheen on dirt is what makes it look like plastic.
      new THREE.MeshStandardMaterial({ roughness: 1.0, metalness: 0, envMapIntensity: 0.22 }),
      MAX_FINE, true
    );
    // Pebbles: chunky low-poly nuggets.
    this.pebble = makeMesh(
      new THREE.DodecahedronGeometry(V * 0.66, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.02, envMapIntensity: 0.5 }),
      MAX_PEBBLE, true
    );
    // Moss: soft squashed cushions, totally matte.
    const tuftGeo = new THREE.IcosahedronGeometry(V * 0.62, 1);
    tuftGeo.scale(1.25, 0.6, 1.25);
    this.tuft = makeMesh(
      tuftGeo,
      new THREE.MeshStandardMaterial({ roughness: 1.0, metalness: 0, envMapIntensity: 0.2 }),
      MAX_TUFT, true
    );
    // Water is rendered by WaterSurface (a continuous smoothed mesh), not
    // by instanced cubes — stacked transparent boxes read as a grid.
  }

  rebuild(): void {
    const g = this.grid;
    const { type, shade, wet } = g;
    const fm = this.fine.instanceMatrix.array as Float32Array;
    const fc = this.fine.instanceColor!.array as Float32Array;
    const pm = this.pebble.instanceMatrix.array as Float32Array;
    const pc = this.pebble.instanceColor!.array as Float32Array;
    const tm = this.tuft.instanceMatrix.array as Float32Array;
    const tc = this.tuft.instanceColor!.array as Float32Array;
    let nf = 0, np = 0, nt = 0;
    const c = this.tmpColor;

    for (let y = 0; y < H; y++) {
      for (let z = 0; z < D; z++) {
        let i = g.idx(0, y, z);
        for (let x = 0; x < W; x++, i++) {
          const t = type[i] as Cell;
          if (t === Cell.EMPTY) continue;

          // Out-of-bounds counts as EMPTY: those faces are visible through glass.
          const xm = x > 0 ? type[i - 1] : Cell.EMPTY;
          const xp = x < W - 1 ? type[i + 1] : Cell.EMPTY;
          const zm = z > 0 ? type[i - W] : Cell.EMPTY;
          const zp = z < D - 1 ? type[i + W] : Cell.EMPTY;
          const ym = y > 0 ? type[i - W * D] : Cell.EMPTY;
          const yp = y < H - 1 ? type[i + W * D] : Cell.EMPTY;

          if (t === Cell.WATER) continue; // drawn by WaterSurface

          const solidXm = xm !== Cell.EMPTY && xm !== Cell.WATER;
          const solidXp = xp !== Cell.EMPTY && xp !== Cell.WATER;
          const solidZm = zm !== Cell.EMPTY && zm !== Cell.WATER;
          const solidZp = zp !== Cell.EMPTY && zp !== Cell.WATER;
          const solidYm = ym !== Cell.EMPTY && ym !== Cell.WATER;
          const solidYp = yp !== Cell.EMPTY && yp !== Cell.WATER;
          if (solidXm && solidXp && solidZm && solidZp && solidYm && solidYp) continue;

          const mossy = t === Cell.MOSS;
          const pebbly = t === Cell.GRAVEL || t === Cell.ROCK;
          if (mossy ? nt >= MAX_TUFT : pebbly ? np >= MAX_PEBBLE : nf >= MAX_FINE) continue;

          const [px, py, pz] = cellToWorld(x, y, z);
          const jitterSet = mossy ? this.tuftJitter : pebbly ? this.pebbleJitter : this.fineJitter;
          const j = jitterSet[cellHash(x, y, z) % jitterSet.length];
          const arr = mossy ? tm : pebbly ? pm : fm;
          const n = mossy ? nt : pebbly ? np : nf;
          const b = n * 16;
          arr[b] = j[0]; arr[b + 1] = j[1]; arr[b + 2] = j[2]; arr[b + 3] = 0;
          arr[b + 4] = j[3]; arr[b + 5] = j[4]; arr[b + 6] = j[5]; arr[b + 7] = 0;
          arr[b + 8] = j[6]; arr[b + 9] = j[7]; arr[b + 10] = j[8]; arr[b + 11] = 0;
          arr[b + 12] = px;
          // Moss cushions nestle down onto the surface they grow on.
          arr[b + 13] = py - (mossy ? V * 0.3 : 0);
          arr[b + 14] = pz; arr[b + 15] = 1;

          const base = PALETTE[shade[i]] ?? PALETTE[1];
          c.copy(base);
          if ((t === Cell.SOIL || t === Cell.SAND) && wet[i] >= WET_VISIBLE) {
            c.multiplyScalar(wet[i] >= WET_SOAKED ? 0.64 : 0.78);
          }
          const nSolid = (solidXm ? 1 : 0) + (solidXp ? 1 : 0) + (solidZm ? 1 : 0) + (solidZp ? 1 : 0) + (solidYm ? 1 : 0);
          let ao = 1 - nSolid * 0.04 - (solidYp ? 0.12 : 0);
          if (ao < 0.55) ao = 0.55;
          c.multiplyScalar(ao);

          const carr = mossy ? tc : pebbly ? pc : fc;
          carr[n * 3] = c.r; carr[n * 3 + 1] = c.g; carr[n * 3 + 2] = c.b;
          if (mossy) nt++; else if (pebbly) np++; else nf++;
        }
      }
    }

    this.fine.count = nf;
    this.pebble.count = np;
    this.tuft.count = nt;
    for (const mesh of [this.fine, this.pebble, this.tuft]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
  }
}
