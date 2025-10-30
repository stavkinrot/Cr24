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
   - **Critical**: GPT-5 only supports temperature of 1.0, so the code automatically overrides user temperature settings when GPT-5 is selected

2. **ThemeContext** (`src/context/ThemeContext.tsx`)
   - Manages light/dark mode
   - Persists theme preference to Chrome storage

### OpenAI Integration Flow

1. User sends message via ChatPanel
2. ChatContext appends user message to chat history
3. System prompt instructs AI to respond with:
   - A short 2-3 sentence summary
   - Complete extension code in JSON format within triple backticks
4. Response parsing:
   - Summary text is extracted (everything before the JSON code block)
   - JSON is parsed to extract `manifest` and `files` objects
   - Files are displayed in FileList component with individual/ZIP download
5. PreviewPanel renders the extension in an iframe sandbox

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

**Solution: postMessage Bridge**

The preview uses a postMessage bridge to allow sandboxed popup code to call real Chrome APIs:

1. **Sandbox Chrome API Mock** (injected into preview HTML):
   - Provides `chrome.tabs`, `chrome.scripting`, `chrome.storage` objects
   - When called, sends `CHROME_API_CALL` postMessage to parent
   - Waits for `CHROME_API_RESULT` response
   - Returns result to extension code

2. **Parent Message Handler** (in PreviewPanel.tsx):
   - Listens for `CHROME_API_CALL` messages
   - Executes real Chrome API in parent context (has access)
   - Sends result back via `CHROME_API_RESULT` postMessage

**Supported APIs via Bridge:**
- `chrome.tabs.query()` - Gets active tab for script injection
- `chrome.tabs.sendMessage()` - Sends messages to content scripts
- `chrome.scripting.executeScript()` - Injects scripts into active tab
- `chrome.storage.local.get/set()` - Mock storage operations

**Content Script Injection:**
When a generated extension has content scripts (detected by `content.js` file or `content_scripts` in manifest):
- PreviewPanel automatically injects the content script into the active tab when preview loads
- Uses real `chrome.scripting.executeScript()` from parent context
- Content script runs on the REAL active webpage
- Popup can then communicate with it via `chrome.tabs.sendMessage()`

**Key Insight:**
- **Preview shows UI only** (visualization in sandboxed iframe)
- **Functionality executes on real pages** (via bridge to parent's Chrome APIs)
- Extensions that use `chrome.scripting.executeScript()` inject into real active tab
- Extensions with content scripts have them auto-injected into real active tab

### Lessons Learned: Chrome API Access Attempts

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

**Final Solution: postMessage Bridge**
- Sandbox sends API requests to parent via postMessage
- Parent executes real Chrome APIs
- Results sent back to sandbox
- **Works**: Clean separation, no CSP issues, real APIs accessible

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

- **GPT-5**: Only supports temperature = 1.0 (enforced in code)
- **Other models**: Support full temperature range 0-1
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

4. **Message Parsing**: The code extracts JSON from triple backtick code blocks. If the AI response format changes, update the regex in ChatContext and ChatPanel.

5. **Chrome Storage**: All persistence uses `chrome.storage.local`, not localStorage. Use the Chrome extension context for testing.

6. **Preview External References**: Generated extensions with `<link>` or `<script src="">` tags will fail in preview unless these are stripped. The preview system handles this automatically.

7. **Preview CSP**: The live preview uses a sandboxed page (`sandbox.html`) to bypass CSP restrictions. Do NOT modify the manifest CSP or remove the sandbox declaration - this is critical for preview interactivity.

8. **Chat Initialization**: The extension auto-creates a new chat on first open if no chats exist. This prevents empty state confusion.

9. **Extension Persistence**: Extensions are stored per-chat, not globally. Switching chats loads that chat's extension into preview.

10. **Sandbox Communication**: PreviewPanel communicates with sandbox.html via postMessage. Always wait for `SANDBOX_READY` before sending HTML to prevent race conditions.

11. **Sandbox Event Listener Persistence**: The sandbox.html event listener MUST be in `<head>` and use `document.body.innerHTML` (NOT `document.write()`). Using `document.write()` destroys the listener and breaks chat switching.

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