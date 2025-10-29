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
- `public/sandbox.html`: Receives HTML via postMessage, renders with document.write()
- `manifest.json`: Declares sandbox page and sandbox-specific CSP policy
- `vite.config.ts`: Copies sandbox.html to dist/ during build

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