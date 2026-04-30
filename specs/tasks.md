# Implementation Plan: Chrome Tab Switcher Extension

## Overview

This implementation plan breaks down the Chrome Tab Switcher extension into discrete, testable coding tasks. The extension consists of three main components: the manifest configuration, background service worker for tab state management, and content script for overlay UI. Tasks are ordered to enable incremental development and testing, with checkpoints to validate progress.

## Tasks

- [ ] 1. Set up project structure and manifest configuration
  - Create extension directory structure (icons/, background.js, content.js, manifest.json)
  - Create manifest.json with Manifest V3 configuration
  - Define permissions: "tabs", "storage", "activeTab"
  - Register background service worker and content script
  - Define keyboard commands: "open-switcher" (Alt+X) and "quick-switch" (Alt+W)
  - Create placeholder icon files (16x16, 48x48, 128x128)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [ ] 2. Implement background service worker core functionality
  - [ ] 2.1 Implement tab stack initialization and persistence
    - Create initializeTabStacks() to restore per-window stacks from chrome.storage.session
    - Create persistTabStacks() to save all window stacks to chrome.storage.session
    - Initialize empty Map for tabStacksByWindow on first run
    - Set up service worker activation listener
    - _Requirements: 2.6, 10.1, 10.2, 10.6_
  
  - [ ] 2.2 Implement tab recency tracking
    - Create updateTabStack(tabId, windowId) to add/move tabs to front of window's stack
    - Remove duplicates before adding to stack
    - Limit each window's stack to 20 items maximum
    - Set up chrome.tabs.onActivated listener to get windowId from event
    - Call persistTabStacks() after modifications
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 10.6_
  
  - [ ] 2.3 Implement tab and window removal handling
    - Create removeClosedTab(tabId, windowId) to remove tab from window's stack
    - Set up chrome.tabs.onRemoved listener to get windowId from event
    - Set up chrome.windows.onRemoved listener to remove entire window's stack
    - Persist stacks after removal
    - _Requirements: 2.4, 10.6_
  
  - [ ]* 2.4 Write unit tests for tab stack management
    - Test initialization from empty and populated storage
    - Test updateTabStack() with new and existing tabs
    - Test stack size limiting (max 20 items per window)
    - Test duplicate removal within window stacks
    - Test removeClosedTab() functionality
    - Test window removal cleanup

- [ ] 3. Implement quick switch command
  - [ ] 3.1 Implement quick switch handler
    - Create handleQuickSwitch() function
    - Derive windowId from the tab provided to commands.onCommand (fallback: chrome.windows.getLastFocused())
    - Read second item from current window's tab stack
    - Activate tab using chrome.tabs.update()
    - Handle case when fewer than 2 tabs in window's stack
    - Update tab stack after successful switch
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 10.6_
  
  - [ ] 3.2 Register quick switch command listener
    - Set up chrome.commands.onCommand listener
    - Handle "quick-switch" command
    - Add error handling for tab activation failures
    - _Requirements: 3.1_
  
  - [ ]* 3.3 Write unit tests for quick switch
    - Test quick switch with valid window tab stack
    - Test quick switch with empty window stack
    - Test quick switch with single tab in window
    - Test error handling for closed tabs
    - Test per-window stack isolation

- [ ] 4. Checkpoint - Verify basic tab tracking and quick switch
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement tab metadata retrieval
  - [ ] 5.1 Implement domain extraction utility
    - Create extractDomain() function to parse hostname from URL
    - Handle chrome:// URLs and invalid URLs gracefully
    - _Requirements: 8.5_
  
  - [ ] 5.2 Implement tab stack metadata enrichment
    - Create getTabStackWithMetadata(windowId) function
    - Query chrome.tabs.query({ windowId }) for tabs in specific window
    - Map tab IDs to metadata (title, url)
    - Filter out closed tabs from window's stack
    - Extract domain from each tab URL
    - Return enriched tab metadata array
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 10.6_
  
  - [ ]* 5.3 Write unit tests for metadata retrieval
    - Test extractDomain() with various URL formats
    - Test getTabStackWithMetadata() with valid tabs in specific window
    - Test filtering of closed tabs
    - Test metadata response structure
    - Test per-window tab filtering

