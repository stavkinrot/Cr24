// popup.ts — Chat UI for CRX Generator
import { generateZipFromFiles } from './generator/index';

type Role = 'user' | 'assistant';
type Phase = 'ideate' | 'iterate';
type Theme = 'light' | 'dark';

type FileEntry = { path: string; content: string; included?: boolean };
type AIPlan = {
  planVersion: number;
  summary: string;
  features: Record<string, boolean>;
  files: { path: string; purpose: string }[];
  risks?: string[];
} | null;

const API_BASE = 'http://localhost:3000'; // your dev proxy

/* ---------- tiny DOM helpers ---------- */
const $ = <T extends HTMLElement = HTMLElement>(sel: string) =>
  document.querySelector(sel) as T;
const on = (el: Element | Document, ev: string, fn: any) =>
  el.addEventListener(ev, fn);

/* ---------- theme ---------- */
function getStoredTheme(): Theme | null {
  const v = localStorage.getItem('theme');
  return v === 'light' || v === 'dark' ? (v as Theme) : null;
}
function getPreferredTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/* ---------- chat state ---------- */
interface Msg {
  id: string;
  role: Role;
  html: string;              // pre-rendered HTML for content (we manage minimal safe rendering)
  attachments?: {
    plan?: AIPlan;
    files?: FileEntry[];
  };
  actions?: {
    simulate?: boolean;
    generate?: boolean;
  };
}

let phase: Phase = 'ideate';
let messages: Msg[] = [];
let currentPlan: AIPlan = null;
let currentFiles: FileEntry[] = [];

let model: string = 'auto';
let temperature = 0.4;

