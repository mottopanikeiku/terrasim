import { W, H, D } from './constants';
import { Cell, F_SETTLED, Grid, WET_SOAKED, WET_VISIBLE } from './Grid';
import { Plant, Species } from '../world/Plants';
import { randomShade } from './palette';

// The living-system simulation:
// - granular pour physics (falling sand, angle of repose, sinking in water)
// - a closed water cycle: ponds evaporate -> humidity -> condensation on the
//   glass -> trickles re-wet the soil near the walls; surface soil dries out
// - plants (smooth meshes, anchored to the grid) drink moisture to grow;
//   thirsty plants wilt, die, and compost back into soil; healthy mature
//   plants reseed nearby
// - moss is a surface cellular automaton: it creeps over damp ground and
//   rocks, and retreats when the tank dries out

const MAX_PLANTS = 60;
const MAX_MOSS = 3600;

// Species thirst (health lost per dry growth tick) and reseed chances —
// shared by the live growth loop and the away-time fast-forward.
const THIRST: Record<Species, number> = {
  succulent: 0.03, grass: 0.11, flower: 0.15, fern: 0.16, mushroom: 0.18,
};
const SPREAD_CHANCE: Record<Species, number> = {
  grass: 0.002, flower: 0.0012, fern: 0.0009, mushroom: 0.0015, succulent: 0.0005,
};

// What happened while the keeper was away — for the welcome-back card.
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

export class Simulation {
  changed = true; // renderer should rebuild
  humidity = 50;  // 0..100, air moisture inside the tank
  events: string[] = []; // notable happenings, drained by the UI

  private plants: Plant[] = [];
  private nextPlantId = 1;
  private growthTimer = 0;
  private firstBloomSeen = false;
  private mossCount = -1; // lazily counted

  constructor(readonly grid: Grid) {}

  // ---- core CA tick (30 Hz) ----

  tick(): void {
    const g = this.grid;
    const { type, flags } = g;
    let moved = false;

    // Hot path: one linear pass. The array layout is y-major ascending, so
    // linear order IS bottom-up; coordinates are decoded only for the few
    // active cells. Direction bias is handled by per-grain shuffled dirs.
    const n = type.length;
    const WD = W * D;
    for (let i = 0; i < n; i++) {
      const t = type[i];
      if (t === Cell.EMPTY) continue;
      if (flags[i] & F_SETTLED) continue;

      const y = (i / WD) | 0;
      const rem = i - y * WD;
      const z = (rem / W) | 0;
      const x = rem - z * W;

      if (t === Cell.SAND || t === Cell.SOIL || t === Cell.GRAVEL) {
        moved = this.stepGranular(x, y, z, i) || moved;
      } else if (t === Cell.WATER) {
        moved = this.stepWater(x, y, z, i) || moved;
      } else {
        flags[i] |= F_SETTLED; // static types never move
      }
    }

    this.waterCycle();
    if (moved) this.changed = true;
  }

