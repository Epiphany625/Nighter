# 🌙 Nighter — Dark Mode Toggle

A lightweight Chrome extension that turns **any** website dark with one click,
and switches it back just as easily. Your choice is remembered **per site**, and
you can fine-tune brightness and contrast for comfortable reading.

No account, no servers, no tracking — everything runs locally in your browser.

---

## Table of contents

1. [What it does](#what-it-does)
2. [How dark mode is achieved](#how-dark-mode-is-achieved)
3. [Code structure](#code-structure)
4. [How the pieces fit together](#how-the-pieces-fit-together)
5. [Installing & using it in Chrome](#installing--using-it-in-chrome)
6. [Permissions explained](#permissions-explained)
7. [Known limitations](#known-limitations)

---

## What it does

- **One-click toggle** — open the popup and flip the switch, or press
  `Alt`+`Shift`+`D`.
- **Auto-detects already-dark sites** — if a page already ships a dark theme,
  Nighter notices and offers to switch it to a **light** theme instead, so the
  toggle never works against you.
- **Per-site memory** — enabling dark mode on `example.com` keeps it dark on
  every visit and in every tab, while leaving other sites untouched.
- **Readability tuning** — global **Brightness** and **Contrast** sliders let you
  soften the look without breaking text legibility.
- **Photos stay normal** — images, video and embeds are kept at their true
  colors instead of looking like photographic negatives.
- **Toolbar badge** — an `ON` badge shows at a glance when the current tab is
  dark.

---

## How dark mode is achieved

The hard part of a universal dark mode is that every website styles itself
differently. Rather than trying to rewrite each site's CSS, Nighter uses a
single, robust **CSS filter** applied to the root `<html>` element:

```css
html.__dm-on {
  filter: invert(1) hue-rotate(180deg) brightness(...) contrast(...);
}
```

Why this works well:

- **`invert(1)`** flips luminance — light backgrounds become dark and dark text
  becomes light. Crucially, it preserves *contrast*, so text stays as readable
  as it was originally. This is the key to not hurting readability.
- **`hue-rotate(180deg)`** undoes the hue shift that inversion alone would cause,
  so blues stay blue-ish, reds stay red-ish, etc., instead of becoming their
  negative.

### Keeping images and video looking right

A naive full-page invert would turn every photo into a negative. Nighter fixes
this by **re-inverting the media elements**:

```css
html.__dm-on img,
html.__dm-on video,
html.__dm-on canvas,
html.__dm-on iframe,
html.__dm-on embed,
html.__dm-on object {
  filter: invert(1) hue-rotate(180deg);
}
```

Because a child element's filter is applied *before* its parent's, the second
`invert + hue-rotate` mathematically cancels the page-level one
(`invert∘invert = identity`, `hue-rotate(180°)` twice = `360°` = identity). The
net result: the page is dark, but photos and videos keep their original colors
(only inheriting the brightness/contrast dimming you choose). Inline `<svg>` is
deliberately *not* re-inverted, because those are usually monochrome icons that
should follow the now-light text color.

### Tuning for comfort

`brightness()` and `contrast()` are driven by CSS custom properties
(`--dm-brightness`, `--dm-contrast`) set on `<html>`. The popup sliders just
update those variables via storage, so tuning is instant and never re-injects
any CSS.

### Detecting a page that's already dark

Because the invert filter simply flips whatever luminance a page has, applying
it to an *already-dark* site would make it **light**. So Nighter first detects
the page's own color scheme and adapts the wording (the mechanism is identical —
only the framing changes):

| Page's natural scheme | Toggle label | What turning it on does |
| --- | --- | --- |
| Light (most sites) | **Dark mode** | makes the page dark |
| Already dark | **Light mode** | makes the page light/bright |

Detection runs in the content script (`detectNaturalDark()`) and reads the
page's *declared* styles via `getComputedStyle` — which report real colors, not
the filtered pixels — so it's accurate even while the filter is applied. It
checks, in order:

1. The effective page background color (`<body>`, then `<html>`); a perceived
   brightness below the midpoint means the page is dark.
2. The CSS `color-scheme` property — `color-scheme: dark` paints a dark default
   canvas even when the body background is transparent.
3. As a last resort, the body text color — light text usually implies a dark
   background.

When an already-dark page is detected, the popup shows a **"Light mode"** toggle
plus a short note, and the toolbar tooltip reads *"Light mode"* accordingly.

### Why a filter instead of rewriting styles?

| Approach | Pros | Cons |
| --- | --- | --- |
| **CSS filter invert** (this extension) | Works on *every* site instantly; handles dynamically-added content automatically; preserves contrast/readability | A few edge cases (see [limitations](#known-limitations)) |
| Rewriting each site's colors | Photos never need re-inverting | Extremely hard to get right universally; breaks on complex/themed sites |

For a "make any page dark" tool, the filter approach is the most **compatible**
and reliable choice, which is why it's used here.

---

## Code structure

```
Nighter/
├── manifest.json          # Manifest V3 config: permissions, scripts, command
├── icons/
│   ├── icon16.png         # toolbar / small UI
│   ├── icon48.png         # extensions page
│   └── icon128.png        # Web Store / install dialog
├── styles/
│   └── darkmode.css       # the invert/hue-rotate dark theme (gated by .__dm-on)
└── src/
    ├── content.js         # applies state per page, syncs via storage, answers messages
    ├── background.js      # service worker: keyboard shortcut + toolbar badge
    ├── popup.html         # the toggle + sliders UI
    ├── popup.css          # dark-themed popup styling
    └── popup.js           # reads state, writes changes to storage
```

### What each file does

- **`manifest.json`** — declares a Manifest V3 extension. It injects
  `darkmode.css` and `content.js` into every page at `document_start`, registers
  the background service worker, the popup, and the `Alt+Shift+D` command.

- **`styles/darkmode.css`** — the actual dark theme. All rules are scoped to
  `html.__dm-on`, so the file is inert until the content script adds that class.
  That makes it safe to inject everywhere.

- **`src/content.js`** — runs on every page. On load it reads the saved state
  for the current host and applies it *before first paint*. It listens to
  `chrome.storage.onChanged` so changes from the popup (or another tab of the
  same site) take effect live, answers `getState` / `toggle` messages, and
  detects whether the page is **already dark** (`detectNaturalDark()`) so the UI
  can offer the right action.

- **`src/background.js`** — a tiny service worker. It turns the keyboard command
  into a `toggle` message for the active tab, and updates the toolbar badge/title
  whenever a page reports its dark-mode state.

- **`src/popup.html` / `popup.css` / `popup.js`** — the UI. The popup is
  intentionally "dumb": it asks the content script for the current state, then
  writes any changes straight to `chrome.storage.local`. The content script does
  the applying. This keeps a **single source of truth** and keeps every open tab
  in sync.

---

## How the pieces fit together

```
        ┌─────────────┐   writes    ┌────────────────────┐
        │   popup.js  │ ──────────► │ chrome.storage.local│
        │ (toggle/    │             │  dm:<host> = on/off │
        │  sliders)   │ ◄────────── │  dm:settings = {...} │
        └─────────────┘  getState   └─────────┬──────────┘
              ▲  │ (via content script)        │ onChanged
              │  │                             ▼
   Alt+Shift+D│  │ toggle msg          ┌────────────────┐   adds/removes
        ┌─────┴──▼─────┐  toggle msg   │   content.js   │ ───────────────►  <html class="__dm-on">
        │ background.js│ ─────────────►│  (per page)    │                   + --dm-brightness / --dm-contrast
        │ (SW + badge) │ ◄──────────── └────────────────┘                          │
        └──────────────┘  "badge" msg                                              ▼
                                                                          styles/darkmode.css applies
```

1. You flip the switch (or press the shortcut, or drag a slider).
2. The new value is written to `chrome.storage.local` — `dm:<host>` for the
   on/off state of that site, `dm:settings` for the global brightness/contrast.
3. Every content script listening on `onChanged` reacts: it adds/removes the
   `__dm-on` class and updates the CSS variables on `<html>`.
4. `styles/darkmode.css` (already injected) instantly takes effect.
5. The content script pings the background worker, which updates the `ON` badge.

Because state lives in `chrome.storage`, it persists across restarts and stays
consistent across multiple tabs of the same site.

---

## Installing & using it in Chrome

This is an **unpacked** extension (no build step required).

### Load it

1. Open Chrome and go to `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Select the `Nighter/` folder (the one containing `manifest.json`).
5. Nighter appears in your toolbar. Click the puzzle-piece icon and **pin** it
   for easy access.

> Works on Chrome (and other Chromium browsers such as Edge, Brave, and Opera)
> with Manifest V3 support — Chrome 88+.

### Use it

- **Click the 🌙 icon** to open the popup, then flip **Dark mode** on/off for the
  current site.
- Or press **`Alt`+`Shift`+`D`** to toggle without opening the popup.
- Drag **Brightness** / **Contrast** to tune comfort (these apply to all sites).
- Click **Reset appearance** to return the sliders to defaults.

The shortcut can be changed at `chrome://extensions/shortcuts`.

---

## Permissions explained

| Permission | Why it's needed |
| --- | --- |
| `storage` | Save your per-site on/off choices and slider settings locally. |
| `activeTab` | Let the popup and keyboard shortcut talk to the page you're currently on. |
| `<all_urls>` (content scripts) | So the dark theme can be applied on *any* website you choose. The CSS is inert until you turn dark mode on for a site. |

Nighter has **no network access** and sends **no data anywhere** — all state is
kept in your browser's local extension storage.

---

## Known limitations

The full-page filter is intentionally simple and universal; a few edge cases
come with that trade-off:

- **CSS background-images** (decorative images set via stylesheets, not `<img>`)
  are inverted along with the page, so they may look off. Inline `<img>`/`<video>`
  etc. are handled correctly.
- **Already-dark sites**: if a site is already dark, turning Nighter on will make
  it light — just leave it off there (Nighter is per-site, so this is easy).
- **Subdomains are separate**: `www.example.com` and `example.com` are remembered
  independently.
- **Browser-restricted pages**: Chrome forbids extensions from running on
  `chrome://` pages, the Chrome Web Store, and some local files. The popup will
  tell you when a page can't be themed.
- **Rare layout quirks**: applying a filter to the root element can, on a small
  number of sites, slightly affect elements that rely on `position: fixed`.
  Toggling dark mode off restores the original layout.

If a specific element ever looks wrong, a page can opt it out by adding the
`data-nighter-skip` attribute or the `nighter-skip` class.
