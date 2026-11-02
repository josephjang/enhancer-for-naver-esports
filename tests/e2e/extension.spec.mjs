import { test, expect } from '../support/extension.mjs';
import { serveFixtures } from '../support/fixture-server.mjs';
import {
  fillAttributeCount,
  isFillActive,
  isTopmostWithin,
  rectOf,
  viewportRect,
} from '../support/page-helpers.mjs';

// The content script only runs on this origin (manifest.json matches), so
// fixtures are served under it; OTHER_ORIGIN proves it does not run elsewhere.
const SITE = 'https://game.naver.com';
const OTHER_ORIGIN = 'https://example.test';
const VIDEO_PAGE = `${SITE}/esports/League_of_Legends/videos/1`;
const LATE_PLAYER_PAGE = `${SITE}/esports/League_of_Legends/videos/2`;
const LIST_PAGE = `${SITE}/esports/League_of_Legends/videos`;

test.beforeEach(async ({ context }) => {
  await serveFixtures(context, SITE, {
    '/esports/League_of_Legends/videos/1': 'pzp-player.html',
    '/esports/League_of_Legends/videos/2': 'late-player.html',
    '/esports/League_of_Legends/videos': 'no-video.html',
  });
  await serveFixtures(context, OTHER_ORIGIN, { '/': 'pzp-player.html' });
});

async function openVideoPage(page, url = VIDEO_PAGE) {
  await page.goto(url);
  // The button marks that the content script finished its first scan.
  await expect(page.locator('.ens-fill-button')).toHaveCount(1);
}

async function expectFilled(page) {
  await expect.poll(() => isFillActive(page)).toBe(true);
  expect(await rectOf(page, '.pzp')).toEqual(await viewportRect(page));
  expect(await isTopmostWithin(page, '.pzp', 5, 5)).toBe(true);
}

async function expectNotFilled(page) {
  await expect.poll(() => isFillActive(page)).toBe(false);
  expect(await fillAttributeCount(page)).toBe(0);
}

/** Dispatches a keydown the way the browser would for a physical key. */
function dispatchKey(page, init) {
  return page.evaluate((eventInit) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...eventInit });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  }, init);
}

/** Tab id of `page`, which must be the only tab, as seen by the extension. */
async function tabIdOf(serviceWorker, page) {
  await page.bringToFront();
  return serviceWorker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    if (tabs.length !== 1) throw new Error(`expected exactly one tab, found ${tabs.length}`);
    return tabs[0].id;
  });
}

/**
 * Waits until the content script answers in `page`, for pages without a
 * player (and so without a button that would signal it). Toggling there is
 * a no-op that reports { active: false }.
 *
 * @returns {Promise<number>} the tab id.
 */
async function waitForContentScript(serviceWorker, page) {
  const tabId = await tabIdOf(serviceWorker, page);
  await expect
    .poll(() => serviceWorker.evaluate((id) => toggleFillInTab(id), tabId))
    .toEqual({ active: false });
  return tabId;
}

