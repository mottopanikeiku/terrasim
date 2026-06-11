import { World, N, MAXS } from './World';
import { Plant } from '../world/Plants';
import { Journal, JournalEntry } from './Journal';

const KEY = 'terrasim-v5'; // same slot; payload carries its own version

export interface SaveMeta {
  savedAt: number;
  bornAt: number;
  journal: JournalEntry[];
}

function rleEncode(arr: ArrayLike<number>): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i];
    let n = 1;
    while (i + n < arr.length && arr[i + n] === v && n < 0xffff) n++;
    out.push(v, n);
    i += n;
  }
  return out;
}

function rleDecode(data: number[], target: { [k: number]: number; length: number }): void {
  let i = 0;
  for (let p = 0; p < data.length; p += 2) {
    const v = data[p], n = data[p + 1];
    for (let k = 0; k < n && i < target.length; k++) target[i++] = v;
  }
}

// Quantize a float array to integers for clean RLE.
function quant(arr: Float32Array, scale: number): number[] {
  const q = new Array<number>(arr.length);
  for (let i = 0; i < arr.length; i++) q[i] = Math.round(arr[i] * scale);
  return rleEncode(q);
}

function dequant(data: number[], target: Float32Array, scale: number): void {
  const tmp = new Array<number>(target.length).fill(0);
  rleDecode(data, tmp as unknown as { [k: number]: number; length: number });
  for (let i = 0; i < target.length; i++) target[i] = tmp[i] / scale;
}

export function save(world: World, journal: Journal): void {
  try {
    const payload = {
      v: 7,
      stratMat: rleEncode(world.stratMat),
      stratH: quant(world.stratH, 200),
      stratN: rleEncode(world.stratN),
      water: quant(world.water, 200),
      wet: quant(world.wet, 100),
      moss: quant(world.moss, 100),
      humidity: world.humidity,
      plants: world.getPlants(),
      rocks: world.rocks,
      meta: {
        savedAt: Date.now(),
        bornAt: journal.bornAt,
        journal: journal.entries,
      },
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('save failed', e);
  }
}

// Returns meta when a compatible (v7) world was restored; returns
// { meta, restored: false } when only the diary could be salvaged from an
// older save; null when there is no save at all.
export function load(world: World): { meta: SaveMeta; restored: boolean } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const meta: SaveMeta = {
      savedAt: p.meta?.savedAt ?? Date.now(),
      bornAt: p.meta?.bornAt ?? Date.now(),
      journal: p.meta?.journal ?? [],
    };
    if (p.v !== 7) return { meta, restored: false };

    rleDecode(p.stratMat, world.stratMat as unknown as { [k: number]: number; length: number });
    dequant(p.stratH, world.stratH, 200);
    rleDecode(p.stratN, world.stratN as unknown as { [k: number]: number; length: number });
    dequant(p.water, world.water, 200);
    dequant(p.wet, world.wet, 100);
    dequant(p.moss, world.moss, 100);
    for (let i = 0; i < N; i++) {
      let h = 0;
      for (let s = 0; s < world.stratN[i]; s++) h += world.stratH[i * MAXS + s];
      world.groundH[i] = h;
    }
    world.humidity = p.humidity ?? 50;
    world.rocks = p.rocks ?? [];
    const plants = (p.plants ?? []) as Plant[];
    for (const pl of plants) {
      if (pl.health === undefined) pl.health = 80;
      if (pl.look === undefined) pl.look = 0;
      if (pl.decayT === undefined) pl.decayT = 0;
    }
    world.restorePlants(plants);
    world.changed = true;
    world.terrainDirty = true;
    world.waterDirty = true;
    return { meta, restored: true };
  } catch (e) {
    console.warn('load failed', e);
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(KEY);
}
