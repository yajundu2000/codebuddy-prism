/**
 * System prompt and tool allowlist for the assistant panel's agent loop.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Operator-shipped skill packs (apps/server/src/agent/skills/*.md), injected
 * whole into every chat turn. v1 has one pack so the token cost is fine;
 * when the directory grows, add keyword dispatch instead of shipping all
 * bodies to every request. The first line of each file is its name+trigger
 * summary — kept plain on purpose, no frontmatter parser.
 */
function skillsPrompt(): string {
  // import.meta.url, not __dirname: tsx's __dirname shim resolves to cwd
  const dir = fileURLToPath(new URL('./skills', import.meta.url));
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  } catch { /* no skills dir → no section */ }
  if (!files.length) return '';
  const bodies = files.map((f) => `### ${f.replace(/\.md$/, '')}\n${readFileSync(`${dir}/${f}`, 'utf8').trim()}`);
  return [
    '\n\n## Skills',
    'When the user\'s request matches a skill below, name the skill you are',
    'using, then follow its instructions. Skills are standing instructions —',
    'they never override what the user themselves says in a turn.',
    ...bodies,
  ].join('\n');
}

export function assistantSystemPrompt(ctx: { project: string; branch: string }): string {
  return [
    'You are the writing assistant of codebuddy-prism, a collaborative LaTeX platform.',
    `The user is working on project "${ctx.project}" on branch "${ctx.branch}".`,
    'Help with drafting, revising, translating, and structuring LaTeX documents.',
    'You have tools: read the project with project_structure/read_file before editing;',
    'edit with edit_file (surgical find/replace) or write_file; compile to check your',
    'work; commit is automatic after edits — do not commit unless asked. Every edit is',
    'pinned to this project and branch. Say what you did in one short sentence per tool.',
    'Prefer minimal, surgical edits to the user\'s source; keep their voice and LaTeX style.',
  ].join(' ') + skillsPrompt();
}

/**
 * Tools the chat agent may call — the ids match mcp/tools.ts registrations.
 * Cross-project or destructive tools stay out: the loop pins every call to
 * the project/branch the panel was opened on, and these ids are the second
 * lock (a registry rename silently drops a tool instead of widening access).
 */
export const CHAT_TOOL_ALLOWLIST = new Set([
  'read_file',
  'edit_file',
  'write_file',
  'batch_write',
  'project_structure',
  'compile',
  'commit',
  'list_citations',
  'list_labels',
  'wordcount',
]);
