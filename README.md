# CRX Extension Generator

Generate loadable Chrome MV3 extensions offline from a prompt and feature options.

## Quick start

1) Install deps
- npm install

2) Build
- npm run build

3) Load the generator
- Open chrome://extensions
- Enable Developer mode
- Load unpacked and select the dist/ folder

4) Use it
- Click the extension icon to open the popup
- Fill in Name, Description, Version, select features (Popup, Background, Content Script, Options Page, Side Panel), set match patterns if using a content script, and provide an optional Prompt
- Click Generate ZIP to download a ready-to-load extension folder as a ZIP
- Unzip and load the generated extension in chrome://extensions

## Project layout

- [package.json](package.json)
- [tsconfig.json](tsconfig.json)
- [vite.config.ts](vite.config.ts)
- [src/manifest.json](src/manifest.json)
- [src/popup.html](src/popup.html)
- [src/popup.ts](src/popup.ts)
- [src/styles.css](src/styles.css)
- [src/generator/index.ts](src/generator/index.ts)

Note: Vite outputs [src/popup.html](src/popup.html) into dist/src/popup.html. The manifest points to popup.html in the project source; when copied into dist, Chrome loads it from dist/src/popup.html.

## How it works

- UI: [src/popup.html](src/popup.html) + [src/popup.ts](src/popup.ts)
- Generator: [src/generator/index.ts](src/generator/index.ts)
  - Composes manifest.json based on selected features
  - Injects simple template strings for popup/background/content script/options/side panel
  - Creates placeholder icons at sizes 16/32/48/128 via Canvas
  - Zips everything with JSZip and triggers a download via an anchor with download attribute

## Permissions

- The generator extension itself uses minimal permissions (action popup only). Downloads are triggered via anchor download; no chrome.downloads permission needed.

## Development notes

- TypeScript + Vite + Vanilla DOM + JSZip
- Manifest is copied to dist using vite-plugin-static-copy
- Templates are embedded as strings in [src/generator/index.ts](src/generator/index.ts); a file-based template pack can be added later

## Troubleshooting

- If Vite warns about /popup.ts path during first build, ensure the popup script reference in [src/popup.html](src/popup.html) is relative: [script tag](src/popup.html:67)
- If Chrome fails to open the popup, verify the manifest path points to dist/src/popup.html after build; using this repo’s layout, action.default_popup in [src/manifest.json](src/manifest.json) should resolve correctly when copied to dist