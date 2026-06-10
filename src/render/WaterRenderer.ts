import * as THREE from 'three';
import { W, H, D, V as VWORLD } from '../core/constants';
import { Cell, Grid, NCX, NCZ } from '../core/Grid';
import { buildChunk, MeshConfig } from './SurfaceNets';
import { ChunkMeshes } from './ChunkMeshes';

// Smooth water surface from the same surface-nets field as the terrain.
// The field counts solids as "inside" too, so the water sheet continues
// into the banks and tucks under them like a meniscus — no cracks, no
// ragged stairstep shoreline. A dual-cell mask clips the mesh to dual
// cells that actually touch water, and polygonOffset lets the terrain win
// where the two surfaces coincide on dry ground.

const DENSITY = new Float32Array(16);
DENSITY[Cell.SAND] = 1;
DENSITY[Cell.SOIL] = 1;
DENSITY[Cell.GRAVEL] = 1;
DENSITY[Cell.ROCK] = 1;
DENSITY[Cell.MOSS] = 1;
DENSITY[Cell.WATER] = 1;

const SHALLOW = new THREE.Color(0xa9dcec).convertSRGBToLinear();
const DEEP = new THREE.Color(0x3d7fab).convertSRGBToLinear();

const WD = W * D;

export class WaterRenderer {
  private chunks: ChunkMeshes;
  private seen = new Uint32Array(NCX * NCZ).fill(0xffffffff);
  private cursor = 0;
  private cfg: MeshConfig;
  private uTime = { value: 0 };

  constructor(scene: THREE.Scene, private grid: Grid) {
    const mat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      roughness: 0.05,
      metalness: 0,
      envMapIntensity: 1.4,
      depthWrite: true,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    // Living surface: upward-facing vertices bob gently and their normals
    // wobble so reflections shimmer; side walls stay put.
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader =
        'uniform float uTime;\n' +
        sh.vertexShader
          .replace(
            '#include <beginnormal_vertex>',
            `#include <beginnormal_vertex>
            float ripW = smoothstep(0.55, 0.95, normal.y);
            objectNormal.xz += ripW * vec2(
              cos(position.x * 7.0 + uTime * 1.8),
              cos(position.z * 9.3 - uTime * 1.4)
            ) * 0.10;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float ripWp = smoothstep(0.55, 0.95, normal.y);
            transformed.y += ripWp * (
              sin(position.x * 7.0 + uTime * 1.8) * 0.5 +
              sin(position.z * 9.3 - uTime * 1.4) * 0.35 +
              sin((position.x + position.z) * 5.1 + uTime * 0.9) * 0.25
            ) * 0.013;`
          );
    };
    this.chunks = new ChunkMeshes(scene, mat, false, 2);

    const { type } = grid;
    const isWater = (x: number, y: number, z: number) =>
      x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D &&
      type[x + W * (z + D * y)] === Cell.WATER;

    this.cfg = {
      density: DENSITY,
      requireType: Cell.WATER,
      auxType: Cell.WATER,
      // Vertices far from any water sink below the banks, so the sheet's
      // cut-off edge hides under the terrain and the visible waterline
      // follows the smooth blurred-proximity contour, not cell steps.
      sinkY: (aux) => (aux < 0.16 ? -(0.16 - aux) * 9 * VWORLD : 0),
      mask: (i, j, k) => {
        for (let dy = 0; dy <= 1; dy++) {
          for (let dz = 0; dz <= 1; dz++) {
            for (let dx = 0; dx <= 1; dx++) {
              if (isWater(i + dx, j + dy, k + dz)) return true;
            }
          }
        }
        return false;
      },
      color: (i, j, k, fx, fy, fz, out) => {
        // Depth tint: average water-column depth across the dual cell's
        // four columns. Averaging keeps neighboring vertices continuous —
        // first-found sampling painted hard square patches on the pond.
        let sum = 0, cols = 0;
        for (let dz = 0; dz <= 1; dz++) {
          for (let dx = 0; dx <= 1; dx++) {
            const x = i + dx, z = k + dz;
            let y = -1;
            if (isWater(x, j + 1, z)) y = j + 1;
            else if (isWater(x, j, z)) y = j;
            if (y < 0) { cols++; continue; } // dry column pulls the rim pale
            let ci = x + W * (z + D * y);
            let d = 0;
            while (d < 7 && ci - WD >= 0 && type[ci - WD] === Cell.WATER) {
              d++;
              ci -= WD;
            }
            sum += d;
            cols++;
          }
        }
        const t = Math.min(1, sum / Math.max(1, cols) / 4.5);
        out[0] = SHALLOW.r + (DEEP.r - SHALLOW.r) * t;
        out[1] = SHALLOW.g + (DEEP.g - SHALLOW.g) * t;
        out[2] = SHALLOW.b + (DEEP.b - SHALLOW.b) * t;
      },
    };
  }

  setTime(time: number): void {
    this.uTime.value = time;
  }

  update(budget: number): boolean {
    const seq = this.grid.chunkSeq;
    const nc = NCX * NCZ;
    let built = 0;
    for (let s = 0; s < nc && built < budget; s++) {
      const c = (this.cursor + s) % nc;
      if (this.seen[c] === seq[c]) continue;
      this.seen[c] = seq[c];
      const cx = c % NCX;
      const cz = (c / NCX) | 0;
      this.chunks.write(c, buildChunk(this.grid, cx, cz, this.cfg));
      built++;
    }
    this.cursor = (this.cursor + built) % nc;
    return built > 0;
  }
}
