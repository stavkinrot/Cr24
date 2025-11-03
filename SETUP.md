# Cr24 Extension Generator - Setup Guide

Complete setup instructions to get Cr24 Extension Generator running in Chrome.

## Prerequisites

- **Node.js** v16 or higher ([Download](https://nodejs.org/))
- **Chrome Browser** (latest version)
- **OpenAI API Key** ([Get one here](https://platform.openai.com/api-keys))

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

This will install all required packages including React, TypeScript, Vite, and JSZip.

### 2. Build the Extension

```bash
npm run build
```

This creates a production build in the `dist/` folder with:
- Compiled JavaScript and CSS
- Extension manifest
- Icons and assets
- Sandbox HTML for live preview

### 3. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder from this project

The Cr24 Extension Generator icon should now appear in your Chrome toolbar.

### 4. Configure OpenAI API Key

1. Click the Cr24 Extension Generator icon in your toolbar
2. Click the **Settings** icon (⚙️) in the top-right
3. Enter your OpenAI API key
4. Choose your preferred model:
   - **GPT-5** (default, most capable, temperature locked to 1.0)
   - **GPT-4.1** (balanced performance)
   - **GPT-4o** (fast and efficient)
5. Adjust temperature if desired (0 = focused, 1 = creative)
6. Click **Save**

Your settings are stored securely in Chrome's local storage.

## Using Cr24 Extension Generator

### Basic Usage

1. Click the extension icon to open the popup
2. Type a description of the extension you want to create:
   ```
   Create a word counter extension that shows the number of words on the current page
   ```
3. Press **Enter** or click **Send**
4. Wait for the AI to generate your extension (this may take 30-60 seconds)
5. View the live preview on the right side
6. Download individual files or the complete ZIP

### Example Prompts

See [EXAMPLES.md](EXAMPLES.md) for a comprehensive list of example prompts.

Quick examples:
- "Create a Pomodoro timer with 25-minute work sessions"
- "Build a dark mode toggle that works on any website"
- "Make a color picker extension with hex code display"

### Managing Chats

- **New Chat**: Click the "+" button in the header
- **Switch Chat**: Click a chat in the left sidebar
- **Auto-Naming**: Chats are automatically named after the generated extension

### Downloading Extensions

Click the **Download ZIP** button to get all files in a single archive, or download individual files separately.

To use your generated extension:
1. Download the ZIP file
2. Extract it to a folder
3. Go to `chrome://extensions/`
4. Click "Load unpacked"
5. Select the extracted folder

## Development Mode

For development with hot reload (browser preview only):

```bash
npm run dev
```

Then open `http://localhost:5173` in your browser.

**Note**: Chrome extension APIs won't work in dev mode. Always build and load as an extension for full functionality testing.

## Troubleshooting

### "No API key" Error
- Ensure you've entered your OpenAI API key in Settings
- Verify the key starts with `sk-` or `sk-proj-`
- Check that your OpenAI account has available credits

### Preview Not Working
- Click the **Refresh** button (↻) in the preview panel
- Check browser console for errors (F12)
- Verify the generated extension includes required files (popup.html, popup.js)

### Extension Not Loading in Chrome
- Make sure you selected the `dist/` folder, not the project root
- Check for errors in `chrome://extensions/`
- Try rebuilding: `npm run build`

### Icons Not Showing
- Icons are already included in the `icons/` folder
- If missing, rebuild the extension: `npm run build`
- Check that `vite.config.ts` copies icons to dist

### GPT-5 Temperature Locked
This is expected behavior. GPT-5 only supports temperature 1.0 due to OpenAI restrictions. The UI will automatically lock the slider when GPT-5 is selected.

### Preview Shows "Blocked by CSP"
Some websites (LinkedIn, Twitter) have strict Content Security Policies that block dynamic script injection. This is a limitation of the live preview. The generated extension will work normally when installed in Chrome.

## Project Structure

```
Cr24.2/
├── dist/                 # Built extension (load this in Chrome)
├── icons/               # Extension icons (16px, 48px, 128px)
├── public/              # Static assets
│   └── sandbox.html     # Sandboxed page for live preview
├── src/
│   ├── components/      # React UI components
│   │   ├── Header.tsx
│   │   ├── ChatPanel.tsx
│   │   ├── PreviewPanel.tsx
│   │   ├── FileList.tsx
│   │   ├── Sidebar.tsx
│   │   └── SettingsModal.tsx
│   ├── context/         # React Context providers
│   │   ├── ChatContext.tsx    # Chat and API logic
│   │   └── ThemeContext.tsx   # Theme management
│   ├── styles/          # Component CSS files
│   ├── types/           # TypeScript definitions
│   ├── App.tsx          # Main app component
│   └── main.tsx         # Entry point
├── index.html           # HTML template
├── manifest.json        # Chrome extension manifest
├── package.json         # Dependencies
├── vite.config.ts       # Build configuration
└── README.md            # Project overview
```

## Security Notes

- Your API key is stored locally in Chrome storage only
- No data is sent anywhere except OpenAI's API
- Chat history is stored locally in your browser
- The extension has minimal permissions (storage, activeTab, scripting)

## Next Steps

1. Read [EXAMPLES.md](EXAMPLES.md) for inspiration
2. Generate your first extension
3. Test the live preview functionality
4. Download and install a generated extension
5. Customize the UI theme (Light/Dark mode toggle in header)

## Getting Help

- Check the [README.md](README.md) for project overview
- Review browser console errors (F12 → Console tab)
- Verify your OpenAI API key and credits
- Ensure you're using the latest Chrome version

Happy extension building with Cr24!
