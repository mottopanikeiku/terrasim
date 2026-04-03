import * as THREE from 'three';
import { GRID_SIZE, VOXEL_SIZE, gridToWorld } from '../utils/MathUtils';
import { darkenColor } from '../utils/ColorPalette';

export enum VoxelType {
  EMPTY = 0,
  SOIL_EARTH = 1,
  SOIL_SAND = 2,
  SOIL_GRAVEL = 3,
  ROCK = 4,
  PLANT = 5,
  MOSS = 6,
  MUSHROOM = 7,
  FLOWER = 8,
  CREATURE = 9,
  CRYSTAL = 10,
  BARK = 11,
  LEAF = 12,
  VINE = 13,
  WATER = 14,
}

interface VoxelData {
  type: VoxelType;
  color: THREE.Color;
}

const TYPE_GROUPS = [
  VoxelType.SOIL_EARTH, VoxelType.SOIL_SAND, VoxelType.SOIL_GRAVEL,
  VoxelType.ROCK, VoxelType.PLANT, VoxelType.MOSS,
  VoxelType.MUSHROOM, VoxelType.FLOWER, VoxelType.CREATURE,
  VoxelType.CRYSTAL, VoxelType.BARK, VoxelType.LEAF,
  VoxelType.VINE, VoxelType.WATER,
];

export class VoxelEngine {
  private grid: Uint8Array;
  private colors: Float32Array; // r,g,b per voxel
  private scene: THREE.Scene;
  private meshes: Map<VoxelType, THREE.InstancedMesh> = new Map();
  private dirty = true;
  private voxelGeometry: THREE.BoxGeometry;
  private maxInstances = 25000;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const total = GRID_SIZE * GRID_SIZE * GRID_SIZE;
    this.grid = new Uint8Array(total);
    this.colors = new Float32Array(total * 3);

    this.voxelGeometry = new THREE.BoxGeometry(VOXEL_SIZE * 0.96, VOXEL_SIZE * 0.96, VOXEL_SIZE * 0.96);

