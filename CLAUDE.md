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

The PreviewPanel (`src/components/PreviewPanel.tsx`) has two modes:

- **Popup Preview**: Injects generated HTML/CSS/JS into an iframe
- **Content Script Preview**: Simulates content script injection on a demo page with mocked Chrome APIs

The iframe uses sandbox attributes: `allow-scripts allow-same-origin allow-forms allow-modals`

### Data Persistence

All data is stored in Chrome's local storage:
- `chats`: Array of chat sessions with messages
- `currentChatId`: ID of the currently active chat
- `settings`: User's API key, model selection, and temperature
- `theme`: Current theme preference

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

## File Generation System

Generated extensions are expected to include:
- `manifest.json`: Manifest v3 format
- `popup.html`, `popup.css`, `popup.js`: For popup extensions
- `content.js`: For content script extensions
- Any additional files specified by the AI

The system doesn't validate the generated code - it trusts the AI output and makes it downloadable.
- add standard git workflow requirements
- do frequent git commits and never do real editing in the main branch - always use feature branches
- do all the git management automatically using standard best practices