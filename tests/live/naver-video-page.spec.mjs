import { test, expect } from '../support/extension.mjs';
import { isFillActive, isTopmostWithin, rectOf, viewportRect } from '../support/page-helpers.mjs';

// The page the extension was built against. Any game.naver.com video page
// works; replace this one if it is ever taken down.
const VIDEO_PAGE = 'https://game.naver.com/esports/League_of_Legends/videos/1051216';

async function openLivePage(page) {
  await page.goto(VIDEO_PAGE, { waitUntil: 'domcontentloaded' });
  await page.locator('.pzp video').waitFor({ state: 'attached', timeout: 60_000 });
  await expect(page.locator('.ens-fill-button')).toHaveCount(1, { timeout: 30_000 });
}

async function expectPlayerFillsWindow(page) {
  await expect.poll(() => isFillActive(page)).toBe(true);
  const viewport = await viewportRect(page);
  expect(await rectOf(page, '.pzp')).toEqual(viewport);
  expect(await rectOf(page, '.pzp video')).toEqual(viewport);
  // The site's fixed header sits at the top; the player must cover it.
  expect(await isTopmostWithin(page, '.pzp', 10, 10)).toBe(true);
  expect(await isTopmostWithin(page, '.pzp', viewport.width / 2, viewport.height / 2)).toBe(true);
}

test('the player fills the browser window and is restored on exit', async ({ page }, testInfo) => {
  await openLivePage(page);
  // The control bar only shows while the pointer is over the player.
  // Hovering scrolls the player into view, so measure afterwards.
  await page.locator('.pzp').hover();
  const playerBefore = await rectOf(page, '.pzp');
  const scrollBefore = await page.evaluate(() => window.scrollY);
  expect(playerBefore.width).toBeLessThan((await viewportRect(page)).width);

  await page.locator('.ens-fill-button').click();

  await expectPlayerFillsWindow(page);
  await expect(page.locator('.ens-fill-button')).toHaveAttribute('aria-pressed', 'true');
  await testInfo.attach('filled', { body: await page.screenshot(), contentType: 'image/png' });

  await page.keyboard.press('Escape');

  await expect.poll(() => isFillActive(page)).toBe(false);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  expect(await rectOf(page, '.pzp')).toEqual(playerBefore);
  await expect(page.locator('.ens-fill-button')).toHaveAttribute('aria-pressed', 'false');
});

test('the w key toggles fill mode and the mode survives a reload', async ({ page }) => {
  await openLivePage(page);

  await page.keyboard.press('w');
  await expectPlayerFillsWindow(page);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.pzp video').waitFor({ state: 'attached', timeout: 60_000 });
  await expectPlayerFillsWindow(page);

  await page.keyboard.press('w');
  await expect.poll(() => isFillActive(page)).toBe(false);
});
