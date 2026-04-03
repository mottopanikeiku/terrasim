import * as THREE from 'three';
import { VoxelEngine, VoxelType } from '../core/VoxelEngine';
import { isInsideVessel, GRID_SIZE, randomInt, randomRange } from '../utils/MathUtils';
import { COLORS, varyColor, pickRandom } from '../utils/ColorPalette';
import { noise } from '../utils/Noise';

export type PlantType = 'succulent' | 'fern' | 'mushroom' | 'flower' | 'cactus' | 'bonsai' | 'vine' | 'pitcher';

function setPlantVoxel(engine: VoxelEngine, x: number, y: number, z: number, type: VoxelType, color: THREE.Color) {
  x = Math.round(x);
  y = Math.round(y);
  z = Math.round(z);
  if (isInsideVessel(x, y, z)) {
    engine.setVoxel(x, y, z, type, color);
  }
}

export class PlantGenerator {
  generate(engine: VoxelEngine, type: PlantType, baseX: number, baseY: number, baseZ: number, scale: number = 1): void {
    switch (type) {
      case 'succulent': this.succulent(engine, baseX, baseY, baseZ, scale); break;
      case 'fern': this.fern(engine, baseX, baseY, baseZ, scale); break;
      case 'mushroom': this.mushroomCluster(engine, baseX, baseY, baseZ, scale); break;
      case 'flower': this.flower(engine, baseX, baseY, baseZ, scale); break;
      case 'cactus': this.cactus(engine, baseX, baseY, baseZ, scale); break;
      case 'bonsai': this.bonsai(engine, baseX, baseY, baseZ, scale); break;
      case 'vine': this.vine(engine, baseX, baseY, baseZ, scale); break;
      case 'pitcher': this.pitcher(engine, baseX, baseY, baseZ, scale); break;
    }
  }

  private succulent(engine: VoxelEngine, bx: number, by: number, bz: number, scale: number): void {
    const rings = randomInt(5, 7);
    const innerColor = pickRandom(COLORS.succulent.inner);
    const outerColor = pickRandom(COLORS.succulent.outer);
    const tipColor = pickRandom(COLORS.succulent.tips);

    // Center core
    setPlantVoxel(engine, bx, by, bz, VoxelType.PLANT, varyColor(innerColor, 0.05));
    setPlantVoxel(engine, bx, by + 1, bz, VoxelType.PLANT, varyColor(innerColor, 0.05));

    for (let ring = 0; ring < rings; ring++) {
      const t = ring / (rings - 1); // 0 = inner, 1 = outer
      const radius = (1.5 + ring * 0.8) * scale;
      const petals = 5 + ring * 2;
      const yOff = ring * 0.3;
      const angleOffset = ring * 0.3; // rotate each ring

      for (let p = 0; p < petals; p++) {
        const angle = (p / petals) * Math.PI * 2 + angleOffset;
        const leafLen = Math.round(radius);

        for (let l = 0; l <= leafLen; l++) {
          const lt = l / leafLen;
          const x = bx + Math.round(Math.cos(angle) * l);
          const z = bz + Math.round(Math.sin(angle) * l);
          const y = by + Math.round(yOff + lt * 0.5 + (1 - lt) * ring * 0.2);

          // Color gradient: inner -> outer -> tip
          let color: THREE.Color;
          if (lt < 0.6) {
            color = varyColor(innerColor, 0.05).lerp(new THREE.Color(outerColor), lt / 0.6 * t);
          } else {
            color = varyColor(outerColor, 0.05).lerp(new THREE.Color(tipColor), (lt - 0.6) / 0.4);
          }

          setPlantVoxel(engine, x, y, z, VoxelType.PLANT, color);

          // Thick leaves — add width on outer rings
          if (ring > 1 && lt < 0.7) {
            const perpAngle = angle + Math.PI / 2;
            const wx = x + Math.round(Math.cos(perpAngle));
            const wz = z + Math.round(Math.sin(perpAngle));
            setPlantVoxel(engine, wx, y, wz, VoxelType.PLANT, color.clone().multiplyScalar(0.95));
          }
        }
      }
    }
  }

