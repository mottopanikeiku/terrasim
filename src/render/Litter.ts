import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { W, D, V } from '../core/constants';
import { World } from '../core/World';
import { mulberry32 } from '../core/random';

// Fallen-leaf litter: small curled oval leaves scattered on the surface.
// One merged mesh, rebuilt when litter changes and re-seated periodically
// so leaves keep riding the terrain.

const BROWNS = [0x8a5f33, 0x9a6b38, 0x7a522c, 0xa87f4a, 0x6e4b28];

export class Litter {
  private mesh: THREE.Mesh | null = null;
  private mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.2,
  });
  private reseat = 0;

  constructor(private scene: THREE.Scene, private world: World) {}

  update(dt: number): void {
    this.reseat -= dt;
    if (!this.world.litterDirty && this.reseat > 0) return;
    this.world.litterDirty = false;
    this.reseat = 1.5;
    this.rebuild();
  }

  private rebuild(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.world.litter.length === 0) return;

    const parts: THREE.BufferGeometry[] = [];
    const c = new THREE.Color();
    for (const lp of this.world.litter) {
      const rand = mulberry32(lp.seed);
      const len = 0.14 + rand() * 0.1;
      const leaf = new THREE.PlaneGeometry(len * 0.55, len, 2, 3);
      const pos = leaf.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const t = pos.getY(i) / len + 0.5;
        const profile = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
        pos.setX(i, pos.getX(i) * (0.2 + profile * 0.8));
        pos.setZ(i, Math.abs(pos.getX(i)) * 0.8 + (t - 0.5) * (t - 0.5) * 0.16); // curl
      }
      leaf.computeVertexNormals();
      c.set(BROWNS[(lp.seed >>> 4) % BROWNS.length]).convertSRGBToLinear();
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const f = 0.85 + ((lp.seed >>> (i % 8)) & 3) * 0.06;
        colors[i * 3] = c.r * f; colors[i * 3 + 1] = c.g * f; colors[i * 3 + 2] = c.b * f;
      }
      leaf.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      leaf.rotateX(-Math.PI / 2 + (rand() - 0.5) * 0.3);
      leaf.rotateY(rand() * Math.PI * 2);
      leaf.translate(
        (lp.x - W / 2 + 0.5) * V,
        this.world.groundWorldYf(lp.x, lp.z) + 0.015,
        (lp.z - D / 2 + 0.5) * V
      );
      parts.push(leaf);
    }
    const geo = mergeGeometries(parts)!;
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.scene.add(this.mesh);
  }
}
