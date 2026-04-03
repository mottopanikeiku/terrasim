import * as THREE from 'three';
import { VoxelEngine, VoxelType } from '../core/VoxelEngine';
import { isInsideVessel } from '../utils/MathUtils';
import { COLORS, varyColor, pickRandom } from '../utils/ColorPalette';

export type CreatureType = 'snail' | 'ladybug' | 'butterfly' | 'frog';

function set(engine: VoxelEngine, x: number, y: number, z: number, color: THREE.Color) {
  x = Math.round(x);
  y = Math.round(y);
  z = Math.round(z);
  if (isInsideVessel(x, y, z)) {
    engine.setVoxel(x, y, z, VoxelType.CREATURE, color);
  }
}

export class CreatureSystem {
  generate(engine: VoxelEngine, type: CreatureType, bx: number, by: number, bz: number, facing: number = 0): void {
    switch (type) {
      case 'snail': this.snail(engine, bx, by, bz, facing); break;
      case 'ladybug': this.ladybug(engine, bx, by, bz, facing); break;
      case 'butterfly': this.butterfly(engine, bx, by, bz); break;
      case 'frog': this.frog(engine, bx, by, bz, facing); break;
    }
  }

  private snail(engine: VoxelEngine, bx: number, by: number, bz: number, facing: number): void {
    const shellColor = pickRandom(COLORS.creature.snailShell);
    const bodyColor = pickRandom(COLORS.creature.snailBody);

    const dx = Math.round(Math.cos(facing));
    const dz = Math.round(Math.sin(facing));
    const px = -dz; // perpendicular
    const pz = dx;

    // Body (elongated, flat)
    set(engine, bx, by, bz, varyColor(bodyColor, 0.05));
    set(engine, bx + dx, by, bz + dz, varyColor(bodyColor, 0.05));
    set(engine, bx + dx * 2, by, bz + dz * 2, varyColor(bodyColor, 0.05));

    // Head
    set(engine, bx + dx * 3, by, bz + dz * 3, varyColor(bodyColor, 0.03));
    // Antennae
    set(engine, bx + dx * 3 + px, by + 1, bz + dz * 3 + pz, varyColor(bodyColor, 0.03));
    set(engine, bx + dx * 3 - px, by + 1, bz + dz * 3 - pz, varyColor(bodyColor, 0.03));
    set(engine, bx + dx * 3 + px, by + 2, bz + dz * 3 + pz, varyColor(bodyColor, 0.03));
    set(engine, bx + dx * 3 - px, by + 2, bz + dz * 3 - pz, varyColor(bodyColor, 0.03));

    // Shell (spiral-ish dome)
    const sc = varyColor(shellColor, 0.06);
    set(engine, bx, by + 1, bz, sc.clone());
    set(engine, bx + dx, by + 1, bz + dz, sc.clone().multiplyScalar(0.95));
    set(engine, bx - dx, by + 1, bz - dz, sc.clone().multiplyScalar(0.9));
    set(engine, bx + px, by + 1, bz + pz, sc.clone().multiplyScalar(0.92));
    set(engine, bx - px, by + 1, bz - pz, sc.clone().multiplyScalar(0.88));
    // Top of shell
    set(engine, bx, by + 2, bz, sc.clone().multiplyScalar(0.85));
    set(engine, bx - dx, by + 2, bz - dz, sc.clone().multiplyScalar(0.8));
    // Spiral accent (darker)
    set(engine, bx, by + 3, bz, varyColor(shellColor, 0.1).multiplyScalar(0.7));
  }

  private ladybug(engine: VoxelEngine, bx: number, by: number, bz: number, facing: number): void {
    const bodyColor = pickRandom(COLORS.creature.ladybug);
    const spotColor = new THREE.Color(COLORS.creature.ladybugSpots[0]);

    const dx = Math.round(Math.cos(facing));
    const dz = Math.round(Math.sin(facing));
    const px = -dz;
    const pz = dx;

    // Body (3x2x2 rounded)
    set(engine, bx, by, bz, varyColor(bodyColor, 0.03));
    set(engine, bx + dx, by, bz + dz, varyColor(bodyColor, 0.03));
    set(engine, bx + px, by, bz + pz, varyColor(bodyColor, 0.03));
    set(engine, bx - px, by, bz - pz, varyColor(bodyColor, 0.03));
    set(engine, bx + dx + px, by, bz + dz + pz, varyColor(bodyColor, 0.03));
    set(engine, bx + dx - px, by, bz + dz - pz, varyColor(bodyColor, 0.03));

    // Top (domed)
    set(engine, bx, by + 1, bz, varyColor(bodyColor, 0.03));
    set(engine, bx + dx, by + 1, bz + dz, varyColor(bodyColor, 0.03));

    // Head (black)
    set(engine, bx - dx, by, bz - dz, new THREE.Color(0x222222));
    set(engine, bx - dx, by + 1, bz - dz, new THREE.Color(0x222222));

    // Spots
    set(engine, bx + px, by + 1, bz + pz, spotColor.clone());
    set(engine, bx - px, by + 1, bz - pz, spotColor.clone());

    // Center line (dark)
    set(engine, bx + dx, by + 1, bz + dz, new THREE.Color(0x111111));
  }

