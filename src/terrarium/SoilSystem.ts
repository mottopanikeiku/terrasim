import * as THREE from 'three';
import { VoxelEngine, VoxelType } from '../core/VoxelEngine';
import { GRID_SIZE, isInsideVessel } from '../utils/MathUtils';
import { COLORS, varyColor, pickRandom } from '../utils/ColorPalette';
import { noise } from '../utils/Noise';

export class SoilSystem {
  generate(engine: VoxelEngine): void {
    const gravelHeight = 3;
    const sandHeight = 5;
    const earthHeight = 11;

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        // Noise-varied layer boundaries for organic look
        const nx = x * 0.15;
        const nz = z * 0.15;
        const variation = noise.noise2D(nx, nz) * 1.5;
        const variation2 = noise.noise2D(nx + 50, nz + 50) * 1.2;

        const localGravel = Math.round(gravelHeight + variation * 0.5);
        const localSand = Math.round(sandHeight + variation);
        const localEarth = Math.round(earthHeight + variation2);

        for (let y = 0; y < GRID_SIZE; y++) {
          if (!isInsideVessel(x, y, z)) continue;
          if (y >= localEarth) continue;

          let type: VoxelType;
          let colorHex: number;

          if (y < localGravel) {
            type = VoxelType.SOIL_GRAVEL;
            colorHex = pickRandom(COLORS.soil.gravel);
          } else if (y < localSand) {
            type = VoxelType.SOIL_SAND;
            colorHex = pickRandom(COLORS.soil.sand);
          } else {
            type = VoxelType.SOIL_EARTH;
            colorHex = pickRandom(COLORS.soil.earth);
          }

          // Extra color variation per voxel
          const color = varyColor(colorHex, 0.06);

          // Darken deeper voxels slightly
          const depthFactor = 1 - (y / localEarth) * 0.15;
          color.multiplyScalar(depthFactor);

          engine.setVoxel(x, y, z, type, color);
        }
      }
    }
  }

  // Get approximate soil surface height at (x, z)
  getSoilHeight(x: number, z: number): number {
    const nx = x * 0.15;
    const nz = z * 0.15;
    const variation2 = noise.noise2D(nx + 50, nz + 50) * 1.2;
    return Math.round(11 + variation2);
  }
}
