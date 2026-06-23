/*
 * Nighter — content script (runs at document_start on every page).
 *
 * Responsibilities:
 *   1. Read the saved state for this host and apply it before first paint.
 *   2. React to storage changes so toggling in the popup (or another tab of
 *      the same site) updates this page live.
 *   3. Answer messages from the popup (getState) and the keyboard command
 *      (toggle).
 *
 * It deliberately stores nothing itself beyond reading/writing chrome.storage,
 * keeping all state in one place so multiple tabs stay in sync.
 */
(() => {
  "use strict";

  const CLASS = "__dm-on";
  const SETTINGS_KEY = "dm:settings";
  const DEFAULTS = { brightness: 100, contrast: 100 };

  // Per-site key. Falls back to origin for exotic schemes without a hostname.
  const host = location.hostname || location.origin || location.href;
  const hostKey = "dm:" + host;

  const root = document.documentElement;
  let enabled = false;

  // --- Detection: is the page *already* dark on its own? --------------------
  function parseColor(str) {
    if (!str) return null;
    const m = str.match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const p = m[1].split(",").map((s) => parseFloat(s));
    if (p.length < 3 || p.some((n) => Number.isNaN(n))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length >= 4 ? p[3] : 1 };
  }

  // Perceived brightness on a 0–255 scale (ITU-R BT.601 weights).
  function brightnessOf(c) {
    return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  }

  // Reports the page's OWN color scheme, independent of our filter — computed
  // style returns declared colors, not the filtered pixels on screen, so this
  // is accurate whether or not dark mode is currently applied.
  function detectNaturalDark() {
    const body = document.body;
    if (!body && !root) return false;

    // 1) The effective page background (first opaque one: body, then html).
    //    Skip <html> while our filter is on — darkmode.css forces it white,
    //    which would mask the page's real scheme. <body> is never overridden.
    const sources = [body];
    if (!root.classList.contains(CLASS)) sources.push(root);
    for (const el of sources) {
      if (!el) continue;
      const c = parseColor(getComputedStyle(el).backgroundColor);
      if (c && c.a >= 0.5) return brightnessOf(c) < 128;
    }
    // 2) `color-scheme: dark` paints the default canvas dark even when the
    //    body background is transparent.
    const scheme = getComputedStyle(root).colorScheme || "";
    if (/\bdark\b/.test(scheme) && !/\blight\b/.test(scheme)) return true;
    // 3) Last resort: light body text usually means a dark background.
    const txt = parseColor(getComputedStyle(body || root).color);
    if (txt) return brightnessOf(txt) > 160;

    return false;
  }

  function sendBadge() {
    // Tell the service worker so it can update the toolbar badge/title.
    try {
      chrome.runtime.sendMessage({
        type: "badge",
        enabled,
        naturalDark: detectNaturalDark(),
      });
    } catch (_) {
      /* service worker may be asleep at document_start; harmless. */
    }
  }

  function applyState(on) {
    enabled = !!on;
    root.classList.toggle(CLASS, enabled);
    sendBadge();
  }

  function applySettings(settings) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    root.style.setProperty("--dm-brightness", s.brightness + "%");
    root.style.setProperty("--dm-contrast", s.contrast + "%");
  }

  // --- Initial paint: pull saved values as early as possible. ---------------
  chrome.storage.local.get([hostKey, SETTINGS_KEY], (res) => {
    applySettings(res[SETTINGS_KEY]);
    applyState(res[hostKey]);
  });

  // Once the DOM and its stylesheets are ready, refresh the badge with an
  // accurate scheme detection — at document_start the <body> may not exist yet.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sendBadge, { once: true });
  } else {
    sendBadge();
  }

  // --- Live updates from the popup / other tabs. ----------------------------
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (hostKey in changes) applyState(changes[hostKey].newValue);
    if (SETTINGS_KEY in changes) applySettings(changes[SETTINGS_KEY].newValue);
  });

  // --- Messages from popup / background. ------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;

    if (msg.type === "getState") {
      chrome.storage.local.get([hostKey, SETTINGS_KEY], (res) => {
        sendResponse({
          ok: true,
          host,
          enabled: !!res[hostKey],
          pageIsDark: detectNaturalDark(),
          settings: Object.assign({}, DEFAULTS, res[SETTINGS_KEY] || {}),
        });
      });
      return true; // keep the message channel open for the async response
    }

    if (msg.type === "toggle") {
      const next = !enabled;
      chrome.storage.local.set({ [hostKey]: next });
      sendResponse({ ok: true, enabled: next });
      return; // synchronous
    }
  });
})();
