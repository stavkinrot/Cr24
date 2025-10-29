# CRX Generator - Setup Guide

## Quick Start (5 minutes)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Generate Icons
1. Open `create-icons.html` in your browser
2. Click each download button to get icon16.png, icon48.png, and icon128.png
3. Save them in the `icons/` folder

### Step 3: Build the Extension
```bash
npm run build
```

### Step 4: Load in Chrome
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `dist` folder from this project

### Step 5: Configure API Key
1. Click the CRX Generator extension icon
2. Click the settings icon (⚙️)
3. Enter your OpenAI API key
4. Choose your preferred model and temperature
5. Click Save

### Step 6: Create Your First Extension!
1. In the chat input, describe the extension you want:
   - "Create a word counter extension"
   - "Make an extension that highlights all links in yellow"
   - "Build a timer extension with start/stop buttons"
2. Watch the AI generate your extension code
3. See it preview in real-time
4. Download the generated files

## Development Mode

For development with hot reload:
```bash
npm run dev
```

Then go to `http://localhost:5173` in your browser.

Note: Some Chrome extension APIs won't work in dev mode. Build and load as an extension for full functionality.

## Troubleshooting

### "No API key" error
- Make sure you've entered your OpenAI API key in Settings
- Verify the key starts with "sk-"

### Preview not showing
- Click the refresh button (↻) in the preview panel
- Check the browser console for errors
- Make sure the generated code includes the required files

### Extension not loading in Chrome
- Check that you selected the `dist` folder, not the project root
- Look for errors in `chrome://extensions/`
- Try rebuilding: `npm run build`

### Icons not showing
- Generate PNG icons using `create-icons.html`
- Make sure they're saved in the `icons/` folder
- Rebuild the extension

## Project Structure

```
crx-generator/
├── dist/                 # Built extension (load this in Chrome)
├── icons/               # Extension icons
├── src/
│   ├── components/      # UI components
│   │   ├── Header.tsx
│   │   ├── ChatPanel.tsx
│   │   ├── PreviewPanel.tsx
│   │   ├── Sidebar.tsx
│   │   └── SettingsModal.tsx
│   ├── context/        # State management
│   │   ├── ChatContext.tsx
│   │   └── ThemeContext.tsx
│   ├── styles/         # CSS files
│   ├── types/          # TypeScript types
│   ├── App.tsx         # Main component
│   └── main.tsx        # Entry point
├── index.html          # HTML template
├── manifest.json       # Extension manifest
├── package.json        # Dependencies
├── vite.config.ts      # Build config
└── README.md           # Documentation
```

## How It Works

### Chat System
- Uses OpenAI's Chat Completions API
- System prompt guides the AI to generate proper extension code
- Responses are parsed to extract extension files

### Live Preview
- **Popup Mode**: Renders popup.html in an iframe with injected CSS/JS
- **Content Script Mode**: Simulates script injection on a demo page
- Chrome APIs are partially simulated for preview purposes

### Storage
- Chat history stored in Chrome's local storage
- Settings (API key, model, temperature) stored securely
- Theme preference persisted

## Customization

### Adding New Models
Edit `src/types/index.ts`:
```typescript
export interface Settings {
  model: 'gpt-4' | 'gpt-4.1' | 'gpt-5' | 'your-model';
  // ...
}
```

### Changing Theme Colors
Edit CSS variables in `src/styles/global.css`:
```css
:root {
  --accent-color: #0066cc; /* Change this */
  /* ... */
}
```

### Improving AI Prompts
Edit the system message in `src/context/ChatContext.tsx`:
```typescript
{
  role: 'system',
  content: `Your custom prompt here...`
}
```

## API Key Security

- Your API key is stored in Chrome's local storage
- It's never sent anywhere except OpenAI's servers
- The extension has minimal permissions
- Consider using environment-based API keys for deployment

## Next Steps

1. Generate some extensions and test the preview
2. Customize the UI to match your preferences
3. Add support for more extension types (background scripts, etc.)
4. Improve the Chrome API simulation
5. Add code syntax highlighting in the preview

## Getting Help

- Check the README.md for detailed documentation
- Review error messages in the browser console
- Verify your OpenAI API key is valid and has credits

Enjoy creating Chrome extensions with AI!
