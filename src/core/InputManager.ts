import * as THREE from 'three';
import { VoxelEngine, VoxelType } from './VoxelEngine';
import { GRID_SIZE, VOXEL_SIZE, worldToGrid, gridToWorld, isInsideVessel } from '../utils/MathUtils';
import { varyColor, pickRandom, COLORS } from '../utils/ColorPalette';
import { PlantGenerator, PlantType } from '../terrarium/PlantGenerator';
import { CreatureSystem, CreatureType } from '../terrarium/CreatureSystem';
import { MossSystem } from '../terrarium/MossSystem';
import { SoilSystem } from '../terrarium/SoilSystem';
import { RockGenerator } from '../terrarium/RockGenerator';

export type ToolType =
  | 'soil' | 'rock' | 'moss' | 'eraser'
  | PlantType | CreatureType;

export class InputManager {
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private camera: THREE.Camera;
  private engine: VoxelEngine;
  private scene: THREE.Scene;
  private canvas: HTMLCanvasElement;

  private ghostMesh: THREE.Mesh | null = null;
  private ghostVisible = false;

  public currentTool: ToolType = 'succulent';
  public onPlacement?: () => void;

  private plantGen = new PlantGenerator();
  private creatureGen = new CreatureSystem();
  private mossGen = new MossSystem();
  private soilSystem = new SoilSystem();
  private rockGen = new RockGenerator();

  private interactionPlane: THREE.Mesh;
  private isOverUI = false;

  constructor(camera: THREE.Camera, engine: VoxelEngine, scene: THREE.Scene, canvas: HTMLCanvasElement) {
    this.camera = camera;
    this.engine = engine;
    this.scene = scene;
    this.canvas = canvas;

    // Invisible interaction plane for raycasting when clicking empty space
    const planeGeo = new THREE.PlaneGeometry(GRID_SIZE * VOXEL_SIZE * 2, GRID_SIZE * VOXEL_SIZE * 2);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    this.interactionPlane = new THREE.Mesh(planeGeo, planeMat);
    this.interactionPlane.rotation.x = -Math.PI / 2;
    this.interactionPlane.position.y = 5; // soil level roughly
    scene.add(this.interactionPlane);

    // Ghost preview
    const ghostGeo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    this.ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
    this.ghostMesh.visible = false;
    scene.add(this.ghostMesh);

    canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    canvas.addEventListener('click', this.onClick.bind(this));
    canvas.addEventListener('contextmenu', this.onRightClick.bind(this));
    canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
  }

  setOverUI(over: boolean): void {
    this.isOverUI = over;
    if (over && this.ghostMesh) this.ghostMesh.visible = false;
  }

  private updateMouse(e: MouseEvent | Touch): void {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  private raycastVoxels(): { point: THREE.Vector3; gridPos: [number, number, number]; normal: THREE.Vector3 } | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Raycast against existing voxel meshes
    const meshes = this.engine.getMeshes();
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const normal = hit.face?.normal ?? new THREE.Vector3(0, 1, 0);
      const worldNormal = normal.clone().transformDirection(hit.object.matrixWorld);

      // Place on the face of the hit voxel
      const placePoint = hit.point.clone().add(worldNormal.multiplyScalar(VOXEL_SIZE * 0.5));
      const gridPos = worldToGrid(placePoint);

      return { point: placePoint, gridPos, normal: worldNormal };
    }

    // Fallback: hit the interaction plane
    const planeHits = this.raycaster.intersectObject(this.interactionPlane, false);
    if (planeHits.length > 0) {
      const gridPos = worldToGrid(planeHits[0].point);
      return { point: planeHits[0].point, gridPos, normal: new THREE.Vector3(0, 1, 0) };
    }

    return null;
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.isOverUI) return;
    this.updateMouse(e);

    const hit = this.raycastVoxels();
    if (hit && this.ghostMesh) {
      const pos = gridToWorld(...hit.gridPos);
      this.ghostMesh.position.copy(pos);
      this.ghostMesh.visible = true;
    } else if (this.ghostMesh) {
      this.ghostMesh.visible = false;
    }
  }

  private onClick(e: MouseEvent): void {
    if (this.isOverUI) return;
    this.updateMouse(e);
    this.place();
  }

  private onRightClick(e: MouseEvent): void {
    e.preventDefault();
    if (this.isOverUI) return;
    this.updateMouse(e);
    this.remove();
  }

  private onTouchEnd(e: TouchEvent): void {
    if (this.isOverUI) return;
    if (e.changedTouches.length > 0) {
      this.updateMouse(e.changedTouches[0]);
      this.place();
    }
  }

  private place(): void {
    const hit = this.raycastVoxels();
    if (!hit) return;

    const [gx, gy, gz] = hit.gridPos;
    if (!isInsideVessel(gx, gy, gz)) return;

    const tool = this.currentTool;

    switch (tool) {
      case 'soil': {
        const color = varyColor(pickRandom(COLORS.soil.earth), 0.06);
        this.engine.setVoxel(gx, gy, gz, VoxelType.SOIL_EARTH, color);
        break;
      }
      case 'rock': {
        this.rockGen.generate(this.engine, {
          cx: gx, cy: gy, cz: gz,
          rx: 2, ry: 2, rz: 2,
          hasLichen: Math.random() < 0.3,
        });
        break;
      }
      case 'moss': {
        this.mossGen.generate(this.engine, gx, gy, gz, 20);
        break;
      }
      case 'eraser': {
        // Remove a 3x3x3 area
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
              this.engine.removeVoxel(gx + dx, gy + dy, gz + dz);
            }
          }
        }
        break;
      }
      case 'succulent':
      case 'fern':
      case 'mushroom':
      case 'flower':
      case 'cactus':
      case 'bonsai':
      case 'vine':
      case 'pitcher':
        this.plantGen.generate(this.engine, tool, gx, gy, gz);
        break;
      case 'snail':
      case 'ladybug':
      case 'butterfly':
      case 'frog':
        this.creatureGen.generate(this.engine, tool, gx, gy, gz, Math.random() * Math.PI * 2);
        break;
    }

    this.engine.rebuild();
    this.onPlacement?.();
  }

  private remove(): void {
    const hit = this.raycastVoxels();
    if (!hit) return;

    // Remove the voxel we're pointing at (step back along normal)
    const removePoint = hit.point.clone().sub(hit.normal.clone().multiplyScalar(VOXEL_SIZE * 0.5));
    const [gx, gy, gz] = worldToGrid(removePoint);

    // Remove 3x3x3 area
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          this.engine.removeVoxel(gx + dx, gy + dy, gz + dz);
        }
      }
    }

    this.engine.rebuild();
    this.onPlacement?.();
  }
}
