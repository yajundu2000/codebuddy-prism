import type { AgentMessage } from '../api';

/**
 * One chat message: markdown-lite rendering (paragraphs, bold/italic, inline
 * code, fenced code blocks) — enough for assistant prose without a markdown
 * dependency. Tool turns render as a compact card.
 */

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // `code`, **bold**, *italic* — leftmost match wins, no nesting inside code.
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[1] !== undefined) out.push(<code key={key}>{m[1]}</code>);
    else if (m[2] !== undefined) out.push(<strong key={key}>{m[2]}</strong>);
    else out.push(<em key={key}>{m[3]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderText(content: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = [];
  const parts = content.split(/```(\w*)\n?([\s\S]*?)```/);
  // alternating: [text, lang, code, text, lang, code, ...]
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      const paras = parts[i].split(/\n{2,}/).filter((p) => p.trim());
      paras.forEach((p, j) => blocks.push(<p key={`t${i}-${j}`}>{inline(p, `t${i}-${j}`)}</p>));
    } else if (parts[i + 1] !== undefined) {
      const lang = parts[i];
      const code = parts[i + 1].replace(/\n$/, '');
      i++;
      blocks.push(
        <pre key={`c${i}`} className="assistant__code" data-lang={lang || undefined}>
          {code}
        </pre>,
      );
    }
  }
  return blocks;
}

export default function AssistantMessage({ message }: { message: AgentMessage }) {
  if (message.role === 'tool') {
    return (
      <div className="assistant__tool" data-testid="assistant-tool">
        <span className="assistant__tool-name">{message.toolName || 'tool'}</span>
        <pre className="assistant__tool-out">{message.content.slice(0, 800)}{message.content.length > 800 ? '…' : ''}</pre>
      </div>
    );
  }
  return (
    <div className={`assistant__msg assistant__msg--${message.role}`} data-testid={`assistant-${message.role}`}>
      {renderText(message.content)}
    </div>
  );
}
