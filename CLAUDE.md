# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cr24 Extension Generator is a Chrome extension (Manifest V3) that uses OpenAI's API to generate Chrome extensions based on natural language descriptions. It's built with React + TypeScript + Vite and runs as a popup extension.

## Build Commands

```bash
# Install dependencies
npm install

# Development mode (opens browser, but Chrome extension APIs won't work fully)
npm run dev

# Production build (required for Chrome extension loading)
npm run build

# After building, load the `dist/` folder as an unpacked extension in chrome://extensions/
```

**Important**: Always use `npm run build` when testing extension functionality. The `dist/` folder is what gets loaded into Chrome.

## Architecture

### State Management

The application uses React Context for state management with two main providers:

1. **ChatContext** (`src/context/ChatContext.tsx`)
   - Manages all chat sessions, messages, and OpenAI API communication
   - Handles settings (API key, model selection, temperature)
   - Stores and retrieves data from Chrome's `chrome.storage.local`
   - Parses AI responses to extract generated extension code (JSON format)
   - **System Prompt**: Optimized to ~2,500 tokens (reduced from 7,000) for 30-50% faster generation
   - **Token Usage Tracking**: Estimates prompt tokens and generation time before API call, captures actual usage after
   - **JavaScript Syntax Validation**: Uses Acorn parser to validate generated JS code before rendering
   - **Auto-Repair**: Automatically requests AI to fix syntax errors or malformed JSON
   - **Streaming Responses**: Currently disabled for all models (can be enabled for verified organizations)
   - **Critical GPT-5 Constraints**:
     - Only supports temperature of 1.0 (automatically enforced)
     - Streaming requires organization verification (photo ID upload to OpenAI)
     - Falls back to non-streaming mode with progress stages and realistic time estimates

2. **ThemeContext** (`src/context/ThemeContext.tsx`)
   - Manages light/dark mode
   - Persists theme preference to Chrome storage

### OpenAI Integration Flow

1. User sends message via ChatPanel
2. **Token Estimation** (before API call):
   - Calculates estimated prompt tokens (~2,500 with optimized prompt)
   - Estimates completion tokens (~10,000 for typical extensions)
   - Calculates estimated generation time based on model speed:
     - GPT-5: ~4m 10s (40 tokens/sec)
     - GPT-4o: ~2m 5s (80 tokens/sec)
     - GPT-4o-mini: ~1m 23s (120 tokens/sec)
   - Logs estimates to console for debugging
3. ChatContext creates placeholder assistant message with time estimate
4. Makes API call to OpenAI (currently non-streaming for all models)
5. **Progress Stages** (non-streaming mode):
   - Shows animated progress messages with real-time estimates
   - Updates every few seconds: "Generating... (~4m 10s estimated)"
   - Provides user feedback during long generation times
6. **Response Processing**:
   - Captures actual token usage from API response (prompt, completion, total)
   - Logs actual usage to console for comparison with estimates
   - Extracts summary text (before JSON code block)
   - Parses JSON to extract `manifest` and `files` objects
7. **Validation Pipeline**:
   - **JavaScript Syntax Validation** (uses Acorn parser):
     - Validates popup.js, content.js, background.js, service_worker.js for syntax errors
     - If errors found, automatically requests AI to fix them
     - Prevents broken extensions from reaching preview
   - **Structure Validation** (uses extensionValidator):
     - Validates manifest format and required fields
     - Validates file structure (4 required files + optional background script)
     - Checks for missing or invalid references
     - Validates background script manifest entries if background.js exists
   - **Auto-Repair Loop**:
     - If validation fails, system automatically asks AI to fix issues
     - Maximum attempts to prevent infinite loops
     - User sees transparent error messages and fix attempts
8. **Post-Generation**:
   - Files displayed in FileList component with individual/ZIP download
   - Extension saved to current chat's `generatedExtension` field
   - **Automatic Chat Title**: Set to manifest.name field
   - **ZIP Filename**: Sanitized from chat title (e.g., `love-calculator.zip`)
9. **Dynamic Preview Sizing**:
   - PreviewPanel extracts actual dimensions from generated extension CSS/HTML
   - Looks for width/height on `body`, `html`, `main`, or `.container` elements
   - Automatically calculates total dimensions including padding
   - Falls back to 400×600px (standard Chrome popup size) if no dimensions found
   - Auto-height extensions default to 600px height to prevent scrollbars
   - Each extension previews at its actual size, not stretched to fill the panel
