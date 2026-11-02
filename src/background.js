/*
 * Service worker: forwards the toolbar icon click and the `toggle-fill`
 * keyboard command to the content script (src/content.js) of the tab, and
 * keeps the toolbar icon enabled only on game.naver.com.
 */
'use strict';

// Must match TOGGLE_MESSAGE_TYPE in src/content.js.
const TOGGLE_MESSAGE = Object.freeze({ type: 'ens:toggle-fill' });
const COMMAND_TOGGLE_FILL = 'toggle-fill';
const SITE_HOST = 'game.naver.com';

/**
 * Asks the tab's content script to toggle fill mode.
 *
 * @param {number} tabId
 * @returns {Promise<{ active: boolean } | null>} the new state, or null when
 *   the tab has no content script (another site, or a game.naver.com tab
 *   opened before the extension was installed and not reloaded since).
 */
async function toggleFillInTab(tabId) {
  try {
    return (await chrome.tabs.sendMessage(tabId, TOGGLE_MESSAGE)) ?? null;
  } catch (error) {
    // "Receiving end does not exist" is the expected no-content-script
    // case; anything else is unexpected and worth surfacing.
    if (!String(error?.message).includes('Receiving end does not exist')) {
      console.error('[Enhancer for NAVER Esports] toggle failed', error);
    }
    return null;
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) void toggleFillInTab(tab.id);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === COMMAND_TOGGLE_FILL && tab?.id !== undefined) {
    void toggleFillInTab(tab.id);
  }
});

// The icon is disabled (greyed out) by default and enabled by a
// declarativeContent rule on matching pages. Rules persist across browser
// restarts but the default disabled state does not, hence onStartup too.
function disableActionByDefault() {
  void chrome.action.disable();
}

function registerShowActionRule() {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostEquals: SITE_HOST, schemes: ['https'] },
          }),
        ],
        actions: [new chrome.declarativeContent.ShowAction()],
      },
    ]);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  disableActionByDefault();
  registerShowActionRule();
});

chrome.runtime.onStartup.addListener(disableActionByDefault);
