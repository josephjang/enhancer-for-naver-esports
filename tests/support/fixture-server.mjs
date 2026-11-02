import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES_DIR } from './paths.mjs';

/**
 * Serves fixture files for `origin` (e.g. https://game.naver.com) from
 * memory via request interception, so content scripts matching that origin
 * run against deterministic pages without any network access.
 *
 * @param {import('@playwright/test').BrowserContext | import('@playwright/test').Page} target
 * @param {string} origin
 * @param {Record<string, string>} pages pathname -> fixture file name
 */
export async function serveFixtures(target, origin, pages) {
  await target.route(`${origin}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const fixture = pages[pathname];
    if (!fixture) {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
      return;
    }
    const body = await readFile(path.join(FIXTURES_DIR, fixture), 'utf8');
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
}
