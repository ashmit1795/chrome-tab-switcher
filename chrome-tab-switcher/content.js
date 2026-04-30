// =============================================================================
// Chrome Tab Switcher - Content Script
// =============================================================================
// Wrapped in an IIFE to avoid "Identifier already declared" errors when the
// script is injected more than once (manifest + on-demand).
// =============================================================================

(function () {
  'use strict';

  // ── Cleanup previous instance ────────────────────────────────────────────
  // When the extension reloads or double-injects, we tear down the old
  // instance cleanly so only one set of listeners is ever active.
  if (window.__ctsMessageHandler) {
    try { chrome.runtime.onMessage.removeListener(window.__ctsMessageHandler); } catch (_) {}
  }
  if (window.__ctsKeyDown) {
    try { document.removeEventListener('keydown', window.__ctsKeyDown, true); } catch (_) {}
  }
  if (window.__ctsKeyUp) {
    try { document.removeEventListener('keyup', window.__ctsKeyUp, true); } catch (_) {}
  }
  const existingOverlay = document.getElementById('chrome-tab-switcher-overlay');
  if (existingOverlay) existingOverlay.remove();

  // ── State ────────────────────────────────────────────────────────────────
  let overlayElement = null;
  let tabList = [];
  let selectedIndex = 1;
  let isOverlayOpen = false;
  let pendingAltRelease = false;
  let openedViaAltX = false;

  // ── Utilities ────────────────────────────────────────────────────────────
  function truncateTitle(title, maxLength = 50) {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength - 1) + '…';
  }

  function getLocalTabIconUrl() {
    return chrome.runtime.getURL('icons/tab16.png');
  }

  function domainHue(domain) {
    let h = 0;
    for (let i = 0; i < domain.length; i++) h = (h + domain.charCodeAt(i) * 37) % 360;
    return h;
  }

  // ── CSS ──────────────────────────────────────────────────────────────────
  function buildOverlayCSS() {
    return `
#chrome-tab-switcher-overlay {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  box-sizing: border-box;

  --cts-bg: rgba(30, 30, 30, 0.92);
  --cts-card: rgba(255, 255, 255, 0.04);
  --cts-card-hover: rgba(255, 255, 255, 0.07);
  --cts-active-bg: rgba(66, 133, 244, 0.18);
  --cts-active-border: #4285f4;
  --cts-radius: 12px;
  --cts-card-h: 52px;
  --cts-text: #eaeaea;
  --cts-text2: #888;
  --cts-shadow: 0 24px 80px rgba(0,0,0,.45), 0 2px 12px rgba(0,0,0,.2);
}

/* ── Animations ───────────────────── */
@keyframes cts-in  { from { opacity:0; transform:scale(.97) translateY(-6px); } to { opacity:1; transform:scale(1) translateY(0); } }
@keyframes cts-out { from { opacity:1; transform:scale(1) translateY(0); } to { opacity:0; transform:scale(.97) translateY(-6px); } }
@keyframes cts-backdrop-in { from { opacity:0; } to { opacity:1; } }

/* ── Backdrop ─────────────────────── */
#chrome-tab-switcher-overlay .cts-backdrop {
  all: initial;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: cts-backdrop-in 120ms ease-out both;
}

/* ── Container ────────────────────── */
#chrome-tab-switcher-overlay .cts-container {
  all: initial;
  position: relative;
  z-index: 1;
  background: var(--cts-bg);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: var(--cts-radius);
  box-shadow: var(--cts-shadow);
  width: 460px;
  max-width: calc(100vw - 32px);
  overflow: hidden;
  animation: cts-in 150ms cubic-bezier(.2,.8,.3,1) both;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex;
  flex-direction: column;
}
#chrome-tab-switcher-overlay .cts-container.cts-closing {
  animation: cts-out 120ms ease-in both;
}

/* ── Header ───────────────────────── */
#chrome-tab-switcher-overlay .cts-header {
  all: initial;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  font-family: inherit;
}
#chrome-tab-switcher-overlay .cts-header-title {
  all: initial; font-family: inherit; color: var(--cts-text); font-weight: 600; font-size: 13px; letter-spacing: .3px;
}
#chrome-tab-switcher-overlay .cts-header-count {
  all: initial; font-family: inherit; color: var(--cts-text2); font-size: 11px;
}

/* ── Tab list ─────────────────────── */
#chrome-tab-switcher-overlay .cts-tab-list {
  all: initial;
  display: block;
  max-height: 416px; /* ~8 cards */
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,.15) transparent;
}
#chrome-tab-switcher-overlay .cts-tab-list::-webkit-scrollbar { width: 5px; }
#chrome-tab-switcher-overlay .cts-tab-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 3px; }

/* ── Tab card ─────────────────────── */
#chrome-tab-switcher-overlay .cts-tab-card {
  all: initial;
  display: flex;
  align-items: center;
  height: var(--cts-card-h);
  padding: 0 14px;
  margin: 0 6px;
  gap: 12px;
  cursor: pointer;
  border-radius: 8px;
  border-left: 3px solid transparent;
  transition: background .1s, border-color .1s;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  box-sizing: border-box;
}
#chrome-tab-switcher-overlay .cts-tab-card:hover {
  background: var(--cts-card-hover);
}
#chrome-tab-switcher-overlay .cts-tab-card.cts-active {
  background: var(--cts-active-bg);
  border-left-color: var(--cts-active-border);
}

/* ── Favicon / Fallback ───────────── */
#chrome-tab-switcher-overlay .cts-favicon {
  all: initial; display: block; width: 20px; height: 20px; flex-shrink: 0; object-fit: contain; border-radius: 4px;
}
#chrome-tab-switcher-overlay .cts-favicon-fb {
  all: initial; display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; flex-shrink: 0; border-radius: 50%;
  color: #fff; font-size: 10px; font-weight: 700;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* ── Tab info ─────────────────────── */
#chrome-tab-switcher-overlay .cts-tab-info {
  all: initial; display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; flex: 1;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
#chrome-tab-switcher-overlay .cts-tab-title {
  all: initial; display: block; font-size: 13px; font-weight: 500; color: var(--cts-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-family: inherit;
}
#chrome-tab-switcher-overlay .cts-tab-domain {
  all: initial; display: block; font-size: 11px; color: var(--cts-text2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-family: inherit;
}

/* ── Footer ───────────────────────── */
#chrome-tab-switcher-overlay .cts-footer {
  all: initial; display: flex; justify-content: center; gap: 20px;
  padding: 8px 16px;
  border-top: 1px solid rgba(255,255,255,.06);
  font-family: inherit;
}
#chrome-tab-switcher-overlay .cts-footer span {
  all: initial; font-family: inherit; color: var(--cts-text2); font-size: 10px; letter-spacing: .2px;
}
#chrome-tab-switcher-overlay .cts-footer kbd {
  all: initial; font-family: inherit; display: inline-block;
  background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12);
  border-radius: 3px; padding: 0 4px; font-size: 9px; color: var(--cts-text);
  margin: 0 2px; line-height: 16px;
}
`;
  }

  // ── DOM Construction ─────────────────────────────────────────────────────
  function createFaviconFallback(domain) {
    const div = document.createElement('div');
    div.className = 'cts-favicon-fb';
    div.textContent = (domain && domain.length > 0 ? domain[0] : '?').toUpperCase();
    div.style.backgroundColor = `hsl(${domainHue(domain || '')}, 50%, 42%)`;
    return div;
  }

  function createTabCard(tab, isActive) {
    const card = document.createElement('div');
    card.className = 'cts-tab-card' + (isActive ? ' cts-active' : '');
    card.dataset.tabId = String(tab.id);

    if (tab.favIconUrl) {
      const img = document.createElement('img');
      img.className = 'cts-favicon';
      img.src = tab.favIconUrl;
      img.alt = '';
      img.width = 20; img.height = 20;
      img.onerror = function () { if (this.parentNode) this.parentNode.replaceChild(createFaviconFallback(tab.domain), this); };
      card.appendChild(img);
    } else {
      card.appendChild(createFaviconFallback(tab.domain));
    }

    const info = document.createElement('div');
    info.className = 'cts-tab-info';
    const t = document.createElement('div');
    t.className = 'cts-tab-title';
    t.textContent = truncateTitle(tab.title || 'Untitled');
    const d = document.createElement('div');
    d.className = 'cts-tab-domain';
    d.textContent = tab.domain || '';
    info.appendChild(t);
    info.appendChild(d);
    card.appendChild(info);

    card.addEventListener('click', () => {
      const idx = tabList.findIndex(x => x.id === tab.id);
      if (idx !== -1) selectedIndex = idx;
      switchToSelectedTab();
    });
    return card;
  }

  function createOverlayElement(tabs) {
    const root = document.createElement('div');
    root.id = 'chrome-tab-switcher-overlay';

    const style = document.createElement('style');
    style.textContent = buildOverlayCSS();
    root.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.className = 'cts-backdrop';
    backdrop.addEventListener('click', () => closeOverlay());
    root.appendChild(backdrop);

    const container = document.createElement('div');
    container.className = 'cts-container';

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'cts-header';
    const hTitle = document.createElement('span');
    hTitle.className = 'cts-header-title';
    hTitle.textContent = 'Switch Tabs';
    const hCount = document.createElement('span');
    hCount.className = 'cts-header-count';
    hCount.textContent = tabs.length + ' tabs';
    hdr.appendChild(hTitle);
    hdr.appendChild(hCount);
    container.appendChild(hdr);

    // Tab list
    const list = document.createElement('div');
    list.className = 'cts-tab-list';
    tabs.forEach((tab, i) => list.appendChild(createTabCard(tab, i === selectedIndex)));
    container.appendChild(list);

    // Footer
    const ftr = document.createElement('div');
    ftr.className = 'cts-footer';
    ftr.innerHTML =
      '<span><kbd>Alt</kbd>+<kbd>X</kbd> cycle</span>' +
      '<span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>' +
      '<span><kbd>Enter</kbd> switch</span>' +
      '<span><kbd>Esc</kbd> cancel</span>';
    container.appendChild(ftr);

    root.appendChild(container);
    return root;
  }

  // ── Highlight ────────────────────────────────────────────────────────────
  function updateHighlight() {
    if (!overlayElement) return;
    const cards = overlayElement.querySelectorAll('.cts-tab-card');
    cards.forEach((c, i) => {
      if (i === selectedIndex) {
        c.classList.add('cts-active');
        c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        c.classList.remove('cts-active');
      }
    });
  }

  function moveSelection(dir) {
    if (tabList.length === 0) return;
    selectedIndex = (selectedIndex + dir + tabList.length) % tabList.length;
    updateHighlight();
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────
  function handleKeyDown(event) {
    if (!isOverlayOpen) return;
    if ((event.key === 'Tab' && !event.shiftKey) || event.key === 'ArrowDown') { event.preventDefault(); moveSelection(1); return; }
    if ((event.key === 'Tab' && event.shiftKey) || event.key === 'ArrowUp') { event.preventDefault(); moveSelection(-1); return; }
    if (event.key === 'Enter') { event.preventDefault(); switchToSelectedTab(); return; }
    if (event.key === 'Escape') { event.preventDefault(); closeOverlay(); return; }
  }

  function handleKeyUp(event) {
    if (event.key === 'Alt') {
      if (!isOverlayOpen) { pendingAltRelease = true; return; }
      if (openedViaAltX) { event.preventDefault(); switchToSelectedTab(); }
    }
  }

  // ── Overlay Lifecycle ────────────────────────────────────────────────────
  function injectOverlay(tabs) {
    if (window.location.protocol === 'chrome:' || window.location.protocol === 'chrome-extension:') return;
    if (isOverlayOpen) return;

    tabList = tabs;
    if (tabList.length === 0) return;
    selectedIndex = tabList.length > 1 ? 1 : 0;

    try {
      overlayElement = createOverlayElement(tabs);
      document.body.appendChild(overlayElement);
      isOverlayOpen = true;

      document.addEventListener('keydown', handleKeyDown, true);
      document.addEventListener('keyup', handleKeyUp, true);
      // Store refs for cleanup on re-injection
      window.__ctsKeyDown = handleKeyDown;
      window.__ctsKeyUp = handleKeyUp;

      chrome.runtime.sendMessage({ type: 'OVERLAY_OPENED' }).catch(() => {});

      if (pendingAltRelease) { pendingAltRelease = false; switchToSelectedTab(); return; }
    } catch (err) {
      console.error('[TabSwitcher] Overlay injection failed:', err);
      closeOverlay();
    }
  }

  function closeOverlay() {
    if (!isOverlayOpen && !overlayElement) return;
    isOverlayOpen = false;
    pendingAltRelease = false;
    openedViaAltX = false;

    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('keyup', handleKeyUp, true);

    if (overlayElement) {
      const container = overlayElement.querySelector('.cts-container');
      if (container) container.classList.add('cts-closing');
      const el = overlayElement;
      setTimeout(() => { if (el && el.parentNode) el.remove(); }, 120);
      overlayElement = null;
    }
    tabList = [];
    selectedIndex = 1;
    chrome.runtime.sendMessage({ type: 'OVERLAY_CLOSED' }).catch(() => {});
  }

  // ── Tab switching ────────────────────────────────────────────────────────
  function switchToSelectedTab() {
    if (tabList.length === 0) return;
    const tab = tabList[selectedIndex];
    if (!tab) return;
    closeOverlay();
    chrome.runtime.sendMessage({ type: 'SWITCH_TO_TAB', tabId: tab.id }).catch(() => {});
  }

  // ── Tab stack request ────────────────────────────────────────────────────
  async function requestTabStack() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_TAB_STACK' });
      if (res && Array.isArray(res.tabs)) injectOverlay(res.tabs);
    } catch (err) {
      console.error('[TabSwitcher] Failed to request tab stack:', err);
    }
  }

  function handleOpenOverlay() {
    if (isOverlayOpen) return;
    pendingAltRelease = false;
    openedViaAltX = true;
    requestTabStack();
  }

  // ── Message listener ─────────────────────────────────────────────────────
  function messageHandler(message) {
    if (message.type === 'OPEN_OVERLAY') {
      if (isOverlayOpen) { moveSelection(1); }
      else { handleOpenOverlay(); }
      return;
    }
    if (message.type === 'TAB_STACK_UPDATED') {
      if (isOverlayOpen) {
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('keyup', handleKeyUp, true);
        if (overlayElement) overlayElement.remove();
        overlayElement = null;
        isOverlayOpen = false;
        tabList = [];
        requestTabStack();
      }
      return;
    }
  }

  // Store reference for cleanup on next injection
  window.__ctsMessageHandler = messageHandler;
  chrome.runtime.onMessage.addListener(messageHandler);

})();
