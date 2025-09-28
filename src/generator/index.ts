import JSZip from 'jszip';

export type Features = {
  popup: boolean;
  background: boolean;
  contentScript: boolean;
  optionsPage: boolean;
  sidePanel: boolean;
};

type IconOptions = {
  mode: 'auto' | 'upload';
  colors?: { bg: string; border: string; text: string };
  uploadDataUrl?: string; // data URL of uploaded PNG/SVG
};

export type GenerateOptions = {
  name: string;
  description: string;
  version: string;
  author?: string;
  year?: string;
  features: Features;
  matches: string[];
  prompt: string;
  icons?: IconOptions; // optional icon configuration
};

type TokenMap = Record<string, string>;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function interpolate(text: string, tokens: TokenMap): string {
  let out = text;
  for (const [k, v] of Object.entries(tokens)) {
    const re = new RegExp(`{{\\s*${k}\\s*}}`, 'g');
    out = out.replace(re, v);
  }
  return out;
}

function composeManifest(opts: GenerateOptions) {
  const { name, description, version, features, matches } = opts;

  const manifest: any = {
    manifest_version: 3,
    name,
    description,
    version,
    icons: {
      16: 'icon.png',
      32: 'icon.png',
      48: 'icon.png',
      128: 'icon.png',
    },
  };

  if (features.popup) {
    manifest.action = {
      default_title: name,
      default_popup: 'popup.html',
      default_icon: 'icon.png',
    };
  }

  if (features.background) {
    manifest.background = {
      service_worker: 'service_worker.js',
      type: 'module',
    };
  }

  if (features.contentScript) {
    manifest.content_scripts = [
      {
        matches: matches && matches.length ? matches : ['https://*/*', 'http://*/*'],
        js: ['content_script.js'],
        run_at: 'document_idle',
      },
    ];
  }

  if (features.optionsPage) {
    manifest.options_page = 'options.html';
  }

  if (features.sidePanel) {
    manifest.side_panel = {
      default_path: 'side_panel.html',
    };
  }

  // Keep minimal permissions; users can add more as needed.
  manifest.permissions = [];

  return manifest;
}

async function makeIconBase64(size: number, label: string): Promise<string> {
  // Legacy: dark theme colors
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#121a34';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#7aa2f7';
  ctx.lineWidth = Math.max(2, Math.round(size / 16));
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
  ctx.fillStyle = '#e6e9f2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(size * 0.55)}px system-ui, sans-serif`;
  ctx.fillText(label, size / 2, Math.round(size * 0.56));
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

async function makeIconBase64Colored(size: number, label: string, colors: { bg: string; border: string; text: string }): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Background
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, size, size);
  // Accent border
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = Math.max(2, Math.round(size / 16));
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
  // Letter
  ctx.fillStyle = colors.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(size * 0.55)}px system-ui, sans-serif`;
  ctx.fillText(label, size / 2, Math.round(size * 0.56));
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

async function generateIconsBase64(name: string) {
  const letter = (name.trim()[0] || 'X').toUpperCase();
  const sizes = [16, 32, 48, 128];
  const out: Record<number, string> = {};
  for (const s of sizes) {
    out[s] = await makeIconBase64(s, letter);
  }
  return out;
}

async function generateIconsBase64WithColors(name: string, colors: { bg: string; border: string; text: string }) {
  const letter = (name.trim()[0] || 'X').toUpperCase();
  const sizes = [16, 32, 48, 128];
  const out: Record<number, string> = {};
  for (const s of sizes) {
    out[s] = await makeIconBase64Colored(s, letter, colors);
  }
  return out;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}

async function generateIconsFromUpload(dataUrl: string) {
  const sizes = [16, 32, 48, 128];
  const out: Record<number, string> = {};
  const img = await loadImage(dataUrl);
  for (const s of sizes) {
    const canvas = document.createElement('canvas');
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext('2d')!;
    // Clear transparent background
    ctx.clearRect(0, 0, s, s);
    // Fit image using contain while centering
    const scale = Math.min(s / img.width, s / img.height);
    const dw = Math.round(img.width * scale);
    const dh = Math.round(img.height * scale);
    const dx = Math.floor((s - dw) / 2);
    const dy = Math.floor((s - dh) / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, dx, dy, dw, dh);
    const b64 = canvas.toDataURL('image/png').split(',')[1];
    out[s] = b64;
  }
  return out;
}

const templates = {
  popupHtml: [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>{{NAME}}</title>',
    '  <style>',
    '    body{font:13px/1.4 system-ui, sans-serif; margin:0; padding:10px; width:320px;}',
    '    button{padding:8px 12px; border-radius:6px; border:0; background:#7aa2f7; color:#0a0f1f; font-weight:600; cursor:pointer;}',
    '  </style>',
    '</head>',
    '<body>',
    '  <h1 style="font-size:16px; margin:0 0 8px;">{{NAME}}</h1>',
    '  <p style="margin:0 0 10px; color:#555;">{{DESCRIPTION}}</p>',
    '  <button id="btn">Hello</button>',
    '  <script src="popup.js"></script>',
    '</body>',
    '</html>',
  ].join('\n'),

  popupJs: [
    `console.log('Popup loaded: {{NAME}} v{{VERSION}}');`,
    `document.getElementById('btn')?.addEventListener('click', () => {`,
    `  alert('Hello from {{NAME}}!');`,
    `});`,
  ].join('\n'),

  serviceWorkerJs: [
    `// Background service worker for {{NAME}}`,
    `console.log('Service worker running: {{NAME}} v{{VERSION}}');`,
    `chrome.runtime.onInstalled.addListener(() => {`,
    `  console.log('Installed: {{DESCRIPTION}}');`,
    `});`,
  ].join('\n'),

  contentScriptJs: [
    `// Content script injected on matched pages`,
    `console.log('Content script from {{NAME}} active');`,
  ].join('\n'),

  optionsHtml: [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>{{NAME}} Options</title>',
    '  <style>body{font:14px system-ui, sans-serif; padding:14px;}</style>',
    '</head>',
    '<body>',
    '  <h1>{{NAME}} Options</h1>',
    '  <p>Configure behavior here.</p>',
    '  <script src="options.js"></script>',
    '</body>',
    '</html>',
  ].join('\n'),

  optionsJs: [
    `console.log('Options page for {{NAME}}');`,
  ].join('\n'),

  sidePanelHtml: [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>{{NAME}} Side Panel</title>',
    '  <style>body{font:14px system-ui, sans-serif; padding:10px; width:300px;}</style>',
    '</head>',
    '<body>',
    '  <h2>{{NAME}} Side Panel</h2>',
    '  <p>{{DESCRIPTION}}</p>',
    '  <script src="side_panel.js"></script>',
    '</body>',
    '</html>',
  ].join('\n'),

  sidePanelJs: [
    `console.log('Side panel for {{NAME}}');`,
  ].join('\n'),

  readmeMd: [
    '# {{NAME}}',
    '',
    '{{DESCRIPTION}}',
    '',
    'Version: {{VERSION}}',
    '',
    'Author: {{AUTHOR}} {{YEAR}}',
    '',
    '---',
    '',
    'Prompt / Notes',
    '',
    '{{PROMPT}}',
    '',
    '## Development',
    '',
    '- Load this folder as an Unpacked extension in chrome://extensions.',
    '- Edit files and reload the extension.',
  ].join('\n'),
};

