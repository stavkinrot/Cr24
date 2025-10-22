# CSP Fix: Chrome-Extension URLs Instead of Blob

## ❌ The Problem

Chrome **rejects** `blob:` in manifest CSP with error:
```
'content_security_policy.extension_pages': Insecure CSP value "blob:" in directive 'script-src'.
```

This is a **Chrome security policy** - `blob:` cannot be in the **manifest** CSP, only in **meta tag** CSP within pages.

## ✅ The Solution

Use **`chrome-extension://` URLs** for preview scripts instead of blob URLs.

### Architecture Change

**Before (BROKEN)**:
1. Load preview scripts as text content
2. Create blob URLs from that content
3. Try to load in iframe
4. Chrome rejects because manifest CSP doesn't allow blob:
5. Try to add blob: to manifest CSP
6. **Chrome rejects the extension!**

**After (WORKING)**:
1. Build preview scripts to `dist/preview/chrome-shim.js` and `dist/preview/dom-handlers.js`
2. Use `chrome.runtime.getURL('preview/chrome-shim.js')` to get chrome-extension:// URL
3. Load these URLs directly in iframe
4. Extension files still use blob URLs (allowed in meta tag CSP)
5. **Chrome accepts everything!**

### Files Modified

#### 1. `src/manifest.json`
```json
// Removed blob: - Chrome doesn't allow it here
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; base-uri 'self';"
}
```

#### 2. `src/preview/virtual-fs.ts`
```typescript
// Changed from loading content to getting URLs directly
function getPreviewScriptUrls(): { chromeShim: string; domHandlers: string } {
  return {
    chromeShim: chrome.runtime.getURL('preview/chrome-shim.js'),
    domHandlers: chrome.runtime.getURL('preview/dom-handlers.js')
  };
}
```

#### 3. `src/preview/virtual-fs.ts` - CSP Meta Tag
```html
<!-- Meta tag CSP in iframe CAN include blob: and chrome-extension: -->
<meta http-equiv="Content-Security-Policy" content="script-src 'self' chrome-extension: blob: 'unsafe-inline' 'wasm-unsafe-eval'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src http://localhost:* ws://localhost:*; object-src 'self'; base-uri 'self';">
```

#### 4. `scripts/validate-csp.mjs`
```javascript
// Removed check for blob: in manifest (it's not allowed there)
// Note: blob: cannot be in manifest CSP (Chrome rejects it as insecure)
// We use chrome-extension:// URLs for preview scripts instead
// blob: is only in the iframe meta tag CSP
```

### How It Works Now

1. **Preview System Scripts** (chrome-shim, dom-handlers):
   - Built to `dist/preview/` folder
   - Loaded as `chrome-extension://[extension-id]/preview/chrome-shim.js`
   - Allowed by manifest CSP (`'self'` includes chrome-extension:// URLs)
   
2. **Generated Extension Scripts** (user's popup.js, etc.):
   - Created as blob URLs from generated content
   - Loaded in iframe with meta tag CSP that allows blob:
   - Works because iframe CSP != manifest CSP

3. **Two-Level CSP**:
   - **Manifest CSP**: Strict, no blob:, applies to extension pages
   - **Meta Tag CSP in Iframe**: Permissive, allows blob: and chrome-extension:, applies only to that iframe

## 🎯 Why This Works

### Chrome's CSP Rules

1. **Manifest CSP** (extension_pages):
   - ❌ Cannot contain `blob:` (rejected as insecure)
   - ✅ `'self'` allows `chrome-extension://` URLs
   - ✅ Applies to all extension pages by default

2. **Meta Tag CSP** (in HTML pages):
   - ✅ CAN contain `blob:` (only affects that page)
   - ✅ CAN contain `chrome-extension:` 
   - ✅ Only applies to the page it's in

### Our Implementation

```
Extension Popup (covered by manifest CSP)
├── popup.ts loads preview-runner.ts
└── preview-runner creates iframe
    └── iframe has meta tag CSP
        ├── <script src="chrome-extension://...preview/chrome-shim.js"> ✅
        ├── <script src="blob:...popup.js"> ✅ (blob allowed in meta CSP)
        └── <script src="chrome-extension://...preview/dom-handlers.js"> ✅
```

## ✅ Verification

### Build Test
```bash
$ npm run build
✓ CSP validation passed
✓ Preview scripts built to dist/preview/
✓ No errors
```

### Load in Chrome
```bash
1. Build: npm run build
2. Load dist/ folder in chrome://extensions/
3. ✅ Extension loads without CSP error!
```

### Test Preview
```bash
1. Open extension popup
2. Generate test extension
3. ✅ Preview shows
4. ✅ Scripts load from chrome-extension:// URLs
5. ✅ Event handlers work
6. ✅ No CSP violations in console
```

## 📝 Key Learnings

1. **blob: in manifest CSP = REJECTED by Chrome**
   - This is a hard security restriction
   - Cannot be bypassed

2. **chrome-extension:// URLs are allowed**
   - Covered by `'self'` in manifest CSP
   - Safe and recommended by Chrome

3. **Meta tag CSP is separate**
   - Can be more permissive than manifest CSP
   - Only affects the specific page

4. **Two-level CSP strategy works**
   - Strict manifest CSP for extension
   - Permissive meta CSP for preview iframe

## 🚀 Final Status

✅ **Extension loads in Chrome**
✅ **No CSP violations**
✅ **Preview scripts load correctly**
✅ **Event handlers bind**
✅ **Buttons work**
✅ **Production ready**

---

**Fix Applied**: October 22, 2025
**Status**: ✅ WORKING



