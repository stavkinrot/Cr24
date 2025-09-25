import { generateZip } from './generator/index';

function $(id: string) {
  return document.getElementById(id)!;
}

function parseMatches(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type Theme = 'light' | 'dark';

function getStoredTheme(): Theme | null {
  const v = localStorage.getItem('theme');
  return v === 'light' || v === 'dark' ? (v as Theme) : null;
}

function getPreferredTheme(): Theme {
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

document.addEventListener('DOMContentLoaded', () => {
  const form = $('gen-form') as HTMLFormElement;
  const btn = $('generateBtn') as HTMLButtonElement;
  const themeToggle = $('themeToggle') as HTMLButtonElement;

  // Theme init
  const initial = getStoredTheme() || getPreferredTheme();
  applyTheme(initial);
  themeToggle.textContent = initial === 'light' ? 'Dark mode' : 'Light mode';
  themeToggle.addEventListener('click', () => {
    const current = (document.documentElement.getAttribute('data-theme') as Theme) || 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem('theme', next);
    themeToggle.textContent = next === 'light' ? 'Dark mode' : 'Light mode';
  });

  // Icons UI
  const modeAuto = $('icon-mode-auto') as HTMLInputElement;
  const modeUpload = $('icon-mode-upload') as HTMLInputElement;
  const inpBg = $('icon-bg') as HTMLInputElement;
  const inpBorder = $('icon-border') as HTMLInputElement;
  const inpText = $('icon-text') as HTMLInputElement;
  const inpUpload = $('icon-upload') as HTMLInputElement;
  const preview = $('icon-preview') as HTMLDivElement;

  let uploadDataUrl: string | null = null;

  function drawInitialIcon(size: number, colors: { bg: string; border: string; text: string }, letter: string): HTMLCanvasElement {
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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.font = `${Math.round(size * 0.55)}px system-ui, sans-serif`;
    ctx.fillText(letter, size / 2, Math.round(size * 0.56));
    return canvas;
  }

  function drawUploadIcon(size: number, dataUrl: string): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, size, size);
        const scale = Math.min(size / img.width, size / img.height);
        const dw = Math.round(img.width * scale);
        const dh = Math.round(img.height * scale);
        const dx = Math.floor((size - dw) / 2);
        const dy = Math.floor((size - dh) / 2);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, dx, dy, dw, dh);
        resolve(canvas);
      };
      img.onerror = (e) => reject(e);
      img.src = dataUrl;
    });
  }

  function clearPreview() {
    preview.innerHTML = '';
  }

  async function renderPreview() {
    clearPreview();
    const sizes = [16, 32, 48, 128];
    if (modeUpload.checked && uploadDataUrl) {
      for (const s of sizes) {
        const c = await drawUploadIcon(s, uploadDataUrl);
        c.style.marginRight = '6px';
        c.title = `${s}x${s}`;
        preview.appendChild(c);
      }
    } else {
      const colors = { bg: inpBg.value, border: inpBorder.value, text: inpText.value };
      const letter = ((($('name') as HTMLInputElement).value.trim()[0]) || 'X').toUpperCase();
      for (const s of sizes) {
        const c = drawInitialIcon(s, colors, letter);
        c.style.marginRight = '6px';
        c.title = `${s}x${s}`;
        preview.appendChild(c);
      }
    }
  }

  function syncUI() {
    const auto = modeAuto.checked;
    inpBg.disabled = !auto;
    inpBorder.disabled = !auto;
    inpText.disabled = !auto;
    inpUpload.disabled = auto;
  }

  function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  // Wire up icon UI events
  modeAuto?.addEventListener('change', () => { syncUI(); renderPreview(); });
  modeUpload?.addEventListener('change', () => { syncUI(); renderPreview(); });
  inpBg?.addEventListener('input', renderPreview);
  inpBorder?.addEventListener('input', renderPreview);
  inpText?.addEventListener('input', renderPreview);
  inpUpload?.addEventListener('change', async () => {
    const f = inpUpload.files?.[0];
    if (!f) return;
    // Accept SVG/PNG only
    if (!/image\/(png|svg\+xml)/.test(f.type)) {
      alert('Please choose a PNG or SVG file.');
      return;
    }
    uploadDataUrl = await readFileAsDataURL(f);
    await renderPreview();
  });

  // Initial state
  syncUI();
  renderPreview();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = ( $('name') as HTMLInputElement ).value.trim();
    const description = ( $('description') as HTMLTextAreaElement ).value.trim();
    const version = ( $('version') as HTMLInputElement ).value.trim();
    const author = ( $('author') as HTMLInputElement ).value.trim();
    const yearInput = ( $('year') as HTMLInputElement ).value.trim();
    const year = yearInput || String(new Date().getFullYear());

    const featPopup = ( $('feat-popup') as HTMLInputElement ).checked;
    const featBg = ( $('feat-bg') as HTMLInputElement ).checked;
    const featCs = ( $('feat-cs') as HTMLInputElement ).checked;
    const featOptions = ( $('feat-options') as HTMLInputElement ).checked;
    const featSidePanel = ( $('feat-sidepanel') as HTMLInputElement ).checked;

    const matches = parseMatches( ( $('matches') as HTMLTextAreaElement ).value );
    const prompt = ( $('prompt') as HTMLTextAreaElement ).value.trim();

    if (!name) {
      alert('Name is required');
      return;
    }
    if (!/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(version)) {
      alert('Version must be semver, e.g. 0.1.0');
      return;
    }
    if (featCs && matches.length === 0) {
      alert('Provide at least one match pattern for the content script.');
      return;
    }

    const iconsOpt =
      modeUpload.checked && uploadDataUrl
        ? { mode: 'upload' as const, uploadDataUrl }
        : { mode: 'auto' as const, colors: { bg: inpBg.value, border: inpBorder.value, text: inpText.value } };

    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
      await generateZip({
        name,
        description,
        version,
        author,
        year,
        features: {
          popup: featPopup,
          background: featBg,
          contentScript: featCs,
          optionsPage: featOptions,
          sidePanel: featSidePanel,
        },
        matches,
        prompt,
        icons: iconsOpt,
      });
    } catch (err) {
      console.error(err);
      alert('Failed to generate ZIP. See console for details.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate ZIP';
    }
  });
});