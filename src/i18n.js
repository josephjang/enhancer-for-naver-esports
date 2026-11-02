/*
 * Localized UI text for the content scripts, from _locales/<lang>/messages.json
 * via chrome.i18n. The browser picks the language from its own UI language
 * (English or Korean, English for any other language; manifest.json's
 * default_locale).
 *
 * Classic script; publishes `globalThis.EnsI18n`.
 */
(function (root) {
  'use strict';

  /**
   * @param {string} key a message name from _locales/<lang>/messages.json.
   * @returns {string} the localized text, or `key` itself when the message
   *   is missing, so a broken locale file shows up as a visible key instead
   *   of an empty label.
   */
  function message(key) {
    const text = root.chrome?.i18n?.getMessage(key);
    if (text) return text;
    root.console.error(`[Enhancer for NAVER Esports] missing message "${key}"`);
    return key;
  }

  root.EnsI18n = Object.freeze({ message });
})(globalThis);