  // Sparse random sampling drives the slow processes cheaply.
  private waterCycle(): void {
    const g = this.grid;
    const { type, wet } = g;
    const n = type.length;

    for (let s = 0; s < 320; s++) {
      const i = (Math.random() * n) | 0;
      const t = type[i] as Cell;
      const above = i + W * D;
      const openAbove = above < n ? type[above] === Cell.EMPTY : true;

      if (t === Cell.WATER && openAbove) {
        // Evaporation from exposed water.
        this.humidity = Math.min(100, this.humidity + 0.022);
        if (Math.random() < 0.0012) {
          type[i] = Cell.EMPTY;
          g.shade[i] = 0;
          g.flags[i] = 0;
          this.wakeIndex(i);
          this.changed = true;
        } else if (Math.random() < 0.6 && this.puddleSize(i, 14) < 14) {
          // Tiny trapped puddles (water threaded between pebbles, splash
          // leftovers) seep into the ground — only real pools persist.
          const below = i - W * D;
          if (below >= 0 && (type[below] === Cell.SOIL || type[below] === Cell.SAND)) {
            wet[below] = Math.min(255, wet[below] + 60);
          }
          this.humidity = Math.min(100, this.humidity + 0.03);
          type[i] = Cell.EMPTY;
          g.shade[i] = 0;
          g.flags[i] = 0;
          this.wakeIndex(i);
          this.changed = true;
        }
      } else if ((t === Cell.SOIL || t === Cell.SAND) && wet[i] > 0) {
        if (openAbove) {
          // Surface soil dries into the air.
          const before = wet[i];
          const loss = Math.min(wet[i], 3);
          wet[i] -= loss;
          this.touchIfWetCrossed(i, before);
          this.humidity = Math.min(100, this.humidity + loss * 0.004);
          this.changed = true;
        }
        // Percolation downward.
        const below = i - W * D;
        if (below >= 0 && wet[i] > 64) {
          const bt = type[below] as Cell;
          if ((bt === Cell.SOIL || bt === Cell.SAND) && wet[below] < wet[i] - 32) {
            const beforeB = wet[below], beforeI = wet[i];
            wet[below] = Math.min(255, wet[below] + 24);
            wet[i] -= 24;
            this.touchIfWetCrossed(below, beforeB);
            this.touchIfWetCrossed(i, beforeI);
          }
        }
      } else if (t === Cell.MOSS) {
        this.stepMoss(i);
      }
    }

    // The lid leaks a little — keeps a big pond's equilibrium around 65-75%
    // instead of pinning the gauge at 100.
    this.humidity = Math.max(0, this.humidity - 0.012);

    // Condensation: humid air fogs the glass and trickles down the walls,
    // re-wetting the soil near the edges.
    if (this.humidity > 60 && Math.random() < 0.25) {
      const side = (Math.random() * 4) | 0;
      const x = side === 0 ? 1 : side === 1 ? W - 2 : 1 + ((Math.random() * (W - 2)) | 0);
      const z = side === 2 ? 1 : side === 3 ? D - 2 : 1 + ((Math.random() * (D - 2)) | 0);
      const top = this.grid.top(x, z);
      if (top >= 0) {
        const i = this.grid.idx(x, top, z);
        const t = type[i] as Cell;
        if ((t === Cell.SOIL || t === Cell.SAND) && wet[i] < 200) {
          const before = wet[i];
          wet[i] = Math.min(255, wet[i] + 50);
          this.touchIfWetCrossed(i, before);
          this.humidity -= 0.5;
          this.changed = true;
        }
      }
    }
  }

  // Moss creeps across damp surfaces and retreats from dry ones.
  private stepMoss(i: number): void {
    const g = this.grid;
    const y = (i / (W * D)) | 0;
    const r = i - y * W * D;
    const z = (r / W) | 0;
    const x = r - z * W;

    const below = y > 0 ? g.type[i - W * D] as Cell : Cell.ROCK;
    const belowWet = y > 0 ? g.wet[i - W * D] : 0;
    const damp = belowWet > 20 || below === Cell.ROCK && this.humidity > 50 || this.humidity > 68;

    if (!damp && this.humidity < 38 && Math.random() < 0.12) {
      // Dries out and dies back.
      g.clearCell(x, y, z);
      this.changed = true;
      return;
    }
    if (!damp || Math.random() > 0.14) return;
    if (this.mossCells() >= MAX_MOSS) return;

    // Creep to a neighboring surface within a small step up/down.
    const dx = Math.random() < 0.5 ? 1 : -1;
    const dz = Math.random() < 0.5 ? 1 : -1;
    const nx = Math.random() < 0.5 ? x + dx : x;
    const nz = nx === x ? z + dz : z;
    if (nx < 0 || nx >= W || nz < 0 || nz >= D) return;
    for (let ny = Math.min(H - 2, y + 2); ny >= Math.max(1, y - 3); ny--) {
      const ti = g.idx(nx, ny, nz);
      const bi = ti - W * D;
      const bt = g.type[bi] as Cell;
      if (g.type[ti] === Cell.EMPTY && (bt === Cell.SOIL || bt === Cell.SAND || bt === Cell.ROCK || bt === Cell.GRAVEL)) {
        g.set(nx, ny, nz, Cell.MOSS, randomShade('moss'));
        g.flags[g.idx(nx, ny, nz)] |= F_SETTLED;
        this.mossCount++;
        this.changed = true;
        return;
      }
      if (g.type[ti] !== Cell.EMPTY && g.type[ti] !== Cell.MOSS) return; // wall of something
    }
  }

