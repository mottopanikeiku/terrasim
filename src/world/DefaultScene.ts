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
      const gravelH = 3 + Math.round(valueNoise2D(x * 0.12, z * 0.12, 7) * 1.5);
      const sandH = gravelH + 2 + Math.round(valueNoise2D(x * 0.1, z * 0.1, 21) * 2);

      // Zone profile: tall on the left, rolling center, low sandy right.
      const u = x / W;
      const highland = Math.max(0, 1 - u * 2.4) * 7; // left third
      const rolling = valueNoise2D(x * 0.05, z * 0.05, 42) * 4;
      const shore = Math.max(0, (u - 0.62) * 2.6) * -4; // right third dips
      const soilH = sandH + 2 + Math.round(highland + rolling + shore);

      const sandyTop = u > 0.68; // beach zone gets a sand cap
      for (let y = 0; y < Math.max(soilH, sandH + 1); y++) {
        if (y < gravelH) grid.set(x, y, z, Cell.GRAVEL, randomShade('gravel'));
        else if (y < sandH) grid.set(x, y, z, Cell.SAND, randomShade('sand'));
        else if (y < soilH) {
          if (sandyTop && y >= soilH - 2) {
            grid.set(x, y, z, Cell.SAND, randomShade('sand'), 20);
          } else {
            grid.set(x, y, z, Cell.SOIL, randomShade('soil'), 40 + ((Math.random() * 80) | 0));
          }
        }
      }
    }
  }

  // Rocks: a pair on the highland, one lone boulder mid-meadow.
  placeRockBlob(grid, 14, 13, 12, 3.6, 2.4, 3.0);
  placeRockBlob(grid, 21, 12, 28, 2.6, 1.8, 2.2);
  placeRockBlob(grid, 52, 9, 10, 2.2, 1.7, 2.0);

  // Let the substrate slump into its natural angle of repose first.
  for (let i = 0; i < 100; i++) sim.tick();

  // Pond: a wide basin against the front-right glass.
  const pcx = 80, pcz = 30, pr = 12;
  const waterLevel = 7;
  for (let x = pcx - pr; x <= pcx + pr; x++) {
    for (let z = pcz - pr; z <= pcz + pr; z++) {
      if (x < 0 || x >= W || z < 0 || z >= D) continue;
      const dist = Math.hypot(x - pcx, z - pcz);
      if (dist > pr) continue;
      const floor = Math.max(4, waterLevel - Math.round((1 - dist / pr) * 4) - 1);
      for (let y = floor; y < 30; y++) {
        if (grid.get(x, y, z) !== Cell.EMPTY) grid.clearCell(x, y, z);
      }
      if (grid.get(x, floor - 1, z) !== Cell.EMPTY) {
        grid.set(x, floor - 1, z, Cell.GRAVEL, randomShade('gravel'));
      }
    }
  }
  for (let i = 0; i < 30; i++) sim.tick();
  for (let x = pcx - pr; x <= pcx + pr; x++) {
    for (let z = pcz - pr; z <= pcz + pr; z++) {
      if (x < 0 || x >= W || z < 0 || z >= D) continue;
      if (Math.hypot(x - pcx, z - pcz) > pr - 1) continue;
      for (let y = 4; y <= waterLevel; y++) {
        if (grid.get(x, y, z) === Cell.EMPTY) {
          grid.set(x, y, z, Cell.WATER, randomShade('water'));
        }
      }
    }
  }
  for (let i = 0; i < 60; i++) sim.tick();

  // Plants by zone, mostly mature so the scene opens alive.
  const plantAt = (species: Parameters<Simulation['addPlant']>[0], x: number, z: number, stage: number) => {
    const y = grid.top(x, z) + 1;
    if (y > 0 && grid.get(x, y - 1, z) !== Cell.WATER) sim.addPlant(species, x, y, z, stage);
  };
  // Highland (ferns, moss, mushrooms in the rock shade)
  plantAt('fern', 9, 9, 0.95);
  plantAt('fern', 17, 22, 0.8);
  plantAt('fern', 7, 30, 0.7);
  plantAt('mushroom', 18, 14, 1);
  sim.paintMoss(14, 12);
  sim.paintMoss(21, 28);
  sim.paintMoss(11, 18);
  // Meadow (grass + flowers)
  plantAt('grass', 38, 12, 1);
  plantAt('grass', 46, 28, 0.9);
  plantAt('grass', 56, 20, 0.85);
  plantAt('flower', 42, 20, 1);
  plantAt('flower', 50, 14, 0.9);
  plantAt('flower', 35, 30, 0.8);
  // Shore (succulents like it dry, one grass tuft at the waterline)
  plantAt('succulent', 86, 10, 1);
  plantAt('succulent', 76, 14, 0.85);
  plantAt('grass', 70, 33, 0.9);

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
