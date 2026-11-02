import path from 'node:path';
import { test, expect } from '@playwright/test';
import { serveFixtures } from '../support/fixture-server.mjs';
import { SRC_DIR } from '../support/paths.mjs';
import {
  fillAttributeCount,
  isFillActive,
  isTopmostWithin,
  rectOf,
  viewportRect,
} from '../support/page-helpers.mjs';

const ORIGIN = 'https://fixture.test';

async function openFixture(page, fixture) {
  await serveFixtures(page, ORIGIN, { '/': fixture });
  await page.goto(`${ORIGIN}/`);
  await page.addStyleTag({ path: path.join(SRC_DIR, 'content.css') });
  await page.addScriptTag({ path: path.join(SRC_DIR, 'fill-mode.js') });
  // One controller per page, exposed for the assertions below. Every state
  // change is logged so tests can assert the exact event sequence.
  await page.evaluate(() => {
    window.controller = new EnsFillMode.FillController(document);
    window.changes = [];
    window.controller.onChange((change) => window.changes.push(change));
    window.resizeEvents = 0;
    window.addEventListener('resize', () => { window.resizeEvents += 1; });
  });
}

test.describe('FillController on the PZP player page', () => {
  test.beforeEach(async ({ page }) => {
    await openFixture(page, 'pzp-player.html');
  });

  test('enter pins the player to the whole viewport, above the fixed header', async ({ page }) => {
    const entered = await page.evaluate(() => controller.enter());

    expect(entered).toBe(true);
    expect(await rectOf(page, '.pzp')).toEqual(await viewportRect(page));
    expect(await rectOf(page, '#main-video')).toEqual(await viewportRect(page));
    // The header (z-index 3001) occupies the top 110px of the page; the
    // player must cover it, despite the transformed ancestor.
    expect(await isTopmostWithin(page, '.pzp', 5, 5)).toBe(true);
    expect(await isTopmostWithin(page, '.pzp', 1275, 715)).toBe(true);
    expect(await page.evaluate(() => controller.target === document.querySelector('.pzp'))).toBe(true);
  });

  test('enter locks page scrolling and exit unlocks it', async ({ page }) => {
    const overflow = () => page.evaluate(() => [
      getComputedStyle(document.documentElement).overflow,
      getComputedStyle(document.body).overflow,
    ]);
    const before = await overflow();

    await page.evaluate(() => controller.enter());
    expect(await overflow()).toEqual(['hidden', 'hidden']);

    await page.evaluate(() => controller.exit());
    expect(await overflow()).toEqual(before);
  });

  test('exit restores the original layout, scroll position and attributes', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, 400));
    const playerBefore = await rectOf(page, '.pzp');

    await page.evaluate(() => controller.enter());
    await page.evaluate(() => controller.exit());

    expect(await rectOf(page, '.pzp')).toEqual(playerBefore);
    expect(await page.evaluate(() => window.scrollY)).toBe(400);
    expect(await fillAttributeCount(page)).toBe(0);
    expect(await page.evaluate(() => controller.active)).toBe(false);
    expect(await page.evaluate(() => controller.target)).toBeNull();
  });

  test('exit restores scroll even when the page scrolls smoothly', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'smooth';
      window.scrollTo({ top: 300, behavior: 'instant' });
    });

    await page.evaluate(() => { controller.enter(); controller.exit(); });

    // Read synchronously after exit: a smooth scroll would still be moving.
    expect(await page.evaluate(() => window.scrollY)).toBe(300);
  });

  test('marks every ancestor of the player up to, but excluding, <html>', async ({ page }) => {
    await page.evaluate(() => controller.enter());

    const marks = await page.evaluate(() => {
      const target = document.querySelector('.pzp');
      const chain = [];
      for (let el = target.parentElement; el; el = el.parentElement) {
        chain.push([el.tagName, el.hasAttribute('data-ens-fill-ancestor')]);
      }
      return chain;
    });
    expect(marks.at(-1)).toEqual(['HTML', false]);
    expect(marks.slice(0, -1).every(([, marked]) => marked)).toBe(true);
    expect(marks.map(([tag]) => tag)).toContain('BODY');
  });

  test('reports state changes in order, with the exit reason', async ({ page }) => {
    await page.evaluate(() => { controller.enter(); controller.exit(); });

    expect(await page.evaluate(() => window.changes)).toEqual([
      { active: true },
      { active: false, reason: 'user' },
    ]);
  });

  test('enter while active and exit while inactive are no-ops', async ({ page }) => {
    const result = await page.evaluate(() => {
      controller.exit();
      const first = controller.enter();
      const second = controller.enter();
      return { first, second, changes: window.changes.length };
    });

    expect(result).toEqual({ first: true, second: true, changes: 1 });
  });

  test('toggle returns the resulting state', async ({ page }) => {
    expect(await page.evaluate(() => controller.toggle())).toBe(true);
    expect(await page.evaluate(() => controller.toggle())).toBe(false);
    expect(await page.evaluate(() => window.changes.at(-1))).toEqual({ active: false, reason: 'user' });
  });

  test('dispatches a window resize on enter and on exit', async ({ page }) => {
    await page.evaluate(() => controller.enter());
    expect(await page.evaluate(() => window.resizeEvents)).toBeGreaterThanOrEqual(1);
    const afterEnter = await page.evaluate(() => window.resizeEvents);

    await page.evaluate(() => controller.exit());
    expect(await page.evaluate(() => window.resizeEvents)).toBeGreaterThan(afterEnter);
  });

  test('exits with reason "detached" when the page removes the player', async ({ page }) => {
    await page.evaluate(() => controller.enter());

    await page.evaluate(() => document.querySelector('#pcVODPlayerID').replaceChildren());

    await expect.poll(() => page.evaluate(() => controller.active)).toBe(false);
    expect(await page.evaluate(() => window.changes.at(-1))).toEqual({ active: false, reason: 'detached' });
    expect(await fillAttributeCount(page)).toBe(0);
  });

  test('a player copied from its HTML while active leaves no fill attributes behind', async ({ page }) => {
    await page.evaluate(() => controller.enter());

    // The copy carries data-ens-fill-target / -ancestor from the markup.
    await page.evaluate(() => {
      const host = document.querySelector('#pcVODPlayerID');
      // Re-parse the player from its own markup: new nodes, no listeners.
      const markup = host.innerHTML;
      host.innerHTML = markup;
    });

    await expect.poll(() => page.evaluate(() => controller.active)).toBe(false);
    expect(await fillAttributeCount(page)).toBe(0);
  });

  test('keeps filling when the page moves the player under a new parent', async ({ page }) => {
    await page.evaluate(() => controller.enter());

    // Move the live player into a new transformed wrapper elsewhere.
    await page.evaluate(() => {
      const wrapper = document.createElement('div');
      wrapper.id = 'new-wrapper';
      wrapper.style.transform = 'translateX(10px)';
      wrapper.style.width = '320px';
      document.body.append(wrapper);
      wrapper.append(document.querySelector('.pzp'));
    });

    await expect.poll(() => rectOf(page, '.pzp')).toEqual(await viewportRect(page));
    expect(await page.evaluate(() => controller.active)).toBe(true);
    expect(await page.evaluate(() => [
      document.querySelector('#new-wrapper').hasAttribute('data-ens-fill-ancestor'),
      // The old parent no longer contains the player.
      document.querySelector('#pcVODPlayerID').hasAttribute('data-ens-fill-ancestor'),
    ])).toEqual([true, false]);

    await page.evaluate(() => controller.exit());
    expect(await fillAttributeCount(page)).toBe(0);
  });

  test('ignores unrelated DOM mutations while active', async ({ page }) => {
    await page.evaluate(() => controller.enter());

    await page.evaluate(() => document.body.append(document.createElement('div')));
    // Let the MutationObserver callback run.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(await page.evaluate(() => controller.active)).toBe(true);
  });

  test('prefers the player video over a larger bare video', async ({ page }) => {
    await page.evaluate(() => {
      const bare = document.createElement('video');
      bare.style.cssText = 'display:block;width:1000px;height:700px';
      document.body.prepend(bare);
    });

    await page.evaluate(() => controller.enter());

    expect(await page.evaluate(() => controller.target === document.querySelector('.pzp'))).toBe(true);
  });

  test('a listener that throws does not stop the others or the state change', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

    const result = await page.evaluate(() => {
      const seen = [];
      const fresh = new EnsFillMode.FillController(document);
      fresh.onChange(() => { throw new Error('boom'); });
      fresh.onChange((change) => seen.push(change.active));
      const entered = fresh.enter();
      fresh.exit();
      return { entered, seen, active: fresh.active };
    });

    expect(result).toEqual({ entered: true, seen: [true, false], active: false });
    expect(errors.some((text) => text.includes('fill-mode listener failed'))).toBe(true);
  });

  test('unsubscribed listeners stop receiving changes', async ({ page }) => {
    const calls = await page.evaluate(() => {
      let count = 0;
      const unsubscribe = controller.onChange(() => { count += 1; });
      controller.enter();
      unsubscribe();
      controller.exit();
      return count;
    });

    expect(calls).toBe(1);
  });
});

