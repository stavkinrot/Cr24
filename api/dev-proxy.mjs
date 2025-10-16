/**
 * Local development proxy server for the Chrome extension generator AI.
 * Run:  OPENAI_API_KEY=sk-... node api/dev-proxy.mjs
 * Endpoint: http://localhost:3000/api/extension-ai
 *
 * Mirrors logic of the Vercel function (api/extension-ai.ts) but uses only
 * Node built-ins (http, url) so no extra deps (Express) are required.
 *
 * Security:
 *  - DO NOT expose this port publicly.
 *  - Keep OPENAI_API_KEY only in your local env / shell.
 */

import { createServer } from 'node:http';
import { parse as parseUrl } from 'node:url';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const MAX_FILES = 40;
const MAX_TOTAL_BYTES = 400 * 1024;
const MODELS = new Set(['gpt-4o-mini', 'gpt-4o']);

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(data);
}

function pickModel(m) {
  if (m && MODELS.has(m)) return m;
  return 'gpt-4o-mini';
}

function sanitizePath(p) {
  return p.replace(/\\/g, '/');
}

function isSafePath(p) {
  if (!p) return false;
  if (p.length > 200) return false;
  if (p.startsWith('/') || p.startsWith('.')) return false;
  if (p.includes('..')) return false;
  if (!/^[a-zA-Z0-9_\-./]+$/.test(p)) return false;
  const segments = p.split('/');
  if (segments.some(s => s.startsWith('.'))) return false;
  if (!/\.[a-zA-Z0-9]+$/.test(p)) return false;
  return true;
}

function approxIsText(str) {
  let control = 0;
  const len = Math.min(str.length, 5000);
  for (let i = 0; i < len; i++) {
    const c = str.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32 || c === 127) control++;
  }
  return control / len <= 0.05;
}

function extractJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const lastOpen = text.lastIndexOf('{');
    const lastClose = text.lastIndexOf('}');
    if (lastOpen === -1 || lastClose === -1 || lastClose < lastOpen) {
      throw new Error('No JSON object found');
    }
    return JSON.parse(text.slice(lastOpen, lastClose + 1));
  }
}

function buildSystemPrompt(isEdit) {
  if (isEdit) {
    return [
      'You are editing an existing Chrome MV3 extension.',
      'You will receive the current files and a user message describing changes.',
      'Return ONLY changed files in JSON format.',
      'Schema: { "files": [{"path":"string","content":"string"}], "summary":"short changelog" }',
      'Rules:',
      '- Return only files that need to change',
      '- Keep manifest_version at 3',
      '- Preserve existing functionality unless explicitly asked to change',
      '- No base64 binaries; text only',
      'No extra commentary.'
    ].join(' ');
  }
  
  // New generation
  return [
    'You are generating a new Chrome MV3 extension from scratch.',
    'Return a complete extension bundle in JSON format.',
    'Schema: { "files": [{"path":"manifest.json","content":"string"}], "summary":"what was created" }',
    'Rules:',
    '- Include manifest.json and all necessary files',
    '- manifest_version must be 3',
    '- Keep code minimal & self-contained',
    '- No base64 binaries; text only',
    'No extra commentary.'
  ].join(' ');
}

// Legacy function for backward compatibility
function buildLegacySystemPrompt(phase) {
  if (phase === 'plan') {
    return [
      'You produce ONLY compact JSON for a Chrome MV3 extension plan.',
      'Schema:',
      '{ "planVersion":1, "summary":"short", "features":{...}, "files":[{"path":"string","purpose":"string"}], "risks":["string"] }',
      'No extra commentary.'
    ].join(' ');
  }
  return [
    'You produce ONLY JSON with Chrome MV3 extension files.',
    'Schema:',
    '{ "planVersion":1, "files":[{"path":"manifest.json","content":"..."}], "notes":["optional"] }',
    'Rules: manifest_version=3, minimal dependencies, no remote code unless requested, pure text, no commentary.'
  ].join(' ');
}

async function openAIChatJson(apiKey, model, temperature, system, userPayload) {
  const body = {
    model,
    temperature,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(userPayload) }
    ]
  };

  const resp = await fetch(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Upstream ${resp.status}: ${txt.slice(0, 400)}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content from model');
  return extractJsonObject(content);
}

function validatePlan(obj) {
  if (typeof obj !== 'object' || !obj) throw new Error('Plan not object');
  if (obj.planVersion !== 1) throw new Error('planVersion must be 1');
  if (!Array.isArray(obj.files)) throw new Error('plan.files must array');
  obj.files.forEach(f => {
    if (!f || typeof f.path !== 'string' || typeof f.purpose !== 'string') throw new Error('Invalid plan file entry');
  });
  return obj;
}

