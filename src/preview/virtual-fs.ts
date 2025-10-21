// virtual-fs.ts - Virtual filesystem for blob-based extension bundles
export type AIFile = { path: string; content: string };

export interface VirtualFS {
  rootUrl: string;
  files: Map<string, string>;
  objectUrls: Map<string, string>;
  cleanup(): void;
}

/**
 * Creates a virtual filesystem from AIFile array using blob URLs
 */
export function createVirtualFS(files: AIFile[]): VirtualFS {
  const fileMap = new Map<string, string>();
  const objectUrls = new Map<string, string>();
  
  // Normalize paths and create blob URLs for each file
  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    fileMap.set(normalizedPath, file.content);
    
    // Create blob URL for the file content
    const mimeType = getMimeType(normalizedPath);
    const blob = new Blob([file.content], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    objectUrls.set(normalizedPath, blobUrl);
  }
  
  // Create a root blob URL that serves as the base href
  const rootBlob = new Blob([''], { type: 'text/html' });
  const rootUrl = URL.createObjectURL(rootBlob);
  
  return {
    rootUrl,
    files: fileMap,
    objectUrls,
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
  <script src="popup-preview.js"></script>
</body>
</html>`;
  }
  
  // Ensure HTML has proper structure
  if (!html.includes('<html')) {
    html = `<!DOCTYPE html><html><head><title>Extension Popup</title></head><body>${html}</body></html>`;
  }
  
  // Replace relative asset paths with blob URLs
  html = replaceAssetPaths(html, fs);
  
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