- [ ] 6. Implement background message handling
  - [ ] 6.1 Implement message handlers
    - Set up chrome.runtime.onMessage listener
    - Handle "GET_TAB_STACK" message type (infer windowId from sender.tab.windowId)
    - Handle "SWITCH_TO_TAB" message type
    - Implement async response pattern for GET_TAB_STACK
    - _Requirements: 7.2, 7.3, 8.1, 8.4, 10.6_
  
  - [ ] 6.2 Implement tab switching function
    - Create switchToTab() function
    - Activate tab using chrome.tabs.update()
    - Update tab stack after successful switch
    - Handle errors for invalid tab IDs
    - _Requirements: 7.2, 7.3_
  
  - [ ] 6.3 Implement open switcher command handler
    - Create handleOpenSwitcher() function
    - Query active tab using chrome.tabs.query()
    - Send OPEN_OVERLAY message to active tab using chrome.tabs.sendMessage()
    - Set up chrome.commands.onCommand listener for "open-switcher"
    - _Requirements: 4.1_
  
  - [ ]* 6.4 Write unit tests for message handling
    - Test GET_TAB_STACK message handling with windowId
    - Test SWITCH_TO_TAB message handling
    - Test open switcher command
    - Test error handling for invalid messages
    - Test per-window stack retrieval

- [ ] 7. Checkpoint - Verify background service worker is complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement content script overlay DOM structure
  - [ ] 8.1 Create overlay HTML structure
    - Create createOverlayElement() function
    - Build overlay container with backdrop
    - Build tab list container
    - Apply unique ID: "chrome-tab-switcher-overlay"
    - _Requirements: 4.3, 4.6, 4.7_
  
  - [ ] 8.2 Implement tab card rendering
    - Create renderTabCards() function
    - Generate HTML for each tab card with data-tab-id attribute
    - Render built-in local icon (do not load remote favicons)
    - Render tab title (truncated to 40 characters)
    - Render tab domain
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ] 8.3 Implement overlay injection
    - Create injectOverlay() function
    - Check for chrome:// pages and fail silently
    - Append overlay to document.body
    - Set isOverlayOpen flag to true
    - _Requirements: 4.3, 10.4_
  
  - [ ]* 8.4 Write unit tests for overlay DOM creation
    - Test createOverlayElement() structure
    - Test renderTabCards() with various tab counts
    - Test favicon fallback rendering
    - Test title truncation

- [ ] 9. Implement overlay CSS styling
  - [ ] 9.1 Create overlay base styles
    - Create inline CSS or style element for overlay
    - Scope all styles to #chrome-tab-switcher-overlay
    - Set z-index to 2147483647
    - Use system-ui font family
    - Apply CSS reset with "all: initial"
    - _Requirements: 4.6, 9.1, 9.2, 9.3_
  
  - [ ] 9.2 Style backdrop and container
    - Style backdrop with semi-transparent background and blur
    - Style container with white background and border radius
    - Center container on screen
    - _Requirements: 4.7, 9.4_
  
  - [ ] 9.3 Style tab cards and highlight
    - Style tab cards with flexbox layout
    - Style favicon, title, and domain elements
    - Create highlight style for selected tab card
    - Add smooth transitions for highlight changes
    - _Requirements: 5.6, 5.7_
  
  - [ ] 9.4 Add animations and scrolling
    - Add fade-in animation for overlay appearance
    - Add fade-out animation for overlay removal
    - Enable vertical scrolling for more than 9 tabs
    - _Requirements: 4.4, 4.5, 9.5, 9.6_

