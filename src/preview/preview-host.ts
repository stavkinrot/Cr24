type AIFile = { path: string; content: string };

function normalizePath(p: string): string {
  return p.replace(/^\.?\/*/, '');
}

function getMime(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'html': return 'text/html';
    case 'css': return 'text/css';
    case 'js': return 'application/javascript';
    case 'json': return 'application/json';
    case 'svg': return 'image/svg+xml';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    default: return 'text/plain';
  }
}

function removeInlineHandlers(html: string): string {
  html = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  html = html.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  return html;
}

async function buildPreviewHtml(files: AIFile[], stageOrigin: string): Promise<{ html: string; urls: string[] }> {
  const byPath = new Map<string, string>();
  for (const f of files) byPath.set(normalizePath(f.path), f.content);
  let html = byPath.get('popup.html') || '<!doctype html><html><head><meta charset="utf-8"><title>Preview</title></head><body><div>Missing popup.html</div></body></html>';
  html = removeInlineHandlers(html);
  // strip existing scripts, we will add external tags
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  const urls: string[] = [];
  const addBlob = (path: string): string | null => {
    const content = byPath.get(normalizePath(path));
    if (!content) return null;
    const blob = new Blob([content], { type: getMime(path) });
    const url = URL.createObjectURL(blob);
    urls.push(url);
    return url;
  };

  // add CSS
  const cssLinks: string[] = [];
  for (const [p] of byPath) {
    if (p.endsWith('.css')) {
      const u = addBlob(p);
      if (u) cssLinks.push(`<link rel="stylesheet" href="${u}">`);
    }
  }
  html = html.replace(/(<\/head>)/i, `${cssLinks.join('\n')}\n$1`);

  // add generated JS
  const jsTags: string[] = [];
  for (const [p] of byPath) {
    if (p.endsWith('.js')) {
      const u = addBlob(p);
      if (u) jsTags.push(`<script src="${u}"></script>`);
    }
  }
  html = html.replace(/(<\/body>)/i, `${jsTags.join('\n')}\n$1`);

  // Inject preview system scripts (chrome-shim first, then dom-handlers)
  // In HTTP host (dev server), fetch TS modules via Vite, blob them for the inner iframe
  try {
    if (location.origin.startsWith('http')) {
      const [shimResp, domResp] = await Promise.all([
        fetch('/preview/chrome-shim.js'),
        fetch('/preview/dom-handlers.js')
      ]);
      const [shimBuf, domBuf] = await Promise.all([shimResp.arrayBuffer(), domResp.arrayBuffer()]);
      const shimBlob = URL.createObjectURL(new Blob([shimBuf], { type: 'application/javascript' }));
      const domBlob = URL.createObjectURL(new Blob([domBuf], { type: 'application/javascript' }));
      urls.push(shimBlob, domBlob);
      html = html.replace(/(<\/head>)/i, `<script type="module" src="${shimBlob}"></script>\n$1`);
      html = html.replace(/(<\/body>)/i, `<script type="module" src="${domBlob}"></script>\n$1`);
    } else {
      const shimUrl = chrome.runtime.getURL('preview/chrome-shim.js');
      const domHandlersUrl = chrome.runtime.getURL('preview/dom-handlers.js');
      html = html.replace(/(<\/head>)/i, `<script src="${shimUrl}"></script>\n$1`);
      html = html.replace(/(<\/body>)/i, `<script src="${domHandlersUrl}"></script>\n$1`);
    }
  } catch {}

  // base and CSP
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' chrome-extension: blob: 'wasm-unsafe-eval'; script-src-elem 'self' chrome-extension: blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src ${stageOrigin} http://localhost:* http://127.0.0.1:*; object-src 'none'; base-uri 'self';">`;
  html = html.replace(/(<head[^>]*>)/i, `$1\n${cspMeta}`);

  return { html, urls };
}

async function mountPreview(files: AIFile[]): Promise<void> {
  const stage = document.getElementById('stage') as HTMLDivElement;
  stage.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  stage.appendChild(iframe);

  const { html, urls } = await buildPreviewHtml(files, location.origin);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  iframe.src = url;

  iframe.addEventListener('load', () => {
    // clean after load revoke html url later
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
}

window.addEventListener('message', (e: MessageEvent) => {
  if (!e.data) return;
  if (e.data.type === 'PREVIEW_FILES') {
    try {
      const files: AIFile[] = e.data.files || [];
      mountPreview(files);
      (e.source as WindowProxy)?.postMessage({ type: 'PREVIEW_READY' }, '*');
    } catch (err: any) {
      (e.source as WindowProxy)?.postMessage({ type: 'PREVIEW_ERROR', message: String(err?.message || err) }, '*');
    }
  }
});

// Notify parent host is ready
parent?.postMessage({ type: 'PREVIEW_HOST_READY' }, '*');


