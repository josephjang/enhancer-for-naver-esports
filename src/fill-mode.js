/*
 * Fill mode: pins the page's video player to the viewport so it covers the
 * whole browser window (unlike the Fullscreen API, the browser UI stays).
 *
 * Classic script (content scripts cannot be ES modules); it publishes its
 * API on `globalThis.EnsFillMode` for src/content.js and the tests.
 *
 * All visual changes are driven by data attributes styled in
 * src/content.css, so exiting only has to remove the attributes to restore
 * the page exactly.
 */
(function (root) {
  'use strict';

  const ATTR = Object.freeze({
    // On <html> while fill mode is active: locks page scrolling.
    root: 'data-ens-fill',
    // On the element pinned to the viewport (the player, or a bare video).
    target: 'data-ens-fill-target',
    // On every ancestor of the target: neutralizes properties that would
    // trap a position: fixed descendant (transform, filter, contain, ...)
    // and lifts the ancestor chain above the site's fixed header.
    ancestor: 'data-ens-fill-ancestor',
  });

  // Root element of Naver's PZP video player, which wraps the <video> and
  // its control bar. Filling it (rather than the bare <video>) keeps the
  // player's own controls usable.
  const PLAYER_SELECTOR = '.pzp';

  const EXIT_REASON = Object.freeze({
    // The user (button, shortcut, toolbar icon) asked to leave fill mode.
    user: 'user',
    // The filled element left the DOM (the page replaced the player).
    detached: 'detached',
  });

  function renderedArea(element) {
    const rect = element.getBoundingClientRect();
    return rect.width * rect.height;
  }

  /**
   * @typedef {object} FindOptions
   * @property {boolean} [playersOnly] ignore videos outside a PZP player.
   * @property {ParentNode} [within] only consider videos inside this node
   *   (e.g. the player whose control-bar button was clicked).
   */

  /**
   * Returns the largest rendered video, preferring videos inside a PZP
   * player over bare ones (e.g. hover previews). Returns null when no video
   * has a layout box.
   *
   * @param {Document} doc
   * @param {FindOptions} [options]
   * @returns {HTMLVideoElement | null}
   */
  function findMainVideo(doc, { playersOnly = false, within = doc } = {}) {
    let best = null;
    let bestInPlayer = false;
    let bestArea = 0;
    for (const video of within.querySelectorAll('video')) {
      const inPlayer = video.closest(PLAYER_SELECTOR) !== null;
      if (playersOnly && !inPlayer) continue;
      const area = renderedArea(video);
      if (area <= 0) continue;
      // Any player video outranks every bare video; area breaks ties.
      const better = best === null
        || (inPlayer && !bestInPlayer)
        || (inPlayer === bestInPlayer && area > bestArea);
      if (better) {
        best = video;
        bestInPlayer = inPlayer;
        bestArea = area;
      }
    }
    return best;
  }

  /** The element to pin: the enclosing player, else the video itself. */
  function resolveFillTarget(video) {
    return video.closest(PLAYER_SELECTOR) ?? video;
  }

  class FillController {
    /** @type {Document} */
    #doc;
    /** @type {Window} */
    #win;
    /**
     * Present exactly while fill mode is active.
     * @type {null | {
     *   target: Element,
     *   ancestors: Element[],
     *   scroll: { left: number, top: number },
     *   observer: MutationObserver,
     * }}
     */
    #state = null;
    /** @type {Set<(change: { active: boolean, reason?: string }) => void>} */
    #listeners = new Set();

    /** @param {Document} doc */
    constructor(doc) {
      if (!doc?.defaultView) {
        throw new TypeError('FillController needs a document attached to a window');
      }
      this.#doc = doc;
      this.#win = doc.defaultView;
    }

    get active() {
      return this.#state !== null;
    }

    /** The element currently pinned to the viewport, or null. */
    get target() {
      return this.#state?.target ?? null;
    }

    /**
     * Subscribes to state changes. Enter events carry `{ active: true }`,
     * exit events `{ active: false, reason }` with a value of EXIT_REASON.
     *
     * @returns {() => void} unsubscribe
     */
    onChange(listener) {
      this.#listeners.add(listener);
      return () => this.#listeners.delete(listener);
    }

    /**
     * Pins the main video player to the viewport.
     *
     * @param {FindOptions} [options] see findMainVideo.
     * @returns {boolean} whether fill mode is active afterwards.
     */
    enter(options) {
      if (this.#state) return true;

      const video = findMainVideo(this.#doc, options);
      if (!video) return false;

      const target = resolveFillTarget(video);

      // Read the scroll position before any style change can move it.
      const scroll = { left: this.#win.scrollX, top: this.#win.scrollY };

      // Start clean: markup copied from a previously filled player could
      // otherwise leave a second element pinned to the viewport.
      this.#clearMarks([]);
      const ancestors = this.#markAncestors(target, []);
      target.setAttribute(ATTR.target, '');
      this.#doc.documentElement.setAttribute(ATTR.root, '');

      const observer = new this.#win.MutationObserver(() => this.#onDomChanged(target));
      observer.observe(this.#doc, { childList: true, subtree: true });

      this.#state = { target, ancestors, scroll, observer };
      this.#notifyLayoutChanged();
      this.#emit({ active: true });
      return true;
    }

    /**
     * Restores the page. No-op when fill mode is not active.
     *
     * @param {string} [reason] a value of EXIT_REASON; defaults to user.
     */
    exit(reason = EXIT_REASON.user) {
      const state = this.#state;
      if (!state) return;
      this.#state = null;

      state.observer.disconnect();
      this.#clearMarks([state.target, ...state.ancestors]);

      // The player leaving the document flow can shift the layout below it;
      // put the reader back where they were. 'instant' overrides a page-level
      // `scroll-behavior: smooth`.
      this.#win.scrollTo({ ...state.scroll, behavior: 'instant' });
      this.#notifyLayoutChanged();
      this.#emit({ active: false, reason });
    }

    /**
     * @param {FindOptions} [options] forwarded to enter().
     * @returns {boolean} whether fill mode is active afterwards.
     */
    toggle(options) {
      if (this.active) {
        this.exit(EXIT_REASON.user);
        return false;
      }
      return this.enter(options);
    }

    #onDomChanged(target) {
      const state = this.#state;
      if (state?.target !== target) return;
      if (!target.isConnected) {
        // A single-page app swapped the player out from under us; leave fill
        // mode so the page is not stuck with a locked scroll.
        this.exit(EXIT_REASON.detached);
        return;
      }
      // The page may have moved the player under a different parent, whose
      // ancestors would otherwise be free to trap it again.
      state.ancestors = this.#markAncestors(target, state.ancestors);
    }

    /**
     * Marks every ancestor of `target` below <html> and unmarks elements of
     * `previous` that are no longer ancestors.
     *
     * @param {Element} target
     * @param {Element[]} previous ancestors marked so far, nearest first.
     * @returns {Element[]} the current ancestors, nearest first.
     */
    #markAncestors(target, previous) {
      const current = [];
      for (let el = target.parentElement; el && el !== this.#doc.documentElement; el = el.parentElement) {
        current.push(el);
      }
      const unchanged = current.length === previous.length && current.every((el, i) => el === previous[i]);
      if (unchanged) return previous;

      const currentSet = new Set(current);
      for (const el of previous) {
        if (!currentSet.has(el)) el.removeAttribute(ATTR.ancestor);
      }
      for (const el of current) el.setAttribute(ATTR.ancestor, '');
      return current;
    }

    /**
     * Removes every fill-mode attribute: from the given elements, which may
     * have been detached from the document (and could be re-attached
     * later), and from anything in the document, which includes copies the
     * page made of marked elements (the live site re-creates its player
     * from HTML, attributes and all).
     */
    #clearMarks(elements) {
      const inDocument = this.#doc.querySelectorAll(`[${ATTR.root}], [${ATTR.target}], [${ATTR.ancestor}]`);
      for (const el of [...elements, ...inDocument]) {
        el.removeAttribute(ATTR.root);
        el.removeAttribute(ATTR.target);
        el.removeAttribute(ATTR.ancestor);
      }
    }

    // Players that size themselves on window resize (rather than with a
    // ResizeObserver) need a nudge to re-layout their controls and overlays.
    #notifyLayoutChanged() {
      this.#win.dispatchEvent(new this.#win.Event('resize'));
    }

    #emit(change) {
      for (const listener of [...this.#listeners]) {
        try {
          listener(change);
        } catch (error) {
          // One faulty listener must not stop the others or corrupt state.
          this.#win.console.error('[Enhancer for NAVER Esports] fill-mode listener failed', error);
        }
      }
    }
  }

  root.EnsFillMode = Object.freeze({
    ATTR,
    EXIT_REASON,
    PLAYER_SELECTOR,
    FillController,
    findMainVideo,
    resolveFillTarget,
  });
})(globalThis);
