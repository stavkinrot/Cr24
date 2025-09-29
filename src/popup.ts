import { generateZip, generateZipFromFiles } from './generator/index';

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

  /* ================= AI (Server Proxy) Section ================= */
  const aiModelSel = document.getElementById('ai-model') as HTMLSelectElement | null;
  const aiTempRange = document.getElementById('ai-temp') as HTMLInputElement | null;
  const aiTempVal = document.getElementById('ai-temp-val') as HTMLSpanElement | null;
  const aiPlanBtn = document.getElementById('ai-plan') as HTMLButtonElement | null;
  const aiGenBtn = document.getElementById('ai-generate') as HTMLButtonElement | null;
  const aiDlBtn = document.getElementById('ai-download') as HTMLButtonElement | null;
  const aiSimBtn = document.getElementById('ai-simulate') as HTMLButtonElement | null;
  const aiRetryBtn = document.getElementById('ai-retry') as HTMLButtonElement | null;
  const aiStatus = document.getElementById('ai-status') as HTMLDivElement | null;
  const aiPlanFilesBox = document.getElementById('ai-plan-files') as HTMLDivElement | null;
  const aiFilesReviewBox = document.getElementById('ai-files-review') as HTMLDivElement | null;
  const aiSimLogs = document.getElementById('ai-sim-logs') as HTMLDivElement | null;
  const aiFeedbackBox = document.getElementById('ai-feedback-box') as HTMLDivElement | null;
  const aiFeedback = document.getElementById('ai-feedback') as HTMLTextAreaElement | null;
  const aiApplyFeedback = document.getElementById('ai-apply-feedback') as HTMLButtonElement | null;

  type AIPlan = {
    planVersion: number;
    summary: string;
    features: Record<string, boolean>;
    files: { path: string; purpose: string }[];
    risks?: string[];
  } | null;

  type AIGeneratedFile = { path: string; content: string; included: boolean };
 
  let currentPlan: AIPlan = null;
  let generatedFiles: AIGeneratedFile[] = [];
  let lastPhase: 'plan' | 'generate' | null = null;
  let feedbackNotes: string = '';
 
  // Local dev proxy base (replace with deployed Vercel base when ready)
  const API_BASE = 'http://localhost:3000';

  function setAIStatus(msg: string, isError = false) {
    if (!aiStatus) return;
    aiStatus.textContent = msg;
    aiStatus.style.color = isError ? 'var(--danger, #d33)' : 'var(--muted, #888)';
    if (aiRetryBtn) {
      if (isError && lastPhase) {
        aiRetryBtn.disabled = false;
        aiRetryBtn.style.display = 'inline-block';
      } else {
        aiRetryBtn.disabled = true;
        aiRetryBtn.style.display = 'none';
      }
    }
  }

  function renderPlanFiles() {
    if (!aiPlanFilesBox) return;
    aiPlanFilesBox.innerHTML = '';
    if (!currentPlan) return;
    const ul = document.createElement('ul');
    ul.style.margin = '0';
    ul.style.padding = '0 0 0 16px';
    currentPlan.files.forEach(f => {
      const li = document.createElement('li');
      li.style.fontSize = '12px';
      li.textContent = `${f.path} – ${f.purpose}`;
      ul.appendChild(li);
    });
    aiPlanFilesBox.appendChild(ul);
    if (currentPlan.risks?.length) {
      const risks = document.createElement('div');
      risks.style.fontSize = '11px';
      risks.style.marginTop = '6px';
      risks.innerHTML = '<strong>Risks:</strong> ' + currentPlan.risks.join('; ');
      aiPlanFilesBox.appendChild(risks);
    }
  }

  function renderGeneratedFiles() {
    if (!aiFilesReviewBox) return;
    aiFilesReviewBox.style.display = 'block';
    aiFilesReviewBox.innerHTML = '';
    if (!generatedFiles.length) {
      aiFilesReviewBox.textContent = 'No files generated.';
      return;
    }
    const frag = document.createDocumentFragment();
    generatedFiles.forEach(f => {
      const wrap = document.createElement('div');
      wrap.style.border = '1px solid var(--border,#333)';
      wrap.style.borderRadius = '4px';
      wrap.style.marginBottom = '6px';
      wrap.style.padding = '4px 6px';
      wrap.style.fontSize = '12px';

      const head = document.createElement('div');
      head.style.display = 'flex';
      head.style.alignItems = 'center';
      head.style.gap = '6px';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = f.included;
      cb.addEventListener('change', () => { f.included = cb.checked; });

      const strong = document.createElement('strong');
      strong.textContent = f.path;

      const size = new Blob([f.content]).size;
      const sizeSpan = document.createElement('span');
      sizeSpan.textContent = `(${size} B)`;
      sizeSpan.style.opacity = '0.7';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = 'View';
      toggle.style.marginLeft = 'auto';
      toggle.style.fontSize = '11px';

      const pre = document.createElement('pre');
      pre.style.display = 'none';
      pre.style.whiteSpace = 'pre';
      pre.style.overflow = 'auto';
      pre.style.marginTop = '4px';
      pre.textContent = f.content;

      toggle.addEventListener('click', () => {
        const open = pre.style.display === 'block';
        pre.style.display = open ? 'none' : 'block';
        toggle.textContent = open ? 'View' : 'Hide';
      });

      head.appendChild(cb);
      head.appendChild(strong);
      head.appendChild(sizeSpan);
      head.appendChild(toggle);
      wrap.appendChild(head);
      wrap.appendChild(pre);
      frag.appendChild(wrap);
    });
    aiFilesReviewBox.appendChild(frag);
  }

  async function postPhase(phase: 'plan' | 'generate', extra: any = {}) {
    const payload: any = {
      phase,
      prompt: ( $('prompt') as HTMLTextAreaElement )?.value || '',
      features: {
        popup: ( $('feat-popup') as HTMLInputElement )?.checked || false,
        background: ( $('feat-bg') as HTMLInputElement )?.checked || false,
        contentScript: ( $('feat-cs') as HTMLInputElement )?.checked || false,
        optionsPage: ( $('feat-options') as HTMLInputElement )?.checked || false,
        sidePanel: ( $('feat-sidepanel') as HTMLInputElement )?.checked || false,
      },
      matches: parseMatches( ( $('matches') as HTMLTextAreaElement )?.value || '' ),
      model: aiModelSel?.value || 'gpt-4o-mini',
      temperature: aiTempRange ? Number(aiTempRange.value) : 0.4,
      ...extra
    };

    const resp = await fetch(`${API_BASE}/api/extension-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 300)}`);
    }
    return resp.json();
  }

  async function handlePlan() {
    if (!aiPlanBtn) return;
    aiPlanBtn.disabled = true;
    aiGenBtn && (aiGenBtn.disabled = true);
    aiDlBtn && (aiDlBtn.disabled = true);
    if (aiRetryBtn) { aiRetryBtn.disabled = true; aiRetryBtn.style.display = 'none'; }
    lastPhase = 'plan';
    setAIStatus('Planning...');
    aiPlanFilesBox && (aiPlanFilesBox.innerHTML = '');
    try {
      const data = await postPhase('plan');
      currentPlan = data.plan;
      renderPlanFiles();
      setAIStatus('Plan ready.');
      aiGenBtn && (aiGenBtn.disabled = false);
    } catch (e: any) {
      setAIStatus(`Plan failed: ${e.message}`, true);
    } finally {
      aiPlanBtn.disabled = false;
    }
  }

  async function handleGenerate() {
    if (!currentPlan || !aiGenBtn) return;
    aiGenBtn.disabled = true;
    aiPlanBtn && (aiPlanBtn.disabled = true);
    aiDlBtn && (aiDlBtn.disabled = true);
    if (aiRetryBtn) { aiRetryBtn.disabled = true; aiRetryBtn.style.display = 'none'; }
    lastPhase = 'generate';
    setAIStatus('Generating files...');
    aiFilesReviewBox && (aiFilesReviewBox.style.display = 'none');
    try {
      const data = await postPhase('generate', { plan: currentPlan });
      generatedFiles = (data.files || []).map((f: any) => ({ ...f, included: true }));
      renderGeneratedFiles();
      // Persist immediately with timestamp for short-term restore
      try {
        const key = 'crxgen.generatedFiles';
        const payload = { ts: Date.now(), files: generatedFiles };
        localStorage.setItem(key, JSON.stringify(payload));
      } catch {}
      setAIStatus('Files generated.');
      aiDlBtn && (aiDlBtn.disabled = false);
    } catch (e: any) {
      setAIStatus(`Generate failed: ${e.message}`, true);
    } finally {
      aiGenBtn.disabled = false;
      aiPlanBtn && (aiPlanBtn.disabled = false);
    }
  }

  async function handleDownloadAI() {
    if (!generatedFiles.length || !aiDlBtn) return;
    aiDlBtn.disabled = true;
    setAIStatus('Preparing ZIP...');
    try {
      const selected = generatedFiles.filter(f => f.included);
      if (!selected.length) throw new Error('No files selected');
      await generateZipFromFiles(
        selected.map(f => ({ path: f.path, content: f.content })),
        {
          name: ( $('name') as HTMLInputElement )?.value || 'AI Extension',
          version: ( $('version') as HTMLInputElement )?.value || '0.1.0',
          addIconsIfMissing: true
        }
      );
      setAIStatus('ZIP downloaded.');
    } catch (e: any) {
      setAIStatus(`ZIP failed: ${e.message}`, true);
    } finally {
      aiDlBtn.disabled = false;
    }
  }

  /* ================= Simulator ================= */
  type ChromeAPIs = Partial<typeof chrome> | any;

  function createChromeStubs(): ChromeAPIs {
    const listeners: Record<string, Function[]> = {};
    const on = (key: string) => ({
      addListener: (fn: Function) => {
        (listeners[key] ||= []).push(fn);
      }
    });
    const runtimeId = 'simulated-extension';
    const api = {
      runtime: {
        id: runtimeId,
        getURL: (path: string) => new URL(path, location.href).toString(),
        onMessage: on('runtime.onMessage'),
        sendMessage: (msg: any) => {
          (listeners['runtime.onMessage'] || []).forEach(fn => {
            try { fn(msg, { id: runtimeId }, () => {}); } catch {}
          });
        }
      },
      storage: {
        local: {
          _data: {} as Record<string, any>,
          get: (keys?: any, cb?: (items: any) => void) => {
            const result = keys ? Object.fromEntries(Object.keys(keys).map(k => [k, (chrome as any)?.storage?.local?._data?.[k]])) : (chrome as any)?.storage?.local?._data || {};
            cb && cb(result);
            return Promise.resolve(result);
          },
          set: (items: any, cb?: () => void) => {
            Object.assign((chrome as any).storage.local._data, items);
            cb && cb();
            return Promise.resolve();
          }
        }
      },
      tabs: {
        create: ({ url }: { url: string }) => {
          try { (window as any).parent?._crxSimNav?.(url); }
          catch { /* noop */ }
        },
        query: (_q: any, cb: Function) => cb([{ id: 0 }]),
        update: (_id: number, { url }: { url: string }) => {
          try { (window as any).parent?._crxSimNav?.(url); }
          catch { /* noop */ }
        }
      }
    } as any;
    // Allow content script to post back logs
    (api as any)._log = (type: 'log'|'error', payload: any) => {
      if (aiSimLogs) {
        aiSimLogs.style.display = 'block';
        const line = document.createElement('div');
        line.style.whiteSpace = 'pre-wrap';
        line.style.color = type === 'error' ? 'var(--danger,#d33)' : 'inherit';
        line.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload);
        aiSimLogs.appendChild(line);
        aiSimLogs.scrollTop = aiSimLogs.scrollHeight;
      }
    };
    return api;
  }

  // Disabled sandbox path to avoid MV3 page CSP issues; rely on chrome.scripting injection only
  function runInIsolatedEval(_sourceCode: string): void {
    setAIStatus('Simulation fallback disabled due to CSP. Please run from a Chrome extension popup with scripting permission.', true);
  }

  function navigateCurrentTab(url: string): void {
    const c: any = (window as any).chrome;
    if (c && c.tabs && typeof c.tabs.query === 'function' && typeof c.tabs.update === 'function') {
      try {
        c.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
          const tabId = tabs && tabs[0] && tabs[0].id;
          if (tabId != null) {
            c.tabs.update(tabId, { url });
          } else {
            window.location.assign(url);
          }
        });
        return;
      } catch {}
    }
    // Fallback: navigate this page
    window.location.assign(url);
  }

  function extractContentScriptFromGenerated(): string | null {
    // 1) Try manifest.json content_scripts
    try {
      const manifestFile = generatedFiles.find(f => f.path === 'manifest.json' && f.included);
      if (manifestFile) {
        const mf = JSON.parse(manifestFile.content);
        const scripts: string[] = [];
        const list = Array.isArray(mf.content_scripts) ? mf.content_scripts : [];
        for (const entry of list) {
          const jsArr = Array.isArray(entry.js) ? entry.js : [];
          for (const p of jsArr) {
            const file = generatedFiles.find(f => f.path === p && f.included);
            if (file) scripts.push(file.content);
          }
        }
        if (scripts.length) return scripts.join('\n;\n');
      }
    } catch {}
    // 2) Fallback: explicit content_script.js
    const byPath = generatedFiles.find(f => /content_script\.js$/i.test(f.path) && f.included);
    if (byPath) return byPath.content;
    // 3) Fallback: any included .js files concatenated
    const anyJs = generatedFiles.filter(f => /\.js$/i.test(f.path) && f.included);
    if (anyJs.length) return anyJs.map(f => f.content).join('\n;\n');
    return null;
  }

  function simulateDemoHelloWorld(): void {
    // Simple demo: open Google search for "hello world"
    const url = 'https://www.google.com/search?q=' + encodeURIComponent('hello world');
    navigateCurrentTab(url);
  }

  async function handleSimulate() {
    if (!aiSimBtn) return;
    aiSimBtn.disabled = true;
    setAIStatus('Simulating...');
    if (aiSimLogs) { aiSimLogs.innerHTML = ''; aiSimLogs.style.display = 'block'; }
    try {
      const code = extractContentScriptFromGenerated();
      if (code) {
        // Prefer real tab injection if available
        const c: any = (window as any).chrome;
        if (c && c.scripting && typeof c.tabs?.query === 'function') {
          c.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
            const tabId = tabs && tabs[0] && tabs[0].id;
            if (tabId == null) {
              setAIStatus('No active tab found for injection.', true);
              if (aiFeedbackBox) aiFeedbackBox.style.display = 'block';
              return;
            }
            // Use MAIN world injection to avoid CSP issues in isolated world
            c.scripting.executeScript({
              target: { tabId },
              world: 'MAIN',
              args: [code],
              func: (codeStr: string) => {
                try {
                  // Install logging hooks that forward to popup via runtime.sendMessage
                  try {
                    const __origLog = console.log; const __origErr = console.error;
                    console.log = function(...args: any[]){ try { chrome.runtime.sendMessage({type:'sim-log', level:'log', args:args.map(a=>''+a)}); } catch(_){}; return (__origLog as any).apply(console, args as any); } as any;
                    console.error = function(...args: any[]){ try { chrome.runtime.sendMessage({type:'sim-log', level:'error', args:args.map(a=>''+a)}); } catch(_){}; return (__origErr as any).apply(console, args as any); } as any;
                  } catch(_) {}
                  
                  // Execute in main world where CSP is more permissive for extension scripts
                  const script = document.createElement('script');
                  script.textContent = codeStr;
                  document.documentElement.appendChild(script);
                  script.remove();
                } catch (e) {
                  try { console.error((e as any)?.stack || String(e)); } catch(_){ }
                }
              }
            }, () => {
              const lastError = c.runtime && c.runtime.lastError && c.runtime.lastError.message;
              if (lastError) {
                setAIStatus(`Injection failed: ${lastError}`, true);
              } else {
                setAIStatus('Content script simulated (in page).');
              }
              if (aiFeedbackBox) aiFeedbackBox.style.display = 'block';
            });
          });
        } else {
          setAIStatus('Simulation requires Chrome extension environment (scripting API).', true);
          if (aiFeedbackBox) aiFeedbackBox.style.display = 'block';
        }
      } else {
        // No generated files or no JS present; run demo
        simulateDemoHelloWorld();
        setAIStatus('Demo simulated.');
        if (aiFeedbackBox) aiFeedbackBox.style.display = 'block';
      }
    } catch (e: any) {
      setAIStatus(`Simulation failed: ${e.message}`, true);
    } finally {
      aiSimBtn.disabled = false;
    }
  }

  function persistGeneratedFiles() {
    try {
      const key = 'crxgen.generatedFiles';
      const payload = { ts: Date.now(), files: generatedFiles.map(f => ({ path: f.path, content: f.content, included: f.included })) };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {}
  }

  function loadPersistedGeneratedFiles() {
    try {
      const key = 'crxgen.generatedFiles';
      const raw = localStorage.getItem(key);
      if (raw) {
        const obj = JSON.parse(raw);
        const now = Date.now();
        const within = obj && typeof obj.ts === 'number' && (now - obj.ts) <= 3 * 60 * 1000; // 3 minutes
        if (within && Array.isArray(obj.files)) {
          generatedFiles = obj.files;
          renderGeneratedFiles();
        } else {
          // Expire old cache
          localStorage.removeItem(key);
        }
      }
    } catch {}
  }

  aiApplyFeedback?.addEventListener('click', () => {
    const note = (aiFeedback?.value || '').trim();
    if (!note) { alert('Please enter feedback.'); return; }
    feedbackNotes = note;
    // Save for later send with plan/generate
    localStorage.setItem('crxgen.feedbackNotes', feedbackNotes);
    persistGeneratedFiles();
    setAIStatus('Feedback saved. You can re-run Plan/Generate to apply changes.');
  });

  aiTempRange?.addEventListener('input', () => {
    if (aiTempVal) aiTempVal.textContent = aiTempRange.value;
  });
  aiPlanBtn?.addEventListener('click', handlePlan);
  aiGenBtn?.addEventListener('click', handleGenerate);
  aiDlBtn?.addEventListener('click', handleDownloadAI);
  aiSimBtn?.addEventListener('click', handleSimulate);
  aiRetryBtn?.addEventListener('click', () => {
    if (lastPhase === 'plan') handlePlan();
    else if (lastPhase === 'generate') handleGenerate();
  });

  // Restore previous session
  loadPersistedGeneratedFiles();

});