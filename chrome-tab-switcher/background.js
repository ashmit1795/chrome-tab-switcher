// =============================================================================
// Chrome Tab Switcher - Background Service Worker
// =============================================================================
// Manages per-window tab recency stacks, persists them to session storage,
// and coordinates tab switching between the background and content scripts.
// =============================================================================

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------

// Map<windowId: number, stack: number[]>
// Each window maintains its own MRU stack of tab IDs (most recent first).
let tabStacksByWindow = new Map();

// Map<windowId: number, tabId: number>
// Tracks which tab is currently hosting the overlay for each window.
// Used to push TAB_STACK_UPDATED messages when the stack changes while
// the overlay is open.
let overlayHostTabByWindow = new Map();

// Key used for chrome.storage.session persistence.
const STORAGE_KEY = 'tabStacksByWindow';

// ---------------------------------------------------------------------------
// INITIALIZATION
// ---------------------------------------------------------------------------

/**
 * Restores per-window tab stacks from chrome.storage.session.
 *
 * Called on service worker activation so that tab history survives
 * service worker termination (but not browser restart, since session
 * storage is cleared when the browser closes).
 *
 * Satisfies Requirements 2.6, 10.1, 10.2
 */
async function initializeTabStacks() {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] || {};
    // Convert plain object { "windowId": [tabId, ...] } back to a Map
    // with numeric keys.
    tabStacksByWindow = new Map(
      Object.entries(stored).map(([k, v]) => [parseInt(k, 10), v])
    );
    console.log('[TabSwitcher] Tab stacks restored from session storage:', tabStacksByWindow.size, 'window(s)');
  } catch (error) {
    console.error('[TabSwitcher] Failed to restore tab stacks:', error);
    tabStacksByWindow = new Map();
  }
}

/**
 * Seeds the tab stacks from all currently open windows and their tabs.
 * Called on first install so that quick-switch works immediately.
 */
async function seedInitialStacks() {
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    for (const win of windows) {
      if (!tabStacksByWindow.has(win.id) || (tabStacksByWindow.get(win.id) || []).length === 0) {
        // Find the active tab to put first
        const activeTab = win.tabs.find(t => t.active);
        const otherTabs = win.tabs.filter(t => !t.active && t.id >= 0);
        const stack = [];
        if (activeTab && activeTab.id >= 0) stack.push(activeTab.id);
        for (const t of otherTabs) stack.push(t.id);
        if (stack.length > 0) {
          tabStacksByWindow.set(win.id, stack.slice(0, 20));
        }
      }
    }
    await persistTabStacks();
    console.log('[TabSwitcher] Initial tab stacks seeded for', tabStacksByWindow.size, 'window(s)');
  } catch (error) {
    console.error('[TabSwitcher] Failed to seed initial stacks:', error);
  }
}

/**
 * Persists all per-window tab stacks to chrome.storage.session.
 *
 * Called after every modification to the stacks so that the state
 * survives service worker termination.
 *
 * Satisfies Requirements 2.5, 10.1
 */
async function persistTabStacks() {
  try {
    // Convert Map to a plain object because storage.session only accepts
    // JSON-serialisable values.
    const obj = {};
    for (const [windowId, stack] of tabStacksByWindow) {
      obj[windowId] = stack;
    }
    await chrome.storage.session.set({ [STORAGE_KEY]: obj });
  } catch (error) {
    console.error('[TabSwitcher] Failed to persist tab stacks:', error);
  }
}

// ---------------------------------------------------------------------------
// SERVICE WORKER ACTIVATION
// ---------------------------------------------------------------------------

// Restore state when the extension is first installed or updated.
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[TabSwitcher] Extension installed/updated — initializing tab stacks.');
  await initializeTabStacks();
  await seedInitialStacks();

  // Inject content script into all existing http/https tabs
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    if (tab.id < 0) continue; // Skip invalid tab IDs
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (e) {
      // Silently skip tabs that reject injection (e.g. Chrome Web Store)
    }
  }
});