10. PreviewPanel renders the extension in an iframe sandbox with enhanced Chrome API mocks

**Streaming vs Non-Streaming:**
- **Current Mode**: Non-streaming for all models (line 156 in ChatContext.tsx)
- **Why**: GPT-5 streaming requires organization verification (photo ID to OpenAI)
- **Can Enable**: Change `useStreaming = true` if organization is verified
- **Non-Streaming Benefits**:
  - Works without verification requirements
  - Shows progress stages with realistic time estimates
  - Captures actual token usage statistics
  - 5-minute timeout protection
- **If Streaming Enabled**:
  - Uses `ReadableStream` reader to process SSE chunks
  - Updates React state on every chunk for real-time UI refresh
  - Character-by-character text appearance
  - 50%+ faster perceived speed

### Preview System

The PreviewPanel (`src/components/PreviewPanel.tsx`) provides a fully interactive preview of generated extensions using Chrome's sandboxed pages feature:

**How it Works:**
1. Loads `sandbox.html` in an iframe via `chrome.runtime.getURL('sandbox.html')`
2. Prepares generated extension HTML:
   - Strips external `<link>` and `<script src="">` references from HTML
   - Strips any existing CSP meta tags that would block inline scripts
   - Injects permissive CSP meta tag (`unsafe-inline`, `unsafe-eval`)
   - Injects comprehensive Chrome API mocks (storage, runtime, tabs)
   - Injects CSS inline in `<head>`
   - Injects JavaScript wrapped in DOMContentLoaded at end of `<body>`
3. Sends prepared HTML to sandbox via `postMessage` API
4. Sandbox receives HTML and renders it using `document.write()`
5. JavaScript executes fully with no CSP restrictions

**Critical CSP Solution:**
The extension's manifest CSP (`script-src 'self'`) blocks inline scripts even in iframes. Chrome extensions cannot use `'unsafe-inline'` in manifest v3 for extension_pages.

**Solution: Sandboxed Pages**
- Created `public/sandbox.html` - a dedicated sandboxed page
- Declared in manifest.json with `"sandbox": { "pages": ["sandbox.html"] }`
- Sandboxed pages can have relaxed CSP with `'unsafe-inline'` and `'unsafe-eval'`
- Communication via `postMessage` API between PreviewPanel and sandbox
- Sandbox has its own security context separate from main extension

**Files:**
- `public/sandbox.html`: Receives HTML via postMessage, renders by updating body.innerHTML
- `manifest.json`: Declares sandbox page and sandbox-specific CSP policy
- `vite.config.ts`: Copies sandbox.html to dist/ during build

