import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type {} from '../../src/main';

test('relative assets load; journal pages have accessible controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Interactive terrarium' })).toBeVisible();
  const toggle = page.getByRole('button', { name: "Open keeper's journal" });
  if (await toggle.isVisible()) await toggle.click();
  for (const name of ['Tools', 'Guide', 'Diary', 'How', 'Studio']) {
    await page.getByRole('navigation', { name: 'Journal pages' }).getByRole('button', { name, exact: true }).click();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations, `${name} accessibility`).toEqual([]);
  }
  await page.getByRole('button', { name: 'Automatic lighting' }).click();
  await expect(page.getByRole('button', { name: 'Automatic lighting' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Daylight' }).click();
  await expect(page.getByRole('button', { name: 'Daylight' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close journal' }).press('Enter');
  await expect(toggle).toBeFocused();
  expect(await page.locator('#book').evaluate((book) => (book as HTMLElement).inert)).toBe(true);
  expect(errors).toEqual([]);
});

test('keyboard terrain editing, camera controls, save and welcome dialog', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#loading')).toHaveCount(0);
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
});
