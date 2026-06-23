/*
 * Nighter — background service worker (Manifest V3).
 *
 * Two small jobs:
 *   1. Keyboard shortcut (Alt+Shift+D) -> tell the active tab to toggle.
 *   2. Toolbar badge -> reflect whether the current tab is in dark mode.
 *
 * No long-lived state lives here; the worker can be torn down at any time and
 * respawned on the next event, which is the MV3 model.
 */

const ACCENT = "#7c5cff";

// --- Keyboard command -------------------------------------------------------
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-dark-mode") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "toggle" });
  } catch (_) {
    // No content script on this page (e.g. chrome:// or the Web Store).
  }
});

// --- Toolbar badge ----------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "badge" || !sender.tab || sender.tab.id == null) {
    return;
  }
  const on = !!msg.enabled;
  const tabId = sender.tab.id;
  // On a site that's already dark, applying the filter brightens it instead,
  // so describe the action as "Light mode".
  const mode = msg.naturalDark ? "Light" : "Dark";
  chrome.action.setBadgeText({ tabId, text: on ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: ACCENT });
  chrome.action.setTitle({
    tabId,
    title: on
      ? `Nighter — ${mode} mode ON (click to turn off)`
      : `Nighter — Toggle ${mode.toLowerCase()} mode`,
  });
});