// Restore state when the service worker wakes up after being terminated.
// 'activate' fires after 'install' completes and the worker takes control.
self.addEventListener('activate', () => {
  console.log('[TabSwitcher] Service worker activated — initializing tab stacks.');
  initializeTabStacks();
});

// ---------------------------------------------------------------------------
// TAB RECENCY TRACKING
// (Satisfies Requirements 2.1, 2.2, 2.3, 2.5, 10.6)
// ---------------------------------------------------------------------------

/**
 * Adds or moves a tab to the front of the window's MRU stack.
 *
 * - Removes any existing occurrence of tabId to avoid duplicates (Req 2.2)
 * - Inserts tabId at index 0 (most recent) (Req 2.1)
 * - Trims the stack to a maximum of 20 entries (Req 2.3)
 * - Persists the updated stacks to session storage (Req 2.5)
 *
 * @param {number} tabId    - The Chrome tab ID that was activated.
 * @param {number} windowId - The Chrome window ID that owns the tab.
 */
function updateTabStack(tabId, windowId) {
  let stack = tabStacksByWindow.get(windowId) || [];
  stack = stack.filter(id => id !== tabId); // remove duplicate
  stack.unshift(tabId);                     // add to front
  if (stack.length > 20) stack = stack.slice(0, 20); // limit to 20
  tabStacksByWindow.set(windowId, stack);
  persistTabStacks();
}

/**
 * Listens for tab activation events and updates the per-window MRU stack.
 *
 * The event info object contains both tabId and windowId directly,
 * so no additional chrome.tabs.get() call is required. (Req 10.6)
 */
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  updateTabStack(tabId, windowId);
});

// ---------------------------------------------------------------------------
// TAB AND WINDOW REMOVAL
// (Satisfies Requirements 2.4, 10.6)
// ---------------------------------------------------------------------------

/**
 * Removes a closed tab from its window's MRU stack.
 *
 * Called when chrome.tabs.onRemoved fires. If the window's stack becomes
 * empty after removal it is left in the map (the window may still be open
 * with other tabs that haven't been activated yet).
 *
 * @param {number} tabId    - The Chrome tab ID that was closed.
 * @param {number} windowId - The Chrome window ID that owned the tab.
 */
function removeClosedTab(tabId, windowId) {
  const stack = tabStacksByWindow.get(windowId);
  if (!stack) return;
  const updated = stack.filter(id => id !== tabId);
  tabStacksByWindow.set(windowId, updated);
  persistTabStacks();
  console.log('[TabSwitcher] Removed closed tab', tabId, 'from window', windowId, '— stack size now', updated.length);

  // If the overlay is currently open in this window, notify the host tab so
  // the content script can re-fetch the updated stack and re-render.
  if (overlayHostTabByWindow.has(windowId)) {
    const overlayTabId = overlayHostTabByWindow.get(windowId);
    chrome.tabs.sendMessage(overlayTabId, { type: 'TAB_STACK_UPDATED' }).catch(err => {
      console.log('[TabSwitcher] TAB_STACK_UPDATED not delivered to tab', overlayTabId, ':', err.message);
    });
  }
}

/**
 * Removes an entire window's stack when the window is closed.
 *
 * Also clears the overlay host entry for that window so stale references
 * don't accumulate.
 *
 * @param {number} windowId - The Chrome window ID that was closed.
 */
function removeClosedWindow(windowId) {
  tabStacksByWindow.delete(windowId);
  overlayHostTabByWindow.delete(windowId);
  persistTabStacks();
  console.log('[TabSwitcher] Removed closed window', windowId, '— remaining windows tracked:', tabStacksByWindow.size);
}

