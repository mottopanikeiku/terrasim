import { W, D } from '../core/constants';
import { Mat, World } from '../core/World';
import { valueNoise2D } from '../core/random';
import { SPECIES } from './Plants';

// The opening garden: a fern canopy and mossy understory on the left,
// flowers around the meadow rocks, then a pond and dry succulent shore.
// Seed the existing growth stages and moisture, without a simulation pre-roll.
export function buildDefaultScene(world: World): void {
  world.clear();
  world.humidity = 66;

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

      // Damp planting beds, a drier succulent shore, and a wet pond bank.
      const bedWet = u < 0.68 ? 0.68 - u * 0.18 : 0.24;
      world.wet[i] = Math.min(1, bedWet + Math.max(0, 1 - pd / (pr + 10)) * 0.7);
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

  // Broad, overlapping moss patches connect the planting beds.
  const mossPatch = (cx: number, cz: number, r: number) => {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, z = cz + dz;
        if (!world.inBounds(x, z)) continue;
        const d = Math.hypot(dx, dz) / r;
        if (d > 1) continue;
        const i = world.idx(x, z);
        if (world.water[i] > 0.02) continue;
        const edge = Math.min(1, (1 - d) * 3);
        const cover = 0.72 + valueNoise2D(x * 0.3, z * 0.3, 83) * 0.28;
        world.moss[i] = Math.min(1, world.moss[i] + edge * cover);
      }
    }
  };
  mossPatch(15, 15, 15);
  mossPatch(17, 37, 16);
  mossPatch(30, 48, 13);
  mossPatch(33, 24, 15);
  mossPatch(45, 12, 13);
  mossPatch(48, 40, 16);
  mossPatch(62, 24, 15);
  mossPatch(68, 48, 14);
  mossPatch(79, 14, 13);
  mossPatch(83, 36, 16);
  mossPatch(94, 47, 10);

  // Mature specimens give the canopy its shape on the first frame.
  // Keep room below the existing population cap for planting and reseeding.
  const plantAt = (species: Parameters<World['addPlant']>[0], x: number, z: number, stage = 1) => {
    if (world.isWater(x, z)) return;
    world.addPlant(species, x, z, stage);
    // Give each root zone a reserve within the species' existing care band.
    const [lo, hi] = SPECIES[species].idealWet;
    const moisture = (lo + hi) / 2;
    for (let dz = -4; dz <= 4; dz++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dz * dz > 16 || !world.inBounds(x + dx, z + dz)) continue;
        const i = world.idx(x + dx, z + dz);
        if (world.water[i] < 0.02) world.wet[i] = moisture;
      }
    }
  };
  // Fern canopy, with lower foliage and mushrooms around the highland rocks.
  plantAt('asplenium', 13, 13);
  plantAt('asplenium', 8, 27, 0.95);
  plantAt('asplenium', 19, 43);
  plantAt('nephrolepis', 25, 33);
  plantAt('nephrolepis', 10, 48, 0.95);
  plantAt('nephrolepis', 26, 9);
  plantAt('nephrolepis', 35, 20);
  plantAt('nephrolepis', 33, 47, 0.95);
  plantAt('fittonia', 18, 37);
  plantAt('fittonia', 8, 38, 0.9);
  plantAt('pilea', 26, 24);
  plantAt('pilea', 40, 13, 0.95);
  plantAt('peperomia', 37, 42);
  plantAt('peperomia', 22, 52);
  plantAt('mycena', 22, 17);
  plantAt('mycena', 16, 26);
  plantAt('leucocoprinus', 39, 32);
  plantAt('mycena', 29, 40, 0.95);

  // Staggered ferns frame a flowering meadow rather than isolated seedlings.
  plantAt('asplenium', 46, 16);
  plantAt('asplenium', 57, 26);
  plantAt('asplenium', 74, 12);
  plantAt('asplenium', 84, 30, 0.95);
  plantAt('nephrolepis', 46, 38);
  plantAt('nephrolepis', 61, 10, 0.95);
  plantAt('nephrolepis', 67, 38);
  plantAt('nephrolepis', 81, 45);
  plantAt('nephrolepis', 91, 16);
  plantAt('fittonia', 48, 49);
  plantAt('pilea', 65, 20);
  plantAt('fittonia', 86, 38);
  plantAt('peperomia', 73, 52);
  plantAt('sinningia', 51, 31);
  plantAt('sinningia', 58, 44);
  plantAt('sinningia', 70, 29);
  plantAt('sinningia', 77, 38);
  plantAt('sinningia', 87, 51);
  plantAt('sinningia', 42, 52, 0.95);
  plantAt('sinningia', 91, 24);
  plantAt('leucocoprinus', 54, 21);
  plantAt('mycena', 62, 35);
  plantAt('leucocoprinus', 73, 45);
  plantAt('mycena', 80, 23, 0.95);

  // A hairgrass fringe and sundews leave the open water visible.
  plantAt('eleocharis', 100, 27);
  plantAt('eleocharis', 108, 47);
  plantAt('eleocharis', 131, 27, 0.95);
  plantAt('eleocharis', 96, 38);
  plantAt('eleocharis', 121, 12);
  plantAt('eleocharis', 133, 40);
  plantAt('eleocharis', 113, 13, 0.95);
  plantAt('drosera', 103, 20);
  plantAt('drosera', 99, 45);
  plantAt('drosera', 124, 50);

  // Dry sandy shore: the succulent corner.
  plantAt('echeveria', 134, 52);
  plantAt('haworthia', 124, 55);
  plantAt('haworthia', 138, 42, 0.95);
  plantAt('echeveria', 99, 8);
  plantAt('echeveria', 109, 5, 0.95);
  plantAt('haworthia', 132, 12);

  // Leaf litter under the highland canopy.
  world.addLitter(20, 30);
  world.addLitter(28, 16);
  world.addLitter(12, 38);
  world.addLitter(72, 44);

  world.changed = true;
  world.terrainDirty = true;
  world.waterDirty = true;
}
