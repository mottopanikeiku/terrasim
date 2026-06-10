import * as THREE from 'three';
import { TANK_W, TANK_H, TANK_D } from '../core/constants';

const COUNT = 18;

// Droplet streaks that form on the inside of the glass when humidity is
// high and slowly run down — the classic terrarium "fogged glass" tell.
export class Condensation {
  private drops: { mesh: THREE.Mesh; speed: number; wall: number }[] = [];
  private mat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.MeshBasicMaterial({
      color: 0xcfe8f5,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(0.05, 0.22);
    for (let i = 0; i < COUNT; i++) {
      const mesh = new THREE.Mesh(geo, this.mat);
      const wall = (Math.random() * 3) | 0; // 0 front, 1 left, 2 right
      this.placeOnWall(mesh, wall, true);
      mesh.renderOrder = 5;
      scene.add(mesh);
      this.drops.push({ mesh, speed: 0.08 + Math.random() * 0.18, wall });
    }
  }

  private placeOnWall(mesh: THREE.Mesh, wall: number, randomY: boolean): void {
    const inset = 0.03;
    const y = randomY ? TANK_H * (0.45 + Math.random() * 0.5) : TANK_H * (0.8 + Math.random() * 0.18);
    if (wall === 0) {
      mesh.position.set((Math.random() - 0.5) * TANK_W * 0.94, y, TANK_D / 2 - inset);
      mesh.rotation.y = 0;
    } else if (wall === 1) {
      mesh.position.set(-TANK_W / 2 + inset, y, (Math.random() - 0.5) * TANK_D * 0.9);
      mesh.rotation.y = Math.PI / 2;
    } else {
      mesh.position.set(TANK_W / 2 - inset, y, (Math.random() - 0.5) * TANK_D * 0.9);
      mesh.rotation.y = -Math.PI / 2;
    }
  }

  update(dt: number, humidity: number): void {
    const target = humidity > 58 ? Math.min(0.5, (humidity - 58) / 50) : 0;
    this.mat.opacity += (target - this.mat.opacity) * Math.min(1, dt * 2);
    if (this.mat.opacity < 0.02) return;
    for (const d of this.drops) {
      d.mesh.position.y -= d.speed * dt;
      d.mesh.position.x += Math.sin(d.mesh.position.y * 8) * 0.0015;
      if (d.mesh.position.y < 0.4) this.placeOnWall(d.mesh, d.wall, false);
    }
  }
}