/**
 * Listens for tab removal events and cleans up the per-window MRU stack.
 *
 * removeInfo.windowId is provided directly by the Chrome API, so no
 * additional chrome.tabs.get() call is required. (Req 10.6)
 */
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  removeClosedTab(tabId, removeInfo.windowId);
});

/**
 * Listens for window removal events and cleans up the entire window stack.
 */
chrome.windows.onRemoved.addListener((windowId) => {
  removeClosedWindow(windowId);
});

// ---------------------------------------------------------------------------
// COMMANDS (QUICK SWITCH / OPEN SWITCHER)
// (Implemented in tasks 3.1, 3.2, 6.3)
// ---------------------------------------------------------------------------

/**
 * Activates the second (most recently previous) tab in the window's MRU stack.
 *
 * - Derives the windowId from commandTab.windowId when available.
 * - Falls back to chrome.windows.getLastFocused() when commandTab is null/undefined.
 * - Does nothing if the window's stack has fewer than 2 entries (Req 3.3).
 * - Activating the tab triggers onActivated, which auto-updates the stack (Req 3.4).
 *
 * @param {chrome.tabs.Tab|null|undefined} commandTab - The active tab passed by
 *   commands.onCommand (MV3 provides this as the second argument).
 *
 * Satisfies Requirements 3.1, 3.2, 3.3, 3.4, 10.6
 */
async function handleQuickSwitch(commandTab) {
  try {
    // Resolve the window ID from the command tab or fall back to the last focused window.
    let windowId;
    if (commandTab && typeof commandTab.windowId === 'number') {
      windowId = commandTab.windowId;
    } else {
      const lastWindow = await chrome.windows.getLastFocused();
      windowId = lastWindow.id;
    }

    const stack = tabStacksByWindow.get(windowId) || [];

    // Req 3.3: Do nothing if fewer than 2 tabs in the window's stack.
    if (stack.length < 2) {
      console.log('[TabSwitcher] Quick switch: fewer than 2 tabs in stack for window', windowId, '— no action taken.');
      return;
    }

    // Req 3.1: Read the second item (index 1) — the most recently previous tab.
    const targetTabId = stack[1];

    // Req 3.2: Activate the target tab.
    // Req 3.4: The onActivated listener will automatically update the stack.
    await chrome.tabs.update(targetTabId, { active: true });
    console.log('[TabSwitcher] Quick switch: activated tab', targetTabId, 'in window', windowId);
  } catch (error) {
    console.error('[TabSwitcher] Quick switch failed:', error);
  }
}

/**
 * Sends an OPEN_OVERLAY message to the active tab in the focused window.
 *
 * - Uses commandTab when provided by commands.onCommand (MV3 passes the
 *   active tab as the second argument).
 * - Falls back to chrome.tabs.query({ active: true, lastFocusedWindow: true })
 *   when commandTab is null/undefined.
 * - Errors are caught silently because chrome:// pages and other restricted
 *   origins will reject the sendMessage call.
 *
 * @param {chrome.tabs.Tab|null|undefined} commandTab
 *
 * Satisfies Requirements 7.2, 7.3, 10.5
 */
