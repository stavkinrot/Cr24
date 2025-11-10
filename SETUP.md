# Cr24 Extension Generator - Setup Guide

Get started with Cr24 Extension Generator to create Chrome extensions using AI.

## What You Need

- **Chrome Browser** (latest version)
- **OpenAI API Key** - [Get one here](https://platform.openai.com/api-keys)

## Installation

### Step 1: Get the Extension

**Option A: Download a Release (Recommended)**
1. Download the latest release ZIP file
2. Extract it to a folder on your computer

**Option B: Build from Source**
1. Make sure you have [Node.js](https://nodejs.org/) installed (v16+)
2. Download or clone this repository
3. Open terminal in the project folder
4. Run: `npm install`
5. Run: `npm run build`

### Step 2: Load in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle switch in top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder from the extracted/built files
5. The Cr24 Extension Generator icon will appear in your Chrome toolbar

### Step 3: Add Your API Key

1. Click the Cr24 Extension Generator icon in your toolbar
2. Click the **Settings** icon (⚙️) in the top-right corner
3. Enter your OpenAI API key
4. Choose your AI model:
   - **GPT-5** - Most capable (temperature locked to 1.0)
   - **GPT-4.1** - Balanced performance
   - **GPT-4o** - Fast and efficient
5. Click **Save**

Your API key is stored locally and never shared.

## How to Use

### Creating Extensions

1. **Click** the Cr24 icon in your Chrome toolbar
2. **Describe** the extension you want:
   ```
   Create a word counter that shows how many words are on the page
   ```
3. **Wait** 30-60 seconds for the AI to generate your extension
4. **Preview** the extension on the right side of the popup
5. **Download** the ZIP file when ready

### Example Prompts

- "Create a Pomodoro timer with 25-minute work sessions"
- "Build a dark mode toggle that works on any website"
- "Make a color picker that shows hex codes"
- "Create a simple note-taking extension"

See [EXAMPLES.md](EXAMPLES.md) for more ideas.

### Managing Your Chats

- **New Chat**: Click the **+** button in the header
- **Switch Chats**: Click any chat in the left sidebar
- **Chat Names**: Automatically named after the extension you create

### Installing Generated Extensions

1. Click **Download ZIP** in Cr24 Extension Generator
2. Extract the ZIP to a folder
3. Go to `chrome://extensions/` in Chrome
4. Click **Load unpacked**
5. Select the extracted folder
6. Your new extension is now installed!

## Troubleshooting

### "No API key" Error
- Make sure you entered your API key in Settings (⚙️)
- Check that your key starts with `sk-` or `sk-proj-`
- Verify your OpenAI account has available credits

### Preview Not Working
- Click the **Refresh** button (↻) in the preview panel
- Some complex extensions may not preview perfectly
- The downloaded extension will work correctly when installed

### Extension Won't Load in Chrome
- Make sure you selected the `dist/` folder, not the project root folder
- Check `chrome://extensions/` for error messages
- If you built from source, try: `npm run build`

### Icons Not Showing
- Icons are included in the `dist/` folder
- If missing after building from source, run: `npm run build`

### GPT-5 Temperature Locked at 1.0
This is normal. OpenAI requires GPT-5 to use temperature 1.0. The slider will lock automatically when GPT-5 is selected.

### Preview Says "Blocked by CSP"
Some websites (LinkedIn, Twitter, banking sites) block the live preview due to security policies. This is normal. The generated extension will work when you install it in Chrome.

## Privacy & Security

- ✅ API key stored locally in Chrome only
- ✅ No data sent anywhere except OpenAI
- ✅ Chat history stored locally in your browser
- ✅ Minimal extension permissions (storage, activeTab, scripting)

## Tips

- Be specific in your prompts for better results
- Start with simple extensions and add features iteratively
- Use the preview to test before downloading
- Toggle Dark/Light mode with the theme button in the header
- Check [EXAMPLES.md](EXAMPLES.md) for inspiration

## Need Help?

- Review error messages in the Chrome console (F12)
- Check that your OpenAI API key is valid
- Make sure you're using the latest Chrome version
- See [README.md](README.md) for project overview

Happy extension building with Cr24! 🚀
