/*
 * Content script entry point for game.naver.com. Wires fill mode to:
 *   - the control-bar button (src/player-button.js),
 *   - the `w` key (toggle) and Escape (exit),
 *   - the toolbar icon and the extension shortcut (src/background.js),
 *   - per-tab persistence: moving to another video is a full page load on
 *     this site, so fill mode is remembered in sessionStorage and restored
 *     once the next page's player appears.
 */
(function () {
  'use strict';

  const { FillController, EXIT_REASON } = globalThis.EnsFillMode;
  const { injectButtons, installClickHandling, syncButtons } = globalThis.EnsPlayerButton;

  const SESSION_KEY = 'enhanced-naver-sports:fill-active';
  // Must match TOGGLE_MESSAGE in src/background.js.
  const TOGGLE_MESSAGE_TYPE = 'ens:toggle-fill';
  // Physical key, so the shortcut also works while the Korean IME is in
  // Hangul mode (where the same key reports event.key === 'ㅈ').
  const SHORTCUT_CODE = 'KeyW';

  /**
   * A boolean flag in the page's sessionStorage, which lives as long as
   * the tab and survives same-origin navigations. Storage can be disabled
   * or full; the flag then degrades to "not remembered" instead of
   * breaking fill mode itself.
   */
  function createSessionFlag(key) {
    return {
      isSet() {
        try {
          return window.sessionStorage.getItem(key) === '1';
        } catch {
          return false;
        }
      },
      set(value) {
        try {
          if (value) window.sessionStorage.setItem(key, '1');
          else window.sessionStorage.removeItem(key);
        } catch {
          // Unavailable storage only loses persistence across page loads.
        }
      },
    };
  }

  function isEditable(node) {
    if (!(node instanceof Element)) return false;
    if (node instanceof HTMLElement && node.isContentEditable) return true;
    return node.closest('input, textarea, select, [role="textbox"]') !== null;
  }

  const controller = new FillController(document);
  const rememberedFill = createSessionFlag(SESSION_KEY);

  controller.onChange(({ active, reason }) => {
    syncButtons(document, active);
    if (active) {
      rememberedFill.set(true);
    } else if (reason === EXIT_REASON.user) {
      // Only an explicit exit forgets the mode; a player swapped out by the
      // page keeps it so the replacement player is filled again.
      rememberedFill.set(false);
    }
  });

  // Player DOM appears late and can be rebuilt, so scan after mutations,
  // coalescing each burst into one pass.
  let scanScheduled = false;
  function scan() {
    scanScheduled = false;
    injectButtons(document, controller.active);
    if (!controller.active && rememberedFill.isSet()) {
      // Restore only onto a real player, never onto e.g. a hover preview.
      controller.enter({ playersOnly: true });
    }
  }
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    setTimeout(scan, 0);
  }
  installClickHandling(document, controller);
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  scan();

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.isComposing || event.repeat) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isEditable(event.composedPath()[0] ?? event.target)) return;

      if (event.code === SHORTCUT_CODE) {
        const wasActive = controller.active;
        const isActive = controller.toggle();
        // Leave the key alone on pages without a video.
        if (wasActive || isActive) event.preventDefault();
      } else if (event.key === 'Escape' && controller.active && !document.fullscreenElement) {
        // In real fullscreen the browser consumes Escape to leave fullscreen;
        // the guard keeps a synthetic Escape from also leaving fill mode.
        controller.exit(EXIT_REASON.user);
      }
    },
    // Capture: the player may stop propagation of keys pressed inside it.
    true,
  );

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== TOGGLE_MESSAGE_TYPE) return false;
    sendResponse({ active: controller.toggle() });
    return false;
  });
})();
