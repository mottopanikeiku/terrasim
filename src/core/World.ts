import { W, D, V } from './constants';
import { Plant, Species } from '../world/Plants';

// The idealized core: the tank is a LAYERED HEIGHTFIELD, not a voxel soup.
// Each of the 144x60 columns holds a little stack of strata (gravel, sand,
// soil — true stratigraphy, visible in the cross-section), a water depth,
// a moisture value and a moss coverage. Pouring adds smooth volume that
// relaxes to the material's angle of repose; water is a shallow-water sim
// that visibly flows downhill and settles mirror-flat. The state is ~9k
// columns instead of 518k cells: the whole tick costs well under a
// millisecond, terrain and water are always smooth, and nothing can ever
// strand a lonely blue cube again.

export const N = W * D;
export const MAXS = 6; // strata segments per column

export enum Mat {
  NONE = 0,
  GRAVEL = 1,
  SAND = 2,
  SOIL = 3,
}

export const MAX_GROUND = 8.6; // world units; keep below the lid

const MAX_PLANTS = 60;

// Health lost per dry growth tick / reseed chances — the living pacing.
const THIRST: Record<Species, number> = {
  succulent: 0.03, grass: 0.11, flower: 0.15, fern: 0.16, mushroom: 0.18,
};
const SPREAD_CHANCE: Record<Species, number> = {
  grass: 0.002, flower: 0.0012, fern: 0.0009, mushroom: 0.0015, succulent: 0.0005,
};

// Talus slack: max height step (world units) a material holds against its
// neighbor one cell away. Lower = flatter piles. Damp soil holds steeper.
const SLACK: Record<Mat, number> = {
  [Mat.NONE]: 1,
  [Mat.GRAVEL]: 0.20,
  [Mat.SAND]: 0.095,
  [Mat.SOIL]: 0.15,
};

export interface AwaySummary {
  seconds: number;
  matured: number;
  sprouted: number;
  wilted: number;
  died: number;
  composted: number;
  mossGrown: number;
  pondShrank: boolean;
}

export interface Rock {
  x: number; z: number; // column coords (fractional ok)
  scale: number;
  seed: number;
}

export class World {
  // Strata stacks (structure-of-arrays).
  readonly stratMat = new Uint8Array(N * MAXS);
  readonly stratH = new Float32Array(N * MAXS);
  readonly stratN = new Uint8Array(N);
  // Cached total ground height per column.
  readonly groundH = new Float32Array(N);
  // Water depth above ground, topsoil moisture 0..1, moss coverage 0..1.
  readonly water = new Float32Array(N);
  readonly wet = new Float32Array(N);
  readonly moss = new Float32Array(N);

  humidity = 50;
  events: string[] = [];
  changed = true;       // anything happened (drives autosave)
  terrainDirty = true;  // ground HEIGHTS changed — remesh promptly
  tintDirty = true;     // only colors drifted (wet/moss) — remesh lazily
  waterDirty = true;    // water mesh needs a refresh

  rocks: Rock[] = [];

  private plants: Plant[] = [];
  private nextPlantId = 1;
  private growthTimer = 0;
  private firstBloomSeen = false;
  private sweep = 0;

  // ---- column helpers ----

  idx(x: number, z: number): number {
    return x + z * W;
  }

  inBounds(x: number, z: number): boolean {
    return x >= 0 && x < W && z >= 0 && z < D;
  }

  private recompute(i: number): void {
    let h = 0;
    const b = i * MAXS;
    for (let s = 0; s < this.stratN[i]; s++) h += this.stratH[b + s];
    this.groundH[i] = h;
  }

  topMat(i: number): Mat {
    const n = this.stratN[i];
    return n > 0 ? (this.stratMat[i * MAXS + n - 1] as Mat) : Mat.NONE;
  }

  surfaceH(i: number): number {
    return this.groundH[i] + this.water[i];
  }