    for (const type of TYPE_GROUPS) {
      const mat = new THREE.MeshStandardMaterial({
        roughness: this.getRoughness(type),
        metalness: this.getMetalness(type),
        vertexColors: true,
      });

      if (type === VoxelType.CRYSTAL) {
        mat.transparent = true;
        mat.opacity = 0.8;
        mat.emissive = new THREE.Color(0x333333);
      }

      if (type === VoxelType.WATER) {
        mat.transparent = true;
        mat.opacity = 0.6;
        mat.color = new THREE.Color(0x4A90D9);
      }

      const mesh = new THREE.InstancedMesh(this.voxelGeometry, mat, this.maxInstances);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.meshes.set(type, mesh);
      scene.add(mesh);
    }
  }

  private getRoughness(type: VoxelType): number {
    switch (type) {
      case VoxelType.CRYSTAL: return 0.1;
      case VoxelType.WATER: return 0.05;
      case VoxelType.ROCK: return 0.85;
      case VoxelType.SOIL_EARTH: return 0.95;
      case VoxelType.MOSS: return 0.9;
      case VoxelType.MUSHROOM: return 0.6;
      default: return 0.75;
    }
  }

  private getMetalness(type: VoxelType): number {
    switch (type) {
      case VoxelType.CRYSTAL: return 0.3;
      case VoxelType.WATER: return 0.1;
      default: return 0.0;
    }
  }

  private idx(x: number, y: number, z: number): number {
    return x + y * GRID_SIZE + z * GRID_SIZE * GRID_SIZE;
  }

  setVoxel(x: number, y: number, z: number, type: VoxelType, color: THREE.Color): void {
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return;
    const i = this.idx(x, y, z);
    this.grid[i] = type;
    this.colors[i * 3] = color.r;
    this.colors[i * 3 + 1] = color.g;
    this.colors[i * 3 + 2] = color.b;
    this.dirty = true;
  }

  getVoxel(x: number, y: number, z: number): VoxelType {
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return VoxelType.EMPTY;
    return this.grid[this.idx(x, y, z)];
  }

  getVoxelColor(x: number, y: number, z: number): THREE.Color {
    const i = this.idx(x, y, z);
    return new THREE.Color(this.colors[i * 3], this.colors[i * 3 + 1], this.colors[i * 3 + 2]);
  }

  removeVoxel(x: number, y: number, z: number): void {
    this.setVoxel(x, y, z, VoxelType.EMPTY, new THREE.Color(0));
  }

  // Check if a voxel is fully surrounded (all 6 neighbors filled)
  private isOccluded(x: number, y: number, z: number): boolean {
    return (
      this.getVoxel(x + 1, y, z) !== VoxelType.EMPTY &&
      this.getVoxel(x - 1, y, z) !== VoxelType.EMPTY &&
      this.getVoxel(x, y + 1, z) !== VoxelType.EMPTY &&
      this.getVoxel(x, y - 1, z) !== VoxelType.EMPTY &&
      this.getVoxel(x, y, z + 1) !== VoxelType.EMPTY &&
      this.getVoxel(x, y, z - 1) !== VoxelType.EMPTY
    );
  }

  // Count filled neighbors for AO
  private countNeighbors(x: number, y: number, z: number): number {
    let count = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          if (this.getVoxel(x + dx, y + dy, z + dz) !== VoxelType.EMPTY) count++;
        }
      }
    }
    return count;
  }

  rebuild(): void {
    if (!this.dirty) return;
    this.dirty = false;

    const dummy = new THREE.Object3D();
    const tempColor = new THREE.Color();

    // Per-type instance data collection
    const typeData: Map<VoxelType, { matrices: THREE.Matrix4[]; colors: THREE.Color[] }> = new Map();
    for (const type of TYPE_GROUPS) {
      typeData.set(type, { matrices: [], colors: [] });
    }

    for (let z = 0; z < GRID_SIZE; z++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const type = this.grid[this.idx(x, y, z)] as VoxelType;
          if (type === VoxelType.EMPTY) continue;

          // Face culling — skip fully surrounded voxels
          if (this.isOccluded(x, y, z)) continue;

          const pos = gridToWorld(x, y, z);
          dummy.position.copy(pos);
          dummy.updateMatrix();

          const i = this.idx(x, y, z);
          tempColor.setRGB(this.colors[i * 3], this.colors[i * 3 + 1], this.colors[i * 3 + 2]);

          // Baked AO
          const neighbors = this.countNeighbors(x, y, z);
          const aoFactor = neighbors / 26;
          const darkenAmount = aoFactor * 0.35;
          const aoColor = darkenColor(tempColor, darkenAmount);

          const data = typeData.get(type);
          if (data && data.matrices.length < this.maxInstances) {
            data.matrices.push(dummy.matrix.clone());
            data.colors.push(aoColor.clone());
          }
        }
      }
    }

    // Apply to instanced meshes
    for (const type of TYPE_GROUPS) {
      const mesh = this.meshes.get(type)!;
      const data = typeData.get(type)!;
      mesh.count = data.matrices.length;

      for (let i = 0; i < data.matrices.length; i++) {
        mesh.setMatrixAt(i, data.matrices[i]);
        mesh.setColorAt(i, data.colors[i]);
      }

      if (mesh.count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  markDirty(): void {
    this.dirty = true;
  }

  // Get instanced mesh for raycasting
  getMeshes(): THREE.InstancedMesh[] {
    return Array.from(this.meshes.values());
  }

  // Serialize for save/load
  serialize(): { grid: number[]; colors: number[] } {
    return {
      grid: Array.from(this.grid),
      colors: Array.from(this.colors),
    };
  }

  deserialize(data: { grid: number[]; colors: number[] }): void {
    this.grid.set(data.grid);
    this.colors.set(data.colors);
    this.dirty = true;
  }

  clear(): void {
    this.grid.fill(0);
    this.colors.fill(0);
    this.dirty = true;
  }

  // Find the top-most filled voxel at (x, z)
  getTopVoxelY(x: number, z: number): number {
    for (let y = GRID_SIZE - 1; y >= 0; y--) {
      if (this.getVoxel(x, y, z) !== VoxelType.EMPTY) return y;
    }
    return -1;
  }
}
