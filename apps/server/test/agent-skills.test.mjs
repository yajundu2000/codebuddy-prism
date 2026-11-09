/**
 * Skills injection (apps/server/src/agent/skills/*.md → system prompt).
 * Every file in the directory ships whole into every chat turn; the prompt
 * must carry the pack verbatim so an operator edit can never silently
 * fail to reach the model.
 */
import { check, eq } from './assert.mjs';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const { assistantSystemPrompt } = await import('../src/agent/prompts.ts');

const prompt = assistantSystemPrompt({ project: 'P', branch: 'main' });
const dir = join(import.meta.dirname, '../src/agent/skills');
const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
check(files.length > 0, 'the skills directory is not empty');
for (const f of files) {
  const body = readFileSync(join(dir, f), 'utf8').trim();
  check(prompt.includes(body), `${f}: injected verbatim`);
  check(prompt.includes(`### ${f.replace(/\.md$/, '')}`), `${f}: carries its heading`);
}
check(prompt.includes('## Skills'), 'the Skills section header is present');
check(prompt.includes('project "P" on branch "main"'), 'project context survives alongside the skills');
const { CHAT_TOOL_ALLOWLIST } = await import('../src/agent/prompts.ts');
eq(CHAT_TOOL_ALLOWLIST.size, 10, 'the tool allowlist is untouched');

console.log('agent-skills: all assertions passed');