async function handleOpenSwitcher(commandTab) {
  try {
    // Resolve the target tab — always fall back to query if commandTab is
    // missing, has a non-numeric id, or has a negative id (TAB_ID_NONE = -1).
    let targetTab = commandTab;
    if (!targetTab || typeof targetTab.id !== 'number' || targetTab.id < 0) {
      const results = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      targetTab = results[0] || null;
    }

    if (!targetTab || typeof targetTab.id !== 'number' || targetTab.id < 0) {
      console.warn('[TabSwitcher] handleOpenSwitcher: could not determine active tab.');
      return;
    }

    // Check that the tab URL is one we can inject into.
    const url = targetTab.url || '';
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
        url.startsWith('about:') || url.startsWith('chrome-search://') ||
        url.startsWith('devtools://') || url === '') {
      console.log('[TabSwitcher] handleOpenSwitcher: skipping restricted page:', url.substring(0, 60));
      return;
    }

    // Try sending the message. If the content script isn't loaded, inject it
    // on-demand and retry once.
    try {
      await chrome.tabs.sendMessage(targetTab.id, { type: 'OPEN_OVERLAY' });
      console.log('[TabSwitcher] Sent OPEN_OVERLAY to tab', targetTab.id);
    } catch (sendError) {
      // Content script not loaded — inject it on-demand and retry.
      console.log('[TabSwitcher] Content script not found on tab', targetTab.id, '— injecting on-demand.');
      try {
        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          files: ['content.js']
        });
        // Brief delay to let the script initialize its message listener.
        await new Promise(resolve => setTimeout(resolve, 100));
        await chrome.tabs.sendMessage(targetTab.id, { type: 'OPEN_OVERLAY' });
        console.log('[TabSwitcher] Sent OPEN_OVERLAY to tab', targetTab.id, '(after on-demand injection)');
      } catch (injectError) {
        console.log('[TabSwitcher] handleOpenSwitcher: injection or retry failed:', injectError.message);
      }
    }
  } catch (error) {
    console.log('[TabSwitcher] handleOpenSwitcher: unexpected error:', error.message);
  }
}

/**
 * Listens for keyboard commands and dispatches to the appropriate handler.
 *
 * In Manifest V3 the commands.onCommand callback receives (command, tab)
 * where tab is the currently active tab at the time the shortcut was pressed.
 *
 * Satisfies Requirements 3.1, 10.6
 */
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'quick-switch') {
    handleQuickSwitch(tab);
  } else if (command === 'open-switcher') {
    handleOpenSwitcher(tab);
  }
});

// ---------------------------------------------------------------------------
// TAB METADATA RETRIEVAL
// (Satisfies Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 10.6)
// ---------------------------------------------------------------------------

/**
 * Extracts the hostname from a URL string.
 *
 * Uses the built-in URL constructor for parsing. Falls back to returning
 * the original string when the URL is invalid or uses a scheme that the
 * URL constructor cannot parse (e.g. chrome://).
 *
 * @param {string} url - The full URL to parse.
 * @returns {string} The hostname, or the original url on parse failure.
 *
 * Satisfies Requirement 8.5
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url; // Fallback for chrome:// URLs and other invalid URLs
  }
}

/**
 * Returns the window's MRU tab stack enriched with live tab metadata.
 *
 * Steps:
 *  1. Query Chrome for all tabs currently open in the given window.
 *  2. Build a Map of tabId → tab object for O(1) lookups.
 *  3. Filter the in-memory stack to only IDs that still exist (removes
 *     closed tabs that weren't caught by onRemoved, e.g. after a service
 *     worker restart).
 *  4. Map each surviving ID to a metadata object: { id, title, url, domain }.
 *  5. Write the cleaned-up ID list back to the in-memory stack and persist.
 *  6. Return the enriched array.
 *
 * @param {number} windowId - The Chrome window ID whose stack to enrich.
 * @returns {Promise<Array<{id: number, title: string, url: string, domain: string}>>}
 *
 * Satisfies Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 10.6
 */
async function getTabStackWithMetadata(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const tabMap = new Map(tabs.map(t => [t.id, t]));

  const stack = tabStacksByWindow.get(windowId) || [];

  // Filter out closed tabs and enrich surviving entries with metadata.
  const enrichedStack = stack
    .filter(id => tabMap.has(id))
    .map(id => {
      const tab = tabMap.get(id);
      return {
        id: tab.id,
        title: tab.title || 'Untitled',
        url: tab.url || '',
        domain: extractDomain(tab.url || ''),
        favIconUrl: tab.favIconUrl || ''
      };
    });

  // Update the in-memory stack to remove any stale tab IDs.
  tabStacksByWindow.set(windowId, enrichedStack.map(t => t.id));
  persistTabStacks();

  return enrichedStack;
}

