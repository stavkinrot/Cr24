// extension-generator.ts
import JSZip from 'jszip';

/* ===== Types shared with popup/server ===== */
export type AIFile = { path: string; content: string };

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
type Manifest = Record<string, any>;

/**
 * Normalize a v3 manifest so the exported ZIP is functional even if the AI omitted bits.
 * Pass havePopupHtml=true when popup.html exists in the bundle.
 */
function normalizeManifest(m: Manifest, havePopupHtml: boolean): Manifest {
  const out: Manifest = {
    manifest_version: 3,
    name: m?.name || "CRX Generator Output",
    version: m?.version || "0.1.0",
    description: m?.description || "",
    icons: m?.icons || { 16: "icon.png", 32: "icon.png", 48: "icon.png", 128: "icon.png" },
    ...m,
  };

  // If the bundle has popup.html, ensure the manifest points to it
  if (havePopupHtml) {
    out.action = {
      ...(out.action || {}),
      default_popup: out?.action?.default_popup || "popup.html"
    };
  }

  // Permissions needed so your Simulate flow can inject code
  const perms = new Set([...(out.permissions || []), "scripting", "activeTab", "storage"]);
  out.permissions = [...perms];

  // Reasonable default host access (edit in UI later if needed)
  out.host_permissions = out.host_permissions || ["https://*/*", "http://*/*"];

  // If background was declared but not wired correctly, normalize to MV3 service worker
  if (out.background && !out.background.service_worker && !out.background.scripts) {
    out.background = { service_worker: "background.js" };
  }

  return out;
}

/** Ensure popup.html actually loads popup.js */
function ensurePopupHasScript(html: string): string {
  return /popup\.js/i.test(html)
    ? html
    : (html.replace(/<\/body>/i, `\n<script src="popup.js"></script>\n</body>`) ||
       (html + `\n<script src="popup.js"></script>`));
}

