import { test, expect } from '@playwright/test';

test('renders the globe, HUD, and a loaded catalog', async ({ page }) => {
  await page.goto('/');

  // 3D canvas mounts.
  await expect(page.locator('canvas')).toBeVisible();

  // The legend total reflects a loaded catalog (not the initial 0).
  const total = page.locator('.legend .panel__badge');
  await expect(total).not.toHaveText('0', { timeout: 30_000 });

  // Selecting the ISS from "popular today" opens the detail panel.
  await page.locator('.hot__item', { hasText: 'ISS' }).first().click();
  await expect(page.locator('.info__name')).toContainText('ISS', { timeout: 15_000 });
});