// ---------------------------------------------------------------------------
// TAB SWITCHING
// (Satisfies Requirements 4.1, 8.1, 10.5)
// ---------------------------------------------------------------------------

/**
 * Activates the specified tab.
 *
 * Errors (e.g. invalid or already-closed tab IDs) are caught and logged so
 * that the caller does not need to handle them. The MRU stack will be
 * cleaned up automatically on the next getTabStackWithMetadata() call.
 *
 * @param {number} tabId - The Chrome tab ID to activate.
 *
 * Satisfies Requirements 4.1, 10.5
 */
async function switchToTab(tabId) {
  try {
    await chrome.tabs.update(tabId, { active: true });
    console.log('[TabSwitcher] Switched to tab', tabId);
  } catch (error) {
    console.error('[TabSwitcher] switchToTab failed for tab', tabId, ':', error);
  }
}

// ---------------------------------------------------------------------------
// MESSAGE HANDLING
// (Satisfies Requirements 7.2, 7.3, 8.1, 8.4, 10.5, 10.6)
// ---------------------------------------------------------------------------

/**
 * Handles messages sent from content scripts.
 *
 * Supported message types:
 *
 *  GET_TAB_STACK   – Returns the enriched MRU stack for the sender's window.
 *                    Responds asynchronously; returns `true` to keep the
 *                    message channel open.
 *
 *  SWITCH_TO_TAB   – Activates the tab identified by message.tabId.
 *                    The MRU stack is updated automatically via onActivated.
 *
 *  OVERLAY_OPENED  – Records the sender tab as the overlay host for its window
 *                    so that TAB_STACK_UPDATED notifications can be pushed.
 *
 *  OVERLAY_CLOSED  – Removes the overlay host record for the sender's window.
 *
 * Satisfies Requirements 7.2, 7.3, 8.1, 8.4, 10.5, 10.6
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ── GET_TAB_STACK ──────────────────────────────────────────────────────────
  if (message.type === 'GET_TAB_STACK') {
    const windowId = sender?.tab?.windowId;
    if (typeof windowId !== 'number') {
      console.warn('[TabSwitcher] GET_TAB_STACK received without a valid windowId — returning empty stack.');
      sendResponse({ type: 'TAB_STACK_RESPONSE', tabs: [] });
      return; // Synchronous early return — no async work needed.
    }
    getTabStackWithMetadata(windowId).then(tabs => {
      sendResponse({ type: 'TAB_STACK_RESPONSE', tabs });
    });
    return true; // Keep the message channel open for the async response.
  }

  // ── SWITCH_TO_TAB ──────────────────────────────────────────────────────────
  if (message.type === 'SWITCH_TO_TAB') {
    switchToTab(message.tabId);
    sendResponse({ success: true });
    return;
  }

  // ── OVERLAY_OPENED ─────────────────────────────────────────────────────────
  if (message.type === 'OVERLAY_OPENED') {
    const windowId = sender?.tab?.windowId;
    const tabId    = sender?.tab?.id;
    if (typeof windowId === 'number' && typeof tabId === 'number') {
      overlayHostTabByWindow.set(windowId, tabId);
      console.log('[TabSwitcher] Overlay opened in window', windowId, 'hosted by tab', tabId);
    } else {
      console.warn('[TabSwitcher] OVERLAY_OPENED received without valid sender tab info — ignoring.');
    }
    return;
  }

  // ── OVERLAY_CLOSED ─────────────────────────────────────────────────────────
  if (message.type === 'OVERLAY_CLOSED') {
    const windowId = sender?.tab?.windowId;
    if (typeof windowId === 'number') {
      overlayHostTabByWindow.delete(windowId);
      console.log('[TabSwitcher] Overlay closed in window', windowId);
    } else {
      console.warn('[TabSwitcher] OVERLAY_CLOSED received without valid sender tab info — ignoring.');
    }
    return;
  }
});
