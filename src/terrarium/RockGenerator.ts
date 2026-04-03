import * as THREE from 'three';
import { VoxelEngine, VoxelType } from '../core/VoxelEngine';
import { isInsideVessel } from '../utils/MathUtils';
import { COLORS, varyColor, pickRandom } from '../utils/ColorPalette';
import { noise } from '../utils/Noise';

export interface RockConfig {
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  ry: number;
  rz: number;
  seed?: number;
  hasCrystals?: boolean;
  hasLichen?: boolean;
}

export class RockGenerator {
  generate(engine: VoxelEngine, config: RockConfig): void {
    const { cx, cy, cz, rx, ry, rz } = config;
    const seed = config.seed ?? Math.random() * 1000;

    for (let dx = -rx - 1; dx <= rx + 1; dx++) {
      for (let dy = -ry - 1; dy <= ry + 1; dy++) {
        for (let dz = -rz - 1; dz <= rz + 1; dz++) {
          const x = Math.round(cx + dx);
          const y = Math.round(cy + dy);
          const z = Math.round(cz + dz);

          if (!isInsideVessel(x, y, z)) continue;

          // Ellipsoid distance
          const dist = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (dz * dz) / (rz * rz);

          // Noise carving for organic shape
          const noiseVal = noise.fbm(
            (x + seed) * 0.3, (y + seed) * 0.3, (z + seed) * 0.3,
            3, 2.0, 0.5
          );
          const threshold = 1.0 + noiseVal * 0.35;

          if (dist > threshold) continue;

          // Crystal inclusions
          if (config.hasCrystals && dist > 0.7 && Math.random() < 0.05) {
            const crystalColor = varyColor(pickRandom(COLORS.crystal), 0.1);
            engine.setVoxel(x, y, z, VoxelType.CRYSTAL, crystalColor);
            continue;
          }

          // Lichen spots on surface
          if (config.hasLichen && dist > 0.65 && dy > 0) {
            const lichenNoise = noise.noise3D(x * 0.5, y * 0.5, z * 0.5);
            if (lichenNoise > 0.3) {
              const lichenColor = varyColor(pickRandom(COLORS.moss.slice(0, 3)), 0.08);
              engine.setVoxel(x, y, z, VoxelType.MOSS, lichenColor);
              continue;
            }
          }

          // Rock surface is lighter, interior darker
          const surfaceFactor = Math.min(1, dist / threshold);
          const baseColor = pickRandom(COLORS.rock);
          const color = varyColor(baseColor, 0.1);
          color.multiplyScalar(0.7 + surfaceFactor * 0.35);

          engine.setVoxel(x, y, z, VoxelType.ROCK, color);
        }
      }
    }
  }

  // Generate small scattered pebbles
  generatePebbles(engine: VoxelEngine, cx: number, cz: number, count: number, soilHeight: (x: number, z: number) => number): void {
    for (let i = 0; i < count; i++) {
      const px = cx + Math.round((Math.random() - 0.5) * 8);
      const pz = cz + Math.round((Math.random() - 0.5) * 8);
      const py = soilHeight(px, pz);

      if (py < 0 || !isInsideVessel(px, py, pz)) continue;

      const color = varyColor(pickRandom(COLORS.rock), 0.1);
      engine.setVoxel(px, py, pz, VoxelType.ROCK, color);

      // Sometimes add a second voxel for slightly larger pebble
      if (Math.random() < 0.4) {
        const ox = Math.random() < 0.5 ? 1 : 0;
        const oz = Math.random() < 0.5 ? 1 : 0;
        if (isInsideVessel(px + ox, py, pz + oz)) {
          engine.setVoxel(px + ox, py, pz + oz, VoxelType.ROCK, varyColor(pickRandom(COLORS.rock), 0.1));
        }
      }
    }
  }
}
