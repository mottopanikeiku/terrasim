import * as THREE from 'three';
import { W, D, V, cellToWorld } from '../core/constants';
import { Grid } from '../core/Grid';
import { Simulation } from '../core/Simulation';

interface Isopod {
  group: THREE.Group;
  pos: THREE.Vector2; // grid-space x,z (floats)
  target: THREE.Vector2;
  pause: number;
  speed: number;
  wobble: number;
}

// The cleanup crew: isopods wander the terrain and nibble dead plant
// matter (real bioactive terrariums use them for exactly this), plus
// fireflies that drift above the plants at night.
export class Critters {
  private isopods: Isopod[] = [];
  private fireflies: THREE.Points;
  private fireflyPhase: Float32Array;
  private fireflyVisible = 0;

  constructor(scene: THREE.Scene, private grid: Grid, private sim: Simulation, count = 3) {
    for (let n = 0; n < count; n++) {
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.55 });
      const shellMat = new THREE.MeshStandardMaterial({ color: 0x5d5650, roughness: 0.45 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), bodyMat);
      body.scale.set(1.5, 0.7, 1);
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), shellMat);
      shell.scale.set(1.2, 0.6, 0.95);
      shell.position.set(-0.02, 0.03, 0);
      group.add(body, shell);
      group.castShadow = true;
      scene.add(group);

      const pos = new THREE.Vector2(8 + Math.random() * (W - 16), 8 + Math.random() * (D - 16));
      this.isopods.push({
        group,
        pos,
        target: pos.clone(),
        pause: Math.random() * 2,
        speed: 2.2 + Math.random() * 1.4, // cells/sec
        wobble: Math.random() * 10,
      });
    }

    // Fireflies
    const n = 14;
    const positions = new Float32Array(n * 3);
    this.fireflyPhase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = (Math.random() - 0.5) * W * 0.8 * V;
      positions[i * 3 + 1] = 4 + Math.random() * 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * D * 0.8 * V;
      this.fireflyPhase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.fireflies = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffd97a,
      size: 0.14,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    scene.add(this.fireflies);
  }

  update(dt: number, time: number, night: boolean): void {
    // --- isopods ---
    for (const iso of this.isopods) {
      iso.wobble += dt * 14;
      if (iso.pause > 0) {
        iso.pause -= dt;
      } else {
        const delta = iso.target.clone().sub(iso.pos);
        const dist = delta.length();
        if (dist < 0.4) {
          // Arrived: nibble any dead plant here, then pick a new destination —
          // preferring carrion within sniffing range (the cleanup crew at work).
          this.sim.nibbleDeadAt(Math.round(iso.pos.x), Math.round(iso.pos.y), 2);
          iso.pause = 0.6 + Math.random() * 2.4;
          const dead = this.sim.findDeadPlantNear(Math.round(iso.pos.x), Math.round(iso.pos.y), 26);
          if (dead) {
            iso.target.set(dead.x + (Math.random() - 0.5), dead.z + (Math.random() - 0.5));
          } else {
            const wander = 6 + Math.random() * 16;
            const ang = Math.random() * Math.PI * 2;
            iso.target.set(
              Math.min(W - 4, Math.max(3, iso.pos.x + Math.cos(ang) * wander)),
              Math.min(D - 4, Math.max(3, iso.pos.y + Math.sin(ang) * wander))
            );
          }
        } else {
          delta.normalize().multiplyScalar(Math.min(dist, iso.speed * dt));
          iso.pos.add(delta);
          iso.group.rotation.y = Math.atan2(-delta.y, delta.x);
        }
      }
      // Stick to the terrain surface; avoid swimming.
      const gx = Math.round(iso.pos.x), gz = Math.round(iso.pos.y);
      let top = this.grid.top(gx, gz);
      if (top < 0) top = 0;
      if (this.grid.get(gx, top, gz) === 5 /* WATER */) {
        // Back away from the pond edge.
        iso.target.set(W / 2 + (Math.random() - 0.5) * 20, D / 2 + (Math.random() - 0.5) * 10);
      }
      const [wx, , wz] = cellToWorld(gx, top, gz);
      const surfaceY = (top + 1) * V;
      iso.group.position.set(
        wx + (iso.pos.x - gx) * V,
        surfaceY + 0.04 + Math.sin(iso.wobble) * 0.006,
        wz + (iso.pos.y - gz) * V
      );
    }

    // --- fireflies ---
    const targetVis = night ? 1 : 0;
    this.fireflyVisible += (targetVis - this.fireflyVisible) * Math.min(1, dt * 1.5);
    const mat = this.fireflies.material as THREE.PointsMaterial;
    mat.opacity = this.fireflyVisible * (0.55 + Math.sin(time * 2.2) * 0.3);
    this.fireflies.visible = this.fireflyVisible > 0.02;
    if (this.fireflies.visible) {
      const pos = this.fireflies.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const ph = this.fireflyPhase[i];
        pos.setX(i, pos.getX(i) + Math.sin(time * 0.5 + ph) * 0.004);
        pos.setY(i, 3.5 + Math.sin(time * 0.35 + ph * 2) * 1.6);
        pos.setZ(i, pos.getZ(i) + Math.cos(time * 0.4 + ph) * 0.004);
      }
      pos.needsUpdate = true;
    }
  }
}
