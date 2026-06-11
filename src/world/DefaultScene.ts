import { W, D } from '../core/constants';
import { Mat, World } from '../core/World';
import { valueNoise2D } from '../core/random';

// The opening scene: a finished-looking landscape across the panoramic
// tank — mossy highland on the left, rolling meadow in the middle, and a
// sandy shore with a clear pond on the right. Built directly into the
// heightfield: no settling pre-roll needed.
export function buildDefaultScene(world: World): void {
  world.clear();
  world.humidity = 58;

  const pcx = 118, pcz = 32, pr = 17; // pond center / radius (columns)

  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      const i = world.idx(x, z);
      const u = x / W;

      const gravel = 0.55 + valueNoise2D(x * 0.07, z * 0.07, 7) * 0.25;
      let sand = 0.45 + valueNoise2D(x * 0.06, z * 0.06, 21) * 0.3;

      // Zone profile: tall on the left, rolling center, low sandy right.
      const highland = Math.max(0, 1 - u * 2.3) * 1.5;
      const rolling = valueNoise2D(x * 0.03, z * 0.03, 42) * 0.85;
      const shore = Math.max(0, (u - 0.6) * 2.5) * -0.9;
      let soil = Math.max(0.15, 0.55 + highland + rolling + shore);

      // Pond basin: scoop a bowl (digging into the sand bed once the soil
      // is gone) and raise a soft bank lip so the water has a true rim.
      const pd = Math.hypot(x - pcx, z - pcz);
      if (pd < pr) {
        const bowl = (1 - pd / pr) ** 1.3 * 1.35;
        const fromSoil = Math.min(soil, bowl);
        soil -= fromSoil;
        sand = Math.max(0.1, sand - (bowl - fromSoil));
      } else if (pd < pr + 5) {
        soil += (1 - (pd - pr) / 5) * 0.22;
      }

      world.addLayer(i, Mat.GRAVEL, gravel);
      world.addLayer(i, Mat.SAND, sand);
      if (soil > 0.02) {
        if (u > 0.68) {
          // Beach zone: sand cap instead of soil.
          world.addLayer(i, Mat.SAND, soil * 0.8);
        } else {
          world.addLayer(i, Mat.SOIL, soil);
        }
      }

      // Moisture: gently damp on the left, wet ring near the pond.
      world.wet[i] = Math.min(1, Math.max(0.12, 0.32 - u * 0.2) + Math.max(0, 1 - pd / (pr + 6)) * 0.7);
    }
  }

  // Fill the pond to just below the lowest escape point of the bank.
  let rim = Infinity;
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      const pd = Math.hypot(x - pcx, z - pcz);
      if (pd > pr - 1 && pd < pr + 4) {
        rim = Math.min(rim, world.groundH[world.idx(x, z)]);
      }
    }
  }
  const level = rim - 0.03;
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      const i = world.idx(x, z);
      if (Math.hypot(x - pcx, z - pcz) < pr && world.groundH[i] < level) {
        world.water[i] = level - world.groundH[i];
        world.wet[i] = 1;
      }
    }
  }

  // Rocks: a pair on the highland, one lone boulder mid-meadow.
  world.rocks.push(
    { x: 21, z: 18, scale: 0.95, seed: 101 },
    { x: 26, z: 23, scale: 0.6, seed: 202 },
    { x: 31, z: 42, scale: 0.75, seed: 303 },
    { x: 78, z: 15, scale: 0.65, seed: 404 }
  );

  // Moss carpets around the highland rocks.
  const mossPatch = (cx: number, cz: number, r: number) => {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, z = cz + dz;
        if (!world.inBounds(x, z)) continue;
        const d = Math.hypot(dx, dz) / r;
        if (d > 1) continue;
        const i = world.idx(x, z);
        if (world.water[i] > 0.02) continue;
        world.moss[i] = Math.min(1, world.moss[i] + (1 - d) * (0.5 + Math.random() * 0.4));
      }
    }
  };
  mossPatch(21, 16, 6);
  mossPatch(30, 41, 5);
  mossPatch(14, 28, 5);

  // Plants by zone, mostly mature so the scene opens alive — a tour of
  // the whole species registry.
  const plantAt = (species: Parameters<World['addPlant']>[0], x: number, z: number, stage: number) => {
    if (!world.isWater(x, z)) world.addPlant(species, x, z, stage);
  };
  // Mossy highland: ferns, tropical foliage, glowing bonnets in the shade.
  plantAt('asplenium', 13, 13, 0.95);
  plantAt('nephrolepis', 25, 33, 0.85);
  plantAt('nephrolepis', 10, 45, 0.7);
  plantAt('fittonia', 18, 40, 0.9);
  plantAt('pilea', 31, 25, 0.85);
  plantAt('peperomia', 35, 45, 0.8);
  plantAt('mycena', 24, 19, 1);
  // Meadow: micro gloxinias and friendship plants among the sedges.
  plantAt('sinningia', 63, 30, 1);
  plantAt('sinningia', 52, 45, 0.85);
  plantAt('pilea', 75, 21, 0.9);
  plantAt('eleocharis', 57, 16, 0.95);
  plantAt('fittonia', 86, 38, 0.85);
  plantAt('leucocoprinus', 70, 48, 0.9);
  // Pond edge: hairgrass fringe + a sundew in the bog.
  plantAt('eleocharis', 100, 27, 1);
  plantAt('eleocharis', 108, 47, 0.9);
  plantAt('eleocharis', 131, 27, 0.85);
  plantAt('drosera', 103, 20, 0.9);
  // Dry sandy shore: the succulent corner.
  plantAt('echeveria', 134, 52, 1);
  plantAt('haworthia', 124, 55, 0.9);
  plantAt('echeveria', 99, 8, 0.85);

  // Leaf litter under the highland canopy.
  world.addLitter(20, 30);
  world.addLitter(28, 16);

  world.changed = true;
  world.terrainDirty = true;
  world.waterDirty = true;
}
