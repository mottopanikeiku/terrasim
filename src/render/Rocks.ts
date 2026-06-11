import * as THREE from 'three';
import { W, D, V } from '../core/constants';
import { World, Rock } from '../core/World';
import { PALETTE, RANGES } from '../core/palette';

// Rocks are decorative meshes that sit on the terrain: low-poly nuggets
// with per-vertex displacement so no two look alike. They re-seat on the
// ground each frame, so pours half-bury them naturally.

function rockGeometry(seed: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  // Displace vertices by a stable per-direction hash (seam-safe).
  const seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let m = seen.get(key);
    if (m === undefined) {
      m = 0.78 + rand() * 0.45;
      seen.set(key, m);
    }
    pos.setXYZ(i, pos.getX(i) * m, pos.getY(i) * m * 0.72, pos.getZ(i) * m);
  }
  geo.computeVertexNormals();
  return geo;
}

export class Rocks {
  private meshes = new Map<Rock, THREE.Mesh>();

  constructor(private scene: THREE.Scene, private world: World) {}

  update(): void {
    const live = new Set(this.world.rocks);
    // Remove meshes for rocks that were dug away.
    for (const [rock, mesh] of this.meshes) {
      if (!live.has(rock)) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.scene.remove(mesh);
        this.meshes.delete(rock);
      }
    }
    for (const rock of this.world.rocks) {
      let mesh = this.meshes.get(rock);
      if (!mesh) {
        const r = RANGES.rock;
        const color = PALETTE[r.start + (rock.seed % r.count)];
        mesh = new THREE.Mesh(
          rockGeometry(rock.seed),
          new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02, envMapIntensity: 0.45 })
        );
        mesh.scale.setScalar(rock.scale);
        mesh.rotation.y = (rock.seed % 628) / 100;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.meshes.set(rock, mesh);
      }
      // Seat on (slightly into) the ground; pours can half-bury it.
      const wx = (rock.x - W / 2) * V;
      const wz = (rock.z - D / 2) * V;
      mesh.position.set(wx, this.world.groundWorldYf(rock.x, rock.z) + rock.scale * 0.42, wz);
    }
  }
}
