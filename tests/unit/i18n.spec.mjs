import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { serveFixtures } from '../support/fixture-server.mjs';
import { LOCALES, installI18nStub, loadMessages, messageTexts } from '../support/i18n.mjs';
import { ROOT_DIR, SRC_DIR } from '../support/paths.mjs';

const ORIGIN = 'https://fixture.test';
const manifest = JSON.parse(readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8'));

async function openPage(page) {
  await serveFixtures(page, ORIGIN, { '/': 'no-video.html' });
  await page.goto(`${ORIGIN}/`);
}

test.describe('EnsI18n.message', () => {
  test('returns the text for the browser language', async ({ page }) => {
    await openPage(page);
    await installI18nStub(page, 'ko');
    await page.addScriptTag({ path: path.join(SRC_DIR, 'i18n.js') });

    expect(await page.evaluate(() => EnsI18n.message('fillButtonEnter'))).toBe(messageTexts('ko').fillButtonEnter);
  });

  test('falls back to the message name, with an error, for a missing message', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    await openPage(page);
    await installI18nStub(page, 'en');
    await page.addScriptTag({ path: path.join(SRC_DIR, 'i18n.js') });

    expect(await page.evaluate(() => EnsI18n.message('noSuchMessage'))).toBe('noSuchMessage');
    expect(errors.some((text) => text.includes('missing message "noSuchMessage"'))).toBe(true);
  });

  test('falls back to the message name when chrome.i18n is unavailable', async ({ page }) => {
    await openPage(page);
    await page.evaluate(() => Object.defineProperty(window, 'chrome', { configurable: true, value: undefined }));
    await page.addScriptTag({ path: path.join(SRC_DIR, 'i18n.js') });

    expect(await page.evaluate(() => EnsI18n.message('fillButtonEnter'))).toBe('fillButtonEnter');
  });
});

test.describe('locale files', () => {
  test('the default locale is one of the shipped locales', () => {
    expect(LOCALES).toContain(manifest.default_locale);
  });

  test('every locale defines the same messages', () => {
    const [first, ...rest] = LOCALES.map((locale) => Object.keys(loadMessages(locale)).sort());
    for (const keys of rest) expect(keys).toEqual(first);
  });

  for (const locale of LOCALES) {
    test(`[${locale}] every message has text and a description for translators`, () => {
      for (const [key, entry] of Object.entries(loadMessages(locale))) {
        expect(entry.message.trim(), `${locale}/${key}`).not.toBe('');
        expect(entry.description?.trim(), `${locale}/${key}`).toBeTruthy();
      }
    });

    test(`[${locale}] defines every message manifest.json refers to`, () => {
      const referenced = [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map(([, key]) => key);
      expect(referenced.length).toBeGreaterThan(0);
      const messages = loadMessages(locale);
      for (const key of referenced) expect(messages, `${locale}/${key}`).toHaveProperty(key);
    });
  }

  test('every locale defines the player button labels', async ({ page }) => {
    await openPage(page);
    await page.addScriptTag({ path: path.join(SRC_DIR, 'fill-mode.js') });
    await page.addScriptTag({ path: path.join(SRC_DIR, 'player-button.js') });
    const keys = await page.evaluate(() => Object.values(EnsPlayerButton.LABEL_KEY));

    expect(keys.length).toBeGreaterThan(0);
    for (const locale of LOCALES) {
      for (const key of keys) expect(loadMessages(locale), `${locale}/${key}`).toHaveProperty(key);
    }
  });

  test('the content scripts load i18n.js before the files that use it', () => {
    const [{ js }] = manifest.content_scripts;
    expect(js.indexOf('src/i18n.js')).toBeGreaterThanOrEqual(0);
    expect(js.indexOf('src/i18n.js')).toBeLessThan(js.indexOf('src/player-button.js'));
  });
});
