import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type {} from '../../src/main';

// Software WebGL is expensive. Draw a few real frames without shadows, then use
// the existing visibility gate while the real simulation, UI and saving continue.
// One explicit photo-frame draw below captures the current scene for the screenshot.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let state: Window['__terra'];
    let frames = 0;
    const hidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')!.get!;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => frames >= 3 || hidden.call(document),
    });
    Object.defineProperty(window, '__terra', {
      configurable: true,
      get: () => state,
      set: (next: Window['__terra']) => {
        state = next;
        next.sceneMgr.renderer.shadowMap.enabled = false;
        const draw = next.sceneMgr.renderFrame.bind(next.sceneMgr);
        next.sceneMgr.renderFrame = () => {
          draw();
          frames++;
          document.documentElement.dataset.renderedFrames = String(frames);
        };
      },
    });
  });
});

test('relative assets load; journal pages have accessible controls', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('./');
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.renderedFrames))).toBeGreaterThan(0);
  await expect(page.getByRole('region', { name: 'Interactive terrarium' })).toBeVisible();
  await expect(page.locator('#book')).toHaveClass('closed');
  expect(await page.locator('#book').evaluate((book) => (book as HTMLElement).inert)).toBe(true);
  await expect(page.locator('#stats [title="Ecosystem mood"]')).toHaveText('\u{1F331}');
  const garden = await page.evaluate(() => {
    const world = window.__terra.world;
    return { plants: world.getPlants().length, healthy: world.stats().healthyFrac };
  });
  expect(garden.plants).toBeGreaterThanOrEqual(50);
  expect(garden.healthy).toBe(1);
  const toggle = page.getByRole('button', { name: "Open keeper's journal" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Journal pages' }).getByRole('button', { name: 'Tools', exact: true })).toBeFocused();
  for (const label of [
    'Sand', 'Soil', 'Gravel', 'Water', 'Boston fern', "Bird's-nest fern",
    'Nerve plant', 'Friendship plant', 'String of turtles', 'Mexican snowball',
    'Zebra plant', 'Dwarf hairgrass', 'Micro gloxinia', 'Cape sundew',
    'Night-light bonnet', 'Flowerpot dapperling', 'Seeds', 'Moss', 'Rock', 'Litter', 'Dig',
  ]) {
    const tool = page.getByRole('button', { name: label, exact: true });
    await expect(tool).toBeVisible();
    await expect(tool.locator('.tool-label')).toHaveText(label);
  }
  for (const name of ['Tools', 'Guide', 'Diary', 'How', 'Studio']) {
    await page.getByRole('navigation', { name: 'Journal pages' }).getByRole('button', { name, exact: true }).click();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations, `${name} accessibility`).toEqual([]);
  }
  await page.getByRole('button', { name: 'Automatic lighting' }).click();
  await expect(page.getByRole('button', { name: 'Automatic lighting' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Daylight' }).click();
  await expect(page.getByRole('button', { name: 'Daylight' })).toHaveAttribute('aria-pressed', 'true');
  const screenshot = process.env.TERRASIM_SCREENSHOTS
    ? `docs/assets/${testInfo.project.name === 'desktop' ? 'terrarium' : 'terrarium-mobile'}.png`
    : testInfo.outputPath('terrarium.png');
  await page.evaluate(() => window.__terra.sceneMgr.renderFrame());
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('Terrarium and journal', { path: screenshot, contentType: 'image/png' });
  expect(await page.evaluate(() => Number(document.documentElement.dataset.renderedFrames))).toBeLessThanOrEqual(4);
  await page.getByRole('button', { name: 'Close journal' }).press('Enter');
  await expect(toggle).toBeFocused();
  expect(await page.locator('#book').evaluate((book) => (book as HTMLElement).inert)).toBe(true);
  expect(errors).toEqual([]);
});

test('keyboard terrain editing, camera controls, save and welcome dialog', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('./');
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.renderedFrames))).toBeGreaterThan(0);
  const toggle = page.getByRole('button', { name: "Open keeper's journal" });
  if (await toggle.isVisible()) await toggle.press('Enter');
  await page.getByRole('button', { name: 'Sand', exact: true }).press('Enter');
  const tank = page.getByRole('region', { name: 'Interactive terrarium' });
  await expect(tank).toBeFocused();
  const before = await page.evaluate(() => Array.from(window.__terra.world.stratH).reduce((sum, height) => sum + height, 0));
  await tank.press('ArrowLeft');
  await tank.press('Enter');
  const after = await page.evaluate(() => Array.from(window.__terra.world.stratH).reduce((sum, height) => sum + height, 0));
  expect(after).toBeGreaterThan(before);
  const camera = await page.evaluate(() => window.__terra.sceneMgr.camera.position.toArray());
  await tank.press('Shift+ArrowLeft');
  expect(await page.evaluate(() => window.__terra.sceneMgr.camera.position.toArray())).not.toEqual(camera);
  await tank.press('+');
  await tank.press('Home');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('terrasim-v5')), { timeout: 15_000 }).not.toBeNull();
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('terrasim-v5')!);
    saved.meta.savedAt = Date.now() - 601_000;
    localStorage.setItem('terrasim-v5', JSON.stringify(saved));
  });
  // Restore the aged payload before the reloaded application initializes.
  const saved = await page.evaluate(() => localStorage.getItem('terrasim-v5')!);
  await page.addInitScript((payload) => localStorage.setItem('terrasim-v5', payload), saved);
  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'Welcome back' });
  await expect(dialog).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a returning keeper keeps their saved planting instead of the starter garden', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.renderedFrames))).toBe(3);
  const saved = await page.evaluate(() => {
    const world = window.__terra.world;
    world.getPlants().splice(1);
    const plant = world.getPlants()[0];
    plant.x = 55;
    plant.z = 33;
    plant.stage = 0.43;
    plant.health = 63;
    world.wet[world.idx(55, 33)] = 0.37;
    world.moss[world.idx(55, 33)] = 0.21;
    world.rocks = [{ x: 61, z: 29, scale: 0.8, seed: 456 }];
    world.humidity = 52;
    // The suite's drawing budget makes the document hidden after three frames.
    document.dispatchEvent(new Event('visibilitychange'));
    return localStorage.getItem('terrasim-v5')!;
  });
  const payload = JSON.parse(saved);
  await page.addInitScript((value) => localStorage.setItem('terrasim-v5', value), saved);
  // Inspect the restored state before normal simulation ticks can change it.
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const restored = await page.evaluate(() => {
    const world = window.__terra.world;
    const i = world.idx(55, 33);
    return {
      plants: world.getPlants(), rocks: world.rocks, humidity: world.humidity,
      moisture: world.wet[i], moss: world.moss[i],
    };
  });
  expect(restored.plants).toEqual(payload.plants);
  expect(restored.rocks).toEqual(payload.rocks);
  expect(restored.humidity).toBe(52);
  expect(restored.moisture).toBeCloseTo(0.37);
  expect(restored.moss).toBeCloseTo(0.21);
  await expect(page.getByRole('dialog', { name: 'Welcome back' })).toHaveCount(0);
});