/* ---------- startup ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // Theme
  const themeToggle = $('#themeToggle') as HTMLButtonElement;
  const initial = getStoredTheme() || getPreferredTheme();
  applyTheme(initial);
  themeToggle.textContent = initial === 'light' ? 'Dark mode' : 'Light mode';
  on(themeToggle, 'click', () => {
    const current = (document.documentElement.getAttribute('data-theme') as Theme) || 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem('theme', next);
    themeToggle.textContent = next === 'light' ? 'Dark mode' : 'Light mode';
  });

  // Persisted model/temperature
  chrome.storage?.local.get({ crxgen_model: 'auto', crxgen_temp: 0.4 }, (st) => {
    model = st.crxgen_model;
    temperature = Number(st.crxgen_temp) || 0.4;
    const sel = $('#ai-model') as HTMLSelectElement;
    const rng = $('#ai-temp') as HTMLInputElement;
    const lbl = $('#ai-temp-val') as HTMLSpanElement;
    if (sel) sel.value = model;
    if (rng) rng.value = String(temperature);
    if (lbl) lbl.textContent = String(temperature);
  });

  // Model popover
  const modelBtn = $('#modelButton')!;
  const popover = $('#model-popover')!;
  const modelSel = $('#ai-model') as HTMLSelectElement;
  const tempRange = $('#ai-temp') as HTMLInputElement;
  const tempVal = $('#ai-temp-val') as HTMLSpanElement;

  on(modelBtn, 'click', () => {
    const open = popover.hasAttribute('hidden') ? false : true;
    if (open) popover.setAttribute('hidden', '');
    else popover.removeAttribute('hidden');
    modelBtn.setAttribute('aria-expanded', String(!open));
  });
  on(document, 'click', (e: MouseEvent) => {
    if (!popover.contains(e.target as Node) && e.target !== modelBtn) {
      popover.setAttribute('hidden', '');
      modelBtn.setAttribute('aria-expanded', 'false');
    }
  });
  on(modelSel, 'change', () => {
    model = modelSel.value || 'auto';
    chrome.storage?.local.set({ crxgen_model: model });
  });
  on(tempRange, 'input', () => {
    temperature = Number(tempRange.value);
    tempVal.textContent = String(temperature);
    chrome.storage?.local.set({ crxgen_temp: temperature });
  });

  // Chat form
  const form = $('#chat-form') as HTMLFormElement;
  const input = $('#chat-input') as HTMLTextAreaElement;
  autoResize(input);

  on(form, 'submit', async (e: Event) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    // Show user message
    pushMessage({
      role: 'user',
      html: escapeHtml(text),
    });

    input.value = '';
    input.placeholder = 'What changes would you like to make?'; // switch guidance after first turn

    // Assistant thinking…
    const thinkingId = pushMessage({
      role: 'assistant',
      html: `<div class="thinking">Planning your extension…</div>`,
    });

    try {
      // 1) PLAN
      const planResp = await postPhase('plan', { prompt: text });
      currentPlan = planResp?.plan || null;

      // Update assistant with plan summary + proposed files
      replaceMessage(thinkingId, {
        role: 'assistant',
        html: renderPlanHtml(currentPlan),
      });

      // 2) GENERATE FILES (first pass)
      const genThinking = pushMessage({
        role: 'assistant',
        html: `<div class="thinking">Generating files…</div>`,
      });

      const genResp = await postPhase('generate', { plan: currentPlan, prompt: text });
      currentFiles = (genResp?.files || []).map((f: any) => ({ ...f, included: true }));

      replaceMessage(genThinking, {
        role: 'assistant',
        html: renderFilesHtml(currentFiles),
        attachments: { plan: currentPlan, files: currentFiles },
        actions: { simulate: true, generate: true },
      });

    } catch (err: any) {
      replaceMessage(thinkingId, {
        role: 'assistant',
        html: `<div class="error">Error: ${escapeHtml(err?.message || String(err))}</div>`,
      });
    }
  });

  // Messages container: delegate clicks for simulate / generate / include toggles
  on($('#messages')!, 'click', (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.matches('[data-action="simulate"]')) {
      e.preventDefault();
      handleSimulate();
    } else if (t.matches('[data-action="generate-zip"]')) {
      e.preventDefault();
      handleDownloadZip();
    } else if (t.matches('[data-toggle-file]')) {
      const path = t.getAttribute('data-toggle-file')!;
      const entry = currentFiles.find(f => f.path === path);
      if (entry) {
        entry.included = !entry.included;
        t.setAttribute('aria-pressed', String(!!entry.included));
        t.textContent = entry.included ? 'Included' : 'Excluded';
      }
    } else if (t.matches('[data-action="toggle-code"]')) {
      const pre = t.closest('.file-card')?.querySelector('pre') as HTMLElement | null;
      if (pre) {
        const open = pre.hasAttribute('hidden') ? false : true;
        if (open) pre.setAttribute('hidden', '');
        else pre.removeAttribute('hidden');
        t.textContent = open ? 'View' : 'Hide';
      }
    }
  });

  // Restore short-lived session (3 minutes)
  restoreSession();
});

/* ---------- API ---------- */
async function postPhase(
  phase: 'plan' | 'generate' | 'revise',
  extra: any = {}
) {
  // Resolve "auto" model priority here if you want (optional)
  const resolvedModel = model;

  const payload = {
    phase,
    model: resolvedModel,
    temperature,
    ...extra,
  };

  const resp = await fetch(`${API_BASE}/api/extension-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }
  return resp.json();
}

/* ---------- render helpers ---------- */
function pushMessage(m: Omit<Msg, 'id'>): string {
  const id = crypto.randomUUID();
  const msg: Msg = { id, ...m };
  messages.push(msg);
  renderMessages();
  return id;
}

function replaceMessage(id: string, m: Omit<Msg, 'id'>) {
  const i = messages.findIndex(x => x.id === id);
  if (i >= 0) {
    messages[i] = { id, ...m };
    renderMessages();
  }
}

function renderMessages() {
  const box = $('#messages')!;
  box.innerHTML = messages.map(renderMessage).join('');
  box.scrollTop = box.scrollHeight;
}

function renderMessage(m: Msg) {
  const side = m.role === 'user' ? 'right' : 'left';
  const actions = m.actions ? renderActions(m.actions) : '';
  return `
    <article class="bubble ${side}">
      <div class="bubble-inner">${m.html}</div>
      ${m.attachments?.files ? renderFilesSection(m.attachments.files) : ''}
      ${actions}
    </article>
  `;
}

function renderActions(a: NonNullable<Msg['actions']>) {
  const buttons: string[] = [];
  if (a.simulate) buttons.push(`<button class="secondary" data-action="simulate">Simulate</button>`);
  if (a.generate) buttons.push(`<button class="primary" data-action="generate-zip">Generate ZIP</button>`);
  return `<div class="actions">${buttons.join('')}</div>`;
}

function renderPlanHtml(plan: AIPlan) {
  if (!plan) return `<div>No plan returned.</div>`;
  const files = plan.files?.map(f => `<li><code>${escapeHtml(f.path)}</code> – ${escapeHtml(f.purpose)}</li>`).join('') || '';
  const risks = plan.risks?.length ? `<p><strong>Risks:</strong> ${plan.risks.map(escapeHtml).join('; ')}</p>` : '';
  return `
    <h3>Plan v${plan.planVersion || 1}</h3>
    <p>${escapeHtml(plan.summary || '')}</p>
    <details open><summary>Planned files</summary><ul>${files}</ul></details>
    ${risks}
  `;
}

function renderFilesHtml(files: FileEntry[]) {
  if (!files?.length) return `<div>No files generated.</div>`;
  return `<div class="file-list">
    ${files.map(renderFileCard).join('')}
  </div>`;
}

function renderFilesSection(files: FileEntry[]) {
  return `<section class="assistant-attachments">${renderFilesHtml(files)}</section>`;
}

function renderFileCard(f: FileEntry) {
  const size = new Blob([f.content]).size;
  const included = f.included !== false;
  return `
    <div class="file-card">
      <header>
        <strong>${escapeHtml(f.path)}</strong>
        <span class="muted">(${size} B)</span>
        <div class="spacer"></div>
        <button class="chip" data-toggle-file="${escapeHtml(f.path)}" aria-pressed="${included}">${included ? 'Included' : 'Excluded'}</button>
        <button class="link" data-action="toggle-code">View</button>
      </header>
      <pre hidden>${escapeHtml(f.content)}</pre>
    </div>
  `;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

/* ---------- textarea autoresize ---------- */
function autoResize(ta: HTMLTextAreaElement) {
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(180, Math.max(36, ta.scrollHeight)) + 'px';
  };
  on(ta, 'input', fit);
  fit();
}

/* ---------- session (short-lived) ---------- */
function persistSession() {
  try {
    const key = 'crxgen.session';
    const payload = { ts: Date.now(), files: currentFiles };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {}
}
function restoreSession() {
  try {
    const raw = localStorage.getItem('crxgen.session');
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && Array.isArray(obj.files) && Date.now() - obj.ts <= 3 * 60 * 1000) {
      currentFiles = obj.files;
      // show a small system message and files
      pushMessage({
        role: 'assistant',
        html: `<div class="muted">Restored previous files (last 3 min).</div>`,
        attachments: { files: currentFiles },
        actions: { simulate: true, generate: true },
      });
    } else {
      localStorage.removeItem('crxgen.session');
    }
  } catch {}
}

/* ---------- simulate & generate ---------- */
async function handleDownloadZip() {
  if (!currentFiles?.length) return;
  const selected = currentFiles.filter(f => f.included !== false);
  if (!selected.length) {
    pushMessage({ role: 'assistant', html: `<div class="error">No files selected.</div>` });
    return;
  }
  try {
    await generateZipFromFiles(
      selected.map(f => ({ path: f.path, content: f.content })),
      { name: 'AI Extension', version: '0.1.0', addIconsIfMissing: true }
    );
    pushMessage({ role: 'assistant', html: `<div class="success">ZIP generated and downloaded.</div>` });
  } catch (e: any) {
    pushMessage({ role: 'assistant', html: `<div class="error">ZIP failed: ${escapeHtml(e?.message || String(e))}</div>` });
  }
}

function extractContentScriptFromGenerated(files: FileEntry[]): string | null {
  try {
    const mf = files.find(f => f.path === 'manifest.json' && f.included !== false);
    if (mf) {
      const manifest = JSON.parse(mf.content);
      const list = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
      const parts: string[] = [];
      for (const entry of list) {
        const jsArr = Array.isArray(entry.js) ? entry.js : [];
        for (const p of jsArr) {
          // Skip background/service worker files - they can't run in page context
          if (p.includes('background') || p.includes('service_worker')) continue;
          
          const file = files.find(f => f.path === p && f.included !== false);
          if (file) parts.push(file.content);
        }
      }
      if (parts.length) return parts.join('\n;\n');
    }
  } catch {}
  
  // Fallback: find content_script.js but exclude background files
  const byPath = files.find(f => 
    /content_script\.js$/i.test(f.path) && 
    f.included !== false &&
    !f.path.includes('background') &&
    !f.path.includes('service_worker')
  );
  if (byPath) return byPath.content;
  
  // Last resort: any JS file except background/service worker
  const anyJs = files.filter(f => 
    /\.js$/i.test(f.path) && 
    f.included !== false &&
    !f.path.includes('background') &&
    !f.path.includes('service_worker')
  );
  if (anyJs.length) return anyJs.map(f => f.content).join('\n;\n');
  
  return null;
}

async function handleSimulate() {
  if (!currentFiles?.length) {
    pushMessage({ role: 'assistant', html: `<div class="muted">No generated files to simulate.</div>` });
    return;
  }
  const code = extractContentScriptFromGenerated(currentFiles);
  if (!code) {
    pushMessage({ role: 'assistant', html: `<div class="muted">No content script found. Try generating again.</div>` });
    return;
  }

  const c: any = (window as any).chrome;
  if (!(c && c.scripting && typeof c.tabs?.query === 'function')) {
    pushMessage({ role: 'assistant', html: `<div class="error">Simulation requires extension context with "scripting" permission.</div>` });
    return;
  }

  try {
    c.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
      const tabId = tabs && tabs[0] && tabs[0].id;
      if (tabId == null) {
        pushMessage({ role: 'assistant', html: `<div class="error">No active tab found for injection.</div>` });
        return;
      }
      c.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [code],
        func: (codeStr: string) => {
          try {
            const script = document.createElement('script');
            script.textContent = codeStr;
            document.documentElement.appendChild(script);
            script.remove();
          } catch (e) {
            console.error(e);
          }
        }
      }, () => {
        const lastError = c.runtime?.lastError?.message;
        if (lastError) {
          pushMessage({ role: 'assistant', html: `<div class="error">Injection failed: ${escapeHtml(lastError)}</div>` });
        } else {
          pushMessage({ role: 'assistant', html: `<div class="success">Simulated in the current page. Check behavior and console logs.</div>` });
        }
      });
    });
  } catch (e: any) {
    pushMessage({ role: 'assistant', html: `<div class="error">Simulation failed: ${escapeHtml(e?.message || String(e))}</div>` });
  }

  persistSession();
}
