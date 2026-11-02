/**
 * Geometry and state probes evaluated in the page. They read only DOM
 * state, so they work identically with and without the extension.
 */

/** Rect of the first element matching `selector`, or null. */
export function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
  }, selector);
}

export function viewportRect(page) {
  return page.evaluate(() => ({ x: 0, y: 0, width: innerWidth, height: innerHeight }));
}

/** Whether the topmost element at (x, y) is inside `selector`. */
export function isTopmostWithin(page, selector, x, y) {
  return page.evaluate(
    ({ sel, px, py }) => document.elementFromPoint(px, py)?.closest(sel) != null,
    { sel: selector, px: x, py: y },
  );
}

export function isFillActive(page) {
  return page.evaluate(() => document.documentElement.hasAttribute('data-ens-fill'));
}

/** Every element still carrying a fill-mode attribute. */
export function fillAttributeCount(page) {
  return page.evaluate(
    () => document.querySelectorAll('[data-ens-fill], [data-ens-fill-target], [data-ens-fill-ancestor]').length,
  );
}