/* ===== Small utilities ===== */
function slugify(input: string): string {
  return (input || 'extension')
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

/** Normalize files for API / storage (trim leading slashes; coerce to string). */
export function normalizeFilesForApi(files: { path: string; content: any }[]): AIFile[] {
  return (files || []).map((f) => ({
    path: String(f?.path || '').replace(/^\/+/, ''),
    content: String(f?.content ?? ''),
  }));
}

/* ===== Manifest composer (for locally generated ZIP) ===== */
function composeManifest(opts: GenerateOptions) {
  const { name, description, version, features, matches } = opts;

  const manifest: any = {
    manifest_version: 3,
    name,
    description,
    version,
    icons: { 16: 'icon.png', 32: 'icon.png', 48: 'icon.png', 128: 'icon.png' },
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

  // Keep minimal permissions for generated bundle; users can add more as needed.
  manifest.permissions = ["scripting", "activeTab", "storage"];
  manifest.host_permissions = manifest.host_permissions || ["https://*/*", "http://*/*"];

  return manifest;
}

/* ===== Icon generation (canvas) ===== */
async function makeIconBase64(
  size: number,
  label: string,
  colors: { bg: string; border: string; text: string }
): Promise<string> {
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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.font = `${Math.round(size * 0.55)}px system-ui, sans-serif`;
  ctx.fillText(label, size / 2, Math.round(size * 0.56));

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

async function generateIconsBase64WithColors(
  name: string,
  colors: { bg: string; border: string; text: string }
) {
  const letter = (name?.trim?.()[0] || 'X').toUpperCase();
  const sizes = [16, 32, 48, 128];
  const out: Record<number, string> = {};
  for (const s of sizes) {
    out[s] = await makeIconBase64(s, letter, colors);
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

/* ===== Simple templates for local (non-AI) generation ===== */
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

  optionsJs: [`console.log('Options page for {{NAME}}');`].join('\n'),

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

  sidePanelJs: [`console.log('Side panel for {{NAME}}');`].join('\n'),

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

/* ===== Local (non-AI) generator: build ZIP from options ===== */
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

/* ===== AI helper: build ZIP from AI-returned files ===== */
export async function generateZipFromFiles(
  files: { path: string; content: string }[],
  opts: {
    name: string;
    version?: string;
    addIconsIfMissing?: boolean;
    colors?: { bg: string; border: string; text: string };
    downloadName?: string;
  }
): Promise<void> {
  if (!Array.isArray(files) || !files.length) throw new Error("No files supplied");

  // --- helpers (scoped, no extra imports/types needed) ---
  const normPath = (p: string) => String(p || "").replace(/^\/+/, "");
  const addToZip = (zip: JSZip, map: Map<string, string>, p: string, c: string) => {
    p = normPath(p);
    map.set(p, c);
    zip.file(p, c);
  };

  const normalizeManifestLocal = (m: Manifest, havePopupHtml: boolean): Manifest => {
    const out: Manifest = {
      manifest_version: 3,
      name: m?.name || "CRX Generator Output",
      version: m?.version || "0.1.0",
      description: m?.description || "",
      icons: m?.icons || { 16: "icon.png", 32: "icon.png", 48: "icon.png", 128: "icon.png" },
      ...m,
    };

    // Ensure popup points to popup.html if it exists
    if (havePopupHtml) {
      out.action = {
        ...(out.action || {}),
        default_popup: out?.action?.default_popup || "popup.html"
      };
    }

    // Permissions that make simulation/content injection work
    const perms = new Set([...(out.permissions || []), "scripting", "activeTab", "storage"]);
    out.permissions = [...perms];

    // Reasonable default host access (adjust in UI if needed)
    out.host_permissions = out.host_permissions || ["https://*/*", "http://*/*"];

    // Normalize background to MV3 SW if present but malformed
    if (out.background && !out.background.service_worker && !out.background.scripts) {
      out.background = { service_worker: "background.js" };
    }

    return out;
  };

  // --- stage 1: write everything verbatim, track what exists ---
  const zip = new JSZip();
  const existing = new Map<string, string>();
  for (const f of files) addToZip(zip, existing, f.path, String(f.content ?? ""));

  // --- stage 2: parse + normalize manifest ---
  const manPath = "manifest.json";
  const rawMan = existing.get(manPath);
  if (!rawMan) throw new Error("manifest.json missing");

  let manifest: Manifest;
  try {
    manifest = JSON.parse(rawMan);
  } catch {
    throw new Error("manifest.json is not valid JSON");
  }

  const havePopupHtml = existing.has("popup.html");
  manifest = normalizeManifestLocal(manifest, havePopupHtml);

  // --- stage 3: popup guarantees (only if popup.html is present) ---
  if (havePopupHtml) {
    const fixedPopup = ensurePopupHasScript(existing.get("popup.html")!);
    if (fixedPopup !== existing.get("popup.html")) addToZip(zip, existing, "popup.html", fixedPopup);

    if (!existing.has("popup.js")) {
      addToZip(
        zip,
        existing,
        "popup.js",
        `document.addEventListener('DOMContentLoaded',()=>{console.log('[Popup] ready');});`
      );
    }

    if (!existing.has("styles.css")) {
      addToZip(zip, existing, "styles.css", `body{font:13px system-ui,sans-serif;padding:10px}`);
    }
  }

  // --- stage 4: icons (best-effort, preserves your previous behavior) ---
  const anyIconAssetPresent = () =>
    [...existing.keys()].some(p => /icon/i.test(p) && /\.(png|svg)$/i.test(p));

  let manifestIconsSpec: { size: number; path: string }[] = [];
  try {
    if (manifest?.icons && typeof manifest.icons === "object") {
      for (const [k, v] of Object.entries(manifest.icons)) {
        if (typeof v === "string") {
          const sizeNum = Number.parseInt(k, 10);
          manifestIconsSpec.push({
            size: Number.isFinite(sizeNum) ? sizeNum : 128,
            path: normPath(v),
          });
        }
      }
    }
  } catch {
    /* ignore */
  }

  const letter = (opts.name?.trim?.()[0] || "X").toUpperCase();
  const colors = opts.colors || { bg: "#121a34", border: "#7aa2f7", text: "#e6e9f2" };

  if (opts.addIconsIfMissing && manifestIconsSpec.length) {
    for (const spec of manifestIconsSpec) {
      if (!existing.has(spec.path)) {
        const size = Math.max(16, Math.min(spec.size || 128, 512));
        const b64 = await makeIconBase64(size, letter, colors);
        zip.file(spec.path, b64, { base64: true });
        existing.set(spec.path, "__binary__");
      }
    }
  }

  if (opts.addIconsIfMissing && !anyIconAssetPresent()) {
    const auto = await generateIconsBase64WithColors(opts.name || "X", colors);
    if (!existing.has("icon.png")) {
      zip.file("icon.png", auto[128], { base64: true });
      existing.set("icon.png", "__binary__");
    }

    // Point manifest to the single icon.png
    manifest.icons = { 16: "icon.png", 32: "icon.png", 48: "icon.png", 128: "icon.png" };
    if (manifest.action?.default_icon) manifest.action.default_icon = "icon.png";
  }

  if (manifest.background?.service_worker === "background.js" && !existing.has("background.js")) {
    addToZip(zip, existing, "background.js", `chrome.runtime.onInstalled.addListener(()=>console.log('[BG] installed'));`);
  }

  const declaresPopup = !!manifest.action?.default_popup;
  if (declaresPopup && !existing.has("popup.html")) {
    addToZip(
      zip,
      existing,
      "popup.html",
      `<!doctype html><meta charset="utf-8"><body><h1>${manifest.name || "Popup"}</h1><script src="popup.js"></script></body>`
    );

    if (!existing.has("popup.js")) {
      addToZip(zip, existing, "popup.js", `console.log('[Popup] ready');`);
    }

    if (!existing.has("styles.css")) {
      addToZip(zip, existing, "styles.css", `body{font:13px system-ui,sans-serif;padding:10px}`);
    }
  }

  // --- write back normalized manifest ---
  addToZip(zip, existing, manPath, JSON.stringify(manifest, null, 2));

  // --- final: build & download ---
  const base = (opts.downloadName || (opts.name || "ai-extension").toLowerCase().replace(/[^a-z0-9_-]+/g, "-")).replace(/-+/g, "-");
  const versionSegment = opts.version ? `-${opts.version}` : "";

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${base}${versionSegment}-ai.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}