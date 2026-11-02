/*
 * Fill-mode toggle button for the PZP player's control bar, placed just
 * before the player's own fullscreen button. It reuses the player's button
 * classes so it inherits the native size, hover tooltip and colors.
 *
 * Classic script; publishes `globalThis.EnsPlayerButton`.
 */
(function (root) {
  'use strict';

  const BUTTON_CLASS = 'ens-fill-button';
  // Right-hand button group of the PZP control bar (settings, wide view,
  // fullscreen).
  const CONTROL_GROUP_SELECTOR = '.pzp-pc__bottom-buttons-right';
  const FULLSCREEN_BUTTON_SELECTOR = '.pzp-pc__fullscreen-button';
  const PLAYER_SELECTOR = root.EnsFillMode.PLAYER_SELECTOR;

  // Message names in _locales/<lang>/messages.json (see src/i18n.js).
  const LABEL_KEY = Object.freeze({
    enter: 'fillButtonEnter',
    exit: 'fillButtonExit',
  });
  // The key handled by src/content.js; the same in every language.
  const SHORTCUT_HINT = 'w';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // 36x36 icons matching the player's icon grid: a browser window whose
  // horizontal arrows point outward (enter) or inward (exit).
  const ICON_PATHS = Object.freeze({
    enter: [
      'M8 10h20a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1z',
      'M7 14h22',
      'M11 20h14',
      'M14 17l-3 3 3 3',
      'M22 17l3 3-3 3',
    ],
    exit: [
      'M8 10h20a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1z',
      'M7 14h22',
      'M10 20h5',
      'M21 20h5',
      'M12 17l3 3-3 3',
      'M24 17l-3 3 3 3',
    ],
  });

  function createIcon(doc, variant) {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', `ens-fill-button__icon ens-fill-button__icon--${variant}`);
    svg.setAttribute('viewBox', '0 0 36 36');
    svg.setAttribute('width', '36');
    svg.setAttribute('height', '36');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const d of ICON_PATHS[variant]) {
      const path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  }

  /** Reflects fill-mode state in the button's label, tooltip and icon. */
  function syncButton(button, active) {
    const label = root.EnsI18n.message(active ? LABEL_KEY.exit : LABEL_KEY.enter);
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(active));
    const tooltip = button.querySelector('.pzp-button__tooltip');
    if (tooltip) tooltip.textContent = `${label} (${SHORTCUT_HINT})`;
  }

  /** Markup only; behavior comes from installClickHandling(). */
  function createFillButton(doc, active) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `pzp-button ${BUTTON_CLASS}`;

    const tooltip = doc.createElement('span');
    tooltip.className = 'pzp-button__tooltip pzp-button__tooltip--top';

    const iconBox = doc.createElement('span');
    iconBox.className = 'pzp-ui-icon';
    iconBox.append(createIcon(doc, 'enter'), createIcon(doc, 'exit'));

    button.append(tooltip, iconBox);
    syncButton(button, active);
    return button;
  }

  /**
   * Adds the button to every PZP control group that lacks one. Idempotent,
   * so it can run on every DOM mutation.
   *
   * @param {Document} doc
   * @param {boolean} active current fill-mode state, for the initial label.
   * @returns {number} how many buttons were added.
   */
  function injectButtons(doc, active) {
    let added = 0;
    for (const group of doc.querySelectorAll(CONTROL_GROUP_SELECTOR)) {
      if (group.querySelector(`:scope > .${BUTTON_CLASS}`)) continue;
      const fullscreenButton = group.querySelector(`:scope > ${FULLSCREEN_BUTTON_SELECTOR}`);
      // insertBefore(x, null) appends, covering a player without fullscreen.
      group.insertBefore(createFillButton(doc, active), fullscreenButton);
      added += 1;
    }
    return added;
  }

  function syncButtons(doc, active) {
    for (const button of doc.querySelectorAll(`.${BUTTON_CLASS}`)) {
      syncButton(button, active);
    }
  }

  function buttonFromEvent(event) {
    return event.target instanceof Element ? event.target.closest(`.${BUTTON_CLASS}`) : null;
  }

  /**
   * Makes every fill button in `doc` work, including copies.
   *
   * The handlers are delegated from the window instead of attached to each
   * button because the live site re-creates the player from its own HTML
   * after load: the copy keeps the button's markup but loses any listener
   * attached to the original element. The capture phase also runs before
   * any handler of the page.
   *
   * @param {Document} doc
   * @param {InstanceType<typeof root.EnsFillMode.FillController>} controller
   * @returns {() => void} removes the handlers.
   */
  function installClickHandling(doc, controller) {
    const win = doc.defaultView;

    // Keep focus where it was (usually the player) so the player's own
    // keyboard shortcuts, e.g. space to pause, keep working after a click.
    const onMouseDown = (event) => {
      if (buttonFromEvent(event)) event.preventDefault();
    };

    const onClick = (event) => {
      const button = buttonFromEvent(event);
      if (!button) return;
      // The player treats clicks that reach it as play/pause toggles.
      event.stopPropagation();
      const player = button.closest(PLAYER_SELECTOR);
      controller.toggle(player ? { within: player } : undefined);
    };

    win.addEventListener('mousedown', onMouseDown, true);
    win.addEventListener('click', onClick, true);
    return () => {
      win.removeEventListener('mousedown', onMouseDown, true);
      win.removeEventListener('click', onClick, true);
    };
  }

  root.EnsPlayerButton = Object.freeze({
    BUTTON_CLASS,
    LABEL_KEY,
    injectButtons,
    installClickHandling,
    syncButtons,
  });
})(globalThis);
