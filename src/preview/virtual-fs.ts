// virtual-fs.ts - Virtual filesystem for blob-based extension bundles
export type AIFile = { path: string; content: string };

export interface VirtualFS {
  rootUrl: string;
  files: Map<string, string>;
  objectUrls: Map<string, string>;
  previewScripts: {
    chromeShim: string;
    domHandlers: string;
  };
  cleanup(): void;
}

/**
 * Gets preview system script URLs as chrome-extension URLs (allowed by manifest CSP)
 */
function getPreviewScriptUrls(): { chromeShim: string; domHandlers: string } {
  return {
    chromeShim: chrome.runtime.getURL('preview/chrome-shim.js'),
    domHandlers: chrome.runtime.getURL('preview/dom-handlers.js')
  };
}

/**
 * Creates a virtual filesystem from AIFile array using blob URLs
 */
export async function createVirtualFS(files: AIFile[]): Promise<VirtualFS> {
  const fileMap = new Map<string, string>();
  const objectUrls = new Map<string, string>();
  
  // Get preview script URLs (chrome-extension://)
  const previewScriptUrls = getPreviewScriptUrls();
  
  console.log('[VirtualFS] Using chrome-extension:// URLs for preview scripts');
  
  // Normalize paths and create blob URLs for each extension file
  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    fileMap.set(normalizedPath, file.content);
    
    // Create blob URL for the file content
    const mimeType = getMimeType(normalizedPath);
    const blob = new Blob([file.content], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    objectUrls.set(normalizedPath, blobUrl);
    
    console.log(`[VirtualFS] Created blob URL for ${normalizedPath}`);
  }
  
  // Create a root blob URL that serves as the base href
  const rootBlob = new Blob([''], { type: 'text/html' });
  const rootUrl = URL.createObjectURL(rootBlob);
  
  return {
    rootUrl,
    files: fileMap,
    objectUrls,
    previewScripts: {
      chromeShim: previewScriptUrls.chromeShim,
      domHandlers: previewScriptUrls.domHandlers
    },
    cleanup() {
      // Revoke all object URLs to free memory
      for (const url of objectUrls.values()) {
        URL.revokeObjectURL(url);
      }
      URL.revokeObjectURL(rootUrl);
      objectUrls.clear();
      fileMap.clear();
    }
  };
}

/**
 * Gets the blob URL for a file in the virtual filesystem
 */
export function getFileUrl(fs: VirtualFS, path: string): string | null {
  const normalizedPath = normalizePath(path);
  return fs.objectUrls.get(normalizedPath) || null;
}

/**
 * Gets file content from the virtual filesystem
 */
export function getFileContent(fs: VirtualFS, path: string): string | null {
  const normalizedPath = normalizePath(path);
  return fs.files.get(normalizedPath) || null;
}

/**
 * Creates an HTML document with injected base href and asset URLs
 */
