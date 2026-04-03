import * as THREE from 'three';
import { VoxelEngine, VoxelType } from '../core/VoxelEngine';
import { isInsideVessel, GRID_SIZE } from '../utils/MathUtils';
import { COLORS, varyColor, pickRandom } from '../utils/ColorPalette';
import { noise } from '../utils/Noise';

export class MossSystem {
  // BFS spread from a seed point, covering soil/rock surfaces
  generate(engine: VoxelEngine, seedX: number, seedY: number, seedZ: number, maxSpread: number = 40): void {
    const visited = new Set<string>();
    const queue: [number, number, number][] = [[seedX, seedY, seedZ]];
    let placed = 0;

    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

    while (queue.length > 0 && placed < maxSpread) {
      const idx = Math.floor(Math.random() * Math.min(queue.length, 5)); // random pick for organic spread
      const [x, y, z] = queue.splice(idx, 1)[0];
      const k = key(x, y, z);

      if (visited.has(k)) continue;
      visited.add(k);

      if (!isInsideVessel(x, y, z)) continue;

      // Only place moss on top of solid voxels
      const below = engine.getVoxel(x, y - 1, z);
      const current = engine.getVoxel(x, y, z);

      if (current !== VoxelType.EMPTY && current !== VoxelType.MOSS) continue;
      if (below === VoxelType.EMPTY) continue;

      // Noise-based probability for organic spread pattern
      const n = noise.noise3D(x * 0.3, y * 0.3, z * 0.3);
      if (n < -0.3) continue; // gaps in moss

      // Multi-shade moss
      const shade = noise.noise2D(x * 0.5, z * 0.5);
      let colorIdx: number;
      if (shade < -0.2) colorIdx = 0;
      else if (shade < 0.2) colorIdx = 1;
      else if (shade < 0.5) colorIdx = 2;
      else colorIdx = 3;

      const color = varyColor(COLORS.moss[colorIdx], 0.06);

      // Height variation: occasionally stack a second moss voxel
      engine.setVoxel(x, y, z, VoxelType.MOSS, color);
      placed++;

      if (Math.random() < 0.15 && isInsideVessel(x, y + 1, z) && engine.getVoxel(x, y + 1, z) === VoxelType.EMPTY) {
        const upperColor = varyColor(COLORS.moss[Math.min(colorIdx + 1, COLORS.moss.length - 1)], 0.06);
        engine.setVoxel(x, y + 1, z, VoxelType.MOSS, upperColor);
        placed++;
      }

      // Spread to neighbors (4-connected on surface + diagonal)
      const neighbors: [number, number, number][] = [
        [x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1],
        [x + 1, y, z + 1], [x - 1, y, z - 1], [x + 1, y, z - 1], [x - 1, y, z + 1],
        // Follow terrain up/down
        [x + 1, y + 1, z], [x - 1, y + 1, z], [x, y + 1, z + 1], [x, y + 1, z - 1],
        [x + 1, y - 1, z], [x - 1, y - 1, z], [x, y - 1, z + 1], [x, y - 1, z - 1],
      ];

      for (const [nx, ny, nz] of neighbors) {
        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
          if (!visited.has(key(nx, ny, nz))) {
            queue.push([nx, ny, nz]);
          }
        }
      }
    }
  }

  // Cover a specific area with moss carpet
  carpet(engine: VoxelEngine, cx: number, cz: number, radius: number): void {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > radius) continue;

        // Probability decreases at edges
        if (Math.random() > 1 - (dist / radius) * 0.5) continue;

        const x = cx + dx;
        const z = cz + dz;
        const topY = engine.getTopVoxelY(x, z);
        if (topY < 0) continue;

        const y = topY + 1;
        if (!isInsideVessel(x, y, z)) continue;
        if (engine.getVoxel(x, y, z) !== VoxelType.EMPTY) continue;

        const n = noise.noise2D(x * 0.4, z * 0.4);
        const colorIdx = Math.min(COLORS.moss.length - 1, Math.max(0, Math.round((n + 1) * 2)));
        const color = varyColor(COLORS.moss[colorIdx], 0.06);
        engine.setVoxel(x, y, z, VoxelType.MOSS, color);
      }
    }
  }
}