test.describe('FillController target selection', () => {
  test('returns false and changes nothing on a page without video', async ({ page }) => {
    await openFixture(page, 'no-video.html');

    expect(await page.evaluate(() => controller.enter())).toBe(false);
    expect(await isFillActive(page)).toBe(false);
    expect(await fillAttributeCount(page)).toBe(0);
    expect(await page.evaluate(() => window.changes)).toEqual([]);
  });

  test('ignores videos without a layout box', async ({ page }) => {
    await openFixture(page, 'no-video.html');
    await page.evaluate(() => {
      const hidden = document.createElement('video');
      hidden.style.display = 'none';
      document.body.append(hidden);
    });

    expect(await page.evaluate(() => controller.enter())).toBe(false);
  });

  test('fills the largest bare video itself when there is no player', async ({ page }) => {
    await openFixture(page, 'no-video.html');
    await page.evaluate(() => {
      for (const [id, w, h] of [['small', 200, 100], ['large', 400, 300]]) {
        const video = document.createElement('video');
        video.id = id;
        video.style.cssText = `display:block;width:${w}px;height:${h}px`;
        document.body.append(video);
      }
    });

    expect(await page.evaluate(() => controller.enter())).toBe(true);
    expect(await page.evaluate(() => controller.target.id)).toBe('large');
    expect(await rectOf(page, '#large')).toEqual(await viewportRect(page));
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#large')).objectFit)).toBe('contain');
  });

  test('playersOnly ignores bare videos', async ({ page }) => {
    await openFixture(page, 'no-video.html');
    await page.evaluate(() => {
      const video = document.createElement('video');
      video.style.cssText = 'display:block;width:400px;height:300px';
      document.body.append(video);
    });

    expect(await page.evaluate(() => controller.enter({ playersOnly: true }))).toBe(false);
    expect(await page.evaluate(() => controller.enter())).toBe(true);
  });

  test('within restricts the search to the given player', async ({ page }) => {
    await openFixture(page, 'pzp-player.html');
    await page.evaluate(() => {
      // A second, larger player elsewhere on the page.
      const other = document.createElement('div');
      other.className = 'pzp';
      other.id = 'other-player';
      other.innerHTML = '<video style="display:block;width:900px;height:500px"></video>';
      document.body.append(other);
    });

    const largestFirst = await page.evaluate(() => {
      controller.enter();
      const id = controller.target.id;
      controller.exit();
      return id;
    });
    expect(largestFirst).toBe('other-player');

    const scoped = await page.evaluate(() => {
      controller.enter({ within: document.querySelector('#pcVODPlayerID .pzp') });
      return controller.target === document.querySelector('#pcVODPlayerID .pzp');
    });
    expect(scoped).toBe(true);
  });

  test('rejects a document without a window', async ({ page }) => {
    await openFixture(page, 'no-video.html');

    const message = await page.evaluate(() => {
      try {
        new EnsFillMode.FillController(document.implementation.createHTMLDocument(''));
        return null;
      } catch (error) {
        return `${error.name}: ${error.message}`;
      }
    });

    expect(message).toMatch(/^TypeError: /);
  });
});
