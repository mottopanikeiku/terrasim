import { W, D } from '../core/constants';
import { Cell, Grid } from '../core/Grid';
import { Simulation } from '../core/Simulation';
import { randomShade } from '../core/palette';
import { valueNoise2D } from '../core/random';

// A finished-looking landscape with three zones across the panoramic tank:
// a mossy highland on the left, an open meadow in the middle, and a sandy
// pond shore on the right.
export function buildDefaultScene(grid: Grid, sim: Simulation): void {
  grid.clear();
  sim.humidity = 58;

  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      const gravelH = 5 + Math.round(valueNoise2D(x * 0.08, z * 0.08, 7) * 2);
      const sandH = gravelH + 3 + Math.round(valueNoise2D(x * 0.07, z * 0.07, 21) * 3);

      // Zone profile: tall on the left, rolling center, low sandy right.
      const u = x / W;
      const highland = Math.max(0, 1 - u * 2.4) * 10; // left third
      const rolling = valueNoise2D(x * 0.033, z * 0.033, 42) * 6;
      const shore = Math.max(0, (u - 0.62) * 2.6) * -6; // right third dips
      const soilH = sandH + 3 + Math.round(highland + rolling + shore);

      const sandyTop = u > 0.68; // beach zone gets a sand cap
      for (let y = 0; y < Math.max(soilH, sandH + 1); y++) {
        if (y < gravelH) grid.set(x, y, z, Cell.GRAVEL, randomShade('gravel'));
        else if (y < sandH) grid.set(x, y, z, Cell.SAND, randomShade('sand'));
        else if (y < soilH) {
          if (sandyTop && y >= soilH - 3) {
            grid.set(x, y, z, Cell.SAND, randomShade('sand'), 20);
          } else {
            grid.set(x, y, z, Cell.SOIL, randomShade('soil'), 40 + ((Math.random() * 80) | 0));
          }
        }
      }
    }
  }

  // Rocks: a pair on the highland, one lone boulder mid-meadow.
  placeRockBlob(grid, 21, 20, 18, 5.4, 3.6, 4.5);
  placeRockBlob(grid, 31, 18, 42, 3.9, 2.7, 3.3);
  placeRockBlob(grid, 78, 14, 15, 3.3, 2.5, 3.0);

  // Let the substrate slump into its natural angle of repose first.
  for (let i = 0; i < 110; i++) sim.tick();

  // Pond: a wide basin against the front-right glass.
  const pcx = 120, pcz = 45, pr = 18;
  const waterLevel = 10;
  for (let x = pcx - pr; x <= pcx + pr; x++) {
    for (let z = pcz - pr; z <= pcz + pr; z++) {
      if (x < 0 || x >= W || z < 0 || z >= D) continue;
      const dist = Math.hypot(x - pcx, z - pcz);
      if (dist > pr) continue;
      const floor = Math.max(6, waterLevel - Math.round((1 - dist / pr) * 6) - 1);
      for (let y = floor; y < 45; y++) {
        if (grid.get(x, y, z) !== Cell.EMPTY) grid.clearCell(x, y, z);
      }
      if (grid.get(x, floor - 1, z) !== Cell.EMPTY) {
        grid.set(x, floor - 1, z, Cell.GRAVEL, randomShade('gravel'));
      }
    }
  }
  for (let i = 0; i < 40; i++) sim.tick();
  for (let x = pcx - pr; x <= pcx + pr; x++) {
    for (let z = pcz - pr; z <= pcz + pr; z++) {
      if (x < 0 || x >= W || z < 0 || z >= D) continue;
      if (Math.hypot(x - pcx, z - pcz) > pr - 1) continue;
      for (let y = 6; y <= waterLevel; y++) {
        if (grid.get(x, y, z) === Cell.EMPTY) {
          grid.set(x, y, z, Cell.WATER, randomShade('water'));
        }
      }
    }
  }
  for (let i = 0; i < 80; i++) sim.tick();

  // Plants by zone, mostly mature so the scene opens alive.
  const plantAt = (species: Parameters<Simulation['addPlant']>[0], x: number, z: number, stage: number) => {
    const y = grid.top(x, z) + 1;
    if (y > 0 && grid.get(x, y - 1, z) !== Cell.WATER) sim.addPlant(species, x, y, z, stage);
  };
  // Highland (ferns, moss, mushrooms in the rock shade)
  plantAt('fern', 13, 13, 0.95);
  plantAt('fern', 25, 33, 0.8);
  plantAt('fern', 10, 45, 0.7);
  plantAt('mushroom', 27, 21, 1);
  sim.paintMoss(21, 18);
  sim.paintMoss(31, 42);
  sim.paintMoss(16, 27);
  // Meadow (grass + flowers)
  plantAt('grass', 57, 18, 1);
  plantAt('grass', 69, 42, 0.9);
  plantAt('grass', 84, 30, 0.85);
  plantAt('flower', 63, 30, 1);
  plantAt('flower', 75, 21, 0.9);
  plantAt('flower', 52, 45, 0.8);
  // Shore (succulents like it dry, one grass tuft at the waterline)
  plantAt('succulent', 129, 15, 1);
  plantAt('succulent', 114, 21, 0.85);
  plantAt('grass', 105, 49, 0.9);

  sim.changed = true;
}

function placeRockBlob(grid: Grid, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): void {
  const r = Math.ceil(Math.max(rx, rz));
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
      for (let dz = -r; dz <= r; dz++) {
        const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (dz * dz) / (rz * rz);
        if (d > 1 - Math.random() * 0.2) continue;
        const x = cx + dx, y = cy + dy, z = cz + dz;
        if (!grid.inBounds(x, y, z)) continue;
        const t = grid.get(x, y, z);
        if (t === Cell.EMPTY || t === Cell.WATER || t === Cell.SOIL) {
          grid.set(x, y, z, Cell.ROCK, randomShade('rock'));
        }
      }
    }
  }
}
