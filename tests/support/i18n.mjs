import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './paths.mjs';

export const LOCALES = Object.freeze(['en', 'ko']);

/**
 * Parsed _locales/<locale>/messages.json.
 *
 * @returns {Record<string, { message: string, description?: string }>}
 */
export function loadMessages(locale) {
  return JSON.parse(readFileSync(path.join(ROOT_DIR, '_locales', locale, 'messages.json'), 'utf8'));
}

/** Message name -> localized text for `locale`. */
export function messageTexts(locale) {
  return Object.fromEntries(Object.entries(loadMessages(locale)).map(([key, { message }]) => [key, message]));
}

/**
 * Gives a plain page the `chrome.i18n.getMessage` that content scripts get
 * from the browser, answering from the real locale file. Like the browser,
 * it returns '' for unknown names.
 */
export async function installI18nStub(page, locale) {
  await page.evaluate((texts) => {
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: { i18n: { getMessage: (key) => texts[key] ?? '' } },
    });
  }, messageTexts(locale));
}
