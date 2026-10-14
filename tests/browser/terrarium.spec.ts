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
  const toggle = page.getByRole('button', { name: "Open keeper's journal" });
  if (await toggle.isVisible()) await toggle.click();
  // Shortened visible labels ("plant", "fern") keep the full common name for assistive technology.
  await expect(page.getByRole('button', { name: 'Friendship plant', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: "Bird's-nest fern", exact: true })).toBeVisible();
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
