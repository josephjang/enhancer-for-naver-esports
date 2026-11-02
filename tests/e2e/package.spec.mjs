import { buildPackage } from '../../scripts/package.mjs';
import { test as base, expect } from '../support/extension.mjs';
import { serveFixtures } from '../support/fixture-server.mjs';
import { extractZip } from '../support/package-zip.mjs';
import { isFillActive } from '../support/page-helpers.mjs';

// Loads the store zip's contents instead of the repository, proving the
// zip alone is a working extension.
const test = base.extend({
  extensionDir: async ({}, use, testInfo) => {
    const { zipPath } = await buildPackage({ outDir: testInfo.outputPath('dist') });
    const dir = testInfo.outputPath('unpacked');
    await extractZip(zipPath, dir);
    await use(dir);
  },
});

test('the packaged extension works on its own', async ({ context, page, serviceWorker }) => {
  await serveFixtures(context, 'https://game.naver.com', {
    '/esports/League_of_Legends/videos/1': 'pzp-player.html',
  });
  expect(serviceWorker.url()).toMatch(/^chrome-extension:\/\/[a-p]{32}\/src\/background\.js$/);

  await page.goto('https://game.naver.com/esports/League_of_Legends/videos/1');
  await expect(page.locator('.ens-fill-button')).toHaveAttribute('aria-label', '브라우저 채우기');
  await page.keyboard.press('w');

  await expect.poll(() => isFillActive(page)).toBe(true);
});
