# Chrome Tab Switcher

> **Windows Alt+Tab-style tab navigation for Chrome.** Hold `Alt+X` to cycle through your recent tabs, release `Alt` to switch. Instant. Keyboard-first. Zero dependencies.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285f4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34a853)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Alt+Tab-style switching** | Hold `Alt`, tap `X` repeatedly to cycle — release `Alt` to switch. Mirrors Windows Alt+Tab exactly. |
| **Quick Switch** | Single `Alt+W` toggles between your current and previous tab instantly. |
| **Visual overlay** | Dark glassmorphism overlay shows tab titles, domains, and real favicons. |
| **Per-window stacks** | Each Chrome window maintains its own independent MRU (Most Recently Used) history. |
| **Survives restarts** | Tab history persists across service worker restarts via `chrome.storage.session`. |
| **On-demand injection** | Content script is injected automatically — works on tabs opened before the extension was installed. |
| **Keyboard-first** | Full keyboard navigation with arrow keys, Tab/Shift+Tab, Enter, and Escape. |
| **Mouse support** | Click any tab card to switch, click backdrop to dismiss. |
| **CSP compliant** | No inline scripts, no `eval()`, no external resources. Chrome Web Store ready. |
| **Zero dependencies** | Pure vanilla JavaScript. No frameworks, no libraries, no build step. |

---

## 🚀 Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open Chrome → navigate to `chrome://extensions/`
3. Enable **Developer Mode** (toggle in top-right corner)
4. Click **Load unpacked**
5. Select the `chrome-tab-switcher/` folder (the one containing `manifest.json`)
6. The extension is now active — shortcuts work immediately

### Verify Installation

- You should see the Tab Switcher icon in your Chrome toolbar
- Press `Alt+X` on any website — the overlay should appear
- Press `Alt+W` — you should toggle to your previous tab

---

## ⌨️ Keyboard Shortcuts

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+X` | **Open overlay** — shows recent tabs for visual selection |
| `Alt+W` | **Quick switch** — instantly toggle to previous tab (no overlay) |

### While Overlay Is Open

| Key | Action |
|-----|--------|
| `Alt+X` (repeated) | Cycle selection to next tab (hold `Alt`, tap `X`) |
| `Release Alt` | **Switch** to highlighted tab and close overlay |
| `↑` / `↓` | Navigate selection up/down |
| `Tab` / `Shift+Tab` | Navigate selection down/up |
| `Enter` | Switch to highlighted tab |
| `Escape` | Close overlay without switching |
| Click tab card | Switch to clicked tab |
| Click backdrop | Close overlay without switching |

### Alt+Tab Workflow

The extension mimics the Windows Alt+Tab experience:

1. **Quick toggle**: Tap `Alt+X` and release → switches to previous tab
2. **Browse & pick**: Hold `Alt`, press `X` repeatedly to cycle through tabs, release `Alt` to switch
3. **Cancel**: Press `Escape` while overlay is open to stay on current tab

### Customizing Shortcuts

1. Navigate to `chrome://extensions/shortcuts`
2. Find **Chrome Tab Switcher**
3. Click the pencil icon next to any shortcut
4. Press your preferred key combination

> **Note:** `Alt+Tab` cannot be used — it's reserved by the operating system.

---

## 📁 Project Structure

```
chrome-tab-switcher/          ← repository root
├── chrome-tab-switcher/      ← extension package (load this in Chrome)
│   ├── manifest.json         ← MV3 manifest: permissions, commands, registration
│   ├── background.js         ← Service worker: tab tracking, commands, messaging
│   ├── content.js            ← Content script: overlay UI, keyboard nav, switching
│   ├── README.md             ← Extension-level readme
│   └── icons/
│       ├── icon16.png        ← Toolbar icon (16×16)
│       ├── icon48.png        ← Management page icon (48×48)
│       ├── icon128.png       ← Chrome Web Store icon (128×128)
│       └── tab16.png         ← Fallback tab icon in overlay (16×16)
├── specs/                    ← Design specifications
│   ├── requirements.md       ← Functional requirements with acceptance criteria
│   ├── design.md             ← Architecture, data models, error handling
│   └── tasks.md              ← Implementation plan with task tracking
└── README.md                 ← This file
```

