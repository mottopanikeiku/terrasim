import assert from 'node:assert/strict';
import test from 'node:test';
import { Scene } from 'three';
import { World } from '../src/core/World.ts';
import { PlantRenderer } from '../src/world/PlantRenderer.ts';

test('plants render at their stored growth stage on the first frame', () => {
  for (const stage of [0.15, 0.5, 1]) {
    const world = new World();
    const plant = world.addPlant('asplenium', 20, 20, stage);
    const scene = new Scene();
    const renderer = new PlantRenderer(scene, world);
    renderer.update(0, 0);
    assert.equal(scene.children.length, 1);
    assert.equal(scene.children[0].scale.x, 3 * (0.14 + 0.86 * stage));
    assert.equal(plant.stage, stage);
    renderer.clear();
  }
});