  addLayer(i: number, mat: Mat, h: number): void {
    if (h <= 0) return;
    const b = i * MAXS;
    let n = this.stratN[i];
    if (n > 0 && this.stratMat[b + n - 1] === mat) {
      this.stratH[b + n - 1] += h;
    } else {
      if (n >= MAXS) {
        // Merge the two bottom strata to make room (deep history blurs).
        this.stratH[b + 1] += this.stratH[b];
        if (this.stratH[b] > this.stratH[b + 1] * 0.5) this.stratMat[b + 1] = this.stratMat[b];
        for (let s = 0; s < n - 1; s++) {
          this.stratMat[b + s] = this.stratMat[b + s + 1];
          this.stratH[b + s] = this.stratH[b + s + 1];
        }
        n--;
      }
      this.stratMat[b + n] = mat;
      this.stratH[b + n] = h;
      this.stratN[i] = n + 1;
    }
    this.recompute(i);
    this.changed = true;
    this.terrainDirty = true;
  }

  // Remove up to `h` from the top of the stack; returns how much came off.
  removeTop(i: number, h: number): number {
    const b = i * MAXS;
    let left = h;
    while (left > 1e-6 && this.stratN[i] > 0) {
      const s = b + this.stratN[i] - 1;
      const take = Math.min(left, this.stratH[s]);
      this.stratH[s] -= take;
      left -= take;
      if (this.stratH[s] < 1e-5) this.stratN[i]--;
    }
    this.recompute(i);
    this.changed = true;
    this.terrainDirty = true;
    return h - left;
  }

  // Move `h` of column i's TOP material onto column j (talus avalanche).
  private slide(i: number, j: number, h: number): void {
    const b = i * MAXS;
    const s = b + this.stratN[i] - 1;
    const mat = this.stratMat[s] as Mat;
    const take = Math.min(h, this.stratH[s]);
    if (take <= 0) return;
    this.stratH[s] -= take;
    if (this.stratH[s] < 1e-5) this.stratN[i]--;
    this.recompute(i);
    this.addLayer(j, mat, take);
    // Moss carried under an avalanche is buried.
    if (take > 0.04) this.moss[j] = Math.max(0, this.moss[j] - take * 2);
  }

  // ---- user actions ----

