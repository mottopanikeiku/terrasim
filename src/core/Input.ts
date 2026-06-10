import * as THREE from 'three';
import { W, H, D, V, cellToWorld } from './constants';
import { Cell, Grid } from './Grid';
import { Simulation } from './Simulation';
import { randomShade, RangeName } from './palette';
import { Species, SPECIES_INFO } from '../world/Plants';

export type ToolId =
  | 'sand' | 'soil' | 'gravel' | 'water'
  | 'rock' | 'seeds' | 'moss'
  | Species
  | 'erase';

const POUR_RANGE: Record<string, { cell: Cell; range: RangeName; rate: number }> = {
  sand: { cell: Cell.SAND, range: 'sand', rate: 5 },
  soil: { cell: Cell.SOIL, range: 'soil', rate: 5 },
  gravel: { cell: Cell.GRAVEL, range: 'gravel', rate: 3 },
  water: { cell: Cell.WATER, range: 'water', rate: 9 },
};

export class Input {
  tool: ToolId = 'soil';
  onAction?: () => void; // called after a user action mutates the world
  onHint?: (text: string) => void;

  private pointer = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private pouring = false;
  private hasPointer = false;
  private cursor: THREE.Mesh;
  private downAt = 0;
  private downPos = new THREE.Vector2();

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: THREE.PerspectiveCamera,
    private grid: Grid,
    private sim: Simulation,
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
      // Touch: quick tap acts (orbit handled by OrbitControls on drag).
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
    if (this.tool in POUR_RANGE || this.tool === 'erase') {
      this.pouring = true;
      if (burst) {
        // Touch tap: a short burst instead of a held pour.
        for (let n = 0; n < 8; n++) this.simStep();
        this.pouring = false;
      }
    } else {
      this.placeAt();
    }
  }

  // Called once per simulation tick by the main loop.
  simStep(): void {
    if (!this.pouring) return;
    if (this.tool === 'erase') {
      this.eraseAt();
      return;
    }
    const spec = POUR_RANGE[this.tool];
    if (!spec) return;
    const pick = this.pick();
    if (!pick.column) return;
    const [cx, cz] = pick.column;

    // Spawn grains just above the local surface so the stream is visible
    // but doesn't teleport from the sky.
    let surface = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const x = Math.min(W - 1, Math.max(0, cx + dx));
        const z = Math.min(D - 1, Math.max(0, cz + dz));
        surface = Math.max(surface, this.grid.top(x, z) + 1);
      }
    }
    const spawnY = Math.min(H - 2, surface + 5);

    let spawned = false;
    for (let n = 0; n < spec.rate; n++) {
      const x = cx + ((Math.random() * 3) | 0) - 1;
      const y = spawnY + ((Math.random() * 3) | 0);
      const z = cz + ((Math.random() * 3) | 0) - 1;
      if (!this.grid.inBounds(x, y, z) || !this.grid.isEmpty(x, y, z)) continue;
      this.grid.set(x, y, z, spec.cell, randomShade(spec.range));
      spawned = true;
    }
    if (spawned) {
      this.sim.changed = true;
      this.onAction?.();
    }
  }

  private placeAt(): void {
    const pick = this.pick();
    if (!pick.surface) {
      this.onHint?.('Aim at the terrain to place');
      return;
    }
    const [x, y, z] = pick.surface;

    if (this.tool === 'rock') {
      this.placeRock(x, y, z);
      this.sim.changed = true;
      this.onAction?.();
      return;
    }

    if (this.tool === 'seeds') {
      this.scatterSeeds(x, z);
      return;
    }

    if (this.tool === 'moss') {
      if (this.sim.paintMoss(x, z)) {
        this.onHint?.('Moss settled in — it creeps over damp ground');
        this.onAction?.();
      } else {
        this.onHint?.('Moss needs a solid surface');
      }
      return;
    }

    const info = SPECIES_INFO[this.tool as Species];
    if (!info) return;
    const below = this.grid.get(x, y - 1, z);
    if (info.needsSoil && below !== Cell.SOIL && below !== Cell.SAND) {
      this.onHint?.(`${info.label} needs soil or sand to grow`);
      return;
    }
    if (below === Cell.EMPTY || below === Cell.WATER) {
      this.onHint?.('Needs solid ground');
      return;
    }
    this.sim.addPlant(this.tool as Species, x, y, z, 0.18);
    this.onAction?.();
  }

  // Toss a small handful of mixed seeds around the click point; whatever
  // lands on damp soil will make it.
  private scatterSeeds(cx: number, cz: number): void {
    const SPECIES: [Species, number][] = [
      ['grass', 0.35], ['flower', 0.3], ['fern', 0.15], ['mushroom', 0.1], ['succulent', 0.1],
    ];
    let planted = 0;
    for (let n = 0; n < 5; n++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * 6;
      const x = Math.round(cx + Math.cos(ang) * dist);
      const z = Math.round(cz + Math.sin(ang) * dist);
      if (!this.grid.inBounds(x, 1, z)) continue;
      const top = this.grid.top(x, z);
      if (top < 0) continue;
      const t = this.grid.get(x, top, z);
      if (t !== Cell.SOIL && t !== Cell.SAND) continue;
      let r = Math.random();
      let species: Species = 'grass';
      for (const [s, w] of SPECIES) { r -= w; if (r <= 0) { species = s; break; } }
      this.sim.addPlant(species, x, top + 1, z, 0.06);
      planted++;
    }
    if (planted > 0) {
      this.onHint?.('Seeds scattered — keep the soil moist and watch them sprout');
      this.onAction?.();
    } else {
      this.onHint?.('Seeds need open soil or sand');
    }
  }

  private placeRock(cx: number, cy: number, cz: number): void {
    const rx = 1.6 + Math.random() * 1.6;
    const ry = 1.2 + Math.random() * 1.4;
    const rz = 1.6 + Math.random() * 1.6;
    const r = Math.ceil(Math.max(rx, rz));
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
        for (let dz = -r; dz <= r; dz++) {
          const d =
            (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (dz * dz) / (rz * rz);
          if (d > 1 - Math.random() * 0.25) continue;
          const x = cx + dx, y = cy + dy + Math.floor(ry * 0.4), z = cz + dz;
          if (!this.grid.inBounds(x, y, z)) continue;
          const t = this.grid.get(x, y, z);
          if (t === Cell.EMPTY || t === Cell.WATER) {
            this.grid.set(x, y, z, Cell.ROCK, randomShade('rock'));
          }
        }
      }
    }
    this.grid.wake(cx, cy, cz);
  }

  private eraseAt(): void {
    const pick = this.pick(true);
    if (!pick.hit) return;
    const [cx, cy, cz] = pick.hit;
    const r = 2;
    let removed = false;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dy * dy + dz * dz > r * r + 1) continue;
          const x = cx + dx, y = cy + dy, z = cz + dz;
          if (!this.grid.inBounds(x, y, z)) continue;
          const i = this.grid.idx(x, y, z);
          const t = this.grid.type[i] as Cell;
          if (t === Cell.EMPTY) continue;
          this.grid.type[i] = Cell.EMPTY;
          this.grid.shade[i] = 0;
          this.grid.flags[i] = 0;
          this.grid.wet[i] = 0;
          this.grid.wake(x, y, z);
          removed = true;
        }
      }
    }
    this.sim.uprootNear(cx, cy, cz, r);
    if (removed) {
      this.sim.changed = true;
      this.onAction?.();
    }
  }

  private updateCursor(): void {
    if (!this.hasPointer) return;
    const pick = this.pick();
    if (pick.surface) {
      const [wx, wy, wz] = cellToWorld(...pick.surface);
      this.cursor.position.set(wx, wy - V * 0.3, wz);
      this.cursor.visible = true;
    } else {
      this.cursor.visible = false;
    }
  }

  setTool(tool: ToolId): void {
    this.tool = tool;
  }

  // The pour material currently streaming, if any (drives the pour sound).
  pouringTool(): 'sand' | 'soil' | 'gravel' | 'water' | null {
    if (this.pouring && this.tool in POUR_RANGE) {
      return this.tool as 'sand' | 'soil' | 'gravel' | 'water';
    }
    return null;
  }

  // Ray-grid DDA (Amanatides & Woo). Returns the first non-empty cell hit,
  // the empty cell just before it (surface), and the column for pouring.
  // includeWaterAsHit: erase should target water too (it always does);
  // pours/placement treat water as a surface as well, so water is a hit.
  private pick(_includeWater = false): {
    hit?: [number, number, number];
    surface?: [number, number, number];
    column?: [number, number];
  } {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const ro = this.raycaster.ray.origin;
    const rd = this.raycaster.ray.direction;

    // To grid space (cells of size 1).
    const ox = ro.x / V + W / 2;
    const oy = ro.y / V;
    const oz = ro.z / V + D / 2;

    // Slab-clip the ray to the grid AABB.
    let tMin = 0, tMax = 200;
    const o = [ox, oy, oz];
    const d = [rd.x, rd.y, rd.z];
    const bounds: [number, number][] = [[0, W], [0, H], [0, D]];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) {
        if (o[a] < bounds[a][0] || o[a] > bounds[a][1]) return {};
        continue;
      }
      let t0 = (bounds[a][0] - o[a]) / d[a];
      let t1 = (bounds[a][1] - o[a]) / d[a];
      if (t0 > t1) [t0, t1] = [t1, t0];
      tMin = Math.max(tMin, t0);
      tMax = Math.min(tMax, t1);
      if (tMin > tMax) return {};
    }

    let px = ox + d[0] * (tMin + 1e-4);
    let py = oy + d[1] * (tMin + 1e-4);
    let pz = oz + d[2] * (tMin + 1e-4);
    let x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz);

    const stepX = d[0] > 0 ? 1 : -1;
    const stepY = d[1] > 0 ? 1 : -1;
    const stepZ = d[2] > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / d[0]);
    const tDeltaY = Math.abs(1 / d[1]);
    const tDeltaZ = Math.abs(1 / d[2]);
    let tMaxX = d[0] !== 0 ? Math.abs(((stepX > 0 ? x + 1 : x) - px) / d[0]) : Infinity;
    let tMaxY = d[1] !== 0 ? Math.abs(((stepY > 0 ? y + 1 : y) - py) / d[1]) : Infinity;
    let tMaxZ = d[2] !== 0 ? Math.abs(((stepZ > 0 ? z + 1 : z) - pz) / d[2]) : Infinity;

    let prev: [number, number, number] | undefined;
    for (let step = 0; step < 400; step++) {
      if (!this.grid.inBounds(x, y, z)) {
        // Left through the floor: pour lands in the last column we crossed.
        if (y < 0 && prev) return { column: [prev[0], prev[2]], surface: prev };
        break;
      }
      const t = this.grid.get(x, y, z);
      if (t !== Cell.EMPTY) {
        return {
          hit: [x, y, z],
          surface: prev,
          column: [x, z],
        };
      }
      prev = [x, y, z];
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; tMaxX += tDeltaX;
      } else if (tMaxY < tMaxZ) {
        y += stepY; tMaxY += tDeltaY;
      } else {
        z += stepZ; tMaxZ += tDeltaZ;
      }
    }
    return {};
  }
}
