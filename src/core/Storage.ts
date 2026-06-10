import { Grid } from './Grid';
import { Simulation } from './Simulation';
import { Plant } from '../world/Plants';
import { Journal, JournalEntry } from './Journal';

const KEY = 'terrasim-v5'; // grid resolution changed; older saves don't fit

// Returned by load(): when the tank was last saved / born, and its diary.
export interface SaveMeta {
  savedAt: number;
  bornAt: number;
  journal: JournalEntry[];
}

function rleEncode(arr: Uint8Array): number[] {
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

function rleDecode(data: number[], target: Uint8Array): void {
  let i = 0;
  for (let p = 0; p < data.length; p += 2) {
    const v = data[p], n = data[p + 1];
    target.fill(v, i, i + n);
    i += n;
  }
}

export function save(grid: Grid, sim: Simulation, journal: Journal): void {
  try {
    // Quantize moisture to 16 steps so it RLE-compresses well.
    const wetQ = new Uint8Array(grid.wet.length);
    for (let i = 0; i < wetQ.length; i++) wetQ[i] = grid.wet[i] & 0xf0;
    const payload = {
      v: 6,
      type: rleEncode(grid.type),
      shade: rleEncode(grid.shade),
      wet: rleEncode(wetQ),
      humidity: sim.humidity,
      plants: sim.getPlants(),
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

export function load(grid: Grid, sim: Simulation): SaveMeta | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p.v !== 5 && p.v !== 6) return null;
    rleDecode(p.type, grid.type);
    rleDecode(p.shade, grid.shade);
    rleDecode(p.wet, grid.wet);
    sim.humidity = p.humidity ?? 50;
    sim.restorePlants(p.plants as Plant[]);
    sim.changed = true;
    // v5 saves predate the journal — treat them as freshly saved today.
    return {
      savedAt: p.meta?.savedAt ?? Date.now(),
      bornAt: p.meta?.bornAt ?? Date.now(),
      journal: p.meta?.journal ?? [],
    };
  } catch (e) {
    console.warn('load failed', e);
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(KEY);
}