  // Pour granular material in a soft round brush.
  pour(mat: Mat, cx: number, cz: number, radius: number, volume: number): void {
    const r = Math.ceil(radius);
    let weightSum = 0;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > radius) continue;
        weightSum += 1 - (d / radius) * 0.7;
      }
    }
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, z = cz + dz;
        if (!this.inBounds(x, z)) continue;
        const d = Math.hypot(dx, dz);
        if (d > radius) continue;
        const i = this.idx(x, z);
        if (this.groundH[i] >= MAX_GROUND) continue;
        const share = (volume * (1 - (d / radius) * 0.7)) / weightSum;
        this.addLayer(i, mat, share / (V * V));
      }
    }
  }

  pourWater(cx: number, cz: number, radius: number, volume: number): void {
    const r = Math.ceil(radius);
    let cols = 0;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.hypot(dx, dz) <= radius && this.inBounds(cx + dx, cz + dz)) cols++;
      }
    }
    if (cols === 0) return;
    const per = volume / cols / (V * V);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, z = cz + dz;
        if (!this.inBounds(x, z) || Math.hypot(dx, dz) > radius) continue;
        const i = this.idx(x, z);
        this.water[i] += per;
        this.wet[i] = Math.min(1, this.wet[i] + 0.3);
      }
    }
    this.changed = true;
    this.waterDirty = true;
    this.terrainDirty = true;
  }

  // Dig: water first, then strata, in a rounded scoop.
  dig(cx: number, cz: number, radius: number, depth: number): void {
    const r = Math.ceil(radius);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, z = cz + dz;
        if (!this.inBounds(x, z)) continue;
        const d = Math.hypot(dx, dz);
        if (d > radius) continue;
        const i = this.idx(x, z);
        const bite = depth * (1 - (d / radius) * 0.65);
        if (this.water[i] > 0) {
          const w = Math.min(this.water[i], bite * 2);
          this.water[i] -= w;
          this.waterDirty = true;
        }
        this.removeTop(i, bite);
        this.moss[i] = Math.max(0, this.moss[i] - bite * 3);
      }
    }
    this.rocks = this.rocks.filter(
      (rk) => Math.hypot(rk.x - cx, rk.z - cz) > radius + rk.scale * 1.5
    );
    this.uprootNear(cx, cz, radius);
  }

  // ---- simulation tick (30 Hz) ----

  tick(): void {
    this.sweep ^= 1;
    this.talus();
    this.flowWater();
    this.flowWater();
    this.moistureCycle();
  }

  // Granular relaxation: steep steps shed their top material downhill.
  private talus(): void {
    const fwd = this.sweep === 0;
    for (let pass = 0; pass < 1; pass++) {
      for (let z = 0; z < D; z++) {
        for (let xi = 0; xi < W; xi++) {
          const x = fwd ? xi : W - 1 - xi;
          const i = this.idx(x, z);
          if (this.stratN[i] === 0) continue;
          const mat = this.topMat(i);
          let slack = SLACK[mat];
          if (mat === Mat.SOIL || mat === Mat.SAND) slack *= 1 + this.wet[i] * 0.8;
          const g = this.groundH[i];
          // Check the 4 neighbors in alternating order.
          for (let k = 0; k < 4; k++) {
            const dir = (k + this.sweep) & 3;
            const nx = x + (dir === 0 ? 1 : dir === 1 ? -1 : 0);
            const nz = z + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
            if (!this.inBounds(nx, nz)) continue;
            const j = this.idx(nx, nz);
            const diff = g - this.groundH[j] - this.water[j] * 0.6;
            if (diff > slack) {
              this.slide(i, j, Math.min((diff - slack) * 0.22, 0.12));
              break;
            }
          }
        }
      }
    }
  }

  // Shallow-water: exchange volume toward equal surface heights. Pours
  // visibly run downhill, ponds settle glassy-flat within a second.
  private flowWater(): void {
    const fwd = this.sweep === 0;
    for (let z = 0; z < D; z++) {
      for (let xi = 0; xi < W; xi++) {
        const x = fwd ? xi : W - 1 - xi;
        const i = this.idx(x, z);
        const wi = this.water[i];
        if (wi <= 1e-5) continue;
        const si = this.groundH[i] + wi;
        for (let k = 0; k < 4; k++) {
          const dir = (k + this.sweep) & 3;
          const nx = x + (dir === 0 ? 1 : dir === 1 ? -1 : 0);
          const nz = z + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
          if (!this.inBounds(nx, nz)) continue;
          const j = this.idx(nx, nz);
          const diff = si - this.groundH[j] - this.water[j];
          if (diff > 1e-4) {
            const flow = Math.min(this.water[i] * 0.4, diff * 0.22);
            this.water[i] -= flow;
            this.water[j] += flow;
            this.waterDirty = true;
          }
        }
      }
    }
  }

  // The slow closed cycle: evaporation -> humidity -> condensation -> soil
  // moisture -> plants. Sampled sparsely; full scans are cheap but this
  // keeps rates easy to reason about.
  private moistureCycle(): void {
    let evaporated = 0;
    for (let i = 0; i < N; i++) {
      const w = this.water[i];
      if (w > 0) {
        // Thin films soak into the ground instead of sitting as varnish.
        if (w < 0.03 && this.wet[i] < 0.98 && this.topMat(i) !== Mat.GRAVEL) {
          const take = Math.min(w, 0.002);
          this.water[i] -= take;
          this.wet[i] = Math.min(1, this.wet[i] + take * 8);
          this.waterDirty = true;
        } else if (w < 0.015 && this.topMat(i) === Mat.GRAVEL) {
          // Gravel is drainage: films vanish into the gaps.
          this.water[i] = Math.max(0, w - 0.0015);
          this.waterDirty = true;
        }
        // Evaporation.
        const e = Math.min(this.water[i], 0.000012);
        this.water[i] -= e;
        evaporated += e;
        // Ground under standing water saturates.
        this.wet[i] = Math.min(1, this.wet[i] + 0.003);
      }
    }
    // Tuned so a healthy pond holds humidity in the 60-75 band against the
    // lid leak — minutes-scale drift, not a sprint to 100.
    this.humidity = Math.min(100, this.humidity + evaporated * 1.7);
    this.humidity = Math.max(0, this.humidity - 0.012); // lid leak

    // Sampled moisture spread / drying (240 columns per tick).
    const dryRate = 0.0016 * Math.max(0.15, 1.15 - this.humidity / 90);
    for (let s = 0; s < 240; s++) {
      const i = (Math.random() * N) | 0;
      if (this.stratN[i] === 0) continue;
      const x = i % W, z = (i / W) | 0;
      // Wicking: moisture creeps toward drier neighbors.
      const nx = x + ((Math.random() * 3) | 0) - 1;
      const nz = z + ((Math.random() * 3) | 0) - 1;
      if (this.inBounds(nx, nz)) {
        const j = this.idx(nx, nz);
        const d = this.wet[i] - this.wet[j] - 0.12;
        if (d > 0) {
          const t = d * 0.18;
          this.wet[i] -= t * 0.7;
          this.wet[j] = Math.min(1, this.wet[j] + t * 0.55); // a little is lost
          this.tintDirty = true;
        }
      }
      // Surface drying (only where no standing water).
      if (this.water[i] <= 1e-4 && this.wet[i] > 0) {
        this.wet[i] = Math.max(0, this.wet[i] - dryRate);
        this.humidity = Math.min(100, this.humidity + dryRate * 0.05);
        this.tintDirty = true;
      }
    }

    // Condensation: humid glass drips along the walls.
    if (this.humidity > 60 && Math.random() < 0.3) {
      const side = (Math.random() * 4) | 0;
      const x = side === 0 ? 1 : side === 1 ? W - 2 : 1 + ((Math.random() * (W - 2)) | 0);
      const z = side === 2 ? 1 : side === 3 ? D - 2 : 1 + ((Math.random() * (D - 2)) | 0);
      const i = this.idx(x, z);
      if (this.stratN[i] > 0 && this.wet[i] < 0.85) {
        this.wet[i] = Math.min(1, this.wet[i] + 0.22);
        this.humidity -= 0.5;
        this.tintDirty = true;
      }
    }
  }

  // ---- plants & moss (0.5s cadence) ----

  addPlant(species: Species, x: number, z: number, initialStage = 0.15): Plant {
    const plant: Plant = {
      id: this.nextPlantId++,
      species,
      x, z,
      seed: (Math.random() * 0xffffffff) >>> 0,
      stage: initialStage,
      health: 80,
      look: 0,
      decayT: 0,
    };
    this.plants.push(plant);
    return plant;
  }

  getPlants(): Plant[] {
    return this.plants;
  }

  restorePlants(plants: Plant[]): void {
    this.plants = plants;
    this.nextPlantId = plants.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  }

  growth(dt: number): void {
    this.growthTimer += dt;
    if (this.growthTimer < 0.5) return;
    this.growthTimer = 0;

    for (let p = this.plants.length - 1; p >= 0; p--) {
      const plant = this.plants[p];
      const i = this.idx(plant.x, plant.z);

      // Drowned: standing water over the crown kills land plants slowly.
      const drowned = this.water[i] > 0.35;

      if (plant.look === 2) {
        plant.decayT -= 0.5;
        if (plant.decayT <= 0) this.compost(plant, p);
        continue;
      }

      const drank = !drowned && this.drink(plant);
      if (drank) {
        plant.health = Math.min(100, plant.health + 1.2);
      } else {
        plant.health -= drowned ? 0.4 : THIRST[plant.species];
      }

      if (plant.health <= 0) {
        plant.look = 2;
        plant.decayT = 120;
        this.events.push(`A ${plant.species} withered away \u{1F342}`);
        continue;
      }
      if (plant.look === 0 && plant.health < 42) {
        plant.look = 1;
        this.events.push(`A ${plant.species} is wilting — it needs water \u{1F4A7}`);
      } else if (plant.look === 1 && plant.health > 60) {
        plant.look = 0;
        this.events.push(`The ${plant.species} perked back up \u{1F33F}`);
      }

      if (plant.look === 0 && drank && plant.stage < 1) {
        plant.stage = Math.min(1, plant.stage + 0.0008);
        if (plant.stage >= 1 && plant.species === 'flower' && !this.firstBloomSeen) {
          this.firstBloomSeen = true;
          this.events.push('First bloom! \u{1F338}');
        }
      }

      if (plant.look === 0 && plant.stage >= 1 && this.plants.length < MAX_PLANTS) {
        this.trySpread(plant);
      }
    }

    this.mossStep();
  }

  private drink(plant: Plant): boolean {
    let bestI = -1, bestWet = 0;
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = plant.x + dx, z = plant.z + dz;
        if (!this.inBounds(x, z)) continue;
        const i = this.idx(x, z);
        if (this.water[i] > 0.02) return true;
        if (this.wet[i] > bestWet) { bestWet = this.wet[i]; bestI = i; }
      }
    }
    if (bestI >= 0 && bestWet >= 0.16) {
      this.wet[bestI] = Math.max(0, this.wet[bestI] - 0.02);
      return true;
    }
    return false;
  }

  private compost(plant: Plant, index: number): void {
    const i = this.idx(plant.x, plant.z);
    this.addLayer(i, Mat.SOIL, 0.02);
    this.wet[i] = Math.min(1, this.wet[i] + 0.1);
    this.plants.splice(index, 1);
    this.events.push(`The dead ${plant.species} composted into fresh soil \u{267B}\u{FE0F}`);
  }

  private trySpread(plant: Plant): void {
    if (Math.random() > SPREAD_CHANCE[plant.species]) return;
    this.spreadOnce(plant);
  }

  private spreadOnce(plant: Plant): boolean {
    const ang = Math.random() * Math.PI * 2;
    const dist = 8 + Math.random() * 12;
    const x = Math.round(plant.x + Math.cos(ang) * dist);
    const z = Math.round(plant.z + Math.sin(ang) * dist);
    if (x < 3 || x >= W - 3 || z < 3 || z >= D - 3) return false;
    const i = this.idx(x, z);
    if (this.water[i] > 0.03) return false;
    const top = this.topMat(i);
    const needsSoil = plant.species !== 'mushroom';
    if (needsSoil && top !== Mat.SOIL && top !== Mat.SAND) return false;
    if (this.wet[i] < 0.12 && plant.species !== 'succulent') return false;
    for (const other of this.plants) {
      if (Math.abs(other.x - x) + Math.abs(other.z - z) < 9) return false;
    }
    this.addPlant(plant.species, x, z, 0.06);
    this.events.push(`A ${plant.species} seedling sprouted \u{1F331}`);
    return true;
  }

  // Moss: coverage creeps over damp ground, retreats when bone dry.
  private mossStep(): void {
    for (let s = 0; s < 80; s++) {
      const i = (Math.random() * N) | 0;
      if (this.moss[i] <= 0.02) continue;
      const damp = this.wet[i] > 0.18 || this.humidity > 66;
      if (damp && this.water[i] < 0.05) {
        if (this.moss[i] < 1) {
          this.moss[i] = Math.min(1, this.moss[i] + 0.012);
          this.tintDirty = true;
        }
        // Creep outward.
        if (this.moss[i] > 0.45 && Math.random() < 0.35) {
          const x = i % W, z = (i / W) | 0;
          const nx = x + ((Math.random() * 3) | 0) - 1;
          const nz = z + ((Math.random() * 3) | 0) - 1;
          if (this.inBounds(nx, nz)) {
            const j = this.idx(nx, nz);
            if (this.stratN[j] > 0 && this.water[j] < 0.05 && (this.wet[j] > 0.14 || this.humidity > 66)) {
              this.moss[j] = Math.min(1, this.moss[j] + 0.06);
              this.tintDirty = true;
            }
          }
        }
      } else if (this.wet[i] < 0.05 && this.humidity < 40 && Math.random() < 0.2) {
        this.moss[i] = Math.max(0, this.moss[i] - 0.03);
        this.tintDirty = true;
      }
    }
  }

  paintMoss(cx: number, cz: number): boolean {
    let added = 0;
    for (let n = 0; n < 30; n++) {
      const x = cx + Math.round((Math.random() - 0.5) * 8);
      const z = cz + Math.round((Math.random() - 0.5) * 8);
      if (!this.inBounds(x, z)) continue;
      const i = this.idx(x, z);
      if (this.stratN[i] === 0 || this.water[i] > 0.05) continue;
      this.moss[i] = Math.min(1, this.moss[i] + 0.35 + Math.random() * 0.3);
      added++;
    }
    if (added > 0) {
      this.terrainDirty = true;
      this.changed = true;
    }
    return added > 0;
  }

  mossAmount(): number {
    let sum = 0;
    for (let i = 0; i < N; i++) sum += this.moss[i];
    return sum;
  }

  grazeMossAt(cx: number, cz: number, r: number): boolean {
    let ate = false;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, z = cz + dz;
        if (!this.inBounds(x, z)) continue;
        const i = this.idx(x, z);
        if (this.moss[i] > 0.3) {
          this.moss[i] -= 0.25;
          ate = true;
          this.tintDirty = true;
          return true;
        }
      }
    }
    return ate;
  }

  // ---- critter / placement helpers ----

  groundWorldY(x: number, z: number): number {
    if (!this.inBounds(x, z)) return 0;
    return this.groundH[this.idx(x, z)];
  }

  // Bilinear ground height at fractional column coords.
  groundWorldYf(px: number, pz: number): number {
    const x0 = Math.max(0, Math.min(W - 2, Math.floor(px)));
    const z0 = Math.max(0, Math.min(D - 2, Math.floor(pz)));
    const fx = Math.min(1, Math.max(0, px - x0));
    const fz = Math.min(1, Math.max(0, pz - z0));
    const h00 = this.groundH[this.idx(x0, z0)];
    const h10 = this.groundH[this.idx(x0 + 1, z0)];
    const h01 = this.groundH[this.idx(x0, z0 + 1)];
    const h11 = this.groundH[this.idx(x0 + 1, z0 + 1)];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }

  isWater(x: number, z: number): boolean {
    return this.inBounds(x, z) && this.water[this.idx(x, z)] > 0.03;
  }

  nibbleDeadAt(x: number, z: number, radius: number): boolean {
    for (const p of this.plants) {
      if (p.look !== 2) continue;
      if (Math.abs(p.x - x) <= radius && Math.abs(p.z - z) <= radius) {
        p.decayT -= 4;
        return true;
      }
    }
    return false;
  }

  findDeadPlantNear(x: number, z: number, radius: number): Plant | null {
    let best: Plant | null = null;
    let bestD = radius;
    for (const p of this.plants) {
      if (p.look !== 2) continue;
      const d = Math.max(Math.abs(p.x - x), Math.abs(p.z - z));
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  uprootNear(x: number, z: number, r: number): void {
    for (let p = this.plants.length - 1; p >= 0; p--) {
      const plant = this.plants[p];
      if (Math.max(Math.abs(plant.x - x), Math.abs(plant.z - z)) <= r + 1) {
        this.plants.splice(p, 1);
      }
    }
  }

  // ---- stats / alerts / away-time ----

  stats(): { humidity: number; water: number; plants: number; healthyFrac: number } {
    let vol = 0;
    for (let i = 0; i < N; i++) vol += this.water[i];
    const alive = this.plants.filter((p) => p.look !== 2);
    const healthy = alive.filter((p) => p.look === 0).length;
    return {
      humidity: this.humidity,
      // Expressed in "droplets" (cell-volume equivalents) for the UI.
      water: Math.round((vol * V * V) / (V * V * V)),
      plants: alive.length,
      healthyFrac: alive.length ? healthy / alive.length : 1,
    };
  }

  alerts(s: { humidity: number; water: number; plants: number; healthyFrac: number }): string[] {
    const out: string[] = [];
    if (s.plants === 0) out.push('\u{1F331} Nothing is growing — scatter some seeds');
    if (s.water === 0) out.push('\u{1F3DC}\u{FE0F} No standing water — the water cycle has stalled');
    else if (s.humidity < 42) out.push('\u{1F4A8} The air is dry — pour some water');
    if (s.humidity > 88) out.push('\u{1F4A6} Very humid — the glass is fogging heavily');
    if (s.plants > 0 && s.healthyFrac < 0.7) out.push('\u{1F940} Plants are thirsty — water the soil near them');
    return out;
  }

  // Gentle closed-form catch-up for time spent away.
  fastForward(seconds: number): AwaySummary {
    const capped = Math.min(seconds, 72 * 3600);
    const ticks = capped / 0.5;
    const summary: AwaySummary = {
      seconds, matured: 0, sprouted: 0, wilted: 0, died: 0,
      composted: 0, mossGrown: 0, pondShrank: false,
    };

    let vol = 0;
    for (let i = 0; i < N; i++) vol += this.water[i];
    const hasPond = vol > 0.8;

    for (let p = this.plants.length - 1; p >= 0; p--) {
      const plant = this.plants[p];
      if (plant.look === 2) {
        plant.decayT -= capped;
        if (plant.decayT <= 0) {
          this.compost(plant, p);
          summary.composted++;
        }
        continue;
      }
      const supply = this.supplyAt(plant);
      const wasMature = plant.stage >= 1;
      if (supply > 0.45) {
        plant.health = Math.min(100, plant.health + 25);
        if (plant.look === 1 && plant.health > 60) plant.look = 0;
        plant.stage = Math.min(1, plant.stage + 0.0008 * ticks);
      } else {
        const drain = THIRST[plant.species] * ticks * (hasPond ? 0.05 : 0.15);
        plant.health -= Math.min(hasPond ? 55 : 130, drain);
        plant.stage = Math.min(1, plant.stage + 0.0008 * ticks * supply);
      }
      if (plant.health <= 0) {
        plant.look = 2;
        plant.decayT = 120;
        summary.died++;
      } else if (plant.look === 0 && plant.health < 42) {
        plant.look = 1;
        summary.wilted++;
      }
      if (!wasMature && plant.stage >= 1) summary.matured++;
    }

    let seedBudget = Math.min(6, MAX_PLANTS - this.plants.length);
    for (const parent of this.plants.slice()) {
      if (seedBudget <= 0) break;
      if (parent.look !== 0 || parent.stage < 1) continue;
      const odds = Math.min(0.75, SPREAD_CHANCE[parent.species] * ticks * 0.05);
      if (Math.random() < odds && this.spreadOnce(parent)) {
        seedBudget--;
        summary.sprouted++;
      }
    }

    // Moss drifts with the humidity.
    if (this.humidity > 50) {
      const before = this.mossAmount();
      const boost = Math.min(0.3, ticks * 0.00002);
      for (let i = 0; i < N; i++) {
        if (this.moss[i] > 0.05 && this.wet[i] > 0.1) {
          this.moss[i] = Math.min(1, this.moss[i] + boost);
        }
      }
      summary.mossGrown = Math.round(this.mossAmount() - before);
    }

    // Pond evaporation, returned to the soil by condensation.
    if (vol > 0) {
      const frac = Math.min(0.3, (capped / 86400) * 0.25);
      for (let i = 0; i < N; i++) {
        if (this.water[i] > 0) this.water[i] *= 1 - frac;
        if (this.stratN[i] > 0 && Math.random() < frac * 0.5) {
          this.wet[i] = Math.min(1, this.wet[i] + 0.15);
        }
      }
      summary.pondShrank = frac > 0.04;
      this.humidity = Math.min(78, Math.max(55, this.humidity));
    } else {
      this.humidity = Math.max(20, this.humidity - (capped / 3600) * 5);
    }

    this.changed = true;
    this.terrainDirty = true;
    this.waterDirty = true;
    return summary;
  }

  private supplyAt(plant: Plant): number {
    let bestWet = 0;
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = plant.x + dx, z = plant.z + dz;
        if (!this.inBounds(x, z)) continue;
        const i = this.idx(x, z);
        if (this.water[i] > 0.02) return 1;
        if (this.wet[i] > bestWet) bestWet = this.wet[i];
      }
    }
    return Math.min(1, bestWet / 0.45);
  }

  clear(): void {
    this.stratMat.fill(0);
    this.stratH.fill(0);
    this.stratN.fill(0);
    this.groundH.fill(0);
    this.water.fill(0);
    this.wet.fill(0);
    this.moss.fill(0);
    this.rocks = [];
    this.plants = [];
    this.humidity = 50;
    this.changed = true;
    this.terrainDirty = true;
    this.waterDirty = true;
  }
}
