# CRX Generator

An AI-powered Chrome extension that generates Chrome extensions using OpenAI's API with live preview functionality.

## Features

- **AI-Powered Generation**: Use ChatGPT to describe your extension and get complete, working code
- **Live Preview**: See your generated extension running in real-time
- **Multi-Mode Support**: Preview popup extensions and content scripts
- **Chat History**: Save and manage multiple extension generation sessions
- **Customizable Settings**: Choose your AI model (GPT-4, GPT-4.1, GPT-5) and adjust temperature
- **Dark/Light Mode**: Toggle between themes for comfortable viewing
- **Export Functionality**: Download your generated extension files

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- OpenAI API key

### Setup

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Build the extension:
```bash
npm run build
```

4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist` folder from this project

## Usage

1. Click the CRX Generator extension icon in Chrome
2. Open Settings (gear icon) and enter your OpenAI API key
3. Describe the extension you want to create in the chat
4. Watch as the AI generates your extension code
5. Preview the extension in real-time
6. Download the generated files

## Development

Run in development mode with hot reload:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

## Project Structure

```
crx-generator/
├── src/
│   ├── components/        # React components
│   ├── context/          # React context providers
│   ├── styles/           # CSS files
│   ├── types/            # TypeScript type definitions
│   ├── App.tsx           # Main app component
│   └── main.tsx          # Entry point
├── manifest.json         # Chrome extension manifest
├── index.html           # HTML template
└── vite.config.ts       # Vite configuration
```

## Features in Detail

### Chat Interface
- Natural language processing to understand extension requirements
- Streaming responses from OpenAI
- Message history persistence
- Multiple chat sessions

### Live Preview
- **Popup Preview**: Renders popup.html with injected CSS and JS
- **Content Script Preview**: Simulates content script injection on a demo page
- Chrome API simulation for testing
- Refresh functionality

### Settings
- API key management (stored locally)
- Model selection (GPT-4, GPT-4.1, GPT-5)
- Temperature control (0-1)
- Secure local storage

## Limitations

- Preview is a simulation and may not perfectly replicate all Chrome extension behaviors
- Some advanced Chrome APIs are not fully simulated
- Network requests from generated extensions may be restricted by CORS

## Privacy

- Your API key is stored locally in Chrome storage
- No data is sent to any server except OpenAI's API
- Chat history is stored locally in your browser

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