  private fern(engine: VoxelEngine, bx: number, by: number, bz: number, scale: number): void {
    const stemHeight = Math.round(randomRange(10, 16) * scale);
    const frondCount = randomInt(4, 7);
    const stemColor = pickRandom(COLORS.fern.slice(0, 2));

    // Stem with slight curve
    for (let y = 0; y < stemHeight; y++) {
      const sway = Math.sin(y * 0.3) * 0.3;
      setPlantVoxel(engine, bx + Math.round(sway), by + y, bz, VoxelType.PLANT,
        varyColor(stemColor, 0.04));
    }

    // Fronds at intervals along stem
    for (let f = 0; f < frondCount; f++) {
      const frondY = by + Math.round(stemHeight * 0.3 + (f / frondCount) * stemHeight * 0.65);
      const angle = (f / frondCount) * Math.PI * 2 + Math.random() * 0.5;
      const frondLen = Math.round(randomRange(5, 9) * scale);

      this.generateFrond(engine, bx, frondY, bz, angle, frondLen, 0);
    }

    // Crown fronds (curling upward at top)
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + Math.random() * 0.3;
      this.generateFrond(engine, bx, by + stemHeight - 1, bz, angle, Math.round(4 * scale), 0);
    }
  }

  private generateFrond(engine: VoxelEngine, bx: number, by: number, bz: number,
    angle: number, length: number, depth: number): void {
    if (depth > 1 || length < 2) return;

    const leafColor = pickRandom(COLORS.fern);

    for (let l = 0; l < length; l++) {
      const t = l / length;
      const droop = t * t * 2; // fronds droop at tips
      const x = bx + Math.round(Math.cos(angle) * l);
      const z = bz + Math.round(Math.sin(angle) * l);
      const y = by - Math.round(droop);

      const tipFade = 1 - t * 0.3; // lighter at tips
      const color = varyColor(leafColor, 0.06);
      color.multiplyScalar(tipFade);
      setPlantVoxel(engine, x, y, z, VoxelType.LEAF, color);

      // Sub-fronds (leaflets)
      if (depth === 0 && l > 1 && l % 2 === 0) {
        const subAngle1 = angle + Math.PI / 3;
        const subAngle2 = angle - Math.PI / 3;
        const subLen = Math.max(2, Math.round((length - l) * 0.4));
        this.generateFrond(engine, x, y, z, subAngle1, subLen, depth + 1);
        this.generateFrond(engine, x, y, z, subAngle2, subLen, depth + 1);
      }
    }
  }

  private mushroomCluster(engine: VoxelEngine, bx: number, by: number, bz: number, scale: number): void {
    const count = randomInt(2, 5);
    const isGlowing = Math.random() < 0.25;

    for (let m = 0; m < count; m++) {
      const ox = Math.round((Math.random() - 0.5) * 3);
      const oz = Math.round((Math.random() - 0.5) * 3);
      const stemH = Math.round(randomRange(3, 6) * scale * (0.6 + Math.random() * 0.4));
      const capR = Math.round(randomRange(2, 4) * scale * (0.5 + Math.random() * 0.5));
      this.singleMushroom(engine, bx + ox, by, bz + oz, stemH, capR, isGlowing);
    }
  }

  private singleMushroom(engine: VoxelEngine, bx: number, by: number, bz: number,
    stemHeight: number, capRadius: number, glow: boolean): void {
    const stemColor = pickRandom(COLORS.mushroom.stem);
    const capColor = glow ? pickRandom(COLORS.mushroom.glow) : pickRandom(COLORS.mushroom.cap);
    const spotColor = pickRandom(COLORS.mushroom.spots);

    // Stem
    for (let y = 0; y < stemHeight; y++) {
      const width = y < stemHeight - 1 ? 1 : 0;
      setPlantVoxel(engine, bx, by + y, bz, VoxelType.MUSHROOM, varyColor(stemColor, 0.04));
      if (width > 0) {
        setPlantVoxel(engine, bx + 1, by + y, bz, VoxelType.MUSHROOM, varyColor(stemColor, 0.04));
      }
    }

    // Cap (hemisphere)
    const capY = by + stemHeight;
    for (let dx = -capRadius; dx <= capRadius; dx++) {
      for (let dz = -capRadius; dz <= capRadius; dz++) {
        for (let dy = 0; dy <= capRadius; dy++) {
          const dist = Math.sqrt(dx * dx + dz * dz + dy * dy * 2);
          if (dist > capRadius) continue;

          const x = bx + dx;
          const y = capY + dy;
          const z = bz + dz;

          // Gills: darker ring on underside
          if (dy === 0 && dist > capRadius * 0.3) {
            const gillColor = varyColor(capColor, 0.1);
            gillColor.multiplyScalar(0.5);
            setPlantVoxel(engine, x, y, z, VoxelType.MUSHROOM, gillColor);
            continue;
          }

          let color = varyColor(capColor, 0.06);

          // Spots on top
          if (dy > 0 && Math.random() < 0.12) {
            color = varyColor(spotColor, 0.03);
          }

          const vType = glow ? VoxelType.CRYSTAL : VoxelType.MUSHROOM;
          setPlantVoxel(engine, x, y, z, vType, color);
        }
      }
    }
  }

  private flower(engine: VoxelEngine, bx: number, by: number, bz: number, scale: number): void {
    const stemH = Math.round(randomRange(6, 11) * scale);
    const petalColor = pickRandom(COLORS.flower);
    const stemColor = pickRandom(COLORS.fern.slice(0, 2));

    // Stem
    for (let y = 0; y < stemH; y++) {
      setPlantVoxel(engine, bx, by + y, bz, VoxelType.PLANT, varyColor(stemColor, 0.04));
    }

    // Leaf pairs at mid-height
    const leafY = by + Math.round(stemH * 0.4);
    for (let side = -1; side <= 1; side += 2) {
      for (let l = 1; l <= 2; l++) {
        const leafC = varyColor(pickRandom(COLORS.leaf), 0.05);
        setPlantVoxel(engine, bx + side * l, leafY, bz, VoxelType.LEAF, leafC);
        setPlantVoxel(engine, bx + side * l, leafY + 1, bz, VoxelType.LEAF, leafC.clone().multiplyScalar(0.9));
      }
    }

    // Optional second leaf pair
    if (stemH > 7) {
      const leafY2 = by + Math.round(stemH * 0.65);
      for (let side = -1; side <= 1; side += 2) {
        setPlantVoxel(engine, bx, leafY2, bz + side, VoxelType.LEAF, varyColor(pickRandom(COLORS.leaf), 0.05));
        setPlantVoxel(engine, bx, leafY2 + 1, bz + side, VoxelType.LEAF, varyColor(pickRandom(COLORS.leaf), 0.05));
      }
    }

    // Bloom at top
    const bloomY = by + stemH;
    const petalR = Math.round(randomRange(2, 3) * scale);
    const petals = randomInt(5, 8);

    // Center stamen
    setPlantVoxel(engine, bx, bloomY, bz, VoxelType.FLOWER, varyColor(0xFFD700, 0.1));
    setPlantVoxel(engine, bx, bloomY + 1, bz, VoxelType.FLOWER, varyColor(0xFFD700, 0.1));

    for (let p = 0; p < petals; p++) {
      const angle = (p / petals) * Math.PI * 2;
      for (let r = 1; r <= petalR; r++) {
        const x = bx + Math.round(Math.cos(angle) * r);
        const z = bz + Math.round(Math.sin(angle) * r);
        const yOff = r === petalR ? -1 : 0; // petals droop at edges
        const pColor = varyColor(petalColor, 0.08);
        pColor.multiplyScalar(1 - r * 0.1);
        setPlantVoxel(engine, x, bloomY + yOff, z, VoxelType.FLOWER, pColor);
      }
    }
  }

  private cactus(engine: VoxelEngine, bx: number, by: number, bz: number, scale: number): void {
    const height = Math.round(randomRange(8, 15) * scale);
    const baseColors = COLORS.cactus;

    // Main body (2x2 column with ribs)
    for (let y = 0; y < height; y++) {
      const taper = y > height * 0.8 ? 1 - (y - height * 0.8) / (height * 0.2) : 1;
      if (taper <= 0) continue;

      for (let dx = 0; dx <= 1; dx++) {
        for (let dz = 0; dz <= 1; dz++) {
          // Alternating greens for rib pattern
          const ribStripe = ((dx + dz + y) % 2 === 0) ? 0.05 : -0.05;
          const color = varyColor(pickRandom(baseColors), 0.04);
          const hsl = { h: 0, s: 0, l: 0 };
          color.getHSL(hsl);
          hsl.l = Math.max(0, Math.min(1, hsl.l + ribStripe));
          color.setHSL(hsl.h, hsl.s, hsl.l);

          setPlantVoxel(engine, bx + dx, by + y, bz + dz, VoxelType.PLANT, color);
        }
      }

      // Spines (single voxel protrusions)
      if (y % 3 === 0 && y > 0 && y < height - 1) {
        const spineColor = varyColor(0xBDB76B, 0.1);
        const sides: [number, number][] = [[-1, 0], [2, 0], [0, -1], [0, 2]];
        const side = sides[y % 4];
        setPlantVoxel(engine, bx + side[0], by + y, bz + side[1], VoxelType.PLANT, spineColor);
      }
    }

    // Optional arm
    if (height > 10 && Math.random() < 0.6) {
      const armY = by + Math.round(height * 0.5);
      const armDir = Math.random() < 0.5 ? -1 : 1;
      const armLen = randomInt(2, 4);

      for (let i = 1; i <= armLen; i++) {
        const color = varyColor(pickRandom(baseColors), 0.04);
        setPlantVoxel(engine, bx + armDir * i, armY, bz, VoxelType.PLANT, color);
        setPlantVoxel(engine, bx + armDir * i, armY, bz + 1, VoxelType.PLANT, color.clone().multiplyScalar(0.95));
      }
      // Arm goes up
      for (let y = 1; y <= 3; y++) {
        const color = varyColor(pickRandom(baseColors), 0.04);
        setPlantVoxel(engine, bx + armDir * armLen, armY + y, bz, VoxelType.PLANT, color);
      }
    }

    // Small flower on top (rare)
    if (Math.random() < 0.3) {
      const flowerC = varyColor(pickRandom(COLORS.flower), 0.1);
      setPlantVoxel(engine, bx, by + height, bz, VoxelType.FLOWER, flowerC);
      setPlantVoxel(engine, bx + 1, by + height, bz, VoxelType.FLOWER, flowerC.clone().multiplyScalar(0.95));
    }
  }

  private bonsai(engine: VoxelEngine, bx: number, by: number, bz: number, scale: number): void {
    const trunkH = Math.round(randomRange(8, 13) * scale);
    const trunkColor = pickRandom(COLORS.bark);

    // Main trunk with slight lean
    const leanX = (Math.random() - 0.5) * 0.15;
    const leanZ = (Math.random() - 0.5) * 0.15;

    for (let y = 0; y < trunkH; y++) {
      const t = y / trunkH;
      const thickness = Math.max(1, Math.round((1 - t * 0.6) * 2.5 * scale));
      const ox = Math.round(leanX * y);
      const oz = Math.round(leanZ * y);

      for (let dx = 0; dx < thickness; dx++) {
        for (let dz = 0; dz < thickness; dz++) {
          const color = varyColor(trunkColor, 0.06);
          setPlantVoxel(engine, bx + ox + dx, by + y, bz + oz + dz, VoxelType.BARK, color);
        }
      }
    }

    // Exposed roots at base
    for (let r = 0; r < 4; r++) {
      const angle = (r / 4) * Math.PI * 2 + Math.random() * 0.5;
      const rootLen = randomInt(2, 4);
      for (let l = 1; l <= rootLen; l++) {
        const rx = bx + Math.round(Math.cos(angle) * l);
        const rz = bz + Math.round(Math.sin(angle) * l);
        setPlantVoxel(engine, rx, by, rz, VoxelType.BARK, varyColor(trunkColor, 0.08));
        if (l < rootLen) {
          setPlantVoxel(engine, rx, by + 1, rz, VoxelType.BARK, varyColor(trunkColor, 0.08));
        }
      }
    }

    // Branches with canopy clusters
    const branchCount = randomInt(3, 5);
    const topX = bx + Math.round(leanX * trunkH);
    const topZ = bz + Math.round(leanZ * trunkH);

    for (let b = 0; b < branchCount; b++) {
      const branchY = by + Math.round(trunkH * (0.5 + b * 0.12));
      const angle = (b / branchCount) * Math.PI * 2 + Math.random() * 0.8;
      const branchLen = randomInt(3, 6);

      // Branch
      for (let l = 1; l <= branchLen; l++) {
        const bxx = topX + Math.round(Math.cos(angle) * l);
        const bzz = topZ + Math.round(Math.sin(angle) * l);
        const byy = branchY + Math.round(l * 0.3);
        setPlantVoxel(engine, bxx, byy, bzz, VoxelType.BARK, varyColor(trunkColor, 0.06));
      }

      // Canopy cluster at end of branch
      const endX = topX + Math.round(Math.cos(angle) * branchLen);
      const endZ = topZ + Math.round(Math.sin(angle) * branchLen);
      const endY = branchY + Math.round(branchLen * 0.3);
      this.canopyCluster(engine, endX, endY, endZ, Math.round(randomRange(2, 4) * scale));
    }

    // Top canopy
    this.canopyCluster(engine, topX, by + trunkH, topZ, Math.round(randomRange(3, 5) * scale));
  }

  private canopyCluster(engine: VoxelEngine, cx: number, cy: number, cz: number, radius: number): void {
    const leafColors = COLORS.leaf;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -1; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const dist = Math.sqrt(dx * dx + dy * dy * 1.5 + dz * dz);
          if (dist > radius) continue;

          // Noise for organic shape
          const n = noise.noise3D((cx + dx) * 0.4, (cy + dy) * 0.4, (cz + dz) * 0.4);
          if (dist > radius * 0.5 && n < -0.2) continue; // organic gaps

          const color = varyColor(pickRandom(leafColors), 0.08);
          // Lighter on top
          if (dy > 0) color.multiplyScalar(1.1);
          setPlantVoxel(engine, cx + dx, cy + dy, cz + dz, VoxelType.LEAF, color);
        }
      }
    }
  }

  private vine(engine: VoxelEngine, bx: number, by: number, bz: number, scale: number): void {
    const length = Math.round(randomRange(12, 22) * scale);
    const vineColor = pickRandom(COLORS.vine);

    // Determine direction to grow (toward nearest wall)
    const halfGrid = GRID_SIZE / 2;
    const distToCenter = Math.sqrt((bx - halfGrid) ** 2 + (bz - halfGrid) ** 2);
    const angleToWall = Math.atan2(bz - halfGrid, bx - halfGrid);

    let cx = bx, cy = by, cz = bz;

    for (let i = 0; i < length; i++) {
      // Grow upward and slightly outward toward wall
      cy += 1;
      cx += Math.round(Math.cos(angleToWall) * 0.3 + (Math.random() - 0.5) * 0.5);
      cz += Math.round(Math.sin(angleToWall) * 0.3 + (Math.random() - 0.5) * 0.5);

      if (!isInsideVessel(Math.round(cx), Math.round(cy), Math.round(cz))) break;

      setPlantVoxel(engine, cx, cy, cz, VoxelType.VINE, varyColor(vineColor, 0.06));

      // Small leaf clusters at intervals
      if (i % 3 === 0 && i > 0) {
        const leafAngle = Math.random() * Math.PI * 2;
        const lx = Math.round(cx + Math.cos(leafAngle));
        const lz = Math.round(cz + Math.sin(leafAngle));
        setPlantVoxel(engine, lx, Math.round(cy), lz, VoxelType.LEAF, varyColor(pickRandom(COLORS.leaf), 0.06));
        setPlantVoxel(engine, lx, Math.round(cy) + 1, lz, VoxelType.LEAF, varyColor(pickRandom(COLORS.leaf), 0.06));
      }
    }
  }

  private pitcher(engine: VoxelEngine, bx: number, by: number, bz: number, scale: number): void {
    const height = Math.round(randomRange(8, 14) * scale);
    const maxRadius = Math.round(2.5 * scale);
    const baseColor = pickRandom(COLORS.pitcher);

    for (let y = 0; y < height; y++) {
      const t = y / height;

      // Tube shape: narrow at base, widens, narrows slightly at neck, flares at lip
      let radius: number;
      if (t < 0.3) {
        radius = 1 + t * 3; // widen from base
      } else if (t < 0.7) {
        radius = maxRadius; // main body
      } else if (t < 0.85) {
        radius = maxRadius - (t - 0.7) * 4; // neck
      } else {
        radius = maxRadius + (t - 0.85) * 6; // flared lip
      }
      radius = Math.round(Math.max(1, Math.min(radius, maxRadius + 2)));

      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > radius) continue;

          // Hollow interior (only shell voxels)
          const isShell = dist > radius - 1.5 || y < 2;

          if (!isShell && y > 1) continue;

          const x = bx + dx;
          const yy = by + y;
          const z = bz + dz;

          // Color: green-to-red gradient with veining
          const veinNoise = noise.noise3D(x * 0.8, yy * 0.3, z * 0.8);
          let color = varyColor(baseColor, 0.08);

          // Interior is darker/different color
          if (!isShell || y >= height - 2) {
            color = varyColor(0x8B0000, 0.08);
          }

          // Vein pattern
          if (veinNoise > 0.3) {
            color.multiplyScalar(0.8);
          }

          // Lip highlight
          if (t > 0.85) {
            color.lerp(new THREE.Color(0xCC3333), 0.3);
          }

          setPlantVoxel(engine, x, yy, z, VoxelType.PLANT, color);
        }
      }
    }
  }
}