test.describe('control-bar button', () => {
  test('is added to the player and toggles fill mode', async ({ page }) => {
    await openVideoPage(page);

    await page.locator('.ens-fill-button').click();
    await expectFilled(page);
    await expect(page.locator('.ens-fill-button')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('.ens-fill-button').click();
    await expectNotFilled(page);
    await expect(page.locator('.ens-fill-button')).toHaveAttribute('aria-pressed', 'false');
  });

  // The live site re-creates the player from its own HTML after load, which
  // copies the injected button's markup but not its event listeners.
  test('keeps working after the page re-creates the player from its HTML', async ({ page }) => {
    await openVideoPage(page);
    await page.evaluate(() => {
      const host = document.querySelector('#pcVODPlayerID');
      // Re-parse the player from its own markup: new nodes, no listeners.
      const markup = host.innerHTML;
      host.innerHTML = markup;
    });

    await page.locator('.ens-fill-button').click();
    await expectFilled(page);
    await expect(page.locator('.ens-fill-button')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('.ens-fill-button').click();
    await expectNotFilled(page);
  });

  test('a copied button does not steal focus or reach the player', async ({ page }) => {
    await openVideoPage(page);
    await page.evaluate(() => {
      const host = document.querySelector('#pcVODPlayerID');
      // Re-parse the player from its own markup: new nodes, no listeners.
      const markup = host.innerHTML;
      host.innerHTML = markup;
      window.playerClicks = 0;
      host.querySelector('.pzp').addEventListener('click', () => { window.playerClicks += 1; });
    });
    await page.locator('#search').focus();

    await page.locator('.ens-fill-button').click();

    expect(await page.evaluate(() => document.activeElement.id)).toBe('search');
    expect(await page.evaluate(() => window.playerClicks)).toBe(0);
  });

  test('is added to a player that mounts after page load', async ({ page }) => {
    await page.goto(LATE_PLAYER_PAGE);

    await expect(page.locator('.ens-fill-button')).toHaveCount(1);
    await page.locator('.ens-fill-button').click();
    await expectFilled(page);
  });
});

test.describe('keyboard', () => {
  test('w toggles fill mode', async ({ page }) => {
    await openVideoPage(page);

    await page.keyboard.press('w');
    await expectFilled(page);

    await page.keyboard.press('w');
    await expectNotFilled(page);
  });

  test('the w key works with the Korean IME in Hangul mode', async ({ page }) => {
    await openVideoPage(page);

    const prevented = await dispatchKey(page, { key: 'ㅈ', code: 'KeyW' });

    expect(prevented).toBe(true);
    await expectFilled(page);
  });

  test('Escape exits fill mode', async ({ page }) => {
    await openVideoPage(page);
    await page.keyboard.press('w');
    await expectFilled(page);

    await page.keyboard.press('Escape');

    await expectNotFilled(page);
  });

  test('Escape does nothing when fill mode is off', async ({ page }) => {
    await openVideoPage(page);

    expect(await dispatchKey(page, { key: 'Escape', code: 'Escape' })).toBe(false);
    await expectNotFilled(page);
  });

  for (const modifier of ['Shift', 'Control', 'Alt']) {
    test(`${modifier}+W is left to the browser and the page`, async ({ page }) => {
      await openVideoPage(page);

      const prevented = await dispatchKey(page, {
        key: 'w',
        code: 'KeyW',
        shiftKey: modifier === 'Shift',
        ctrlKey: modifier === 'Control',
        altKey: modifier === 'Alt',
      });

      expect(prevented).toBe(false);
      expect(await isFillActive(page)).toBe(false);
    });
  }

  test('auto-repeat of a held key does not toggle again', async ({ page }) => {
    await openVideoPage(page);

    expect(await dispatchKey(page, { key: 'w', code: 'KeyW', repeat: true })).toBe(false);
    expect(await isFillActive(page)).toBe(false);
  });

  test('typing w in a text field does not toggle', async ({ page }) => {
    await openVideoPage(page);

    await page.locator('#search').fill('');
    await page.locator('#search').press('w');

    await expect(page.locator('#search')).toHaveValue('w');
    expect(await isFillActive(page)).toBe(false);
  });

  test('typing w in a contenteditable element does not toggle', async ({ page }) => {
    await openVideoPage(page);
    await page.evaluate(() => {
      const editor = document.createElement('div');
      editor.id = 'editor';
      editor.contentEditable = 'true';
      editor.innerHTML = '<p>댓글</p>';
      // Below the fixed header, next to the page's search field.
      document.querySelector('#search').after(editor);
    });

    await page.locator('#editor p').click();
    await page.keyboard.press('w');

    await expect(page.locator('#editor')).toContainText('w');
    expect(await isFillActive(page)).toBe(false);
  });

  test('w is not swallowed on a page without video', async ({ page, serviceWorker }) => {
    await page.goto(LIST_PAGE);
    await waitForContentScript(serviceWorker, page);

    expect(await dispatchKey(page, { key: 'w', code: 'KeyW' })).toBe(false);
    expect(await isFillActive(page)).toBe(false);
  });
});

test.describe('persistence within a tab', () => {
  test('fill mode is restored after the page reloads', async ({ page }) => {
    await openVideoPage(page);
    await page.keyboard.press('w');
    await expectFilled(page);

    await page.reload();

    await expectFilled(page);
    await expect(page.locator('.ens-fill-button')).toHaveAttribute('aria-pressed', 'true');
  });

  test('fill mode follows the tab to the next video, even one that mounts late', async ({ page }) => {
    await openVideoPage(page);
    await page.keyboard.press('w');
    await expectFilled(page);

    await page.goto(LATE_PLAYER_PAGE);

    await expectFilled(page);
  });

  test('an explicit exit is remembered too', async ({ page }) => {
    await openVideoPage(page);
    await page.keyboard.press('w');
    await expectFilled(page);
    await page.keyboard.press('Escape');
    await expectNotFilled(page);

    await page.reload();
    await expect(page.locator('.ens-fill-button')).toHaveCount(1);

    expect(await isFillActive(page)).toBe(false);
  });

  test('a player replaced by the page is filled again', async ({ page }) => {
    await openVideoPage(page);
    await page.keyboard.press('w');
    await expectFilled(page);

    // Fresh markup, as a re-rendering page would produce.
    await page.evaluate(() => {
      document.querySelector('#pcVODPlayerID').innerHTML = `
        <div class="pzp pzp-pc" style="height: 100%">
          <div class="pzp-pc__video"><video muted playsinline></video></div>
          <div class="pzp-pc__bottom-buttons-right">
            <button class="pzp-pc__fullscreen-button pzp-button" aria-label="전체 화면"></button>
          </div>
        </div>`;
    });

    await expectFilled(page);
    await expect(page.locator('.ens-fill-button')).toHaveCount(1);
    await expect(page.locator('.ens-fill-button')).toHaveAttribute('aria-pressed', 'true');
  });

  test('other tabs are not affected', async ({ context, page }) => {
    await openVideoPage(page);
    await page.keyboard.press('w');
    await expectFilled(page);

    const other = await context.newPage();
    await openVideoPage(other);

    expect(await isFillActive(other)).toBe(false);
  });

  test('fill mode still works when sessionStorage is unavailable', async ({ context, page }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', {
        get() { throw new DOMException('blocked', 'SecurityError'); },
      });
    });
    await openVideoPage(page);

    await page.keyboard.press('w');
    await expectFilled(page);
    await page.keyboard.press('w');
    await expectNotFilled(page);
  });
});

