import * as THREE from 'three';
import { W, D } from '../core/constants';
import { Cell, Grid, NCX, NCZ, WET_VISIBLE, WET_SOAKED } from '../core/Grid';
import { PALETTE } from '../core/palette';
import { valueNoise2D } from '../core/random';
import { buildChunk, MeshConfig } from './SurfaceNets';
import { ChunkMeshes } from './ChunkMeshes';

// Smooth sculpted terrain: sand, soil, gravel, rock and moss as one soft
// surface per chunk. Color comes from blending the palette shades of the
// cells around each vertex (gentle mottling instead of per-grain confetti),
// darkened where the soil is damp, with a low-frequency tone variation so
// large areas never look airbrushed.

const DENSITY = new Float32Array(16);
DENSITY[Cell.SAND] = 1;
DENSITY[Cell.SOIL] = 1;
DENSITY[Cell.GRAVEL] = 1;
DENSITY[Cell.ROCK] = 1;
DENSITY[Cell.MOSS] = 1;

const WD = W * D;

export class TerrainRenderer {
  private chunks: ChunkMeshes;
  private seen = new Uint32Array(NCX * NCZ).fill(0xffffffff);
  private cursor = 0;
  private cfg: MeshConfig;

  constructor(scene: THREE.Scene, private grid: Grid) {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1.0,
      metalness: 0,
      envMapIntensity: 0.25,
    });
    this.chunks = new ChunkMeshes(scene, mat, true);

    const { type, shade, wet } = grid;
    this.cfg = {
      density: DENSITY,
      color: (i, j, k, fx, fy, fz, out) => {
        let r = 0, g = 0, b = 0, n = 0, pebbly = 0;
        for (let dy = 0; dy <= 1; dy++) {
          const y = j + dy;
          if (y < 0) continue;
          for (let dz = 0; dz <= 1; dz++) {
            const z = k + dz;
            if (z < 0 || z >= D) continue;
            for (let dx = 0; dx <= 1; dx++) {
              const x = i + dx;
              if (x < 0 || x >= W) continue;
              const ci = x + W * (z + D * y);
              const t = type[ci];
              if (DENSITY[t] === 0) continue;
              const col = PALETTE[shade[ci]] ?? PALETTE[1];
              let m = 1;
              if ((t === Cell.SOIL || t === Cell.SAND) && wet[ci] >= WET_VISIBLE) {
                m = wet[ci] >= WET_SOAKED ? 0.62 : 0.78;
              }
              if (t === Cell.GRAVEL || t === Cell.ROCK) pebbly++;
              r += col.r * m; g += col.g * m; b += col.b * m;
              n++;
            }
          }
        }
        if (n === 0) {
          const col = PALETTE[shade[i + W * (k + D * Math.max(0, j))] || 10] ?? PALETTE[10];
          r = col.r; g = col.g; b = col.b; n = 1;
        }
        // Low-frequency tonal patches so large areas never look airbrushed,
        // plus tight stony speckle where the surface is gravel or rock.
        let tone =
          0.9 + 0.18 * valueNoise2D((i + fx) * 0.11, (k + fz) * 0.11, 17) +
          0.05 * valueNoise2D((i + fx) * 0.45, (k + fz) * 0.45, 53);
        if (pebbly > n * 0.4) {
          tone *= 0.86 + 0.28 * valueNoise2D((i + fx) * 1.9 + (j + fy) * 2.7, (k + fz) * 1.9, 29);
        }
        out[0] = (r / n) * tone;
        out[1] = (g / n) * tone;
        out[2] = (b / n) * tone;
      },
    };
  }

  // Rebuild up to `budget` dirty chunks (round-robin so none starve).
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
