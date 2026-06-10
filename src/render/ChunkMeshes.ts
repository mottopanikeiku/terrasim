import * as THREE from 'three';
import { NCX, NCZ } from '../core/Grid';
import { MeshResult } from './SurfaceNets';

// One mesh per render chunk, lazily allocated and grown with hysteresis so
// stable chunks never reallocate and empty chunks cost nothing.
export class ChunkMeshes {
  private meshes: (THREE.Mesh | null)[] = new Array(NCX * NCZ).fill(null);
  private capV = new Int32Array(NCX * NCZ);
  private capI = new Int32Array(NCX * NCZ);

  constructor(
    private scene: THREE.Scene,
    private material: THREE.Material,
    private shadows: boolean,
    private renderOrder = 0
  ) {}

  write(c: number, res: MeshResult): void {
    const mesh = this.meshes[c];
    if (res.iCount === 0) {
      if (mesh) mesh.geometry.setDrawRange(0, 0);
      return;
    }

    if (!mesh || this.capV[c] < res.vCount || this.capI[c] < res.iCount) {
      const capV = Math.ceil(res.vCount * 1.4) + 64;
      const capI = Math.ceil(res.iCount * 1.4) + 96;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capV * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(capV * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(capV * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(capI), 1).setUsage(THREE.DynamicDrawUsage));
      if (mesh) {
        mesh.geometry.dispose();
        mesh.geometry = geo;
      } else {
        const m = new THREE.Mesh(geo, this.material);
        m.castShadow = this.shadows;
        m.receiveShadow = this.shadows;
        m.frustumCulled = false;
        m.renderOrder = this.renderOrder;
        m.raycast = () => {}; // picking uses grid DDA
        this.scene.add(m);
        this.meshes[c] = m;
      }
      this.capV[c] = capV;
      this.capI[c] = capI;
    }

    const geo = this.meshes[c]!.geometry;
    (geo.attributes.position.array as Float32Array).set(res.pos.subarray(0, res.vCount * 3));
    (geo.attributes.normal.array as Float32Array).set(res.nor.subarray(0, res.vCount * 3));
    (geo.attributes.color.array as Float32Array).set(res.col.subarray(0, res.vCount * 3));
    (geo.index!.array as Uint32Array).set(res.idx.subarray(0, res.iCount));
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.index!.needsUpdate = true;
    geo.setDrawRange(0, res.iCount);
  }
}
