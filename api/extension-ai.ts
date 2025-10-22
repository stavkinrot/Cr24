// /api/extension-ai (Vercel)
// Unified API for context-aware extension generation
// - New generation: no previousFiles provided
// - Edit mode: previousFiles provided with file summary
//
// Models: gpt-4o-mini, gpt-4o  (you can extend easily)
// Limits: ≤40 files, ≤400KB total, safe text paths only

import type { VercelRequest, VercelResponse } from '@vercel/node';

const MODELS = new Set(['gpt-4o-mini', 'gpt-4o']);
const MAX_FILES = 40;
const MAX_TOTAL_BYTES = 400 * 1024;

type AIFile = { path: string; content: string };
type GenerateRequest = {
  threadId: string;
  userMessage: string;
  previousFiles?: AIFile[];
  filesSummary?: string;
  model?: string;
  temperature?: number;
};
type GenerateResponse = {
  files: AIFile[];
  summary?: string;
};

// Legacy types for backward compatibility
type Phase = 'plan' | 'generate' | 'revise';

interface FeatureFlags {
  popup: boolean;
  background: boolean;
  contentScript: boolean;
  optionsPage: boolean;
  sidePanel: boolean;
  [k: string]: any;
}

interface PlanFileEntry { path: string; purpose: string; }
interface PlanSchema {
  planVersion: number;
  summary: string;
  features: FeatureFlags;
  files: PlanFileEntry[];
  risks?: string[];
}

interface GeneratedFile { path: string; content: string; }
interface GenerateSchema {
  planVersion: number;
  files: GeneratedFile[];
  notes?: string[];
}

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
  // Must have an extension (avoid directories)
  if (!/\.[a-zA-Z0-9]+$/.test(p)) return false;
  return true;
}
function approxIsText(str: string): boolean {
  let control = 0;
  const len = Math.min(str.length, 5000);
  for (let i = 0; i < len; i++) {
    const c = str.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32 || c === 127) control++;
  }
  return control / len <= 0.05;
}

function isBinaryFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const binaryExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'avi', 'mov', 'wav', 'pdf', 'zip', 'tar', 'gz'];
  return binaryExtensions.includes(ext);
}
function extractJsonObject(text: string): any {
  try { return JSON.parse(text); } catch {
    const lastOpen = text.lastIndexOf('{');
    const lastClose = text.lastIndexOf('}');
    if (lastOpen === -1 || lastClose === -1 || lastClose < lastOpen) throw new Error('No JSON object found');
    return JSON.parse(text.slice(lastOpen, lastClose + 1));
  }
}

/* ---------- validators ---------- */
function validatePlan(obj: any): PlanSchema {
  if (typeof obj !== 'object' || obj === null) throw new Error('Plan not an object');
  if (obj.planVersion !== 1) throw new Error('planVersion must be 1');
  if (!Array.isArray(obj.files)) throw new Error('plan.files must be array');
  obj.files.forEach((f: any) => {
    if (!f || typeof f.path !== 'string' || typeof f.purpose !== 'string') throw new Error('Invalid plan file entry');
  });
  return obj as PlanSchema;
}

function validateFilesArray(files: any[], isEdit = false): GeneratedFile[] {
  if (!Array.isArray(files)) throw new Error('files must be array');
  if (files.length === 0) throw new Error('No files returned');
  if (files.length > MAX_FILES) throw new Error('File count exceeds limit');

  let total = 0;
  const out: GeneratedFile[] = [];
  for (const f of files) {
    if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') throw new Error('Invalid file entry');
    f.path = sanitizePath(f.path);
    if (!isSafePath(f.path)) throw new Error(`Unsafe path: ${f.path}`);
    const bytes = Buffer.byteLength(f.content, 'utf8');
    total += bytes;
    if (total > MAX_TOTAL_BYTES) throw new Error('Total size exceeds limit');
    
    // Skip text validation for known binary files
    if (!isBinaryFile(f.path)) {
      if (!approxIsText(f.content)) throw new Error(`File appears non-text: ${f.path}`);
    }
    
    out.push({ path: f.path, content: f.content });
  }
  
  // Only require manifest.json for new generation, not for edits
  if (!isEdit && !out.some(f => f.path === 'manifest.json')) {
    throw new Error('manifest.json missing');
  }
  
  // light MV3 sanity check only if manifest.json is present
  const manifest = out.find(f => f.path === 'manifest.json');
  if (manifest) {
    try {
      const mf = JSON.parse(manifest.content);
      if (Number(mf.manifest_version) !== 3) throw new Error('manifest_version must be 3');
    } catch (e: any) {
      throw new Error(`Invalid manifest.json: ${e?.message || e}`);
    }
  }
  return out;
}

function validateGenerate(obj: any): GenerateSchema {
  if (typeof obj !== 'object' || obj === null) throw new Error('Generate result not an object');
  if (obj.planVersion !== 1) throw new Error('planVersion must be 1');
  const files = validateFilesArray(obj.files);
  return { planVersion: 1, files, notes: obj.notes || [] };
}

