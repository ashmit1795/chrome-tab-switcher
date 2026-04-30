# Requirements Document

## Introduction

The Chrome Tab Switcher is a browser extension that enables Windows Alt+Tab-style navigation between Chrome tabs. The extension maintains a recency-ordered history of tab usage and provides both instant switching to the previous tab and a visual overlay for selecting from recently used tabs.

## Glossary

- **Extension**: The Chrome Tab Switcher browser extension
- **Background_Service**: The background service worker that manages tab state
- **Content_Script**: The script injected into web pages to display the overlay
- **Tab_Stack**: An ordered list of tab identifiers with most recently used tabs first
- **Overlay**: The visual interface displaying available tabs for selection
- **Quick_Switch**: Instant switch to the previous tab without showing the overlay
- **Switcher_Overlay**: The full visual interface for tab selection
- **Tab_Card**: A visual representation of a tab showing favicon, title, and domain
- **Active_Highlight**: The currently selected tab card in the overlay
- **Session_Storage**: Chrome's storage.session API for persisting data across service worker restarts
- **Recency_Order**: Ordering where most recently activated items appear first

## Requirements

### Requirement 1: Extension Manifest Configuration

**User Story:** As a developer, I want the extension properly configured, so that Chrome can load and execute it with appropriate permissions.

#### Acceptance Criteria

1. THE Extension SHALL use Manifest version 3
2. THE Extension SHALL declare permissions for "tabs", "storage", and "activeTab"
3. THE Extension SHALL register background.js as a service worker
4. THE Extension SHALL register content.js as a content script on all URLs with document_end timing
5. THE Extension SHALL define a command "open-switcher" with suggested key Alt+Y
6. THE Extension SHALL define a command "quick-switch" with suggested key Alt+W
7. THE Extension SHALL include icon files at sizes 16x16, 48x48, and 128x128 pixels

### Requirement 2: Tab Recency Tracking

**User Story:** As a user, I want the extension to remember which tabs I used recently, so that I can quickly switch back to them.

#### Acceptance Criteria

1. WHEN a tab is activated, THE Background_Service SHALL add the tab identifier to the front of the Tab_Stack
2. WHEN a tab identifier already exists in the Tab_Stack, THE Background_Service SHALL remove the duplicate before adding to front
3. WHEN the Tab_Stack exceeds 20 items, THE Background_Service SHALL remove the oldest items
4. WHEN a tab is closed, THE Background_Service SHALL remove its identifier from the Tab_Stack
5. WHEN the Tab_Stack is modified, THE Background_Service SHALL persist it to Session_Storage within 100 milliseconds
6. WHEN the Background_Service starts, THE Background_Service SHALL restore the Tab_Stack from Session_Storage

### Requirement 3: Quick Switch Command

**User Story:** As a user, I want to instantly switch to my previous tab with a keyboard shortcut, so that I can toggle between two tabs efficiently.

#### Acceptance Criteria

1. WHEN the "quick-switch" command is triggered, THE Background_Service SHALL read the second item from the Tab_Stack
2. WHEN the second item exists, THE Background_Service SHALL activate that tab
3. IF the Tab_Stack contains fewer than 2 items, THEN THE Background_Service SHALL take no action
4. WHEN the tab activation completes, THE Background_Service SHALL update the Tab_Stack with the new recency order

### Requirement 4: Switcher Overlay Display

**User Story:** As a user, I want to see a visual list of my recent tabs, so that I can select which tab to switch to.

#### Acceptance Criteria

1. WHEN the "open-switcher" command is triggered, THE Background_Service SHALL send an OPEN_OVERLAY message to the active tab
2. WHEN the Content_Script receives an OPEN_OVERLAY message, THE Content_Script SHALL request the Tab_Stack from the Background_Service
3. WHEN the Tab_Stack is received, THE Content_Script SHALL inject the Overlay into the current page DOM
4. THE Overlay SHALL display up to 9 Tab_Cards in a scrollable container
5. WHEN more than 9 tabs exist in the Tab_Stack, THE Overlay SHALL enable scrolling
6. THE Overlay SHALL use z-index 2147483647 to appear above all page content
7. THE Overlay SHALL display a semi-transparent backdrop with blur effect

### Requirement 5: Tab Card Rendering

**User Story:** As a user, I want to see recognizable information about each tab, so that I can identify which tab to switch to.

#### Acceptance Criteria

1. FOR ALL tabs in the Tab_Stack, THE Content_Script SHALL render a Tab_Card
2. THE Tab_Card SHALL display the tab favicon at 16x16 pixels
3. THE Tab_Card SHALL display the tab title truncated to 40 characters
4. THE Tab_Card SHALL display the tab domain
5. WHEN a tab has no favicon, THE Tab_Card SHALL display a default icon
6. THE Tab_Card SHALL render tabs in Recency_Order with most recent first
7. THE Content_Script SHALL highlight the second Tab_Card by default

