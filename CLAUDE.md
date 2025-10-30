# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CRX Generator is a Chrome extension (Manifest V3) that uses OpenAI's API to generate Chrome extensions based on natural language descriptions. It's built with React + TypeScript + Vite and runs as a popup extension.

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
   - **Streaming Responses**: Uses OpenAI's streaming API for real-time text generation (disabled for GPT-5)
   - **Critical GPT-5 Constraints**:
     - Only supports temperature of 1.0 (automatically enforced)
     - Streaming disabled due to organization verification requirement
     - Falls back to non-streaming mode for GPT-5 requests

2. **ThemeContext** (`src/context/ThemeContext.tsx`)
   - Manages light/dark mode
   - Persists theme preference to Chrome storage

### OpenAI Integration Flow

1. User sends message via ChatPanel
2. ChatContext creates placeholder assistant message and displays it immediately
3. Makes streaming API call to OpenAI (non-streaming for GPT-5)
4. **Streaming Mode** (GPT-4o, GPT-4o-mini, GPT-3.5-turbo):
   - Response streams in real-time using Server-Sent Events (SSE)
   - Each chunk updates the message content immediately
   - User sees text appear character-by-character
   - Provides instant feedback and perceived speed improvement
5. **Non-Streaming Mode** (GPT-5):
   - Waits for complete response
   - Updates message once generation completes
   - Required due to OpenAI organization verification requirement for GPT-5 streaming
6. System prompt instructs AI to respond with:
   - A short 2-3 sentence summary
   - Complete extension code in JSON format within triple backticks
7. Response parsing:
   - Summary text is extracted (everything before the JSON code block)
   - JSON is parsed to extract `manifest` and `files` objects
   - Files are displayed in FileList component with individual/ZIP download
8. **Automatic Chat Title**:
   - After extension is generated, chat title is automatically set to the manifest name
   - Example: If manifest.name is "Love Calculator", chat becomes "Love Calculator"
   - ZIP download filename uses this title (sanitized to `love-calculator.zip`)
   - Falls back to current chat title if manifest name is missing
9. **Dynamic Preview Sizing**:
   - PreviewPanel extracts actual dimensions from generated extension CSS/HTML
   - Looks for width/height on `body`, `html`, `main`, or `.container` elements
   - Automatically calculates total dimensions including padding
   - Falls back to 400×600px (standard Chrome popup size) if no dimensions found
   - Auto-height extensions default to 600px height to prevent scrollbars
   - Each extension previews at its actual size, not stretched to fill the panel
10. PreviewPanel renders the extension in an iframe sandbox

**Streaming Implementation Details:**
- Uses `ReadableStream` reader to process SSE chunks
- Updates React state on every chunk for real-time UI refresh
- 5-minute timeout for both streaming and non-streaming modes
- Gracefully handles stream interruptions and errors
- Final content saved to Chrome storage after completion

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
- `chrome.storage.local.get/set()` - Mock storage operations

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
1. Generate the extension in CRX Generator
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

For the Chrome API bridge to work, the CRX Generator extension itself needs these permissions in `manifest.json`:

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
- Default model: `gpt-4o`

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

1. **Popup Size**: The extension popup has fixed dimensions (800x600) set in `src/styles/global.css`. Chrome extensions need explicit width/height on html/body elements.

2. **Manifest Copying**: If manifest.json or icons aren't in dist/, the extension won't load. Check the Vite plugin in `vite.config.ts`.

3. **Temperature Override**: When modifying API calls, remember GPT-5 temperature must always be 1.0 regardless of user settings.

4. **Streaming Constraints**: GPT-5 cannot use streaming mode due to OpenAI organization verification requirements. The code automatically disables streaming when GPT-5 is selected (line 152 in ChatContext.tsx). Other models use streaming for better UX.

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

## File Generation System

Generated extensions are expected to include:
- `manifest.json`: Manifest v3 format
- `popup.html`, `popup.css`, `popup.js`: For popup extensions
- `content.js`: For content script extensions
- Any additional files specified by the AI

The system doesn't validate the generated code - it trusts the AI output and makes it downloadable.

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