test.describe('toolbar icon and extension shortcut', () => {
  test('toggles fill mode in the tab', async ({ page, serviceWorker }) => {
    await openVideoPage(page);
    const tabId = await tabIdOf(serviceWorker, page);

    expect(await serviceWorker.evaluate((id) => toggleFillInTab(id), tabId)).toEqual({ active: true });
    await expectFilled(page);
    await expect(page.locator('.ens-fill-button')).toHaveAttribute('aria-pressed', 'true');

    expect(await serviceWorker.evaluate((id) => toggleFillInTab(id), tabId)).toEqual({ active: false });
    await expectNotFilled(page);
  });

  test('reports an inactive state on a page without video', async ({ page, serviceWorker }) => {
    await page.goto(LIST_PAGE);

    const tabId = await waitForContentScript(serviceWorker, page);

    expect(await serviceWorker.evaluate((id) => toggleFillInTab(id), tabId)).toEqual({ active: false });
    expect(await isFillActive(page)).toBe(false);
  });

  test('does nothing outside game.naver.com, where no content script runs', async ({ page, serviceWorker }) => {
    await page.goto(`${OTHER_ORIGIN}/`);
    await page.waitForLoadState('load');
    // A content script wrongly matching this origin would run at
    // document_idle, right after load; give it ample time.
    await page.waitForTimeout(500);
    const tabId = await tabIdOf(serviceWorker, page);

    expect(await serviceWorker.evaluate((id) => toggleFillInTab(id), tabId)).toBeNull();
    await expect(page.locator('.ens-fill-button')).toHaveCount(0);
    expect(await isFillActive(page)).toBe(false);
  });

  // chrome.action.isEnabled() ignores declarativeContent's ShowAction, so
  // the per-page result cannot be observed from a test; assert its inputs:
  // the icon is disabled by default and the rule enabling it targets only
  // https://game.naver.com.
  test('the icon is disabled by default and enabled by a rule for game.naver.com', async ({ page, serviceWorker }) => {
    await page.goto(`${OTHER_ORIGIN}/`);
    const tabId = await tabIdOf(serviceWorker, page);

    await expect.poll(() => serviceWorker.evaluate(() => chrome.action.isEnabled())).toBe(false);
    expect(await serviceWorker.evaluate((id) => chrome.action.isEnabled(id), tabId)).toBe(false);

    const rules = () => serviceWorker.evaluate(
      () => new Promise((resolve) => chrome.declarativeContent.onPageChanged.getRules(undefined, resolve)),
    );
    await expect.poll(async () => (await rules()).length).toBe(1);
    const [rule] = await rules();
    expect(rule.conditions).toEqual([
      {
        instanceType: 'declarativeContent.PageStateMatcher',
        pageUrl: { hostEquals: 'game.naver.com', schemes: ['https'] },
      },
    ]);
    expect(rule.actions).toEqual([{ instanceType: 'declarativeContent.ShowAction' }]);
  });
});