### Requirement 6: Overlay Keyboard Navigation

**User Story:** As a user, I want to navigate the tab list with my keyboard, so that I can select tabs without using my mouse.

#### Acceptance Criteria

1. WHEN the overlay shortcut is pressed while the Overlay is open, THE Content_Script SHALL move the Active_Highlight to the next Tab_Card
2. WHEN the overlay shortcut is pressed with Shift while the Overlay is open, THE Content_Script SHALL move the Active_Highlight to the previous Tab_Card
3. WHEN the Active_Highlight reaches the last Tab_Card and moves next, THE Content_Script SHALL wrap to the first Tab_Card
4. WHEN the Active_Highlight reaches the first Tab_Card and moves previous, THE Content_Script SHALL wrap to the last Tab_Card
5. WHEN Enter is pressed while the Overlay is open, THE Content_Script SHALL switch to the highlighted tab
6. WHEN Escape is pressed while the Overlay is open, THE Content_Script SHALL close the Overlay without switching tabs
7. WHEN the overlay shortcut is released, THE Content_Script SHALL switch to the highlighted tab and close the Overlay

### Requirement 7: Tab Switching Execution

**User Story:** As a user, I want the extension to switch to my selected tab, so that I can view its content.

#### Acceptance Criteria

1. WHEN the Content_Script requests a tab switch, THE Content_Script SHALL send a SWITCH_TO_TAB message with the tab identifier to the Background_Service
2. WHEN the Background_Service receives a SWITCH_TO_TAB message, THE Background_Service SHALL activate the specified tab
3. WHEN tab activation completes, THE Background_Service SHALL update the Tab_Stack with the new recency order
4. WHEN the Content_Script initiates a tab switch, THE Content_Script SHALL remove the Overlay from the DOM within 100 milliseconds

### Requirement 8: Tab Stack Metadata Retrieval

**User Story:** As a user, I want to see current information about my tabs, so that I can make informed switching decisions.

#### Acceptance Criteria

1. WHEN the Content_Script requests the Tab_Stack, THE Background_Service SHALL query Chrome for current tab metadata
2. FOR ALL tabs in the Tab_Stack, THE Background_Service SHALL retrieve the tab title, favicon URL, and page URL
3. WHEN a tab no longer exists, THE Background_Service SHALL remove it from the Tab_Stack before responding
4. THE Background_Service SHALL respond with tab metadata within 200 milliseconds
5. THE Background_Service SHALL extract the domain from each tab URL for display purposes

### Requirement 9: Overlay Styling and Isolation

**User Story:** As a user, I want the overlay to look consistent and not interfere with page styles, so that it works reliably on any website.

#### Acceptance Criteria

1. THE Content_Script SHALL scope all overlay styles to the #chrome-tab-switcher-overlay element
2. THE Overlay SHALL use only system-ui or web-safe fonts
3. THE Overlay SHALL not use inline scripts or eval() to comply with Content Security Policy
4. THE Overlay SHALL define CSS variables for theming colors and dimensions
5. THE Overlay SHALL apply smooth fade-in animation when displayed
6. THE Overlay SHALL apply smooth fade-out animation when closed

### Requirement 10: Edge Case Handling

**User Story:** As a user, I want the extension to work reliably in unusual situations, so that it doesn't break my browsing experience.

#### Acceptance Criteria

1. WHEN the Background_Service restarts, THE Background_Service SHALL restore the Tab_Stack from Session_Storage
2. IF Session_Storage contains no Tab_Stack, THEN THE Background_Service SHALL initialize an empty Tab_Stack
3. WHEN a tab is closed while the Overlay is open, THE Content_Script SHALL re-fetch the Tab_Stack and re-render the Overlay
4. WHEN the "open-switcher" command is triggered on a chrome:// page, THE Extension SHALL fail silently without errors
5. WHEN the user holds the overlay shortcut key, THE Content_Script SHALL debounce navigation events to prevent rapid cycling
6. WHEN multiple Chrome windows are open, THE Background_Service SHALL maintain a separate Tab_Stack for each window using chrome.windows.getCurrent

### Requirement 11: Resource Loading and Security

**User Story:** As a developer, I want the extension to be secure and self-contained, so that it passes Chrome Web Store review.

#### Acceptance Criteria

1. THE Extension SHALL not load external resources at runtime
2. THE Extension SHALL not use document.write() in content scripts
3. THE Extension SHALL bundle all icons, scripts, and styles in the extension package
4. THE Extension SHALL not execute code from strings or external sources
5. THE Extension SHALL use only vanilla JavaScript without external libraries
