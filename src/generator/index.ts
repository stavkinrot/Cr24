import JSZip from 'jszip';

export type Features = {
  popup: boolean;
  background: boolean;
  contentScript: boolean;
  optionsPage: boolean;
  sidePanel: boolean;
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
      16: 'icons/16.png',
      32: 'icons/32.png',
      48: 'icons/48.png',
      128: 'icons/128.png',
    },
  };

  if (features.popup) {
    manifest.action = {
      default_title: name,
      default_popup: 'popup.html',
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
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Background
  ctx.fillStyle = '#121a34';
  ctx.fillRect(0, 0, size, size);
  // Accent border
  ctx.strokeStyle = '#7aa2f7';
  ctx.lineWidth = Math.max(2, Math.round(size / 16));
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
  // Letter
  ctx.fillStyle = '#e6e9f2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(size * 0.55)}px system-ui, sans-serif`;
  ctx.fillText(label, size / 2, Math.round(size * 0.56));
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1]; // base64 payload
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
  const icons = await generateIconsBase64(opts.name);
  for (const size of [16, 32, 48, 128] as const) {
    zip.file(`icons/${size}.png`, icons[size], { base64: true });
  }

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