function validateFilesArray(files, isEdit = false) {
  if (!Array.isArray(files)) throw new Error('files must be array');
  if (files.length === 0) throw new Error('No files returned');
  if (files.length > MAX_FILES) throw new Error('File count exceeds limit');

  let total = 0;
  const out = [];
  for (const f of files) {
    if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') throw new Error('Invalid file entry');
    f.path = sanitizePath(f.path);
    if (!isSafePath(f.path)) throw new Error(`Unsafe path: ${f.path}`);
    const bytes = Buffer.byteLength(f.content, 'utf8');
    total += bytes;
    if (total > MAX_TOTAL_BYTES) throw new Error('Total size exceeds limit');
    if (!approxIsText(f.content)) throw new Error(`File appears non-text: ${f.path}`);
    out.push({ path: f.path, content: f.content });
  }
  
  // Only require manifest.json for new generation, not for edits
  if (!isEdit && !out.some(f => f.path === 'manifest.json')) {
    throw new Error('manifest.json missing');
  }
  return out;
}

function validateGenerate(obj) {
  if (typeof obj !== 'object' || !obj) throw new Error('Generate result not object');
  if (obj.planVersion !== 1) throw new Error('planVersion must be 1');
  const files = validateFilesArray(obj.files);
  return { planVersion: 1, files, notes: obj.notes || [] };
}

async function handleExtensionAI(req, res, body) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json(res, 500, { error: 'OPENAI_API_KEY missing' });

  // Check if this is the new unified API or legacy phase-based API
  const isNewAPI = body.threadId && body.userMessage;
  
  if (isNewAPI) {
    // New unified API
    const threadId = body.threadId;
    const userMessage = body.userMessage;
    const previousFiles = body.previousFiles;
    const filesSummary = body.filesSummary;
    
    if (!threadId || !userMessage?.trim()) {
      return json(res, 400, { error: 'threadId and userMessage required' });
    }
    
    const model = pickModel(body.model);
    const temperature = typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1) : 0.4;
    
    try {
      const isEdit = !!previousFiles;
      const system = buildSystemPrompt(isEdit);
      
      let userPayload = {
        userMessage,
        threadId
      };
      
      if (isEdit && filesSummary) {
        userPayload.currentFiles = filesSummary;
        userPayload.instruction = userMessage;
      } else {
        userPayload.prompt = userMessage;
      }
      
      const raw = await openAIChatJson(apiKey, model, temperature, system, userPayload);
      
      // Validate response
      if (!raw.files || !Array.isArray(raw.files)) {
        throw new Error('Invalid response: files array missing');
      }
      
      const files = validateFilesArray(raw.files, isEdit);
      const response = {
        files,
        summary: raw.summary || undefined
      };
      
      return json(res, 200, response);
      
    } catch (e) {
      return json(res, 500, { error: 'Generation failed', detail: e.message });
    }
  }
  
  // Legacy phase-based API
  const phase = body.phase;
  if (phase !== 'plan' && phase !== 'generate') {
    return json(res, 400, { error: 'phase must be plan or generate' });
  }
  const prompt = (body.prompt || '').trim();
  if (!prompt) return json(res, 400, { error: 'prompt required' });

  const features = body.features || {};
  const matches = Array.isArray(body.matches) ? body.matches.slice(0, 50) : [];
  const model = pickModel(body.model);
  const temperature = typeof body.temperature === 'number'
    ? Math.min(Math.max(body.temperature, 0), 1)
    : 0.4;

  const system = buildLegacySystemPrompt(phase);
  const userPayload = { phase, prompt, features, matches };
  if (phase === 'generate') {
    if (!body.plan) return json(res, 400, { error: 'plan required for generate phase' });
    userPayload.plan = body.plan;
  }

  try {
    const raw = await openAIChatJson(apiKey, model, temperature, system, userPayload);
    if (phase === 'plan') {
      const plan = validatePlan(raw);
      return json(res, 200, { phase: 'plan', plan });
    } else {
      const gen = validateGenerate(raw);
      return json(res, 200, { phase: 'generate', files: gen.files, notes: gen.notes || [] });
    }
  } catch (e) {
    return json(res, 500, { error: 'Generation failed', detail: e.message });
  }
}

const server = createServer(async (req, res) => {
  const url = parseUrl(req.url || '', true);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (url.pathname === '/api/extension-ai' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) { // 1MB body cap
        req.destroy();
      }
    });
    req.on('end', () => {
      let body = null;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        return json(res, 400, { error: 'Invalid JSON body' });
      }
      handleExtensionAI(req, res, body);
    });
    return;
  }

  if (url.pathname === '/health') {
    return json(res, 200, { ok: true });
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[dev-proxy] Listening on http://localhost:${PORT}`);
});