import { test as base, chromium } from '@playwright/test';
import { ROOT_DIR } from './paths.mjs';

/**
 * Playwright fixtures that launch a Chromium-based browser with the unpacked
 * extension. Extensions need a persistent context. The `browserChannel`
 * option picks the browser per project in playwright.config.mjs: the
 * bundled "chromium", or an installed one such as "msedge".
 * `browserLocale` sets the browser's UI language, which decides the
 * extension's language (_locales/); tests override it per describe block.
 */
export const test = base.extend({
  browserChannel: ['chromium', { option: true }],
  browserLocale: ['ko-KR', { option: true }],

  context: async ({ browserChannel, browserLocale }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: browserChannel,
      locale: browserLocale,
      viewport: { width: 1280, height: 720 },
      args: [
        `--disable-extensions-except=${ROOT_DIR}`,
        `--load-extension=${ROOT_DIR}`,
        `--lang=${browserLocale}`,
      ],
    });
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    const [existing] = context.serviceWorkers();
    await use(existing ?? (await context.waitForEvent('serviceworker')));
  },

  page: async ({ context }, use) => {
    // Reuse the persistent context's initial tab so it is the only tab.
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },
});

export { expect } from '@playwright/test';
