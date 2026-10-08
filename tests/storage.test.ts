import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../src/core/random.ts';
import { Journal } from '../src/core/Journal.ts';
import { clearSave, load, save } from '../src/core/Storage.ts';
import { Mat, N, World } from '../src/core/World.ts';
import { buildDefaultScene } from '../src/world/DefaultScene.ts';

Math.random = mulberry32(7);

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => store.clear(),
  key: (index: number) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
} as Storage;

const KEY = 'terrasim-v5';

function maxDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  return worst;
}

test('a saved tank restores terrain, water, plants and diary', () => {
  store.clear();
  const world = new World();
  buildDefaultScene(world);
  world.pourWater(30, 30, 3, 0.5);
  const journal = new Journal();
  journal.add('A new terrarium was born');
  save(world, journal);

  const restored = new World();
  const result = load(restored);
  assert.ok(result);
  assert.equal(result.restored, true);
  assert.deepEqual(result.meta.journal.map((e) => e.msg), ['A new terrarium was born']);
  assert.equal(result.meta.bornAt, journal.bornAt);
  assert.deepEqual(restored.stratN, world.stratN);
  assert.deepEqual(restored.stratMat, world.stratMat);
  // Heights and water are stored to 1/200 of a world unit per stratum.
  assert.ok(maxDiff(restored.groundH, world.groundH) < 0.02);
  assert.ok(maxDiff(restored.water, world.water) <= 0.0025 + 1e-6);
  assert.ok(maxDiff(restored.wet, world.wet) <= 0.005 + 1e-6);
  assert.deepEqual(restored.getPlants(), world.getPlants());
  assert.deepEqual(restored.rocks, world.rocks);
  assert.equal(restored.litter.length, world.litter.length);
  assert.equal(restored.humidity, world.humidity);
  // New plants continue the saved id sequence.
  const next = restored.addPlant('pilea', 10, 10);
  assert.ok(next.id > Math.max(...world.getPlants().map((p) => p.id)));
});

test('older plant records gain defaults and current species names', () => {
  store.clear();
  const world = new World();
  for (let i = 0; i < N; i++) world.addLayer(i, Mat.SOIL, 0.5);
  world.addPlant('pilea', 20, 20);
  save(world, new Journal());
  const payload = JSON.parse(store.get(KEY)!);
  payload.plants = [{ id: 4, species: 'fern', x: 20, z: 20, seed: 1, stage: 0.5 }];
  store.set(KEY, JSON.stringify(payload));

  const restored = new World();
  assert.equal(load(restored)?.restored, true);
  assert.deepEqual(restored.getPlants(), [
    { id: 4, species: 'nephrolepis', x: 20, z: 20, seed: 1, stage: 0.5, health: 80, look: 0, decayT: 0 },
  ]);
});

test('an older save format keeps only the diary; no save or a corrupt save loads nothing', () => {
  store.clear();
  assert.equal(load(new World()), null);
  store.set(KEY, JSON.stringify({ v: 6, meta: { savedAt: 1, bornAt: 2, journal: [{ at: 3, msg: 'old' }] } }));
  assert.deepEqual(load(new World()), {
    meta: { savedAt: 1, bornAt: 2, journal: [{ at: 3, msg: 'old' }] },
    restored: false,
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    store.set(KEY, '{not json');
    assert.equal(load(new World()), null);
  } finally {
    console.warn = warn;
  }
  clearSave();
  assert.equal(store.has(KEY), false);
});

test('the first-bloom milestone survives a reload', () => {
  store.clear();
  const world = new World();
  world.firstBloomSeen = true;
  save(world, new Journal());
  const restored = new World();
  load(restored);
  assert.equal(restored.firstBloomSeen, true);

  // Saves written before the flag existed fall back to the diary.
  const payload = JSON.parse(store.get(KEY)!);
  delete payload.firstBloom;
  store.set(KEY, JSON.stringify(payload));
  load(restored);
  assert.equal(restored.firstBloomSeen, false);
  payload.meta.journal = [{ at: 1, msg: 'First bloom! \u{1F338}' }];
  store.set(KEY, JSON.stringify(payload));
  load(restored);
  assert.equal(restored.firstBloomSeen, true);
});
