import assert from 'node:assert/strict';
import test from 'node:test';
import { RenderPolicy } from '../src/core/RenderPolicy.ts';

test('resolution stays within the device ratio, ratio cap and pixel budget', () => {
  const desktop = new RenderPolicy(false);
  const mobile = new RenderPolicy(true);
  for (const [width, height] of [[390, 844], [1920, 1080], [7680, 4320]]) {
    for (const deviceRatio of [1, 2, 3]) {
      const ratio = desktop.pixelRatio(deviceRatio, width, height);
      assert.ok(ratio <= deviceRatio && ratio <= 1.5);
      assert.ok(width * height * ratio ** 2 <= 2_200_000 + 0.001);
      assert.ok(mobile.pixelRatio(deviceRatio, width, height) <= ratio);
    }
  }
});

test('render frequency is bounded on high-refresh displays; hidden tabs do not render', () => {
  for (const refreshRate of [46, 60, 120, 144, 240]) {
    const policy = new RenderPolicy(false);
    let frames = 0;
    for (let now = 0; now < 1000; now += 1000 / refreshRate) {
      if (policy.shouldRender(now, true)) frames++;
    }
    assert.ok(frames <= 45);
  }
  const policy = new RenderPolicy(false);
  assert.equal(policy.shouldRender(10_000, false), false);
  assert.equal(policy.shouldRender(10_000, true), true);
  assert.equal(policy.shouldRender(10_001, true), false);
});

test('sustained pressure lowers shadows and render frequency, not gameplay', () => {
  const policy = new RenderPolicy(false);
  const initialRatio = policy.pixelRatio(3, 1000, 800);
  for (let n = 0; n < 30; n++) policy.observe(40, 2);
  assert.equal(policy.maxFps, 30);
  assert.ok(policy.pixelRatio(3, 1000, 800) < initialRatio);
  assert.equal(policy.shadowSize, 1024);
  for (let n = 0; n < 30; n++) policy.observe(60, 2);
  assert.equal(policy.maxFps, 24);
  assert.equal(policy.shadowSize, 512);
  for (let n = 0; n < 100; n++) policy.observe(60, 2);
  assert.equal(policy.maxFps, 24);
  assert.equal(policy.shadowSize, 512);
});

test('recovery requires sustained headroom and respects the mobile ceiling', () => {
  const policy = new RenderPolicy(true);
  for (let n = 0; n < 30; n++) policy.observe(50, 2);
  assert.equal(policy.maxFps, 24);
  for (let n = 0; n < 359; n++) policy.observe(16, 2);
  assert.equal(policy.maxFps, 24);
  assert.equal(policy.observe(16, 2), true);
  assert.equal(policy.maxFps, 30);
  for (let n = 0; n < 1000; n++) policy.observe(16, 2);
  assert.equal(policy.maxFps, 30);
});

test('isolated stalls and tab-return gaps do not change quality', () => {
  const policy = new RenderPolicy(false);
  assert.equal(policy.observe(10_000, 1), false);
  assert.equal(policy.observe(Number.NaN, 1), false);
  for (let n = 0; n < 100; n++) {
    policy.observe(50, 1);
    policy.observe(16, 1);
  }
  assert.equal(policy.maxFps, 45);
});

test('very expensive drawing still lowers quality instead of being treated as a tab-return gap', () => {
  const policy = new RenderPolicy(false);
  for (let n = 0; n < 30; n++) policy.observe(500, 400);
  assert.equal(policy.maxFps, 30);
  for (let n = 0; n < 30; n++) policy.observe(1500, 400);
  assert.equal(policy.maxFps, 24);
  assert.equal(policy.shadowSize, 512);
});