/* ---------- prompts ---------- */
function buildSystemPrompt(isEdit: boolean): string {
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
function buildLegacySystemPrompt(phase: Phase): string {
  if (phase === 'plan') {
    return [
      'You produce ONLY compact JSON for a Chrome MV3 extension plan.',
      'Schema:',
      '{ "planVersion":1, "summary":"short", "features":{...},',
      '  "files":[{"path":"string","purpose":"string"}], "risks":["string"] }',
      'No extra commentary.'
    ].join(' ');
  }
  if (phase === 'revise') {
    return [
      'You produce ONLY JSON with revised Chrome MV3 extension files.',
      'Input includes current files and user feedback.',
      'Schema:',
      '{ "planVersion":1, "files":[{"path":"manifest.json","content":"..."}], "notes":["optional"] }',
      'Rules:',
      '- Update only what is necessary to address feedback.',
      '- Keep manifest_version at 3.',
      '- Avoid external network unless clearly requested.',
      '- No base64 binaries; text only.',
      'No extra commentary.'
    ].join(' ');
  }
  // generate
  return [
    'You produce ONLY JSON with Chrome MV3 extension files.',
    'Schema:',
    '{ "planVersion":1, "files":[{"path":"manifest.json","content":"..."}], "notes":["optional"] }',
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

/* ---------- handler ---------- */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return error(res, 405, 'Method not allowed', undefined, 'METHOD_NOT_ALLOWED');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return error(res, 500, 'Server misconfiguration', 'OPENAI_API_KEY missing', 'SERVER_CONFIG');

  let body: any = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(req.body as any); }
    catch { return error(res, 400, 'Invalid JSON body', undefined, 'BAD_REQUEST'); }
  }

  // Check if this is the new unified API or legacy phase-based API
  const isNewAPI = body.threadId && body.userMessage;
  
  if (isNewAPI) {
    // New unified API
    const threadId: string = body.threadId;
    const userMessage: string = body.userMessage;
    const previousFiles: AIFile[] | undefined = body.previousFiles;
    const filesSummary: string | undefined = body.filesSummary;
    
    if (!threadId || !userMessage?.trim()) {
      return error(res, 400, 'threadId and userMessage required', undefined, 'BAD_REQUEST');
    }
    
    const model = pickModel(body.model);
    const temperature = typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1) : 0.4;
    
    try {
      const isEdit = !!previousFiles;
      const system = buildSystemPrompt(isEdit);
      
      let userPayload: any = {
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
      const response: GenerateResponse = {
        files,
        summary: raw.summary || undefined
      };
      
      return json(res, 200, response);
      
    } catch (e: any) {
      return error(res, 500, 'Generation failed', e?.message, 'GENERATION_ERROR');
    }
  }
  
  // Legacy phase-based API
  const phase: Phase = body.phase;
  if (phase !== 'plan' && phase !== 'generate' && phase !== 'revise') {
    return error(res, 400, 'phase must be "plan" | "generate" | "revise"', undefined, 'BAD_REQUEST');
  }

  const model = pickModel(body.model);
  const temperature = typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1) : 0.4;

  try {
    const system = buildLegacySystemPrompt(phase);
    let userPayload: any = { phase };

    if (phase === 'plan') {
      const prompt: string = body.prompt || '';
      if (!prompt.trim()) return error(res, 400, 'prompt required', undefined, 'BAD_REQUEST');
      const features: FeatureFlags = body.features || {};
      const matches: string[] = Array.isArray(body.matches) ? body.matches.slice(0, 50) : [];
      userPayload = { phase, prompt, features, matches };
      const raw = await openAIChatJson(apiKey, model, temperature, system, userPayload);
      const plan = validatePlan(raw);
      return json(res, 200, { phase: 'plan', plan });
    }

    if (phase === 'generate') {
      const prompt: string = body.prompt || '';
      if (!prompt.trim()) return error(res, 400, 'prompt required', undefined, 'BAD_REQUEST');
      if (!body.plan) return error(res, 400, 'plan required for generate phase', undefined, 'BAD_REQUEST');
      userPayload = { phase, prompt, plan: body.plan };
      const raw = await openAIChatJson(apiKey, model, temperature, system, userPayload);
      const gen = validateGenerate(raw);
      return json(res, 200, { phase: 'generate', files: gen.files, notes: gen.notes || [] });
    }

    // revise
    const feedback: string = (body.feedback || '').trim();
    const files: any[] = body.files;
    if (!files) return error(res, 400, 'files required for revise phase', undefined, 'BAD_REQUEST');
    if (!feedback) return error(res, 400, 'feedback required for revise phase', undefined, 'BAD_REQUEST');

    // validate incoming files (current state)
    validateFilesArray(files, false);

    userPayload = {
      phase: 'revise',
      feedback,
      files: files.map(f => ({ path: sanitizePath(f.path), content: String(f.content) }))
    };
    const raw = await openAIChatJson(apiKey, model, temperature, system, userPayload);
    const revised = validateGenerate(raw); // same shape as generate
    return json(res, 200, { phase: 'revise', files: revised.files, notes: revised.notes || [] });

  } catch (e: any) {
    return error(res, 500, 'Generation failed', e?.message, 'GENERATION_ERROR');
  }
}