**Critical: Sandbox Persistence**
The sandbox.html event listener MUST persist across multiple renders:
- Event listener is in `<head>` wrapped in IIFE, not in `<body>`
- Uses `document.body.innerHTML` instead of `document.write()` to preserve listener
- Scripts are manually re-executed after innerHTML update (innerHTML doesn't auto-execute scripts)
- DO NOT use `document.write()` or `document.open()` as they destroy the event listener
- This ensures preview updates correctly when switching between chats

**Why External References Are Stripped:**
Generated extensions often have `<link rel="stylesheet" href="popup.css">` and `<script src="popup.js">`.
These files don't exist in the iframe, causing:
- Failed resource loads
- JavaScript not executing
- Buttons remaining disabled
- "No entry" cursor on interactive elements

The regex patterns remove these while preserving inline scripts:
```javascript
html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '');
html.replace(/<script[^>]*src=["'][^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '');
html.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
```

**Technical Details:**
- Iframe sandbox attributes: `allow-scripts allow-forms allow-modals allow-popups`
- NO `allow-same-origin` (prevents CSP inheritance from parent)
- Chrome API mock loads BEFORE extension scripts to prevent "chrome is not defined" errors
- Supports both popup and content script extensions automatically
- Preview is fully interactive - buttons, forms, and event listeners work without CSP violations

### Chrome API Bridge Architecture

**Critical Issue:** Sandboxed iframes CANNOT access the parent extension's Chrome APIs directly. Even with `allow-same-origin`, the sandbox context is isolated and `chrome.tabs`, `chrome.scripting`, etc. are undefined.

**Solution: Multi-Layer postMessage Bridge System**

The preview uses a sophisticated multi-layer bridge system to enable full Chrome API functionality:

#### Layer 1: Sandbox-to-Parent Bridge (Popup Preview)

1. **Sandbox Chrome API Mock** (injected into preview HTML, lines 386-489 in PreviewPanel.tsx):
   - Provides `chrome.tabs`, `chrome.scripting`, `chrome.storage` objects
   - When called, sends `CHROME_API_CALL` postMessage to parent
   - Waits for `CHROME_API_RESULT` response
   - Returns result to extension code
   - **Critical**: Supports both Promise-based AND callback-based APIs (e.g., `executeScript(details, callback)`)

2. **Parent Message Handler** (in PreviewPanel.tsx, lines 10-217):
   - Listens for `CHROME_API_CALL` messages from sandbox
   - Executes real Chrome API in parent context (has full access)
   - Sends result back via `CHROME_API_RESULT` postMessage

#### Layer 2: Content Script Communication Bridge

**Problem:** Content scripts injected into real webpages cannot directly receive messages from the sandboxed popup because:
1. Content scripts run in the MAIN world on real pages
2. They need `chrome.runtime.onMessage` to receive messages
3. Real pages don't have Chrome APIs

**Solution: postMessage-Based Content Script Bridge**

**Content Script Injection with Chrome API Mock** (lines 115-188 in PreviewPanel.tsx):
- When injecting content scripts (either on popup load or via `executeScript({ files: [...] }}`):
  1. Wraps the content script code with a Chrome API mock
  2. Sets up `chrome.runtime.onMessage.addListener()` that listens to `window.postMessage`
  3. Filters messages with `source: 'crx-generator-popup'`
  4. Calls registered listeners and sends responses back via `window.postMessage`
  5. Injects via script element (not eval) to avoid CSP restrictions
  6. Uses `world: 'MAIN'` to execute in page context

**Message Sending from Popup to Content Script** (lines 23-97 in PreviewPanel.tsx):
- When popup calls `chrome.tabs.sendMessage(tabId, message)`:
  1. Bridge intercepts the call
  2. Uses `chrome.scripting.executeScript` to inject a message-sending script into the active tab
  3. That script sends `window.postMessage({ source: 'crx-generator-popup', message })` in MAIN world
  4. Content script receives the postMessage event
  5. Executes the message listener callback
  6. Sends response back via `window.postMessage({ source: 'crx-generator-content', response })`
  7. Message-sending script receives the response and returns it to the popup

**Critical Implementation Details:**

1. **File-Based Injection Transformation** (lines 103-188):
   - When `chrome.scripting.executeScript({ files: ['content.js'] })` is called
   - Bridge looks up file content from `generatedExtension.files['content.js']`
   - Wraps with Chrome API mock
   - Injects via script element to avoid CSP eval() restriction
   - Uses `world: 'MAIN'` to ensure same context as page

2. **CSP Bypass for Content Scripts** (line 179):
   - Cannot use `eval()` due to Chrome's CSP restrictions
   - Instead: Creates `<script>` element, sets `textContent`, appends to page, then removes
   - Browser executes script content without CSP violations

3. **Execution World Context** (critical for communication):
   - Content scripts: `world: 'MAIN'` (page context)
   - Message sending scripts: `world: 'MAIN'` (line 49)
   - Both must be in MAIN world to communicate via `window.postMessage`

4. **Callback Support** (lines 477-488):
   - Chrome APIs support both Promises AND callbacks
   - Mock must handle: `executeScript(details, callback)`
   - Calls callback after Promise resolves
   - Sets `chrome.runtime.lastError` on errors

**Supported APIs via Bridge:**
- `chrome.tabs.query()` - Gets active tab for script injection
- `chrome.tabs.sendMessage()` - Sends messages to content scripts (via postMessage bridge)
- `chrome.scripting.executeScript()` - Injects scripts into active tab (transforms file references to code)
- `chrome.storage.local.get/set()` - **ENHANCED**: Now supports both Promises AND callbacks
  - ✅ `await chrome.storage.local.get(key)` - Promise-based (modern, recommended)
  - ✅ `chrome.storage.local.get(key, callback)` - Callback-based (legacy, still supported)
  - **Critical Fix**: Previously only supported callbacks, causing Pomodoro extension to fail
- `chrome.storage.onChanged` - **NEW**: Event emitter for reactive storage updates
  - Fires when `storage.local.set()` is called
  - Allows content scripts to react to storage changes
  - Example: `chrome.storage.onChanged.addListener((changes, area) => {...})`
- `chrome.action.setBadgeText()` - **NEW**: Sets extension icon badge text (no-op in preview, logs to console)
- `chrome.action.setBadgeBackgroundColor()` - **NEW**: Sets badge background color (no-op in preview, logs to console)

**Content Script Injection Flow:**
1. When popup opens with content script extension:
   - `injectContentScripts()` (line 230) automatically injects content.js
   - Wraps with Chrome API mock
   - Registers message listeners
2. When popup calls `executeScript({ files: ['content.js'] })`:
   - Re-injects content script (popup may do this to ensure it's loaded)
   - Uses same wrapping mechanism
3. When popup calls `tabs.sendMessage()`:
   - Injects message-sending script via executeScript
   - Sends postMessage to content script
   - Waits for response
   - Returns response to popup

#### Layer 3: Background Script Execution Bridge (NEW)

**Problem:** Background scripts (service workers) run persistently in the background context, separate from the popup. In preview, there is no background context.

**Solution: Execute background.js in Same Sandbox Context as Popup**

The preview executes background.js in the same sandbox as popup.js, but BEFORE popup.js loads:

**Background Script Execution** (lines 1046-1086 in PreviewPanel.tsx):
1. If `background.js` or `service_worker.js` exists, inject it first (before popup.js)
2. Wrap background script to intercept `chrome.runtime.onMessage.addListener()` calls
3. Store registered message listeners in `window.__backgroundMessageListeners` array
4. Execute background script code (runs chrome.runtime.onInstalled immediately)
5. Background script initializes storage, sets up state, registers message handlers

**Popup ↔ Background Communication** (lines 738-787 in PreviewPanel.tsx):
- `chrome.runtime.sendMessage()` mock looks up `window.__backgroundMessageListeners`
- Calls each registered background listener with the message
- Waits for `sendResponse()` callback or returned Promise
- Returns response to popup.js
- **Critical**: Supports both sync and async listeners (return true for async)

**chrome.runtime.onInstalled Simulation**:
- Fires immediately when background script loads
- Simulates fresh extension install (`{ reason: 'install' }`)
- Allows background script to initialize storage defaults

**Execution Order**:
1. Chrome API mock loads first
2. background.js executes (registers listeners, initializes storage)
3. popup.js loads and can immediately communicate with background

**What This Enables**:
- ✅ **Pomodoro timers** - Background manages timer state, popup shows UI
- ✅ **State management extensions** - Background holds persistent state
- ✅ **Extensions with background data processing**
- ✅ **Timer/alarm-based extensions** - Background listens to `chrome.alarms.onAlarm`

**Limitations**:
- Background and popup run in **same JavaScript context** (not separate like real extensions)
- `chrome.alarms` fire but won't persist across popup closes (preview is ephemeral)
- No true background persistence (preview resets when you switch chats)

**Key Insight:**
- **Preview popup runs in sandboxed iframe** (isolated, uses postMessage to parent)
- **Content scripts run on real webpages in MAIN world** (can modify page DOM)
- **Communication uses window.postMessage** (only way to communicate between contexts)
- **All Chrome APIs are bridged** (either to parent extension or via postMessage)

### Lessons Learned: Chrome API Access and Content Script Communication

**Early Attempts (Sandbox Access):**

**Attempt 1: Direct Chrome API in Sandbox**
- Tried to access `window.chrome` directly in sandbox
- **Failed**: Sandboxed iframes have isolated context, no Chrome API access

**Attempt 2: Spread Operator to Preserve Real APIs**
- Used `{ ...realChrome, storage: mock, ... }`
- **Failed**: Still replaced entire object, lost real APIs

**Attempt 3: Conditional Addition**
- Only added mocks if `!window.chrome.storage`
- **Failed**: Sandbox has no `window.chrome` at all

**Attempt 4: Demo Page in Separate Iframe**
- Created nested iframe for demo page to run scripts
- **Failed**: Complex, caused CSP violations, "blocked by Chrome"

**Solution for Sandbox: postMessage Bridge to Parent**
- Sandbox sends API requests to parent via postMessage
- Parent executes real Chrome APIs
- Results sent back to sandbox
- **Works**: Clean separation, no CSP issues, real APIs accessible

**Content Script Communication Issues:**

**Issue 1: CSP Blocks eval() in Content Scripts**
- Tried using `eval(contentScriptCode)` in executeScript func
- **Failed**: Chrome CSP blocks `eval()` with error: "Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed"
- **Solution**: Inject code via `<script>` element: `script.textContent = code; document.head.appendChild(script);`

**Issue 2: Isolated World vs MAIN World**
- Content scripts injected without `world: 'MAIN'` run in isolated world
- Message-sending scripts also ran in isolated world by default
- **Failed**: Different worlds cannot communicate via `window.postMessage`
- **Solution**: Always use `world: 'MAIN'` for both content scripts and message-sending scripts (line 49, 185, 319)

**Issue 3: Missing Callback Support**
- Chrome API mock only handled Promise-based `executeScript(details)`
- Generated extensions used callback style: `executeScript(details, callback)`
- **Failed**: Callback never called, Promise never resolved, flow blocked
- **Solution**: Add callback parameter to mock: `executeScript: async function(injection, callback)` and call it after Promise resolves (line 477)

**Issue 4: File References Don't Exist**
- Popup calls `executeScript({ files: ['content.js'] })`
- **Failed**: Chrome API error "Could not load file: 'content.js'" because file doesn't exist in CRX Generator extension
- **Solution**: Intercept file-based injections, look up code from `generatedExtension.files`, transform to inline code execution

**Issue 5: Content Scripts Can't Receive Messages**
- Content scripts run on real pages without Chrome APIs
- No `chrome.runtime.onMessage` available
- **Failed**: `tabs.sendMessage()` couldn't reach content script
- **Solution**: Wrap content scripts with Chrome API mock that listens to `window.postMessage`, and bridge `tabs.sendMessage()` to inject message-sending scripts that use `window.postMessage`

**Final Working Architecture:**
- Sandbox popup → postMessage → Parent extension (for Chrome APIs)
- Parent extension → executeScript (MAIN/ISOLATED world) → Real webpage
- Content scripts wrapped with mock → listen to window.postMessage
- Popup sendMessage → executeScript injects messenger → window.postMessage → Content script
- Full bidirectional communication working with real DOM manipulation

**Known Limitations - Ultra-Strict CSP Sites:**

Some websites implement extremely restrictive Content Security Policies with **Trusted Types** that block ALL forms of dynamic script injection:
- **LinkedIn** - Blocks Function(), eval(), script.textContent, script.src with blob/data URLs
- **Twitter/X** - Similar Trusted Types restrictions
- **Banking/Financial sites** - Often have strictest CSP

These sites require pre-compiled, signed scripts and cannot support dynamic content script injection in the live preview.

**Workaround for Users:**
1. Generate the extension in Cr24 Extension Generator
2. Download the extension files (ZIP)
3. Install as a regular Chrome extension via chrome://extensions/
4. The extension will work normally when installed, bypassing preview restrictions

**Why This Happens:**
- Preview injects code dynamically as strings
- Trusted Types policy requires all scripts to go through approved "trust" functions
- No way to create trusted scripts dynamically without page's trust policy
- ISOLATED world also affected (policy applies to both worlds)

**Compatibility:**
- ✅ Works: Wikipedia, GitHub, Stack Overflow, most news sites, blogs, documentation sites
- ❌ Blocked: LinkedIn, Twitter, some banking sites, sites with Trusted Types
- Estimated: 95%+ of websites support dynamic injection

### Data Persistence

All data is stored in Chrome's local storage:
- `chats`: Array of chat sessions with messages AND generated extensions
- `currentChatId`: ID of the currently active chat
- `settings`: User's API key, model selection, and temperature
- `theme`: Current theme preference

**Important**: Each Chat object includes a `generatedExtension` field. When switching chats or reopening the popup, the extension is restored from this field. The preview automatically displays the extension associated with the current chat.

### File Download System

The FileList component (`src/components/FileList.tsx`) uses JSZip to create downloadable archives:
- Individual files: Direct blob download
- ZIP: Bundles manifest.json + all generated files using JSZip library
- **Automatic Naming**: ZIP filename is automatically generated from chat title
  - Chat title is set from the extension's manifest.name field
  - Filename is sanitized (removes invalid characters, converts spaces to hyphens, lowercase)
  - Example: "Love Calculator" chat → `love-calculator.zip`
  - Falls back to `chrome-extension.zip` if no title is available

### Required Manifest Permissions

For the Chrome API bridge to work, the Cr24 Extension Generator extension itself needs these permissions in `manifest.json`:

```json
"permissions": [
  "storage",      // For settings and chat storage
  "activeTab",    // Required to access current tab for script injection
  "scripting"     // Required to inject content scripts and execute scripts
]
```

**Why These Are Needed:**
- `activeTab`: Allows getting tab info and sending messages to content scripts
- `scripting`: Allows `chrome.scripting.executeScript()` to inject generated extension code
- Without these, the preview cannot execute functionality on real webpages

## Key Technical Details

### Build Process

The Vite config includes a custom plugin (`copy-manifest`) that runs after build to:
1. Copy `manifest.json` to `dist/`
2. Copy icon files (PNG or SVG fallback) to `dist/icons/`

This is critical because Chrome extensions require manifest.json and icons in the output directory.

### Message Format

The AI is instructed to respond in this exact format:
```
Created a [Extension Name] Chrome extension that [description].

```json
{
  "manifest": { /* manifest v3 content */ },
  "files": {
    "popup.html": "...",
    "popup.js": "...",
    // etc.
  },
  "type": "popup"
}
```
```

The summary is displayed in chat, while the JSON is parsed and hidden from view.

### API Timeout

OpenAI API calls have a 180-second (3 minute) timeout using AbortController. This is necessary because:
- Higher temperature values (especially 1.0) take longer
- Complex extension generation can be slow
- Network latency varies

### Model-Specific Constraints

- **GPT-5**:
  - Only supports temperature = 1.0 (enforced in code)
  - Streaming disabled (requires organization verification on OpenAI platform)
  - Uses non-streaming mode with "Generating extension..." loading indicator
- **GPT-4o, GPT-4o-mini, GPT-3.5-turbo**:
  - Support full temperature range 0-1
  - Streaming enabled for real-time response
- Default model: `gpt-5`
- Available models: GPT-5, GPT-4.1, GPT-4o

## Syntax Validation & Auto-Repair

The system validates generated extension code in two stages before rendering:

### **Stage 1: JavaScript Syntax Validation** (`src/utils/syntaxValidator.ts`)
- **Parser**: Uses Acorn (lightweight, safe, no eval())
- **Files Validated**: popup.js, content.js, background.js, service-worker.js
- **Validation Output**:
  - Syntax errors with file name, line number, column number, and message
  - Example: `popup.js (line 42, column 5): Unexpected token '}'`
- **Integration**: Runs in ChatContext.tsx before structure validation (line 640)
- **Auto-Repair**: If errors found, automatically requests AI to fix them

### **Stage 2: Extension Structure Validation** (`src/utils/extensionValidator.ts`)
- **Validates**:
  - Manifest format and required fields
  - Exactly 4 files required: popup.html, popup.css, popup.js, content.js
  - Manifest references match actual files
  - Version format, name length, permissions validity
- **Auto-Repair**: If validation fails, system asks AI to regenerate with corrections

### **Auto-Repair Flow**
1. AI generates extension
2. System validates JavaScript syntax (Acorn)
3. If syntax errors → Auto-request fix from AI
4. System validates structure (extensionValidator)
5. If structure errors → Auto-request fix from AI
6. Maximum retry limit prevents infinite loops
7. User sees transparent error messages in chat

**Result**: Broken extensions rarely reach the preview. Most issues are auto-fixed transparently.

## Component Hierarchy

```
App
├── ThemeProvider
│   └── ChatProvider
│       ├── Header (controls: new chat, sidebar, settings, theme toggle)
│       ├── Sidebar (chat history list)
│       ├── ChatPanel (message display + FileList for generated files)
│       ├── PreviewPanel (iframe preview with refresh)
│       └── SettingsModal (API key, model, temperature)
```

## Common Gotchas

1. **Popup Size**: The extension popup has fixed dimensions (750x550) set in `src/styles/global.css`. Chrome extensions need explicit width/height on html/body elements.

2. **Manifest Copying**: If manifest.json or icons aren't in dist/, the extension won't load. Check the Vite plugin in `vite.config.ts`.

3. **Temperature Override**: When modifying API calls, remember GPT-5 temperature must always be 1.0 regardless of user settings.

4. **Streaming Constraints**: Streaming is currently disabled for all models (line 156 in ChatContext.tsx). GPT-5 streaming requires organization verification (photo ID to OpenAI). Can be enabled by changing `useStreaming = true` if organization is verified.

5. **Message Parsing**: The code extracts JSON from triple backtick code blocks. If the AI response format changes, update the regex in ChatContext and ChatPanel.

6. **Chrome Storage**: All persistence uses `chrome.storage.local`, not localStorage. Use the Chrome extension context for testing.

7. **Preview External References**: Generated extensions with `<link>` or `<script src="">` tags will fail in preview unless these are stripped. The preview system handles this automatically.

8. **Preview CSP**: The live preview uses a sandboxed page (`sandbox.html`) to bypass CSP restrictions. Do NOT modify the manifest CSP or remove the sandbox declaration - this is critical for preview interactivity.

9. **Chat Initialization**: The extension auto-creates a new chat on first open if no chats exist. This prevents empty state confusion.

10. **Extension Persistence**: Extensions are stored per-chat, not globally. Switching chats loads that chat's extension into preview.

11. **Sandbox Communication**: PreviewPanel communicates with sandbox.html via postMessage. Always wait for `SANDBOX_READY` before sending HTML to prevent race conditions.

12. **Sandbox Event Listener Persistence**: The sandbox.html event listener MUST be in `<head>` and use `document.body.innerHTML` (NOT `document.write()`). Using `document.write()` destroys the listener and breaks chat switching.

13. **Chat Title from Manifest**: After an extension is generated, the chat title is automatically set to the extension's manifest.name field. This updates both the sidebar display and ZIP download filename with no extra API calls needed.

14. **Dynamic Preview Dimensions**: The preview iframe automatically extracts and applies the actual dimensions from the generated extension's CSS. It parses width/height from body/html/main/container elements, calculates total size including padding, and displays each extension at its true size rather than a fixed dimension. Known limitation: Sizing may not perfectly match Chrome's rendering in all cases and requires further refinement.

15. **Token Usage & Estimation**: The system estimates generation time before API calls and logs actual token usage after. Console shows prompt tokens (~2,500), estimated completion (~10,000), and realistic time estimates (GPT-5: ~4m, GPT-4o: ~2m). This helps users understand API costs and wait times.

16. **System Prompt Optimization**: The system prompt is optimized to ~2,500 tokens (reduced from ~7,000). This provides 30-50% faster generation times while maintaining output quality. DO NOT bloat the prompt with verbose examples or repetitive instructions.

## File Generation System

Generated extensions can include:
- **Required files (4)**:
  - `manifest.json`: Manifest v3 format
  - `popup.html`, `popup.css`, `popup.js`: For popup UI
  - `content.js`: For content script extensions
- **Optional files (1)**:
  - `background.js` or `service_worker.js`: For persistent tasks, alarms, event listeners

The system validates all generated code through:
1. **JavaScript Syntax Validation** (Acorn parser) - validates popup.js, content.js, background.js
2. **Structure Validation** (extensionValidator) - ensures manifest format, file structure, and references are correct
3. **Auto-Repair** - automatically requests AI to fix validation errors

### Supported Extension Types

**Phase 1 Capabilities (Current)**:
- ✅ **Popup extensions** with interactive UI
- ✅ **Content script extensions** that modify web pages
- ✅ **Background/Service Worker extensions** with persistent tasks
- ✅ **Hybrid extensions** (popup + content script + background script)

**Supported Chrome APIs**:
- `chrome.storage` (local storage, onChanged events)
- `chrome.tabs` (query, sendMessage)
- `chrome.scripting` (executeScript)
- `chrome.action` (setBadgeText, setBadgeBackgroundColor)
- `chrome.notifications` (create, clear, getAll) - **NEW in Phase 1**
- `chrome.contextMenus` (create, update, remove, removeAll) - **NEW in Phase 1**
- `chrome.downloads` (download, search, pause, resume, cancel) - **NEW in Phase 1**
- `chrome.alarms` (create, get, getAll, clear, clearAll) - **NEW in Phase 1**

All APIs are fully bridged through the postMessage system, working seamlessly in the preview sandbox.

## Git Workflow

**Standard Practices:**
- Always work on feature branches (e.g., `feature/initial-crx-generator`)
- Never commit directly to `main` branch
- Make frequent, descriptive commits
- Use conventional commit messages with co-author attribution
- All git operations (branch creation, commits) are handled automatically

**Commit Format:**
```
Brief description of changes

Detailed explanation of what was changed and why.
Multiple paragraphs if needed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```