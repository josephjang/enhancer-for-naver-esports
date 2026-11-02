import { test, expect } from '../support/extension.mjs';
import { serveFixtures } from '../support/fixture-server.mjs';
import { messageTexts } from '../support/i18n.mjs';

const VIDEO_PAGE = 'https://game.naver.com/esports/League_of_Legends/videos/1';

// Browser UI language -> locale the extension must use. Any language other
// than Korean or English falls back to manifest.json's default_locale.
const CASES = [
  { browserLocale: 'ko-KR', locale: 'ko' },
  { browserLocale: 'en-US', locale: 'en' },
  { browserLocale: 'ja-JP', locale: 'en' },
];

for (const { browserLocale, locale } of CASES) {
  test.describe(`browser in ${browserLocale}`, () => {
    test.use({ browserLocale });
    const texts = messageTexts(locale);

    test(`names and describes the extension in "${locale}"`, async ({ serviceWorker }) => {
      const shown = await serviceWorker.evaluate(async () => ({
        name: chrome.i18n.getMessage('extName'),
        actionTitle: await chrome.action.getTitle({}),
        commands: (await chrome.commands.getAll()).map(({ name, description }) => ({ name, description })),
      }));

      expect(shown.name).toBe(texts.extName);
      expect(shown.actionTitle).toBe(texts.actionTitle);
      expect(shown.commands).toContainEqual({ name: 'toggle-fill', description: texts.commandToggleFill });
    });

    test(`labels the player button in "${locale}"`, async ({ context, page }) => {
      await serveFixtures(context, 'https://game.naver.com', {
        '/esports/League_of_Legends/videos/1': 'pzp-player.html',
      });
      await page.goto(VIDEO_PAGE);
      const button = page.locator('.ens-fill-button');

      await expect(button).toHaveAttribute('aria-label', texts.fillButtonEnter);
      await expect(button.locator('.pzp-button__tooltip')).toHaveText(`${texts.fillButtonEnter} (w)`);

      await button.click();
      await expect(button).toHaveAttribute('aria-label', texts.fillButtonExit);
    });
  });
}
