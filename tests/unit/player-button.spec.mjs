import path from 'node:path';
import { test, expect } from '@playwright/test';
import { serveFixtures } from '../support/fixture-server.mjs';
import { SRC_DIR } from '../support/paths.mjs';
import { isFillActive, rectOf, viewportRect } from '../support/page-helpers.mjs';
import { LOCALES, installI18nStub, messageTexts } from '../support/i18n.mjs';

const ORIGIN = 'https://fixture.test';

async function openFixture(page, fixture = 'pzp-player.html', locale = 'ko') {
  await serveFixtures(page, ORIGIN, { '/': fixture });
  await page.goto(`${ORIGIN}/`);
  await installI18nStub(page, locale);
  await page.addStyleTag({ path: path.join(SRC_DIR, 'content.css') });
  await page.addScriptTag({ path: path.join(SRC_DIR, 'i18n.js') });
  await page.addScriptTag({ path: path.join(SRC_DIR, 'fill-mode.js') });
  await page.addScriptTag({ path: path.join(SRC_DIR, 'player-button.js') });
  // Same wiring as src/content.js, minus persistence and shortcuts.
  await page.evaluate(() => {
    window.controller = new EnsFillMode.FillController(document);
    window.controller.onChange(({ active }) => EnsPlayerButton.syncButtons(document, active));
    window.uninstallClickHandling = EnsPlayerButton.installClickHandling(document, window.controller);
  });
}

const inject = (page) => page.evaluate(() => EnsPlayerButton.injectButtons(document, controller.active));

test('injects one button right before the fullscreen button', async ({ page }) => {
  await openFixture(page);

  expect(await inject(page)).toBe(1);

  const order = await page.evaluate(() =>
    [...document.querySelector('.pzp-pc__bottom-buttons-right').children].map((el) => el.className));
  expect(order).toEqual([
    'pzp-setting-button pzp-pc__setting-button pzp-button',
    'pzp-button ens-fill-button',
    'pzp-fullscreen-button pzp-pc__fullscreen-button pzp-button',
  ]);
});

test('injection is idempotent', async ({ page }) => {
  await openFixture(page);

  expect(await inject(page)).toBe(1);
  expect(await inject(page)).toBe(0);
  expect(await page.locator('.ens-fill-button').count()).toBe(1);
});

test('appends the button when the control group has no fullscreen button', async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => document.querySelector('.pzp-pc__fullscreen-button').remove());

  await inject(page);

  expect(await page.evaluate(() =>
    document.querySelector('.pzp-pc__bottom-buttons-right').lastElementChild.classList.contains('ens-fill-button'),
  )).toBe(true);
});

test('adds a button to each player and none when there is no player', async ({ page }) => {
  await openFixture(page, 'no-video.html');
  expect(await inject(page)).toBe(0);

  await page.evaluate(() => {
    for (let i = 0; i < 2; i += 1) {
      const group = document.createElement('div');
      group.className = 'pzp-pc__bottom-buttons-right';
      document.body.append(group);
    }
  });
  expect(await inject(page)).toBe(2);
});

for (const locale of LOCALES) {
  const { fillButtonEnter: enterLabel, fillButtonExit: exitLabel } = messageTexts(locale);

  test(`[${locale}] starts with the enter label and an accessible, non-pressed state`, async ({ page }) => {
    await openFixture(page, 'pzp-player.html', locale);
    await inject(page);

    const button = page.locator('.ens-fill-button');
    await expect(button).toHaveAttribute('type', 'button');
    await expect(button).toHaveAttribute('aria-label', enterLabel);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button.locator('.pzp-button__tooltip')).toHaveText(`${enterLabel} (w)`);
    await expect(button.locator('.ens-fill-button__icon--enter')).toBeVisible();
    await expect(button.locator('.ens-fill-button__icon--exit')).toBeHidden();
  });

  test(`[${locale}] clicking toggles fill mode and keeps label, state and icon in sync`, async ({ page }) => {
    await openFixture(page, 'pzp-player.html', locale);
    await inject(page);
    const button = page.locator('.ens-fill-button');

    await button.click();
    expect(await isFillActive(page)).toBe(true);
    expect(await rectOf(page, '.pzp')).toEqual(await viewportRect(page));
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toHaveAttribute('aria-label', exitLabel);
    await expect(button.locator('.pzp-button__tooltip')).toHaveText(`${exitLabel} (w)`);
    await expect(button.locator('.ens-fill-button__icon--exit')).toBeVisible();
    await expect(button.locator('.ens-fill-button__icon--enter')).toBeHidden();

    await button.click();
    expect(await isFillActive(page)).toBe(false);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toHaveAttribute('aria-label', enterLabel);
  });
}

test('the two locales use different labels', () => {
  // Guards the locale tests above against both files saying the same thing.
  expect(messageTexts('en').fillButtonEnter).not.toBe(messageTexts('ko').fillButtonEnter);
});

test('a button created while fill mode is active starts pressed', async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => controller.enter());

  await inject(page);

  await expect(page.locator('.ens-fill-button')).toHaveAttribute('aria-pressed', 'true');
});

test('clicks do not reach the player, which would toggle playback', async ({ page }) => {
  await openFixture(page);
  await inject(page);

  await page.locator('.ens-fill-button').click();

  expect(await page.evaluate(() => window.playerClicks)).toBe(0);
});

test('clicking does not steal keyboard focus', async ({ page }) => {
  await openFixture(page);
  await inject(page);
  await page.locator('#search').focus();

  await page.locator('.ens-fill-button').click();

  expect(await page.evaluate(() => document.activeElement.id)).toBe('search');
});

test('the button fills its own player, not the largest one on the page', async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => {
    const other = document.createElement('div');
    other.className = 'pzp';
    other.id = 'other-player';
    other.innerHTML = '<video style="display:block;width:900px;height:500px"></video>';
    document.body.append(other);
  });
  await inject(page);

  await page.locator('#pcVODPlayerID .ens-fill-button').click();

  expect(await page.evaluate(() => controller.target === document.querySelector('#pcVODPlayerID .pzp'))).toBe(true);
});

test('is keyboard operable', async ({ page }) => {
  await openFixture(page);
  await inject(page);

  await page.locator('.ens-fill-button').focus();
  await page.keyboard.press('Enter');

  expect(await isFillActive(page)).toBe(true);
});

test('a copy of the button made from HTML works like the original', async ({ page }) => {
  await openFixture(page);
  await inject(page);
  await page.evaluate(() => {
    const host = document.querySelector('#pcVODPlayerID');
    // Re-parse the player from its own markup: new nodes, no listeners.
    const markup = host.innerHTML;
    host.innerHTML = markup;
  });

  await page.locator('.ens-fill-button').click();

  expect(await isFillActive(page)).toBe(true);
  expect(await page.evaluate(() => controller.target === document.querySelector('#pcVODPlayerID .pzp'))).toBe(true);
});

test('clicks elsewhere keep their default behavior and reach the player', async ({ page }) => {
  await openFixture(page);
  await inject(page);

  // The search field still takes focus on click; the player still gets clicks.
  await page.locator('#search').click();
  expect(await page.evaluate(() => document.activeElement.id)).toBe('search');

  await page.locator('.pzp-pc__setting-button').click();
  expect(await page.evaluate(() => window.playerClicks)).toBe(1);
  expect(await isFillActive(page)).toBe(false);
});

test('the uninstall function removes the click handling', async ({ page }) => {
  await openFixture(page);
  await inject(page);

  await page.evaluate(() => window.uninstallClickHandling());
  await page.locator('.ens-fill-button').click();

  expect(await isFillActive(page)).toBe(false);
});
