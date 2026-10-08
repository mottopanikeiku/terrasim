import assert from 'node:assert/strict';
import test from 'node:test';
import { D, V, W } from '../src/core/constants.ts';
import { mulberry32 } from '../src/core/random.ts';
import { MAXS, Mat, N, World } from '../src/core/World.ts';

// The simulation draws from Math.random; a seeded stream keeps these checks repeatable.
Math.random = mulberry32(20261008);

const sum = (values: ArrayLike<number>) => {
  let total = 0;
  for (let i = 0; i < values.length; i++) total += values[i];
  return total;
};

function flatWorld(mat = Mat.SOIL, height = 1): World {
  const world = new World();
  for (let i = 0; i < N; i++) world.addLayer(i, mat, height);
  return world;
}

test('pouring away from the walls adds exactly the requested volume', () => {
  const world = new World();
  world.pour(Mat.SAND, W / 2, D / 2, 4, 2);
  assert.ok(Math.abs(sum(world.groundH) * V * V - 2) < 1e-4);
});

test('strata beyond the per-column limit merge at the bottom without losing height', () => {
  const world = new World();
  const i = world.idx(10, 10);
  const mats = [Mat.GRAVEL, Mat.SAND, Mat.SOIL];
  for (let n = 0; n < 10; n++) world.addLayer(i, mats[n % 3], 0.1 + n * 0.01);
  assert.equal(world.stratN[i], MAXS);
  assert.ok(Math.abs(world.groundH[i] - (1 + 0.45)) < 1e-5);
  assert.equal(world.topMat(i), Mat.GRAVEL);
});

test('digging removes no more material than the column holds', () => {
  const world = new World();
  const i = world.idx(5, 5);
  world.addLayer(i, Mat.GRAVEL, 0.2);
  world.addLayer(i, Mat.SAND, 0.3);
  assert.ok(Math.abs(world.removeTop(i, 0.4) - 0.4) < 1e-6);
  assert.equal(world.topMat(i), Mat.GRAVEL);
  assert.ok(Math.abs(world.removeTop(i, 5) - 0.1) < 1e-6);
  assert.equal(world.stratN[i], 0);
  assert.equal(world.groundH[i], 0);
});

test('a steep pile slumps downhill while conserving material', () => {
  const world = flatWorld(Mat.SOIL, 0.5);
  const peak = world.idx(W / 2, D / 2);
  world.addLayer(peak, Mat.SAND, 3);
  const before = sum(world.groundH);
  for (let n = 0; n < 300; n++) world.tick();
  assert.ok(world.groundH[peak] < 1.5, `peak still ${world.groundH[peak]}`);
  assert.ok(Math.abs(sum(world.groundH) - before) < before * 1e-4);
});

test('standing water levels out over saturated soil and is never created', () => {
  const world = flatWorld(Mat.SOIL, 0.5);
  world.wet.fill(1); // saturated ground: no soaking, only slow evaporation
  world.pourWater(W / 2, D / 2, 3, 3);
  const centre = world.idx(W / 2, D / 2);
  const startDepth = world.water[centre];
  let volume = sum(world.water);
  for (let n = 0; n < 200; n++) {
    world.tick();
    const next = sum(world.water);
    assert.ok(next <= volume + 1e-4);
    volume = next;
  }
  assert.ok(world.water[centre] < startDepth / 4, `centre depth ${world.water[centre]}`);
  assert.ok(world.water[world.idx(W / 2 + 8, D / 2)] > 0);
  assert.ok(volume > (0.9 * 3) / (V * V), `volume ${volume}`);
});

test('a dry plant wilts, dies and composts into soil', () => {
  const world = flatWorld(Mat.SOIL, 1);
  const plant = world.addPlant('fittonia', 40, 30, 0.5);
  const column = world.idx(40, 30);
  const groundBefore = world.groundH[column];
  const looks = new Set<number>();
  for (let n = 0; n < 1200 && world.getPlants().length > 0; n++) {
    world.growth(0.5);
    looks.add(plant.look);
  }
  assert.deepEqual([...looks].sort(), [0, 1, 2]);
  assert.equal(world.getPlants().length, 0);
  assert.ok(world.groundH[column] > groundBefore);
  assert.ok(world.events.some((e) => e.includes('wilting')));
  assert.ok(world.events.some((e) => e.includes('withered')));
  assert.ok(world.events.some((e) => e.includes('composted')));
});

test('a plant in damp soil recovers and grows', () => {
  const world = flatWorld(Mat.SOIL, 1);
  world.wet.fill(1);
  const plant = world.addPlant('pilea', 40, 30, 0.2);
  plant.health = 50;
  for (let n = 0; n < 100; n++) world.growth(0.5);
  assert.equal(plant.health, 100);
  assert.ok(plant.stage > 0.2);
  assert.equal(plant.look, 0);
});

test('away time composts dead plants and caps catch-up at 72 hours', () => {
  const world = flatWorld(Mat.SOIL, 1);
  const dead = world.addPlant('pilea', 20, 20, 1);
  dead.look = 2;
  dead.decayT = 120;
  const dry = world.addPlant('fittonia', 100, 40, 0.5);
  const summary = world.fastForward(30 * 86400);
  assert.equal(summary.seconds, 30 * 86400);
  assert.equal(summary.composted, 1);
  assert.equal(summary.died, 1);
  assert.equal(dry.look, 2);
  // No pond: humidity drains by 5 points per hour of capped time, floored at 20.
  assert.equal(world.humidity, 20);
});