- [ ] 10. Implement content script message handling
  - [ ] 10.1 Implement OPEN_OVERLAY message handler
    - Set up chrome.runtime.onMessage listener
    - Handle "OPEN_OVERLAY" message type
    - Call handleOpenOverlay() function
    - _Requirements: 4.2_
  
  - [ ] 10.2 Implement tab stack request
    - Create requestTabStack() function
    - Send "GET_TAB_STACK" message to background (background infers windowId from sender)
    - Handle response with tab metadata
    - Call injectOverlay() with received tabs
    - Add error handling for message failures
    - _Requirements: 4.2, 8.4, 10.6_
  
  - [ ] 10.3 Implement tab switch request
    - Create switchToSelectedTab() function
    - Send "SWITCH_TO_TAB" message with selected tab ID
    - Close overlay after sending message
    - _Requirements: 7.1, 7.4_
  
  - [ ]* 10.4 Write unit tests for message handling
    - Test OPEN_OVERLAY message handling
    - Test requestTabStack() message sending with windowId
    - Test switchToSelectedTab() message sending
    - Test error handling
    - Test window ID retrieval

- [ ] 11. Implement overlay keyboard navigation
  - [ ] 11.1 Implement selection state management
    - Initialize selectedIndex to 1 (second tab)
    - Create updateHighlight() function to apply highlight class
    - Create moveSelection() function with wrapping logic
    - _Requirements: 5.7, 6.3, 6.4_
  
  - [ ] 11.2 Implement keyboard event handlers
    - Create handleKeyDown() function
    - Handle Tab or ArrowDown for next tab navigation
    - Handle Shift+Tab or ArrowUp for previous tab navigation
    - Handle Enter key to switch to selected tab
    - Handle Escape key to close overlay
    - Prevent default behavior for handled keys
    - _Requirements: 6.1, 6.2, 6.5, 6.6_
  
  - [ ] 11.4 Register and unregister event listeners
    - Add keydown listener when overlay opens
    - Remove listeners when overlay closes
    - _Requirements: 6.1, 6.2, 6.5, 6.6_
  
  - [ ]* 11.5 Write unit tests for keyboard navigation
    - Test moveSelection() with wrapping
    - Test handleKeyDown() for all key combinations
    - Test event listener registration/cleanup

- [ ] 12. Implement overlay cleanup
  - [ ] 12.1 Implement overlay removal
    - Create closeOverlay() function
    - Remove overlay element from DOM
    - Reset state variables (isOverlayOpen, selectedIndex)
    - Remove keyboard event listeners
    - _Requirements: 7.4_
  
  - [ ]* 12.2 Write unit tests for overlay cleanup
    - Test closeOverlay() removes DOM element
    - Test state reset after close
    - Test event listener cleanup

- [ ] 13. Checkpoint - Verify content script and overlay functionality
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Implement debouncing and edge case handling
  - [ ] 14.1 Add command debouncing
    - Implement debounce logic for handleOpenSwitcher()
    - Prevent overlay flickering from rapid key presses
    - Use 300ms debounce timeout
    - _Requirements: 10.5_
  
  - [ ] 14.2 Add chrome:// page detection
    - Check window.location.protocol in injectOverlay()
    - Fail silently on chrome:// pages
    - Log warning to console
    - _Requirements: 10.4_
  
  - [ ]* 14.3 Write integration tests for edge cases
    - Test rapid command triggering
    - Test overlay on chrome:// pages
    - Test with empty window tab stack
    - Test with single tab in window stack
    - Test per-window stack isolation with multiple windows

- [ ] 15. Final integration and wiring
  - [ ] 15.1 Verify all components are connected
    - Test background service worker initialization
    - Test command registration and handling
    - Test message passing between background and content script
    - Test overlay display and interaction
    - Test tab switching end-to-end
    - _Requirements: All_
  
  - [ ] 15.2 Add error logging and debugging
    - Add console.error() for all error cases
    - Add console.warn() for edge cases
    - Ensure no errors in normal operation
  
  - [ ]* 15.3 Write end-to-end integration tests
    - Test complete quick switch flow
    - Test complete overlay switch flow
    - Test tab stack persistence across service worker restarts
    - Test per-window stack isolation with multiple windows
    - Test window closure cleanup

- [ ] 16. Final checkpoint - Ensure all tests pass and extension is ready
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The extension uses vanilla JavaScript with no external dependencies
- All code must comply with Chrome's Content Security Policy (no inline scripts or eval)
- Testing focuses on unit tests and integration tests (no property-based tests needed for this UI-focused extension)
- Checkpoints ensure incremental validation at key milestones
