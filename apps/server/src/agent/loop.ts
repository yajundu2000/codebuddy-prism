import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { chatStream, type ChatMsg, type ToolDef } from '../ai.js';
import { createMcpServer } from '../mcp/server.js';
import type { McpIdentity } from '../mcp/guards.js';
import { CHAT_TOOL_ALLOWLIST } from './prompts.js';

/**
 * The assistant's tool loop. The tools are the SAME mcp/tools.ts registry the
 * /mcp connector exposes, driven over an in-memory transport pair — one
 * implementation of read/edit/write/compile/commit for every agent surface.
 * Every call's `project` and `branch` arguments are overwritten by the route:
 * the model cannot name another project even by trying.
 */

/** Hard stop for one turn: a stuck model must not loop compile forever. */
const MAX_ROUNDS = 12;
/** Tool output cap sent back as the tool message (disk reads can be huge). */
const TOOL_RESULT_CAP = 8000;

export interface ToolEvent {
  name: string;
  ok: boolean;
  /** First line of the result, for the panel's tool card. */
  summary: string;
}

export interface LoopResult {
  content: string;
  toolEvents: ToolEvent[];
}

/** One agent turn per project at a time: edits and compiles contend for the
 *  same worktree lock, and a queued pile-up would burn the AI budget.
 *  // ponytail: per-project serial; per-user gates if multi-tenant load shows up. */
const running = new Set<string>();

export function agentLoopBusy(projectId: string): boolean {
  return running.has(projectId);
}

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return (result.content || [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text!)
    .join('\n')
    .slice(0, TOOL_RESULT_CAP);
}

export async function runAgentLoop(opts: {
  projectId: string;
  branch: string;
  identity: McpIdentity;
  base: string;
  messages: ChatMsg[]; // includes the system prompt; last message is the user turn
  model?: string;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onToolEvent: (event: ToolEvent) => void;
}): Promise<LoopResult> {
  if (running.has(opts.projectId)) throw new Error('Another assistant turn is still running in this project — wait for it to finish');
  running.add(opts.projectId);
  try {
    const server = createMcpServer(opts.identity, opts.base);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'codebuddy-prism-assistant', version: '1.0.0' });
    await client.connect(clientTransport);
    try {
      const listed = await client.listTools();
      const tools: ToolDef[] = listed.tools
        .filter((t) => CHAT_TOOL_ALLOWLIST.has(t.name))
        .map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description || '', parameters: (t.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} } } }));
      const messages = [...opts.messages];
      const toolEvents: ToolEvent[] = [];
      let content = '';
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const result = await chatStream({
          messages,
          tools,
          model: opts.model,
          signal: opts.signal,
          onDelta: opts.onDelta,
        });
        content = result.content;
        if (!result.toolCalls.length) break;
        messages.push({ role: 'assistant', content: result.content, tool_calls: result.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.args || '{}' } })) });
        for (const call of result.toolCalls) {
          let args: Record<string, unknown> = {};
          try { args = call.args ? JSON.parse(call.args) : {}; } catch { /* provider sent bad JSON — empty args, tool will name the problem */ }
          args.project = opts.projectId; // route-pinned: the model cannot redirect
          args.branch = opts.branch;
          const started = Date.now();
          let event: ToolEvent;
          try {
            const res = (await client.callTool({ name: call.name, arguments: args })) as { isError?: boolean } & ReturnType<typeof Object>;
            const text = textOf(res as never);
            event = { name: call.name, ok: !res.isError, summary: text.split('\n')[0]?.slice(0, 200) || (res.isError ? 'error' : 'done') };
            messages.push({ role: 'tool', tool_call_id: call.id, content: text || '(no output)' });
          } catch (err: any) {
            const text = `Tool error: ${err.message}`;
            event = { name: call.name, ok: false, summary: text.slice(0, 200) };
            messages.push({ role: 'tool', tool_call_id: call.id, content: text });
          }
          event.summary += ` (${Date.now() - started}ms)`;
          toolEvents.push(event);
          opts.onToolEvent(event);
        }
      }
      return { content, toolEvents };
    } finally {
      await client.close().catch(() => {});
      await server.close().catch(() => {});
    }
  } finally {
    running.delete(opts.projectId);
  }
}