  // Size of the connected water body containing cell i, capped at `cap`
  // (BFS over the 6-neighborhood; tiny bound keeps this O(cap)).
  private puddleStack: number[] = [];
  private puddleSeen = new Set<number>();
  private puddleSize(start: number, cap: number): number {
    const { type } = this.grid;
    const WD = W * D;
    const stack = this.puddleStack;
    const seen = this.puddleSeen;
    stack.length = 0;
    seen.clear();
    stack.push(start);
    seen.add(start);
    let size = 0;
    while (stack.length > 0) {
      const i = stack.pop()!;
      size++;
      if (size >= cap) return size;
      const y = (i / WD) | 0;
      const rem = i - y * WD;
      const z = (rem / W) | 0;
      const x = rem - z * W;
      const tryCell = (j: number) => {
        if (j >= 0 && j < type.length && type[j] === Cell.WATER && !seen.has(j)) {
          seen.add(j);
          stack.push(j);
        }
      };
      if (x > 0) tryCell(i - 1);
      if (x < W - 1) tryCell(i + 1);
      if (z > 0) tryCell(i - W);
      if (z < D - 1) tryCell(i + W);
      if (y > 0) tryCell(i - WD);
      if (y < H - 1) tryCell(i + WD);
    }
    return size;
  }

  mossCells(): number {
    if (this.mossCount < 0) {
      this.mossCount = 0;
      for (let i = 0; i < this.grid.type.length; i++) if (this.grid.type[i] === Cell.MOSS) this.mossCount++;
    }
    return this.mossCount;
  }

  paintMoss(cx: number, cz: number): boolean {
    const g = this.grid;
    let added = 0;
    for (let n = 0; n < 26; n++) {
      const x = cx + Math.round((Math.random() - 0.5) * 8);
      const z = cz + Math.round((Math.random() - 0.5) * 8);
      if (x < 0 || x >= W || z < 0 || z >= D) continue;
      const top = g.top(x, z);
      if (top < 0 || top >= H - 2) continue;
      const t = g.get(x, top, z);
      if (t === Cell.WATER || t === Cell.MOSS) continue;
      g.set(x, top + 1, z, Cell.MOSS, randomShade('moss'));
      g.flags[g.idx(x, top + 1, z)] |= F_SETTLED;
      added++;
    }
    if (added > 0) {
      this.mossCount = -1;
      this.changed = true;
    }
    return added > 0;
  }

  // Moisture changes only need a remesh when they cross a visual threshold
  // (damp / soaked darkening) — otherwise wet drift would dirty every chunk
  // every tick.
  private touchIfWetCrossed(i: number, before: number): void {
    const now = this.grid.wet[i];
    if ((before >= WET_VISIBLE) !== (now >= WET_VISIBLE) || (before >= WET_SOAKED) !== (now >= WET_SOAKED)) {
      this.grid.touchIndex(i);
    }
  }

  private wakeIndex(i: number): void {
    const y = (i / (W * D)) | 0;
    const r = i - y * W * D;
    const z = (r / W) | 0;
    const x = r - z * W;
    this.grid.wake(x, y, z);
  }

  private move(fx: number, fy: number, fz: number, fi: number, tx: number, ty: number, tz: number): void {
    const g = this.grid;
    const ti = g.idx(tx, ty, tz);
    g.type[ti] = g.type[fi];
    g.shade[ti] = g.shade[fi];
    g.flags[ti] = 0;
    g.wet[ti] = g.wet[fi];
    g.type[fi] = Cell.EMPTY;
    g.shade[fi] = 0;
    g.flags[fi] = 0;
    g.wet[fi] = 0;
    g.wake(fx, fy, fz);
    g.wake(tx, ty, tz);
  }

  private swap(fi: number, ti: number): void {
    const g = this.grid;
    const t = g.type[ti], s = g.shade[ti], wv = g.wet[ti];
    g.type[ti] = g.type[fi];
    g.shade[ti] = g.shade[fi];
    g.flags[ti] = 0;
    g.wet[ti] = g.wet[fi];
    g.type[fi] = t;
    g.shade[fi] = s;
    g.flags[fi] = 0;
    g.wet[fi] = wv;
  }