---

## 🏗️ Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│  User presses Alt+X / Alt+W                             │
│       ↓                                                 │
│  chrome.commands.onCommand                              │
│       ↓                                                 │
│  ┌─────────────────────┐    ┌─────────────────────────┐ │
│  │   background.js     │◄──►│   chrome.storage.session│ │
│  │   (Service Worker)  │    │   (Tab Stack persistence)│ │
│  │                     │    └─────────────────────────┘ │
│  │  • Tab recency      │                                │
│  │  • Quick switch      │    ┌─────────────────────────┐ │
│  │  • Message routing   │───►│   content.js            │ │
│  │  • On-demand inject  │◄───│   (Content Script)      │ │
│  └─────────────────────┘    │                         │ │
│                              │  • Overlay DOM          │ │
│                              │  • Keyboard handling    │ │
│                              │  • Alt-release detect   │ │
│                              └─────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Message Protocol

| Direction | Message | Purpose |
|-----------|---------|---------|
| Background → Content | `OPEN_OVERLAY` | Trigger overlay display |
| Background → Content | `TAB_STACK_UPDATED` | Tab closed while overlay open — re-render |
| Content → Background | `GET_TAB_STACK` | Request enriched tab metadata |
| Content → Background | `SWITCH_TO_TAB { tabId }` | Activate specified tab |
| Content → Background | `OVERLAY_OPENED` | Register overlay host tab |
| Content → Background | `OVERLAY_CLOSED` | Unregister overlay host tab |

### Key Design Decisions

- **IIFE-wrapped content script** — Prevents `let` redeclaration errors on double-injection
- **On-demand injection** — When `sendMessage` fails, background injects `content.js` via `chrome.scripting.executeScript()` and retries. This guarantees the overlay works on every tab.
- **Per-window MRU stacks** — Each window maintains an independent stack of up to 20 tab IDs
- **Alt-release detection** — Content script listens for `keyup` on `Alt` to trigger the switch, matching native OS behavior
- **Session storage persistence** — Tab stacks survive service worker termination but reset on browser restart
- **Cleanup-on-reinject pattern** — On re-injection, the new script removes the old message listener and any leftover overlay DOM

---

## 🔒 Security & Compliance

- ✅ **No external resources** loaded at runtime
- ✅ **No `eval()`** or `new Function()` or `document.write()`
- ✅ **No inline scripts** — all event handlers attached via `addEventListener()`
- ✅ **`textContent`-only rendering** — tab titles and domains are never inserted as HTML (XSS-safe)
- ✅ **CSS isolation** — all styles scoped to `#chrome-tab-switcher-overlay` with `all: initial` reset
- ✅ **Minimal permissions** — `tabs`, `storage`, `activeTab`, `scripting`

---

## 🛠️ Development

### Prerequisites

- Google Chrome (version 111+)
- No build tools required — pure vanilla JS

### Making Changes

1. Edit files in `chrome-tab-switcher/`
2. Go to `chrome://extensions/` → click **Reload** (↻) on the extension
3. Test on any website

### Debugging

- **Background logs**: Click "Inspect views: service worker" on `chrome://extensions/`
- **Content script logs**: Open DevTools (F12) on any website → Console tab
- **Keyboard shortcuts**: Verify at `chrome://extensions/shortcuts`

---

## 📋 Specs & Requirements

Detailed specifications live in the `specs/` directory:

- [**requirements.md**](specs/requirements.md) — 11 functional requirements with acceptance criteria
- [**design.md**](specs/design.md) — Architecture, data models, error handling, testing strategy
- [**tasks.md**](specs/tasks.md) — Implementation plan with task completion status

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
