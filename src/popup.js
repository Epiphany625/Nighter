/*
 * Nighter — popup controller.
 *
 * The popup is intentionally "dumb": it asks the content script for the
 * current state, then writes changes straight to chrome.storage.local. The
 * content script's storage listener does the actual applying, which keeps a
 * single source of truth and means every open tab of the site stays in sync.
 */
(() => {
  "use strict";

  const SETTINGS_KEY = "dm:settings";
  const DEFAULTS = { brightness: 100, contrast: 100 };
  const $ = (sel) => document.querySelector(sel);

  let host = null;

  function showUnsupported() {
    $("#content").hidden = true;
    $("#unsupported").hidden = false;
  }

  function clampSettings(s) {
    const n = (v, lo, hi, d) => {
      const x = Number(v);
      return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
    };
    return {
      brightness: n(s && s.brightness, 50, 100, DEFAULTS.brightness),
      contrast: n(s && s.contrast, 70, 110, DEFAULTS.contrast),
    };
  }

  function reflect(id) {
    $("#" + id + "-val").textContent = $("#" + id).value + "%";
  }

  function saveSettings() {
    chrome.storage.local.set({
      [SETTINGS_KEY]: {
        brightness: Number($("#brightness").value),
        contrast: Number($("#contrast").value),
      },
    });
  }

  async function init() {
    let tab;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch (_) {
      /* ignore */
    }
    if (!tab || tab.id == null) return showUnsupported();

    let state = null;
    try {
      state = await chrome.tabs.sendMessage(tab.id, { type: "getState" });
    } catch (_) {
      // Content script isn't present -> page Chrome won't let us touch.
    }
    if (!state || !state.ok) return showUnsupported();

    host = state.host;
    $("#host").textContent = host;
    $("#host").title = host;
    $("#toggle").checked = !!state.enabled;

    // Adapt the framing to the page's natural scheme. The underlying mechanism
    // (invert filter) is identical; only the wording changes: applying it to a
    // page that's already dark switches it to a light theme instead.
    const pageIsDark = !!state.pageIsDark;
    $("#toggle-label").textContent = pageIsDark ? "Light mode" : "Dark mode";
    $("#mode-note").hidden = !pageIsDark;
    $("#switch").title = pageIsDark
      ? "Switch this site to a light theme"
      : "Toggle dark mode for this site";

    const s = clampSettings(state.settings || DEFAULTS);
    $("#brightness").value = s.brightness;
    $("#contrast").value = s.contrast;
    reflect("brightness");
    reflect("contrast");

    $("#content").hidden = false;

    // --- Wire up events ---
    $("#toggle").addEventListener("change", (e) => {
      chrome.storage.local.set({ ["dm:" + host]: e.target.checked });
    });

    const onSlide = () => {
      reflect("brightness");
      reflect("contrast");
      saveSettings();
    };
    $("#brightness").addEventListener("input", onSlide);
    $("#contrast").addEventListener("input", onSlide);

    $("#reset").addEventListener("click", () => {
      $("#brightness").value = DEFAULTS.brightness;
      $("#contrast").value = DEFAULTS.contrast;
      reflect("brightness");
      reflect("contrast");
      chrome.storage.local.set({ [SETTINGS_KEY]: Object.assign({}, DEFAULTS) });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
