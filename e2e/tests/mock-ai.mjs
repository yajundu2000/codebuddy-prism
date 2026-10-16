import http from 'node:http';

/**
 * Mock OpenAI-compatible chat endpoint for the assistant-panel e2e test.
 * Scripted two-round behavior: the first call answers with an edit_file
 * tool_call (matching the sentinel the spec seeds into main.tex); once a
 * tool message comes back it answers with final prose. Same wire format
 * chatStream parses — stream chunks + [DONE].
 */

const PORT = Number(process.env.E2E_MOCK_AI_PORT || 4926);

export const EDIT_QUOTE = 'MOCKEDIT sentinel sentence waiting for the assistant.';
export const EDIT_SUFFIX = 'The assistant was here.';

// Only listen when run directly — the spec imports the constants above, and
// that import must not start a second listener (the config's webServer owns
// the port).
const runAsMain = process.argv[1] && process.argv[1].endsWith('mock-ai.mjs');

if (runAsMain) http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let messages = [];
    try { messages = JSON.parse(body).messages || []; } catch { /* empty body → final round */ }
    const hasTool = messages.some((m) => m.role === 'tool');
    const send = (delta) => res.write(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (!hasTool) {
      const args = JSON.stringify({
        path: 'main.tex',
        edits: [{ quote: EDIT_QUOTE, replacement: `${EDIT_QUOTE} ${EDIT_SUFFIX}` }],
        message: 'Append the assistant marker',
      });
      send({ tool_calls: [{ index: 0, id: 'call_e2e_1', type: 'function', function: { name: 'edit_file', arguments: args } }] });
      send({ finish_reason: 'tool_calls' });
    } else {
      send({ content: `Edited main.tex and committed; the file now contains the marker.` });
      send({ finish_reason: 'stop' });
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });
}).listen(PORT, () => console.log(`mock-ai on :${PORT}`));
