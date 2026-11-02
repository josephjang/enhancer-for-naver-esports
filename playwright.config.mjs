import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: {
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  projects: [
    // Content-script modules loaded into a plain page; no extension needed.
    { name: 'unit', testDir: 'tests/unit', use: { browserName: 'chromium' } },
    // The unpacked extension against local fixtures served on the
    // game.naver.com origin. The bundled Chromium is the open-source base of
    // Chrome, Whale, Brave and the other Chromium browsers (Google Chrome
    // itself no longer loads unpacked extensions from the command line).
    // Edge is a branded Chromium browser that still does, so it covers
    // vendor-specific behavior; it must be installed.
    { name: 'e2e-chromium', testDir: 'tests/e2e', use: { browserChannel: 'chromium' } },
    { name: 'e2e-edge', testDir: 'tests/e2e', use: { browserChannel: 'msedge' } },
    // The unpacked extension in Edge against the real site; needs network
    // access. Run explicitly with `npm run test:live`.
    { name: 'live', testDir: 'tests/live', timeout: 120_000, use: { browserChannel: 'msedge' } },
  ],
});