export async function generateZip(opts: GenerateOptions): Promise<void> {
  const zip = new JSZip();

  const pkgName = slugify(opts.name);
  const tokens: TokenMap = {
    NAME: opts.name,
    DESCRIPTION: opts.description || '',
    VERSION: opts.version,
    AUTHOR: opts.author || '',
    YEAR: opts.year || String(new Date().getFullYear()),
    PROMPT: opts.prompt || '',
    PACKAGE_NAME: pkgName,
    MATCHES: (opts.matches || []).join('\n'),
  };

  // Manifest
  const manifest = composeManifest(opts);
  zip.file('manifest.json', JSON.stringify(manifest, null, 2), { createFolders: true });

  // README
  zip.file('README.md', interpolate(templates.readmeMd, tokens));

  // Feature files
  if (opts.features.popup) {
    zip.file('popup.html', interpolate(templates.popupHtml, tokens));
    zip.file('popup.js', interpolate(templates.popupJs, tokens));
  }

  if (opts.features.background) {
    zip.file('service_worker.js', interpolate(templates.serviceWorkerJs, tokens));
  }

  if (opts.features.contentScript) {
    zip.file('content_script.js', interpolate(templates.contentScriptJs, tokens));
  }

  if (opts.features.optionsPage) {
    zip.file('options.html', interpolate(templates.optionsHtml, tokens));
    zip.file('options.js', interpolate(templates.optionsJs, tokens));
  }

  if (opts.features.sidePanel) {
    zip.file('side_panel.html', interpolate(templates.sidePanelHtml, tokens));
    zip.file('side_panel.js', interpolate(templates.sidePanelJs, tokens));
  }

  // Icons
  let icons: Record<number, string>;
  if (opts.icons?.mode === 'upload' && opts.icons.uploadDataUrl) {
    icons = await generateIconsFromUpload(opts.icons.uploadDataUrl);
  } else {
    const colors = opts.icons?.colors || { bg: '#121a34', border: '#7aa2f7', text: '#e6e9f2' };
    icons = await generateIconsBase64WithColors(opts.name, colors);
  }

// Save a single high-res image; 128px is a good default
zip.file('icon.png', icons[128], { base64: true });
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${pkgName}-${opts.version}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- AI helper: generate a ZIP from an already prepared list of files (AI output) ---
// Files must include manifest.json. If icons are missing and addIconsIfMissing=true, placeholder
// icons will be generated using either provided name initial or 'X'.
export async function generateZipFromFiles(
  files: { path: string; content: string }[],
  opts: {
    name: string;
    version?: string;
    addIconsIfMissing?: boolean;
    // Optional icon colors (same structure as automatic icons)
    colors?: { bg: string; border: string; text: string };
    downloadName?: string; // base filename for zip (without .zip)
  }
): Promise<void> {
  if (!Array.isArray(files) || !files.length) {
    throw new Error('No files supplied');
  }
  const hasManifest = files.some(f => f.path === 'manifest.json');
  if (!hasManifest) {
    throw new Error('manifest.json missing');
  }

  const zip = new JSZip();

  // Write provided files verbatim
  const existingPaths = new Set<string>();
  for (const f of files) {
    // Normalize simple leading slashes
    const normalized = f.path.replace(/^\/+/, '');
    existingPaths.add(normalized);
    zip.file(normalized, f.content);
  }

  // Attempt to parse manifest to discover declared icon paths
  let manifestIconsSpec: { size: number; path: string }[] = [];
  if (opts.addIconsIfMissing) {
    try {
      const manifestFile = files.find(f => f.path === 'manifest.json');
      if (manifestFile) {
        const manifestJson = JSON.parse(manifestFile.content);
        if (manifestJson && typeof manifestJson.icons === 'object' && manifestJson.icons) {
          for (const [k, v] of Object.entries(manifestJson.icons)) {
            if (typeof v === 'string') {
              const sizeNum = Number.parseInt(k, 10);
              manifestIconsSpec.push({
                size: Number.isFinite(sizeNum) ? sizeNum : 128,
                path: v.replace(/^\/+/, ''),
              });
            }
          }
        }
      }
    } catch {
      // swallow JSON errors; we only do best-effort augmentation
    }
  }

  // Helper to determine if any icon asset already exists
  const anyIconAssetPresent = () =>
    Array.from(existingPaths).some(p => /icon/i.test(p) && /\.(png|svg)$/i.test(p));

  const letter = (opts.name?.trim?.()[0] || 'X').toUpperCase();

  // Generate any missing manifest-declared icon assets
  if (opts.addIconsIfMissing && manifestIconsSpec.length) {
    const colors = opts.colors || { bg: '#121a34', border: '#7aa2f7', text: '#e6e9f2' };
    for (const spec of manifestIconsSpec) {
      if (!existingPaths.has(spec.path)) {
        // Reuse colored icon helper for arbitrary size
        const size = Math.max(16, Math.min(spec.size || 128, 512));
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = colors.bg;
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = Math.max(2, Math.round(size / 16));
        ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
        ctx.fillStyle = colors.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${Math.round(size * 0.55)}px system-ui, sans-serif`;
        ctx.fillText(letter, size / 2, Math.round(size * 0.56));
        const dataUrl = canvas.toDataURL('image/png').split(',')[1];
        zip.file(spec.path, dataUrl, { base64: true });
        existingPaths.add(spec.path);
      }
    }
  }

  // Fallback: if still no icon assets at all, create a single icon.png
  if (opts.addIconsIfMissing && !anyIconAssetPresent()) {
    const colors = opts.colors || { bg: '#121a34', border: '#7aa2f7', text: '#e6e9f2' };
    const icons = await generateIconsBase64WithColors(opts.name || 'X', colors);
    // Use 128px as the single icon size
    const path = 'icon.png';
    if (!existingPaths.has(path)) {
      zip.file(path, icons[128], { base64: true });
      existingPaths.add(path);
    }
  }

  // Fix manifest icon paths to use single icon.png
  if (opts.addIconsIfMissing) {
    try {
      const manifestFile = files.find(f => f.path === 'manifest.json');
      if (manifestFile) {
        const manifestJson = JSON.parse(manifestFile.content);
        let manifestUpdated = false;
        
        // Fix icons section
        if (manifestJson.icons) {
          manifestJson.icons = {
            16: 'icon.png',
            32: 'icon.png', 
            48: 'icon.png',
            128: 'icon.png'
          };
          manifestUpdated = true;
        }
        
        // Fix action default_icon
        if (manifestJson.action && manifestJson.action.default_icon) {
          manifestJson.action.default_icon = 'icon.png';
          manifestUpdated = true;
        }
        
        if (manifestUpdated) {
          zip.file('manifest.json', JSON.stringify(manifestJson, null, 2));
        }
      }
    } catch {
      // swallow JSON errors; we only do best-effort fixing
    }
  }

  const base = (opts.downloadName ||
    (opts.name || 'ai-extension')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
  ).replace(/-+/g, '-');

  const versionSegment = opts.version ? `-${opts.version}` : '';

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}${versionSegment}-ai.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}