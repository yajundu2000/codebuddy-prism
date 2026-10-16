import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { metaDir } from '../config.js';

/**
 * Conversation log for the assistant panel. Sessions are UX state, not
 * project data: kept in memory with a debounced JSON snapshot under META_DIR
 * (same shape as the collab Yjs snapshots), never routed through the
 * DataStore seam.
 * // ponytail: single-node only; if a REDIS_URL deployment needs shared
 * sessions, move persistence into db/json + db/pg.
 */

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** role === 'tool' display card fields; tool result summary in content. */
  toolName?: string;
  ts: number;
}

export interface AgentSession {
  id: string;
  title: string;
  model: string;
  messages: AgentMessage[];
  updatedAt: number;
}

export interface AgentSessionSummary {
  id: string;
  title: string;
  model: string;
  messageCount: number;
  updatedAt: number;
}

const MAX_SESSIONS = 20;
const MAX_MESSAGES = 100;
const FLUSH_MS = 1500;

const dir = path.join(metaDir, 'agent-sessions');
const cache = new Map<string, AgentSession[]>();
const dirty = new Set<string>();
let flushTimer: NodeJS.Timeout | null = null;

function fileFor(projectId: string): string {
  return path.join(dir, `${projectId.replace(/[^a-zA-Z0-9_-]/g, '')}.json`);
}

function load(projectId: string): AgentSession[] {
  const hit = cache.get(projectId);
  if (hit) return hit;
  let sessions: AgentSession[] = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(fileFor(projectId), 'utf8')) as AgentSession[];
    if (Array.isArray(parsed)) sessions = parsed;
  } catch { /* first open */ }
  cache.set(projectId, sessions);
  return sessions;
}

function scheduleFlush(projectId: string): void {
  dirty.add(projectId);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    fs.mkdirSync(dir, { recursive: true });
    for (const id of dirty) {
      try { fs.writeFileSync(fileFor(id), JSON.stringify(cache.get(id) ?? [])); } catch { /* best effort */ }
    }
    dirty.clear();
  }, FLUSH_MS);
  flushTimer.unref?.();
}

/** Open (or create) the session a chat turn runs in. New sessions take their
 *  title from the first user message; `sessionId` resumes an existing one. */
export function openSession(projectId: string, sessionId: string | undefined, model: string): AgentSession {
  const sessions = load(projectId);
  if (sessionId) {
    const hit = sessions.find((s) => s.id === sessionId);
    if (hit) return hit;
  }
  const session: AgentSession = {
    id: crypto.randomUUID().slice(0, 12),
    title: '',
    model,
    messages: [],
    updatedAt: Date.now(),
  };
  sessions.unshift(session);
  while (sessions.length > MAX_SESSIONS) sessions.pop();
  scheduleFlush(projectId);
  return session;
}

export function appendMessages(projectId: string, session: AgentSession, messages: AgentMessage[]): void {
  session.messages.push(...messages);
  if (session.messages.length > MAX_MESSAGES) session.messages = session.messages.slice(-MAX_MESSAGES);
  if (!session.title) {
    const first = session.messages.find((m) => m.role === 'user');
    session.title = (first?.content || 'Conversation').slice(0, 60);
  }
  session.updatedAt = Date.now();
  scheduleFlush(projectId);
}

export function listSessions(projectId: string): AgentSessionSummary[] {
  return load(projectId)
    .map(({ id, title, model, messages, updatedAt }) => ({ id, title, model, messageCount: messages.length, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(projectId: string, sessionId: string): AgentSession | null {
  return load(projectId).find((s) => s.id === sessionId) ?? null;
}

export function deleteSession(projectId: string, sessionId: string): boolean {
  const sessions = load(projectId);
  const i = sessions.findIndex((s) => s.id === sessionId);
  if (i < 0) return false;
  sessions.splice(i, 1);
  scheduleFlush(projectId);
  return true;
}