export function createPopupHTML(fs: VirtualFS, originalHtml?: string): string {
  let html = originalHtml || getFileContent(fs, 'popup.html');
  
  if (!html) {
    // Create minimal popup HTML if none exists - CSP compliant
    html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Extension Popup</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 16px;
      min-width: 300px;
    }
    h1 { color: #1a73e8; margin: 0 0 16px 0; }
    p { color: #5f6368; }
    button {
      background: #1a73e8;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      margin: 8px 4px 0 0;
    }
    button:hover { background: #1557b0; }
    #result {
      margin-top: 16px;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 4px;
      min-height: 20px;
    }
  </style>
</head>
<body>
  <h1>Extension Preview</h1>
  <p>No popup.html found in bundle. This is a placeholder.</p>
  <button id="testStorageBtn">Test Storage</button>
  <button id="testMessagingBtn">Test Messaging</button>
  <button id="calculateLoveBtn">Calculate Love</button>
  <div id="result"></div>
</body>
</html>`;
  }
  
  // Ensure HTML has proper structure
  if (!html.includes('<html')) {
    html = `<!DOCTYPE html><html><head><title>Extension Popup</title></head><body>${html}</body></html>`;
  }
  
  // Remove any existing inline event handlers to make CSP compliant
  html = removeInlineEventHandlers(html);
  
  // Remove any existing script tags (they'll be added back as external blob URLs)
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  
  // Remove any existing CSP meta tags to avoid conflicts (browser uses the first one)
  html = html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
  
  // Add CSP meta tag that allows chrome-extension:// and blob: URLs for scripts
  // Note: blob: for extension files, chrome-extension: for preview system scripts
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="script-src 'self' chrome-extension: blob: 'wasm-unsafe-eval'; script-src-elem 'self' chrome-extension: blob: 'wasm-unsafe-eval'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src http://localhost:* http://127.0.0.1:* ws://localhost:*; object-src 'self'; base-uri 'self';">`;
  
  // Add base href and CSP to head
  if (!html.match(/<base\s+href/i)) {
    html = html.replace(/(<head[^>]*>)/i, `$1\n<base href="${fs.rootUrl}/">\n${cspMeta}`);
  } else {
    html = html.replace(/(<head[^>]*>)/i, `$1\n${cspMeta}`);
  }
  
  // Inject CSS files if they exist
  const cssFiles = Array.from(fs.files.keys()).filter(path => path.endsWith('.css') && !path.includes('__preview__'));
  if (cssFiles.length > 0) {
    const cssLinks = cssFiles.map(cssFile => {
      const cssUrl = fs.objectUrls.get(cssFile) || cssFile;
      return `<link rel="stylesheet" href="${cssUrl}">`;
    }).join('\n');
    html = html.replace(/(<\/head>)/i, `${cssLinks}\n$1`);
  }
  
  // Replace relative asset paths with blob URLs
  html = replaceAssetPaths(html, fs);
  
  return html;
}

/**
 * Remove inline event handlers to make HTML CSP compliant
 */
function removeInlineEventHandlers(html: string): string {
  // Remove onclick, onload, onerror, etc. attributes
  html = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove javascript: URLs
  html = html.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  
  return html;
}

/**
 * Replace relative asset paths in HTML with blob URLs
 */
function replaceAssetPaths(html: string, fs: VirtualFS): string {
  // Replace src and href attributes that point to local files
  html = html.replace(
    /((?:src|href)\s*=\s*["'])([^"']+)(["'])/gi,
    (match, prefix, path, suffix) => {
      // Skip absolute URLs and data URLs
      if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('//') || path.startsWith('chrome-extension://')) {
        return match;
      }
      
      const blobUrl = getFileUrl(fs, path);
      if (blobUrl) {
        return `${prefix}${blobUrl}${suffix}`;
      }
      
      return match;
    }
  );
  
  // Also replace @import statements in CSS
  html = html.replace(
    /@import\s+["']([^"']+)["']/gi,
    (match, path) => {
      // Skip absolute URLs
      if (path.startsWith('http') || path.startsWith('//')) {
        return match;
      }
      
      const blobUrl = getFileUrl(fs, path);
      if (blobUrl) {
        return `@import "${blobUrl}"`;
      }
      
      return match;
    }
  );
  
  // Replace url() statements in CSS
  html = html.replace(
    /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
    (match, path) => {
      // Skip absolute URLs and data URLs
      if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('//')) {
        return match;
      }
      
      const blobUrl = getFileUrl(fs, path);
      if (blobUrl) {
        return `url("${blobUrl}")`;
      }
      
      return match;
    }
  );
  
  return html;
}

/**
 * Normalize file path by removing leading slashes and dots
 */
function normalizePath(path: string): string {
  return path.replace(/^\.?\/*/, '');
}

/**
 * Get MIME type for file extension
 */
function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  
  const mimeTypes: Record<string, string> = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
  };
  
  return mimeTypes[ext] || 'text/plain';
}

/**
 * Check if the bundle has a background script
 */
export function hasBackgroundScript(fs: VirtualFS): { hasBackground: boolean; scriptPath?: string } {
  const manifestContent = getFileContent(fs, 'manifest.json');
  if (!manifestContent) {
    return { hasBackground: false };
  }
  
  try {
    const manifest = JSON.parse(manifestContent);
    const background = manifest.background;
    
    if (background?.service_worker) {
      const scriptPath = normalizePath(background.service_worker);
      if (fs.files.has(scriptPath)) {
        return { hasBackground: true, scriptPath };
      }
    }
    
    if (background?.scripts && Array.isArray(background.scripts)) {
      for (const script of background.scripts) {
        const scriptPath = normalizePath(script);
        if (fs.files.has(scriptPath)) {
          return { hasBackground: true, scriptPath };
        }
      }
    }
  } catch (e) {
    console.error('Failed to parse manifest.json:', e);
  }
  
  return { hasBackground: false };
}