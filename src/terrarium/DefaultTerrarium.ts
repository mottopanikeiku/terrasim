import { VoxelEngine } from '../core/VoxelEngine';
import { SoilSystem } from './SoilSystem';
import { RockGenerator } from './RockGenerator';
import { PlantGenerator } from './PlantGenerator';
import { MossSystem } from './MossSystem';
import { CreatureSystem } from './CreatureSystem';
import { GRID_SIZE } from '../utils/MathUtils';

export function buildDefaultTerrarium(engine: VoxelEngine): void {
  const soil = new SoilSystem();
  const rocks = new RockGenerator();
  const plants = new PlantGenerator();
  const moss = new MossSystem();
  const creatures = new CreatureSystem();

  const half = GRID_SIZE / 2;

  // 1. Soil layers (fills bottom ~25% of vessel)
  soil.generate(engine);

  // 2. Rocks — two featured rocks
  rocks.generate(engine, {
    cx: half - 5, cy: 10, cz: half + 3,
    rx: 4, ry: 3, rz: 3,
    seed: 42,
    hasLichen: true,
    hasCrystals: true,
  });

  rocks.generate(engine, {
    cx: half + 6, cy: 9, cz: half - 2,
    rx: 3, ry: 2, rz: 3,
    seed: 99,
    hasLichen: true,
  });

  // Scattered pebbles
  rocks.generatePebbles(engine, half, half, 12, (x, z) => soil.getSoilHeight(x, z));

  // 3. Focal succulent (center-ish)
  const succulentY = soil.getSoilHeight(half, half);
  plants.generate(engine, 'succulent', half, succulentY, half, 1.1);

  // 4. Ferns (flanking)
  const fernY1 = soil.getSoilHeight(half - 7, half - 4);
  plants.generate(engine, 'fern', half - 7, fernY1, half - 4, 0.9);

  const fernY2 = soil.getSoilHeight(half + 4, half + 6);
  plants.generate(engine, 'fern', half + 4, fernY2, half + 6, 0.8);

  // 5. Mushroom cluster (near rock)
  const mushroomY = soil.getSoilHeight(half - 3, half + 5);
  plants.generate(engine, 'mushroom', half - 3, mushroomY, half + 5, 0.9);

  // Small extra mushroom cluster
  const mush2Y = soil.getSoilHeight(half + 7, half + 3);
  plants.generate(engine, 'mushroom', half + 7, mush2Y, half + 3, 0.6);

  // 6. Wildflowers
  const flowerY1 = soil.getSoilHeight(half + 2, half - 5);
  plants.generate(engine, 'flower', half + 2, flowerY1, half - 5);

  const flowerY2 = soil.getSoilHeight(half - 6, half - 2);
  plants.generate(engine, 'flower', half - 6, flowerY2, half - 2);

  const flowerY3 = soil.getSoilHeight(half + 5, half - 4);
  plants.generate(engine, 'flower', half + 5, flowerY3, half - 4, 0.8);

  // 7. Bonsai tree (feature piece)
  const bonsaiY = soil.getSoilHeight(half - 2, half - 6);
  plants.generate(engine, 'bonsai', half - 2, bonsaiY, half - 6, 0.85);

  // 8. Cactus
  const cactusY = soil.getSoilHeight(half + 8, half - 1);
  plants.generate(engine, 'cactus', half + 8, cactusY, half - 1, 0.7);

  // 9. Vine climbing near vessel wall
  const vineY = soil.getSoilHeight(half + 10, half);
  plants.generate(engine, 'vine', half + 10, vineY, half, 0.8);

  // 10. Moss carpet — spread across soil surface
  moss.carpet(engine, half, half, 10);
  moss.generate(engine, half - 4, soil.getSoilHeight(half - 4, half + 2), half + 2, 30);
  moss.generate(engine, half + 3, soil.getSoilHeight(half + 3, half - 3), half - 3, 25);

  // 11. Creatures — the life of the terrarium
  // Snail on the big rock
  creatures.generate(engine, 'snail', half - 4, 13, half + 3, 0);

  // Butterfly near flowers
  creatures.generate(engine, 'butterfly', half + 2, flowerY1 + 10, half - 4);

  // Tiny frog on the second rock
  creatures.generate(engine, 'frog', half + 6, 11, half - 1, Math.PI);

  // Ladybug on soil
  const ladybugY = soil.getSoilHeight(half + 1, half + 3);
  creatures.generate(engine, 'ladybug', half + 1, ladybugY, half + 3, Math.PI / 4);

  // 12. Rebuild mesh
  engine.rebuild();
}
