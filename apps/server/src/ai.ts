import Anthropic from '@anthropic-ai/sdk';

/**
 * AI error-fix helper. Bring-your-own key, server-side only (never reaches the
 * browser). Two providers, auto-detected:
 *   - OpenRouter / any OpenAI-compatible endpoint  (OPENROUTER_API_KEY, or
 *     OPENAI_API_KEY + ALDINE_AI_BASE_URL)  — chat-completions format
 *   - Anthropic Messages API                        (ANTHROPIC_API_KEY)
 * Model and endpoint are env-configurable so it can point at a gateway or mock.
 */

type Provider = 'openrouter' | 'openai' | 'anthropic' | null;

function provider(): Provider {
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

export function aiConfigured(): boolean {
  return provider() !== null;
}

function model(): string {
  if (process.env.ALDINE_AI_MODEL) return process.env.ALDINE_AI_MODEL;
  const p = provider();
  if (p === 'openrouter') return 'anthropic/claude-opus-4.8';
  if (p === 'openai') return 'gpt-4o';
  return 'claude-opus-4-8';
}

export function aiModel(): string {
  return aiConfigured() ? model() : '';
}

export interface AiFix { file: string; find: string; replace: string; note?: string }
export interface AiResult { explanation: string; fixes: AiFix[] }

interface DiagnoseInput {
  rootFile: string;
  files: Array<{ path: string; content: string }>;
  errors: Array<{ type: string; line: number | null; message: string; file?: string }>;
  log: string;
}

function numberLines(src: string): string {
  return src.split('\n').map((l, i) => `${i + 1}\t${l}`).join('\n');
}

function extractJson(text: string): AiResult {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  else {
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first >= 0 && last > first) s = s.slice(first, last + 1);
  }
  const parsed = JSON.parse(s) as Partial<AiResult>;
  return {
    explanation: typeof parsed.explanation === 'string' ? parsed.explanation : 'No explanation returned.',
    fixes: Array.isArray(parsed.fixes)
      ? parsed.fixes.filter((f) => f && typeof f.find === 'string' && typeof f.replace === 'string').map((f) => ({
          file: String(f.file || ''),
          find: String(f.find),
          replace: String(f.replace),
          note: f.note ? String(f.note) : undefined,
        }))
      : [],
  };
}

const SYSTEM = `You are a LaTeX expert helping a writer fix compilation errors in their document.
You are given the compiler error list, the tail of the compile log, and the project's .tex source files (with line numbers).
Diagnose the most likely cause and propose the smallest set of concrete edits that will make the document compile.

Respond with ONLY a JSON object, no preamble and no markdown fences:
{
  "explanation": "1-3 sentences in plain English: what went wrong and how the fix addresses it.",
  "fixes": [
    { "file": "main.tex", "find": "<exact substring currently in the file>", "replace": "<the corrected text>", "note": "short label" }
  ]
}
Rules: "find" MUST be an exact, unique substring of the current file content so it can be replaced verbatim (do not include the line-number prefixes shown in the source). Keep each fix minimal. If a needed package is missing, add the \\usepackage line via a fix that targets an existing preamble line. If you cannot determine a safe automatic fix, return an empty "fixes" array and explain what the user should check.`;

function buildUserPrompt(input: DiagnoseInput): string {
  const sources = input.files
    .map((f) => `--- ${f.path} ---\n${numberLines(f.content)}`)
    .join('\n\n')
    .slice(0, 40_000);
  const errs = input.errors
    .filter((e) => e.type === 'error')
    .slice(0, 20)
    .map((e) => `${e.file || input.rootFile}:${e.line ?? '?'} — ${e.message}`)
    .join('\n');
  return `Root file: ${input.rootFile}\n\nErrors:\n${errs || '(none parsed; see log)'}\n\nCompile log (tail):\n${input.log.slice(-3000)}\n\nSource files:\n${sources}`;
}

