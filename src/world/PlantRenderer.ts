import * as THREE from 'three';
import { cellToWorld } from '../core/constants';
import { Simulation } from '../core/Simulation';
import { buildPlantGeometry } from './PlantMeshes';
import { Plant } from './Plants';

interface Visual {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  phase: number;
  displayStage: number;
  tint: THREE.Color;
  droop: number;
  dying: boolean;
}

const TINT_HEALTHY = new THREE.Color(1, 1, 1);
const TINT_WILT = new THREE.Color(1.0, 0.82, 0.5);
const TINT_DEAD = new THREE.Color(0.55, 0.4, 0.26);

// Bridges the simulation's plant list to smooth animated meshes: continuous
// growth scaling, idle sway, wilt tint + droop, and a shrink-out on death.
export class PlantRenderer {
  private visuals = new Map<number, Visual>();

  constructor(private scene: THREE.Scene, private sim: Simulation) {}

  update(dt: number, time: number): void {
    const plants = this.sim.getPlants();
    const seen = new Set<number>();

    for (const p of plants) {
      seen.add(p.id);
      let v = this.visuals.get(p.id);
      if (!v) {
        v = this.create(p);
        this.visuals.set(p.id, v);
      }

      // Smoothly approach the simulated growth stage.
      v.displayStage += (p.stage - v.displayStage) * Math.min(1, dt * 1.5);
      const s = 0.14 + 0.86 * v.displayStage;
      const squash = p.look === 2 ? 0.85 : 1;
      v.mesh.scale.set(s, s * squash, s);

      // Health look: tint + droop.
      const targetTint = p.look === 0 ? TINT_HEALTHY : p.look === 1 ? TINT_WILT : TINT_DEAD;
      v.tint.lerp(targetTint, Math.min(1, dt * 2));
      v.mat.color.copy(v.tint);
      const targetDroop = p.look === 0 ? 0 : p.look === 1 ? 0.12 : 0.3;
      v.droop += (targetDroop - v.droop) * Math.min(1, dt);

      // Idle sway, calmer for wilted plants.
      const sway = Math.sin(time * 1.1 + v.phase) * 0.025 * (p.look === 0 ? 1 : 0.4);
      v.mesh.rotation.z = sway + v.droop;
      v.mesh.rotation.x = Math.cos(time * 0.9 + v.phase * 1.7) * 0.015;
    }

    // Plants gone from the sim shrink away and are disposed.
    for (const [id, v] of this.visuals) {
      if (seen.has(id)) continue;
      v.dying = true;
      v.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 2.5));
      if (v.mesh.scale.x < 0.02) {
        this.scene.remove(v.mesh);
        v.mesh.geometry.dispose();
        v.mat.dispose();
        this.visuals.delete(id);
      }
    }
  }

  private create(p: Plant): Visual {
    const geo = buildPlantGeometry(p.species, p.seed);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const [wx, wy, wz] = cellToWorld(p.x, p.y, p.z);
    mesh.position.set(wx, wy - 0.12, wz); // base slightly into the soil
    mesh.castShadow = true;
    this.scene.add(mesh);
    return {
      mesh,
      mat,
      phase: Math.random() * Math.PI * 2,
      displayStage: 0,
      tint: TINT_HEALTHY.clone(),
      droop: 0,
      dying: false,
    };
  }

  // Full reset (used when the world is rebuilt/loaded).
  clear(): void {
    for (const [, v] of this.visuals) {
      this.scene.remove(v.mesh);
      v.mesh.geometry.dispose();
      v.mat.dispose();
    }
    this.visuals.clear();
  }
}
