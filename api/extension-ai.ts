// Vercel serverless function for /api/extension-ai
// Purpose: Proxy extension generation "plan" and "generate" phases to OpenAI securely.
// Models allowed: gpt-4o-mini, gpt-4o
// Limits: max 40 files, max 400 KB total (UTF-8), reject unsafe paths.
// Single JSON response (no streaming).
//
// Environment variables:
//   OPENAI_API_KEY (required)
// Optional future vars (not used yet):
//   OPENAI_BASE_URL
//
// Request (POST JSON):
// {
//   "phase": "plan" | "generate",
//   "prompt": "user natural language description",
//   "features": { "popup": true, "background": false, ... },
//   "matches": ["https://*/*"],
//   "plan": { ... }                 // required for phase=generate
//   "model": "gpt-4o-mini"          // optional
//   "temperature": 0.4              // optional
// }
//
// Response 200 JSON for phase=plan:
// { "phase":"plan","plan":{ "planVersion":1,"summary":"...",
//   "features":{...},
//   "files":[{"path":"manifest.json","purpose":"..."}, ...],
//   "risks":["..."] } }
//
// Response 200 JSON for phase=generate:
// { "phase":"generate","files":[{"path":"manifest.json","content":"..."}],
//   "notes":["optional"] }
//
// Error JSON format:
// { "error":"Message", "detail":"(optional)", "code":"BAD_REQUEST" }
//
// NOTE: The OpenAI response is forced to JSON via response_format=json_object.
// Fallback heuristic attempts to extract last JSON object if model returns extra text.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const MODELS = new Set(['gpt-4o-mini', 'gpt-4o']);
const MAX_FILES = 40;
const MAX_TOTAL_BYTES = 400 * 1024;

interface FeatureFlags {
  popup: boolean;
  background: boolean;
  contentScript: boolean;
  optionsPage: boolean;
  sidePanel: boolean;
  [k: string]: any;
}

interface PlanFileEntry {
  path: string;
  purpose: string;
}

interface PlanSchema {
  planVersion: number;
  summary: string;
  features: FeatureFlags;
  files: PlanFileEntry[];
  risks?: string[];
}

interface GeneratedFile {
  path: string;
  content: string;
}

interface GenerateSchema {
  planVersion: number;
  files: GeneratedFile[];
  notes?: string[];
}

type Phase = 'plan' | 'generate';

function json(res: VercelResponse, status: number, body: any) {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
}

function error(res: VercelResponse, status: number, message: string, detail?: string, code?: string) {
  json(res, status, { error: message, detail, code });
}

function pickModel(input?: string): string {
  if (input && MODELS.has(input)) return input;
  return 'gpt-4o-mini';
}

function sanitizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function isSafePath(p: string): boolean {
  if (!p) return false;
  if (p.length > 200) return false;
  if (p.startsWith('/') || p.startsWith('.')) return false;
  if (p.includes('..')) return false;
  if (!/^[a-zA-Z0-9_\-./]+$/.test(p)) return false;
  // Disallow hidden segments
  const segments = p.split('/');
  if (segments.some(s => s.startsWith('.'))) return false;
  // Must have an extension (avoid binary guesses / directories)
  if (!/\.[a-zA-Z0-9]+$/.test(p)) return false;
  return true;
}

function approxIsText(str: string): boolean {
  // Heuristic: reject if >5% of chars are control chars excluding common whitespace
  let control = 0;
  const len = Math.min(str.length, 5000);
  for (let i = 0; i < len; i++) {
    const c = str.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32 || c === 127) control++;
  }
  return control / len <= 0.05;
}

function extractJsonObject(text: string): any {
  // Attempt direct JSON parse first.
  try {
    return JSON.parse(text);
  } catch {
    // Fallback: find last '{' and matching '}' naive approach.
    const lastOpen = text.lastIndexOf('{');
    const lastClose = text.lastIndexOf('}');
    if (lastOpen === -1 || lastClose === -1 || lastClose < lastOpen) throw new Error('No JSON object found');
    const candidate = text.slice(lastOpen, lastClose + 1);
    return JSON.parse(candidate);
  }
}

function validatePlan(obj: any): PlanSchema {
  if (typeof obj !== 'object' || obj === null) throw new Error('Plan not an object');
  if (obj.planVersion !== 1) throw new Error('planVersion must be 1');
  if (!Array.isArray(obj.files)) throw new Error('plan.files must be array');
  obj.files.forEach((f: any) => {
    if (!f || typeof f.path !== 'string' || typeof f.purpose !== 'string') throw new Error('Invalid plan file entry');
  });
  return obj as PlanSchema;
}

