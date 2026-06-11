import * as THREE from 'three';
import { W, D, V } from './constants';
import { Mat, World } from './World';
import { Species, SPECIES } from '../world/Plants';

export type ToolId =
  | 'sand' | 'soil' | 'gravel' | 'water'
  | 'rock' | 'seeds' | 'moss' | 'litter'
  | Species
  | 'erase';

// Volume (world units cubed) added per 30Hz tick while a pour is held.
const POUR: Record<string, { mat: Mat | 'water'; rate: number }> = {
  sand: { mat: Mat.SAND, rate: 0.05 },
  soil: { mat: Mat.SOIL, rate: 0.05 },
  gravel: { mat: Mat.GRAVEL, rate: 0.035 },
  water: { mat: 'water', rate: 0.065 },
};

export interface PickResult {
  column?: [number, number];
  point?: THREE.Vector3; // world-space surface point
}

export class Input {
  tool: ToolId = 'soil';
  onAction?: () => void;
  onHint?: (text: string) => void;

  private pointer = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private pouring = false;
  private hasPointer = false;
  private cursor: THREE.Mesh;
  private downAt = 0;
  private downPos = new THREE.Vector2();
  private lastPick: PickResult = {};

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: THREE.PerspectiveCamera,
    private world: World,
    scene: THREE.Scene
  ) {
    this.cursor = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.035, 10, 36),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65, depthWrite: false })
    );
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.visible = false;
    this.cursor.renderOrder = 50;
    scene.add(this.cursor);

    canvas.addEventListener('pointermove', (e) => {
      this.updatePointer(e);
      this.hasPointer = e.pointerType === 'mouse';
      this.updateCursor();
    });
    canvas.addEventListener('pointerdown', (e) => {
      this.updatePointer(e);
      this.downAt = performance.now();
      this.downPos.set(e.clientX, e.clientY);
      if (e.button !== 0) return;
      if (e.pointerType === 'mouse') this.beginAction();
    });
    addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse' && e.target === canvas) {
        const quick = performance.now() - this.downAt < 300;
        const still = Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y) < 10;
        if (quick && still) {
          this.updatePointer(e);
          this.beginAction(true);
        }
      }
      this.pouring = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private updatePointer(e: PointerEvent): void {
    this.pointer.x = (e.clientX / innerWidth) * 2 - 1;
    this.pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  }

  private beginAction(burst = false): void {
    if (this.tool in POUR || this.tool === 'erase') {
      this.pouring = true;
      if (burst) {
        for (let n = 0; n < 10; n++) this.simStep();
        this.pouring = false;
      }
    } else {
      this.placeAt();
    }
  }

  // Called once per simulation tick by the main loop.
  simStep(): void {
    if (!this.pouring) return;
    const pick = this.pick();
    if (!pick.column) return;
    const [cx, cz] = pick.column;

    if (this.tool === 'erase') {
      this.world.dig(cx, cz, 3.2, 0.05);
      this.onAction?.();
      return;
    }
    const spec = POUR[this.tool];
    if (!spec) return;
    if (spec.mat === 'water') {
      this.world.pourWater(cx, cz, 2.6, spec.rate);
    } else {
      this.world.pour(spec.mat, cx, cz, 2.8, spec.rate);
    }
    this.onAction?.();
  }

  private placeAt(): void {
    const pick = this.pick();
    if (!pick.column || !pick.point) {
      this.onHint?.('Aim at the terrain to place');
      return;
    }
    const [x, z] = pick.column;
    const w = this.world;
    const i = w.idx(x, z);

    if (this.tool === 'rock') {
      w.rocks.push({
        x: x + (Math.random() - 0.5), z: z + (Math.random() - 0.5),
        scale: 0.45 + Math.random() * 0.55,
        seed: (Math.random() * 0xffffffff) >>> 0,
      });
      w.changed = true;
      this.onAction?.();
      return;
    }

    if (this.tool === 'seeds') {
      this.scatterSeeds(x, z);
      return;
    }

    if (this.tool === 'moss') {
      if (w.paintMoss(x, z)) {
        this.onHint?.('Moss settled in — it creeps over damp ground');
        this.onAction?.();
      } else {
        this.onHint?.('Moss needs a solid surface');
      }
      return;
    }

    if (this.tool === 'litter') {
      w.addLitter(x, z);
      this.onHint?.('Leaf litter scattered — it keeps the soil under it moist');
      this.onAction?.();
      return;
    }

    const def = SPECIES[this.tool as Species];
    if (!def) return;
    if (w.water[i] > 0.05 && !def.waterEdge) {
      this.onHint?.('Too deep — plant on dry ground');
      return;
    }
    const top = w.topMat(i);
    if (top === Mat.NONE) {
      this.onHint?.('Needs solid ground');
      return;
    }
    if (def.needsSoil && top !== Mat.SOIL && top !== Mat.SAND) {
      this.onHint?.(`${def.label} needs soil or sand to grow`);
      return;
    }
    w.addPlant(this.tool as Species, x, z, 0.18);
    this.onHint?.(`${def.label} planted (${def.sci})`);
    this.onAction?.();
  }

  private scatterSeeds(cx: number, cz: number): void {
    const MIX: [Species, number][] = [
      ['eleocharis', 0.22], ['sinningia', 0.16], ['pilea', 0.16], ['fittonia', 0.12],
      ['nephrolepis', 0.1], ['peperomia', 0.08], ['mycena', 0.08], ['echeveria', 0.08],
    ];
    const w = this.world;
    let planted = 0;
    for (let n = 0; n < 5; n++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * 9;
      const x = Math.round(cx + Math.cos(ang) * dist);
      const z = Math.round(cz + Math.sin(ang) * dist);
      if (!w.inBounds(x, z)) continue;
      const i = w.idx(x, z);
      if (w.water[i] > 0.05) continue;
      const top = w.topMat(i);
      if (top !== Mat.SOIL && top !== Mat.SAND) continue;
      let r = Math.random();
      let species: Species = 'eleocharis';
      for (const [s, wgt] of MIX) { r -= wgt; if (r <= 0) { species = s; break; } }
      w.addPlant(species, x, z, 0.06);
      planted++;
    }
    if (planted > 0) {
      this.onHint?.('Seeds scattered — keep the soil moist and watch them sprout');
      this.onAction?.();
    } else {
      this.onHint?.('Seeds need open soil or sand');
    }
  }

  private updateCursor(): void {
    if (!this.hasPointer) return;
    const pick = this.pick();
    if (pick.point) {
      this.cursor.position.copy(pick.point).y += 0.04;
      this.cursor.visible = true;
    } else {
      this.cursor.visible = false;
    }
  }

  setTool(tool: ToolId): void {
    this.tool = tool;
  }

  pouringTool(): 'sand' | 'soil' | 'gravel' | 'water' | null {
    if (this.pouring && this.tool in POUR) {
      return this.tool as 'sand' | 'soil' | 'gravel' | 'water';
    }
    return null;
  }

  // Where the cursor last hit, for the pour-stream visual.
  currentPick(): PickResult {
    return this.lastPick;
  }

  // Raymarch the surface heightfield (terrain + water) inside the tank.
  private pick(): PickResult {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const ro = this.raycaster.ray.origin;
    const rd = this.raycaster.ray.direction;

    // Clip to the tank's interior AABB.
    const minX = -W / 2 * V, maxX = W / 2 * V;
    const minZ = -D / 2 * V, maxZ = D / 2 * V;
    const minY = 0, maxY = 10;
    let t0 = 0, t1 = 200;
    const clip = (o: number, d: number, lo: number, hi: number) => {
      if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
      let a = (lo - o) / d, b = (hi - o) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      return t0 <= t1;
    };
    if (!clip(ro.x, rd.x, minX, maxX) || !clip(ro.y, rd.y, minY, maxY) || !clip(ro.z, rd.z, minZ, maxZ)) {
      this.lastPick = {};
      return this.lastPick;
    }

    const w = this.world;
    const step = 0.045;
    let prevCol: [number, number] | null = null;
    for (let t = t0 + 1e-3; t <= t1; t += step) {
      const px = ro.x + rd.x * t;
      const py = ro.y + rd.y * t;
      const pz = ro.z + rd.z * t;
      const fx = px / V + W / 2;
      const fz = pz / V + D / 2;
      const cx = Math.floor(fx), cz = Math.floor(fz);
      if (cx < 0 || cx >= W || cz < 0 || cz >= D) continue;
      const i = w.idx(cx, cz);
      const surf = w.groundH[i] + w.water[i];
      if (py <= surf) {
        this.lastPick = {
          column: [cx, cz],
          point: new THREE.Vector3(px, surf, pz),
        };
        return this.lastPick;
      }
      prevCol = [cx, cz];
    }
    // Ray left through the floor without hitting: pour into the last column.
    if (prevCol) {
      const i = w.idx(prevCol[0], prevCol[1]);
      this.lastPick = {
        column: prevCol,
        point: new THREE.Vector3(
          (prevCol[0] - W / 2 + 0.5) * V,
          w.groundH[i] + w.water[i],
          (prevCol[1] - D / 2 + 0.5) * V
        ),
      };
      return this.lastPick;
    }
    this.lastPick = {};
    return this.lastPick;
  }
}
