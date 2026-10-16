/**
 * System prompt and tool allowlist for the assistant panel's agent loop.
 */

export function assistantSystemPrompt(ctx: { project: string; branch: string }): string {
  return [
    'You are the writing assistant of codebuddy-prism, a collaborative LaTeX platform.',
    `The user is working on project "${ctx.project}" on branch "${ctx.branch}".`,
    'Help with drafting, revising, translating, and structuring LaTeX documents.',
    'When you edit files or compile, say what you did in one short sentence.',
    'Prefer minimal, surgical edits to the user\'s source; keep their voice and LaTeX style.',
  ].join(' ');
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