function validateGenerate(obj: any): GenerateSchema {
  if (typeof obj !== 'object' || obj === null) throw new Error('Generate result not an object');
  if (obj.planVersion !== 1) throw new Error('planVersion must be 1');
  if (!Array.isArray(obj.files)) throw new Error('files must be array');
  if (obj.files.length === 0) throw new Error('No files returned');
  if (obj.files.length > MAX_FILES) throw new Error('File count exceeds limit');
  let total = 0;
  obj.files.forEach((f: any) => {
    if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') throw new Error('Invalid file entry');
    f.path = sanitizePath(f.path);
    if (!isSafePath(f.path)) throw new Error(`Unsafe path: ${f.path}`);
    const bytes = Buffer.byteLength(f.content, 'utf8');
    total += bytes;
    if (total > MAX_TOTAL_BYTES) throw new Error('Total size exceeds limit');
    if (!approxIsText(f.content)) throw new Error(`File appears non-text: ${f.path}`);
  });
  // Ensure manifest exists
  if (!obj.files.some((f: any) => f.path === 'manifest.json')) {
    throw new Error('manifest.json missing');
  }
  return obj as GenerateSchema;
}

function buildSystemPrompt(phase: Phase): string {
  if (phase === 'plan') {
    return [
      'You produce ONLY compact JSON for a Chrome MV3 extension plan.',
      'Schema:',
      '{',
      ' "planVersion":1,',
      ' "summary":"short",',
      ' "features":{...},',
      ' "files":[{"path":"string","purpose":"string"}],',
      ' "risks":["string"]',
      '}',
      'No extra commentary.'
    ].join(' ');
  }
  return [
    'You produce ONLY JSON with Chrome MV3 extension files.',
    'Schema:',
    '{',
    ' "planVersion":1,',
    ' "files":[{"path":"manifest.json","content":"..."}],',
    ' "notes":["optional"]',
    '}',
    'Rules:',
    '- Keep code minimal & self-contained.',
    '- manifest_version must be 3.',
    '- Avoid external network unless clearly requested.',
    '- No base64 binaries; keep pure text.',
    'No extra commentary.'
  ].join(' ');
}

async function openAIChatJson(apiKey: string, model: string, temperature: number, system: string, user: any) {
  const body = {
    model,
    temperature,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(user) }
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
  const content: string | undefined = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content from model');
  return extractJsonObject(content);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS (optional simple)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    return error(res, 405, 'Method not allowed', undefined, 'METHOD_NOT_ALLOWED');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return error(res, 500, 'Server misconfiguration', 'OPENAI_API_KEY missing', 'SERVER_CONFIG');
  }

  let body: any = req.body;
  if (!body || typeof body !== 'object') {
    // Attempt to parse raw body if not auto-parsed
    try {
      body = JSON.parse(req.body as any);
    } catch {
      return error(res, 400, 'Invalid JSON body', undefined, 'BAD_REQUEST');
    }
  }

  const phase: Phase = body.phase;
  if (phase !== 'plan' && phase !== 'generate') {
    return error(res, 400, 'phase must be "plan" or "generate"', undefined, 'BAD_REQUEST');
  }

  const prompt: string = body.prompt || '';
  if (!prompt.trim()) {
    return error(res, 400, 'prompt required', undefined, 'BAD_REQUEST');
  }

  const features: FeatureFlags = body.features || {};
  const matches: string[] = Array.isArray(body.matches) ? body.matches.slice(0, 50) : [];

  const model = pickModel(body.model);
  const temperature = typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1) : 0.4;

  try {
    const system = buildSystemPrompt(phase);
    const userPayload: any = {
      phase,
      prompt,
      features,
      matches,
    };

    if (phase === 'generate') {
      if (!body.plan) {
        return error(res, 400, 'plan required for generate phase', undefined, 'BAD_REQUEST');
      }
      userPayload.plan = body.plan;
    }

    const raw = await openAIChatJson(apiKey, model, temperature, system, userPayload);

    if (phase === 'plan') {
      const plan = validatePlan(raw);
      return json(res, 200, { phase: 'plan', plan });
    } else {
      const gen = validateGenerate(raw);
      return json(res, 200, { phase: 'generate', files: gen.files, notes: gen.notes || [] });
    }
  } catch (e: any) {
    return error(res, 500, 'Generation failed', e?.message, 'GENERATION_ERROR');
  }
}