  private static DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  private shuffledDirs(): [number, number][] {
    const d = Simulation.DIRS.slice();
    for (let i = d.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  private stepGranular(x: number, y: number, z: number, i: number): boolean {
    const g = this.grid;
    if (y === 0) {
      g.flags[i] |= F_SETTLED;
      return false;
    }
    const belowT = g.get(x, y - 1, z);
    if (belowT === Cell.EMPTY) {
      // Free fall covers two cells per tick so fine grains still drop briskly.
      if (y > 1 && g.get(x, y - 2, z) === Cell.EMPTY) {
        this.move(x, y, z, i, x, y - 2, z);
      } else {
        this.move(x, y, z, i, x, y - 1, z);
      }
      return true;
    }
    if (belowT === Cell.WATER) {
      this.swap(i, g.idx(x, y - 1, z));
      g.wake(x, y, z);
      this.changed = true;
      return true;
    }
    if (belowT === Cell.MOSS) {
      // Grains crush moss they land on.
      this.mossCount = -1;
      this.move(x, y, z, i, x, y - 1, z);
      return true;
    }
    for (const [dx, dz] of this.shuffledDirs()) {
      const nx = x + dx, nz = z + dz;
      if (!g.inBounds(nx, y - 1, nz)) continue;
      const side = g.get(nx, y, nz);
      const diag = g.get(nx, y - 1, nz);
      if ((side === Cell.EMPTY || side === Cell.WATER) && diag === Cell.EMPTY) {
        this.move(x, y, z, i, nx, y - 1, nz);
        return true;
      }
      if (side === Cell.WATER && diag === Cell.WATER && Math.random() < 0.5) {
        this.swap(i, g.idx(nx, y - 1, nz));
        this.changed = true;
        return true;
      }
    }
    g.flags[i] |= F_SETTLED;
    return false;
  }

  private stepWater(x: number, y: number, z: number, i: number): boolean {
    const g = this.grid;

    if (y > 0) {
      const bi = g.idx(x, y - 1, z);
      const bt = g.type[bi] as Cell;
      // Soak in slowly so puddles visibly pool before the ground drinks them.
      if ((bt === Cell.SOIL || bt === Cell.SAND) && g.wet[bi] < 140 && Math.random() < 0.01) {
        g.wet[bi] = Math.min(255, g.wet[bi] + 130);
        g.type[i] = Cell.EMPTY;
        g.shade[i] = 0;
        g.flags[i] = 0;
        g.wake(x, y, z);
        this.changed = true;
        return true;
      }
      if (bt === Cell.EMPTY) {
        if (y > 1 && g.get(x, y - 2, z) === Cell.EMPTY) {
          this.move(x, y, z, i, x, y - 2, z);
        } else {
          this.move(x, y, z, i, x, y - 1, z);
        }
        return true;
      }
    }

    // Flow downhill: diagonal drops first. A cell riding on top of other
    // water also skates sideways across the surface — that's how a poured
    // mound levels out into a flat sheet that actually submerges the bed.
    // (No jitter risk: on a full flat surface there is no EMPTY side cell.)
    for (const [dx, dz] of this.shuffledDirs()) {
      const nx = x + dx, nz = z + dz;
      if (y > 0 && g.get(nx, y, nz) === Cell.EMPTY) {
        const diag = g.get(nx, y - 1, nz);
        if (diag === Cell.EMPTY) {
          this.move(x, y, z, i, nx, y - 1, nz);
          return true;
        }
        if (diag === Cell.WATER && g.get(x, y - 1, z) === Cell.WATER && Math.random() < 0.5) {
          this.move(x, y, z, i, nx, y, nz);
          return true;
        }
      }
    }
    // Level out: spread sideways only over SOLID ground (never slosh across
    // other water — that caused endless surface jitter), and only if the
    // spot above the target is open so water doesn't burrow.
    for (const [dx, dz] of this.shuffledDirs()) {
      const nx = x + dx, nz = z + dz;
      const belowTarget = g.get(nx, y - 1, nz);
      if (
        g.get(nx, y, nz) === Cell.EMPTY &&
        belowTarget !== Cell.EMPTY && belowTarget !== Cell.WATER &&
        Math.random() < 0.25
      ) {
        this.move(x, y, z, i, nx, y, nz);
        return true;
      }
    }
    // Stranded films and lonely droplets: thin ragged water (a single cell,
    // or the 1-neighbor tail of a film smeared across a slope) soaks into
    // the ground or evaporates instead of sitting around as blue specks.
    // Crucially, these cells never settle — they stay awake until gone, and
    // ponds erode their ragged rims until the waterline reads smooth.
    const sideWater =
      (g.get(x + 1, y, z) === Cell.WATER ? 1 : 0) +
      (g.get(x - 1, y, z) === Cell.WATER ? 1 : 0) +
      (g.get(x, y, z + 1) === Cell.WATER ? 1 : 0) +
      (g.get(x, y, z - 1) === Cell.WATER ? 1 : 0);
    const vertWater =
      g.get(x, y + 1, z) === Cell.WATER || (y > 0 && g.get(x, y - 1, z) === Cell.WATER);
    if (!vertWater && sideWater <= 1) {
      // Films seep away faster on gravel — it's the drainage layer — but a
      // connected pond sheet (2+ side neighbors) is never drained by this.
      const onGravel = y > 0 && g.get(x, y - 1, z) === Cell.GRAVEL;
      const fade = (sideWater === 0 ? 0.06 : 0.035) * (onGravel ? 2.5 : 1);
      if (Math.random() < fade) {
        if (y > 0) {
          const bi = g.idx(x, y - 1, z);
          const bt = g.type[bi] as Cell;
          if (bt === Cell.SOIL || bt === Cell.SAND) {
            g.wet[bi] = Math.min(255, g.wet[bi] + 100);
          }
        }
        this.humidity = Math.min(100, this.humidity + 0.05);
        g.type[i] = Cell.EMPTY;
        g.shade[i] = 0;
        g.flags[i] = 0;
        g.wake(x, y, z);
        this.changed = true;
      }
      return true;
    }
    if (Math.random() < 0.5) this.grid.flags[i] |= F_SETTLED;
    return false;
  }

  // ---- plants ----

  addPlant(species: Species, x: number, y: number, z: number, initialStage = 0.15): Plant {
    const plant: Plant = {
      id: this.nextPlantId++,
      species,
      x, y, z,
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
    for (const p of plants) {
      if (p.health === undefined) p.health = 80;
      if (p.look === undefined) p.look = 0;
      if (p.decayT === undefined) p.decayT = 0;
    }
    this.plants = plants;
    this.nextPlantId = plants.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  }

  // Slow life processes; dt in (sim-time) seconds, called from the main loop.
  growth(dt: number): void {
    this.growthTimer += dt;
    if (this.growthTimer < 0.5) return;
    this.growthTimer = 0;

    const g = this.grid;
    for (let p = this.plants.length - 1; p >= 0; p--) {
      const plant = this.plants[p];

      // Support check: the ground under the anchor must still exist.
      const below = g.get(plant.x, plant.y - 1, plant.z);
      if (below === Cell.EMPTY || below === Cell.WATER) {
        // Re-anchor downward if the ground slumped, otherwise it dies.
        const top = g.top(plant.x, plant.z);
        if (top >= 0 && g.get(plant.x, top, plant.z) !== Cell.WATER && plant.y - top < 6) {
          plant.y = top + 1;
        } else {
          this.plants.splice(p, 1);
          continue;
        }
      }

      if (plant.look === 2) {
        plant.decayT -= 0.5;
        if (plant.decayT <= 0) this.compost(plant, p);
        continue;
      }

      // Drink: species differ in thirst — succulents shrug off droughts.
      // Paced for real-time watching: a thirsty fern wilts after ~2 dry
      // minutes and has ~2 more before it's gone.
      const drank = this.drink(plant);
      if (drank) {
        plant.health = Math.min(100, plant.health + 1.2);
      } else {
        plant.health -= THIRST[plant.species];
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

      // Real-time growth: a seedling takes ~9 minutes to mature at 1x —
      // slow enough to watch, fast enough to feel alive.
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
  }

  // Consume moisture from soil near the anchor (or live off an adjacent pond).
  private drink(plant: Plant): boolean {
    const g = this.grid;
    let bestI = -1, bestWet = 0;
    for (let dy = -4; dy <= 0; dy++) {
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          const x = plant.x + dx, y = plant.y + dy, z = plant.z + dz;
          if (!g.inBounds(x, y, z)) continue;
          const i = g.idx(x, y, z);
          const t = g.type[i] as Cell;
          if (t === Cell.WATER) return true;
          if ((t === Cell.SOIL || t === Cell.SAND) && g.wet[i] > bestWet) {
            bestWet = g.wet[i];
            bestI = i;
          }
        }
      }
    }
    if (bestI >= 0 && bestWet >= 24) {
      this.grid.wet[bestI] -= 4;
      this.touchIfWetCrossed(bestI, bestWet);
      return true;
    }
    return false;
  }

  // Dead plants compost: removed from the world, returning a little soil.
  private compost(plant: Plant, index: number): void {
    const g = this.grid;
    const top = g.top(plant.x, plant.z);
    for (let n = 0; n < 2; n++) {
      const x = plant.x + ((Math.random() * 3) | 0) - 1;
      const z = plant.z + ((Math.random() * 3) | 0) - 1;
      const y = Math.min(H - 2, (top >= 0 ? top : plant.y) + 1 + n);
      if (g.inBounds(x, y, z) && g.isEmpty(x, y, z)) {
        g.set(x, y, z, Cell.SOIL, randomShade('soil'), 30);
      }
    }
    this.plants.splice(index, 1);
    this.events.push(`The dead ${plant.species} composted into fresh soil \u{267B}\u{FE0F}`);
    this.changed = true;
  }

  // Critters nibble dead plants, speeding up decay.
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

  private trySpread(plant: Plant): void {
    if (Math.random() > SPREAD_CHANCE[plant.species]) return;
    this.spreadOnce(plant);
  }

  // Attempt one reseed near a parent; returns true if a seedling landed.
  private spreadOnce(plant: Plant): boolean {
    const g = this.grid;
    const ang = Math.random() * Math.PI * 2;
    const dist = 8 + Math.random() * 12;
    const x = Math.round(plant.x + Math.cos(ang) * dist);
    const z = Math.round(plant.z + Math.sin(ang) * dist);
    if (x < 3 || x >= W - 3 || z < 3 || z >= D - 3) return false;
    const top = g.top(x, z);
    if (top < 0 || top >= H - 6) return false;
    const ti = g.idx(x, top, z);
    const tt = g.type[ti] as Cell;
    if (tt === Cell.WATER) return false;
    const needsSoil = plant.species !== 'mushroom';
    if (needsSoil && tt !== Cell.SOIL && tt !== Cell.SAND) return false;
    if (g.wet[ti] < 24 && plant.species !== 'succulent') return false; // seeds need damp ground
    for (const other of this.plants) {
      if (Math.abs(other.x - x) + Math.abs(other.z - z) < 9) return false;
    }
    this.addPlant(plant.species, x, top + 1, z, 0.06);
    this.events.push(`A ${plant.species} seedling sprouted \u{1F331}`);
    return true;
  }

  // ---- away-time fast-forward ----

  // Coarse, closed-form evolution for time spent away from the tab. It is
  // deliberately gentler than the live sim — coming back to a graveyard
  // kills the hobby — but a tank left with no water for days will still
  // lose its thirstiest plants, and a healthy one will have visibly grown.
  fastForward(seconds: number): AwaySummary {
    const g = this.grid;
    const capped = Math.min(seconds, 72 * 3600);
    const ticks = capped / 0.5; // growth-tick equivalents
    const summary: AwaySummary = {
      seconds, matured: 0, sprouted: 0, wilted: 0, died: 0,
      composted: 0, mossGrown: 0, pondShrank: false,
    };

    let waterCells = 0;
    for (let i = 0; i < g.type.length; i++) if (g.type[i] === Cell.WATER) waterCells++;
    const hasPond = waterCells > 40;

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

    // Reseeding: healthy mature plants quietly multiplied while you were out.
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

    // Moss creep: reuse the CA step on random existing moss cells.
    if (this.humidity > 50) {
      const mossIdx: number[] = [];
      for (let i = 0; i < g.type.length; i++) if (g.type[i] === Cell.MOSS) mossIdx.push(i);
      if (mossIdx.length > 0) {
        const before = mossIdx.length;
        const attempts = Math.min(1500, ticks * 0.15) | 0;
        for (let a = 0; a < attempts; a++) {
          this.stepMoss(mossIdx[(Math.random() * mossIdx.length) | 0]);
        }
        summary.mossGrown = Math.max(0, this.mossCells() - before);
      }
    }

    // The pond evaporated a little; the moisture went back into the soil
    // (condensation kept running while you were away).
    if (waterCells > 0) {
      const frac = Math.min(0.3, (capped / 86400) * 0.25);
      let quota = (waterCells * frac) | 0;
      const removed = quota;
      const WD = W * D;
      for (let i = g.type.length - 1; i >= 0 && quota > 0; i--) {
        if (g.type[i] !== Cell.WATER) continue;
        const above = i + WD;
        if (above < g.type.length && g.type[above] !== Cell.EMPTY) continue;
        g.type[i] = Cell.EMPTY;
        g.shade[i] = 0;
        g.flags[i] = 0;
        quota--;
      }
      summary.pondShrank = removed > waterCells * 0.04;
      for (let k = 0; k < removed; k++) {
        const x = 1 + ((Math.random() * (W - 2)) | 0);
        const z = 1 + ((Math.random() * (D - 2)) | 0);
        const top = g.top(x, z);
        if (top < 0) continue;
        const i = g.idx(x, top, z);
        const t = g.type[i] as Cell;
        if (t === Cell.SOIL || t === Cell.SAND) g.wet[i] = Math.min(255, g.wet[i] + 40);
      }
      this.humidity = Math.min(78, Math.max(55, this.humidity));
    } else {
      this.humidity = Math.max(20, this.humidity - (capped / 3600) * 5);
    }

    this.mossCount = -1;
    this.changed = true;
    this.grid.touchAll();
    return summary;
  }

  // Non-consuming version of drink(): how well-supplied is this plant, 0..1.
  private supplyAt(plant: Plant): number {
    const g = this.grid;
    let bestWet = 0;
    for (let dy = -4; dy <= 0; dy++) {
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          const x = plant.x + dx, y = plant.y + dy, z = plant.z + dz;
          if (!g.inBounds(x, y, z)) continue;
          const i = g.idx(x, y, z);
          const t = g.type[i] as Cell;
          if (t === Cell.WATER) return 1;
          if ((t === Cell.SOIL || t === Cell.SAND) && g.wet[i] > bestWet) bestWet = g.wet[i];
        }
      }
    }
    return Math.min(1, bestWet / 110);
  }

  // Uproot any plant whose anchor falls inside the erase sphere.
  uprootNear(x: number, y: number, z: number, r: number): void {
    for (let p = this.plants.length - 1; p >= 0; p--) {
      const plant = this.plants[p];
      const d = Math.max(Math.abs(plant.x - x), Math.abs(plant.y - y), Math.abs(plant.z - z));
      if (d <= r + 1) this.plants.splice(p, 1);
    }
  }

  // Condition alerts: what the keeper should know right now.
  alerts(s: { humidity: number; water: number; plants: number; healthyFrac: number }): string[] {
    const out: string[] = [];
    if (s.plants === 0) out.push('\u{1F331} Nothing is growing — scatter some seeds');
    if (s.water === 0) out.push('\u{1F3DC}\u{FE0F} No standing water — the water cycle has stalled');
    else if (s.humidity < 42) out.push('\u{1F4A8} The air is dry — pour some water');
    if (s.humidity > 88) out.push('\u{1F4A6} Very humid — the glass is fogging heavily');
    if (s.plants > 0 && s.healthyFrac < 0.7) out.push('\u{1F940} Plants are thirsty — water the soil near them');
    return out;
  }

  // Aggregate stats for the UI.
  stats(): { humidity: number; water: number; plants: number; healthyFrac: number } {
    let water = 0;
    for (let i = 0; i < this.grid.type.length; i++) if (this.grid.type[i] === Cell.WATER) water++;
    const alive = this.plants.filter((p) => p.look !== 2);
    const healthy = alive.filter((p) => p.look === 0).length;
    return {
      humidity: this.humidity,
      water,
      plants: alive.length,
      healthyFrac: alive.length ? healthy / alive.length : 1,
    };
  }
}