  private butterfly(engine: VoxelEngine, bx: number, by: number, bz: number): void {
    const wingColor = pickRandom(COLORS.creature.butterfly);
    const accentColor = pickRandom(COLORS.creature.butterfly.filter(c => c !== wingColor));

    // Body (vertical, thin)
    set(engine, bx, by, bz, new THREE.Color(0x222222));
    set(engine, bx, by + 1, bz, new THREE.Color(0x333333));
    set(engine, bx, by + 2, bz, new THREE.Color(0x222222));

    // Wings (symmetric, spread)
    const wc = varyColor(wingColor, 0.08);
    const ac = varyColor(accentColor, 0.08);

    // Left wing
    set(engine, bx - 1, by + 1, bz, wc.clone());
    set(engine, bx - 2, by + 1, bz, wc.clone().multiplyScalar(0.9));
    set(engine, bx - 1, by + 2, bz, wc.clone());
    set(engine, bx - 2, by + 2, bz, ac.clone());
    set(engine, bx - 1, by, bz, wc.clone().multiplyScalar(0.85));
    set(engine, bx - 2, by, bz, wc.clone().multiplyScalar(0.8));

    // Right wing (mirror)
    set(engine, bx + 1, by + 1, bz, wc.clone());
    set(engine, bx + 2, by + 1, bz, wc.clone().multiplyScalar(0.9));
    set(engine, bx + 1, by + 2, bz, wc.clone());
    set(engine, bx + 2, by + 2, bz, ac.clone());
    set(engine, bx + 1, by, bz, wc.clone().multiplyScalar(0.85));
    set(engine, bx + 2, by, bz, wc.clone().multiplyScalar(0.8));

    // Antennae
    set(engine, bx, by + 3, bz, new THREE.Color(0x333333));
    set(engine, bx - 1, by + 4, bz, new THREE.Color(0x444444));
    set(engine, bx + 1, by + 4, bz, new THREE.Color(0x444444));
  }

  private frog(engine: VoxelEngine, bx: number, by: number, bz: number, facing: number): void {
    const bodyColors = COLORS.creature.frog;
    const mainColor = pickRandom(bodyColors.slice(0, 3));
    const isPoison = Math.random() < 0.3;

    const dx = Math.round(Math.cos(facing));
    const dz = Math.round(Math.sin(facing));
    const px = -dz;
    const pz = dx;

    const mc = varyColor(mainColor, 0.05);

    // Body (3x2x3)
    set(engine, bx, by, bz, mc.clone());
    set(engine, bx + dx, by, bz + dz, mc.clone());
    set(engine, bx - dx, by, bz - dz, mc.clone());
    set(engine, bx + px, by, bz + pz, mc.clone().multiplyScalar(0.95));
    set(engine, bx - px, by, bz - pz, mc.clone().multiplyScalar(0.95));

    // Top
    set(engine, bx, by + 1, bz, mc.clone().multiplyScalar(1.05));
    set(engine, bx + dx, by + 1, bz + dz, mc.clone().multiplyScalar(1.05));

    // Eyes (bulging)
    set(engine, bx + dx + px, by + 1, bz + dz + pz, new THREE.Color(0xFFFF00));
    set(engine, bx + dx - px, by + 1, bz + dz - pz, new THREE.Color(0xFFFF00));
    set(engine, bx + dx + px, by + 2, bz + dz + pz, new THREE.Color(0x111111)); // pupils
    set(engine, bx + dx - px, by + 2, bz + dz - pz, new THREE.Color(0x111111));

    // Front legs
    set(engine, bx + dx * 2 + px, by, bz + dz * 2 + pz, mc.clone().multiplyScalar(0.85));
    set(engine, bx + dx * 2 - px, by, bz + dz * 2 - pz, mc.clone().multiplyScalar(0.85));

    // Back legs (longer)
    set(engine, bx - dx + px * 2, by, bz - dz + pz * 2, mc.clone().multiplyScalar(0.85));
    set(engine, bx - dx - px * 2, by, bz - dz - pz * 2, mc.clone().multiplyScalar(0.85));

    // Poison dart markings
    if (isPoison) {
      const accentColor = pickRandom(bodyColors.slice(3));
      set(engine, bx, by + 1, bz, varyColor(accentColor, 0.1));
      set(engine, bx + px, by, bz + pz, varyColor(accentColor, 0.1));
      set(engine, bx - px, by, bz - pz, varyColor(accentColor, 0.1));
    }
  }
}