async function diagnoseOpenAICompatible(input: DiagnoseInput, base: string, key: string, extraHeaders: Record<string, string> = {}): Promise<AiResult> {
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({
      model: model(),
      max_tokens: 4000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildUserPrompt(input) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI provider error (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = body.choices?.[0]?.message?.content || '';
  return extractJson(text);
}

async function diagnoseAnthropic(input: DiagnoseInput): Promise<AiResult> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL from env
  const resp = await client.messages.create({
    model: model(),
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
  });
  const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
  return extractJson(text);
}

export async function diagnose(input: DiagnoseInput): Promise<AiResult> {
  const p = provider();
  if (p === 'openrouter') {
    return diagnoseOpenAICompatible(input, process.env.ALDINE_AI_BASE_URL || 'https://openrouter.ai/api/v1', process.env.OPENROUTER_API_KEY!, {
      'HTTP-Referer': 'https://github.com/aldine',
      'X-Title': 'Aldine',
    });
  }
  if (p === 'openai') {
    return diagnoseOpenAICompatible(input, process.env.ALDINE_AI_BASE_URL || 'https://api.openai.com/v1', process.env.OPENAI_API_KEY!);
  }
  return diagnoseAnthropic(input);
}

// ---- streaming chat (assistant panel) ----

export interface ToolDef { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }
export interface ToolCallMsg { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: ToolCallMsg[];
  tool_call_id?: string;
}

export interface ChatResult {
  content: string;
  toolCalls: Array<{ id: string; name: string; args: string }>;
}

/**
 * Chat provider precedence: PRISM_AI_* (this fork's native config, defaulting
 * to the Hunyuan OpenAI-compatible endpoint) > OpenRouter > generic
 * OpenAI-compatible. The diagnose() path keeps its Anthropic fallback; chat
 * streams only the OpenAI wire format, so an ANTHROPIC_API_KEY-only instance
 * reports the chat as unconfigured (the error names the env var to set).
 */
function chatProvider(): { base: string; key: string } | null {
  if (process.env.PRISM_AI_API_KEY) {
    return { base: process.env.PRISM_AI_BASE_URL || 'https://api.hunyuan.cloud.tencent.com/v1', key: process.env.PRISM_AI_API_KEY };
  }
  if (process.env.OPENROUTER_API_KEY) return { base: process.env.ALDINE_AI_BASE_URL || 'https://openrouter.ai/api/v1', key: process.env.OPENROUTER_API_KEY };
  if (process.env.OPENAI_API_KEY) return { base: process.env.ALDINE_AI_BASE_URL || 'https://api.openai.com/v1', key: process.env.OPENAI_API_KEY };
  return null;
}

export function chatConfigured(): boolean {
  return chatProvider() !== null;
}

export interface AiModelInfo { id: string; label?: string }

/** Model catalog for the panel's picker. PRISM_AI_MODELS is a JSON array of
 *  {id, label}; the default follows the configured provider. */
export function aiModels(): AiModelInfo[] {
  const raw = process.env.PRISM_AI_MODELS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AiModelInfo[];
      if (Array.isArray(parsed) && parsed.length) return parsed.filter((m) => m && typeof m.id === 'string');
    } catch { /* malformed override → fall through to provider defaults */ }
  }
  const base = chatProvider()?.base || '';
  if (base.includes('hunyuan')) {
    return [
      { id: 'hunyuan-turbos-latest', label: 'Hunyuan TurboS' },
      { id: 'hunyuan-standard', label: 'Hunyuan Standard' },
      { id: 'hunyuan-lite', label: 'Hunyuan Lite (free)' },
    ];
  }
  if (base.includes('openrouter')) {
    return [
      { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5' },
      { id: 'anthropic/claude-opus-5', label: 'Claude Opus 5' },
    ];
  }
  if (base) return [{ id: model(), label: model() }];
  return [];
}

export function chatModel(requested?: string): string {
  if (requested && requested.trim()) return requested;
  if (process.env.ALDINE_AI_MODEL) return process.env.ALDINE_AI_MODEL;
  const models = aiModels();
  if (models.length) return models[0].id;
  return model();
}

/**
 * Streaming chat-completions call. Deltas are surfaced through onDelta as they
 * arrive; tool_calls are aggregated across chunks and returned whole (the
 * agent loop replays them as assistant messages for the next round).
 */
export async function chatStream(opts: {
  messages: ChatMsg[];
  tools?: ToolDef[];
  model?: string;
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}): Promise<ChatResult> {
  const base = chatProvider();
  if (!base) throw new Error('No chat provider configured — set PRISM_AI_API_KEY on the server');
  const body: Record<string, unknown> = { model: chatModel(opts.model), messages: opts.messages, stream: true };
  if (opts.tools?.length) body.tools = opts.tools;
  const res = await fetch(`${base.base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${base.key}` },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`AI provider error (HTTP ${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`);
  }
  let content = '';
  const calls: Array<{ idx: number; id: string; name: string; args: string }> = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const handleLine = (line: string): boolean => {
    if (!line.startsWith('data:')) return true;
    const data = line.slice(5).trim();
    if (data === '[DONE]') return false;
    let evt: { choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> } }> };
    try { evt = JSON.parse(data); } catch { return true; }
    const delta = evt.choices?.[0]?.delta;
    if (typeof delta?.content === 'string' && delta.content) {
      content += delta.content;
      opts.onDelta?.(delta.content);
    }
    for (const tc of delta?.tool_calls ?? []) {
      const idx = tc.index ?? 0;
      let acc = calls.find((c) => c.idx === idx);
      if (!acc) { acc = { idx, id: '', name: '', args: '' }; calls.push(acc); }
      if (tc.id) acc.id = tc.id;
      if (tc.function?.name) acc.name = tc.function.name;
      if (tc.function?.arguments) acc.args += tc.function.arguments;
    }
    return true;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    let stop = false;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (!handleLine(line)) { stop = true; break; }
    }
    if (stop) break;
  }
  return {
    content,
    toolCalls: calls.sort((a, b) => a.idx - b.idx).map(({ id, name, args }) => ({ id, name, args })),
  };
}
