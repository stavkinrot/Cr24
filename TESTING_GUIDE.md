# Testing Guide: LinkedIn Extractor Extension Generator

## What's Been Implemented

### Core Features
1. **Domain Auto-Detection** - Generator will detect active tab domain and create `*://*.domain.com/*` patterns
2. **LinkedIn Recipe** - Built-in LinkedIn posts extractor (no user pasting needed)
3. **Modern UI** - Professional popup with dark mode, animations, proper spacing
4. **Messaging Architecture** - Popup ↔ Background ↔ Content script communication
5. **Extended Chrome Shim** - tabs.sendMessage and scripting.executeScript for preview

### Generated Extension Structure

When you generate an extension targeting LinkedIn, it will include:

```
linkedin-extractor/
├── manifest.json
│   ├── manifest_version: 3
│   ├── permissions: ["scripting", "activeTab", "storage"]
│   ├── host_permissions: ["*://*.linkedin.com/*", "*://linkedin.com/*"]
│   ├── content_scripts: [{ matches: [...], js: ["content_script.js"] }]
│   └── background: { service_worker: "service_worker.js" }
├── popup.html         - Modern UI with Extract Posts button
├── popup.js           - Sends message to content script, renders results
├── styles.css         - Professional theme with CSS variables
├── service_worker.js  - Background messaging mediator
├── content_script.js  - Listens for messages, calls extractPosts()
├── lib/
│   └── extract-posts.js - LinkedIn-specific extractor
└── icon.png
```

## How to Test

### 1. Build and Load the Generator

```bash
npm run build
```

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` folder
5. Pin the extension to toolbar

### 2. Test on LinkedIn

1. Navigate to `https://www.linkedin.com/feed`
2. Click the extension icon
3. The generator should detect you're on LinkedIn
4. Type: "Create an extension that extracts LinkedIn posts"
5. The AI will generate an extension with:
   - Auto-detected domain patterns (`*://*.linkedin.com/*`)
   - Built-in LinkedIn extractor included
   - Modern popup UI

### 3. Download and Test the Generated Extension

1. Click "Download ZIP" when generation completes
2. Extract the ZIP file
3. Go to `chrome://extensions`
4. Load the extracted folder as unpacked extension
5. Navigate to LinkedIn feed again
6. Click the new extension's popup
7. Click "Extract Posts" button
8. Should see posts with impressions, likes, comments displayed

### 4. Test in Live Preview (if implemented)

1. The preview pane should show two sections:
   - **Page Preview**: LinkedIn feed skeleton
   - **Popup Preview**: Extension popup
2. Clicking "Extract Posts" in popup preview should extract from skeleton
3. Results should appear in the popup

## Expected Behavior

### Popup UI
- Clean, modern interface
- LinkedIn blue color scheme (#0a66c2)
- Dark mode support
- Smooth animations on hover
- Professional typography

### Extract Functionality
- Button sends `{ type: 'extract-posts' }` to content script
- Content script calls `extractPosts()` from lib
- Returns `{ success: true, data: { posts: [...], count: N } }`
- Popup renders posts in styled list with:
  - Post text (truncated to 3 lines)
  - 👁️ Impressions
  - 👍 Likes
  - 💬 Comments

### Error Handling
- No content script: Shows "Error: Could not establish connection"
- No posts found: Shows "No posts found"
- Script error: Shows error message in popup

## Manual Testing Checklist

- [ ] Generator loads without errors
- [ ] Detects LinkedIn domain when opened on linkedin.com
- [ ] Generates extension with correct manifest permissions
- [ ] Generated popup.html has modern UI
- [ ] Generated styles.css includes dark mode
- [ ] LinkedIn extractor (lib/extract-posts.js) is included
- [ ] content_script.js imports and calls extractPosts()
- [ ] popup.js sends messages correctly
- [ ] Extension works on actual LinkedIn page
- [ ] Extracts real posts with metrics
- [ ] UI renders results properly
- [ ] Dark mode works correctly

## Known Limitations

1. **Preview Implementation Incomplete**: The dual-pane preview (page-sim + popup) requires additional work in preview-runner.ts and preview-host.ts
2. **Live Preview Content Scripts**: Content script injection into page-sim iframe needs MessageChannel wiring
3. **Domain Detection UI**: Popup UI doesn't yet show detected domain or allow override

## Architecture Decisions

### Why `*://*.domain.com/*` Pattern?
- Covers both http and https
- Includes all subdomains (www, m, mobile, etc.)
- More flexible than `https://www.domain.com/*`

### Why Recipes System?
- No user pasting required
- Easy to add more sites (YouTube, Reddit, etc.)
- Extractors are pre-tested and optimized
- Maintainable and versionable

### Why Separate lib/ Folder?
- Clean separation of concerns
- Content script stays small and generic
- Extractor logic is modular and reusable
- Easy to debug

## Troubleshooting

### "Could not establish connection"
- Content script isn't running on the page
- Check manifest content_scripts matches
- Verify host_permissions includes the domain
- Reload the extension

### "No posts found"
- LinkedIn changed their DOM structure
- Extractor selectors may need updating
- Check console for errors
- Verify you're on the feed page

### Preview doesn't work
- Preview runner may not be fully wired
- Check console for errors
- Verify files are in preview bundle
- Try "Download ZIP" and test manually

## Next Development Steps

To complete the implementation:

1. Update `preview-runner.ts`:
   - Create page-sim iframe
   - Load domain skeleton HTML
   - Inject content scripts with chrome shim
   - Setup MessageChannel for tabs.sendMessage bridging

2. Update `preview-host.html` and `preview-host.ts`:
   - Add two-pane layout (50/50 split or adjustable)
   - Add domain indicator/selector
   - Add "Run in Active Tab" button
   - Style the dual-pane interface

3. Wire domain detection into popup UI:
   - Show detected domain in generator interface
   - Allow manual override of domain
   - Update matches patterns dynamically

4. Test end-to-end flow
5. Update main README.md with new features

