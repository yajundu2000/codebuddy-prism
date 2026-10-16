import { useEffect, useRef, useState } from 'react';
import {
  aiStatus, agentChat, agentDeleteSession, agentSession, agentSessionList,
  type AgentMessage, type AgentSessionInfo, type AiStatus,
} from '../api';
import AssistantMessage from './AssistantMessage';

/**
 * AI writing assistant: streamed chat against the server-held key
 * (PRISM_AI_API_KEY — the browser never sees it), with a model picker and
 * per-project conversation list.
 */
export default function AssistantPanel({ id }: { id: string }) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [sessions, setSessions] = useState<AgentSessionInfo[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streamText, setStreamText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('');
  const [error, setError] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    aiStatus().then(setStatus).catch(() => setStatus({ configured: false, model: '', chatConfigured: false, models: [] }));
    agentSessionList(id).then((list) => {
      setSessions(list);
      if (list[0]) {
        setSessionId(list[0].id);
        agentSession(id, list[0].id).then((s) => setMessages(s.messages)).catch(() => {});
      }
    }).catch(() => {});
  }, [id]);

  useEffect(() => {
    setModel((m) => m || status?.models[0]?.id || '');
  }, [status]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, streamText]);

  const refreshSessions = () => {
    agentSessionList(id).then(setSessions).catch(() => {});
  };

  const send = () => {
    const message = input.trim();
    if (!message || streaming) return;
    setError('');
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: message, ts: Date.now() }]);
    setStreaming(true);
    setStreamText('');
    agentChat(
      id,
      { sessionId: sessionId || undefined, message, model: model || undefined },
      {
        onStart: (sid) => {
          if (!sessionId) setSessionId(sid);
        },
        onDelta: (text) => setStreamText((prev) => prev + text),
        onDone: () => {
          setStreamText((text) => {
            setMessages((prev) => [...prev, { role: 'assistant', content: text, ts: Date.now() }]);
            return '';
          });
          setStreaming(false);
          refreshSessions();
        },
        onError: (msg) => {
          setError(msg);
          setStreaming(false);
        },
      },
    ).catch((err) => {
      setError(err.name === 'AbortError' ? '' : `Connection failed: ${err.message}`);
      setStreaming(false);
    });
  };

  const newSession = () => {
    setSessionId('');
    setMessages([]);
    setError('');
  };

  const openSession = (sid: string) => {
    if (!sid) { newSession(); return; }
    setSessionId(sid);
    agentSession(id, sid).then((s) => setMessages(s.messages)).catch(() => setMessages([]));
  };

  const removeSession = async () => {
    if (!sessionId) return;
    await agentDeleteSession(id, sessionId).catch(() => {});
    newSession();
    refreshSessions();
  };

  const models = status?.models ?? [];
  const disabled = !status?.chatConfigured || streaming;

  return (
    <div className="assistant" data-testid="assistant-panel">
      <div className="assistant__head">
        <select
          className="assistant__sessions"
          value={sessionId}
          onChange={(e) => openSession(e.target.value)}
          aria-label="Conversation"
          data-testid="assistant-sessions"
        >
          <option value="">New conversation</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.title || 'Conversation'}</option>
          ))}
        </select>
        {sessionId && <button className="btn btn--small" onClick={removeSession} title="Delete this conversation">Delete</button>}
        {models.length > 1 && (
          <select className="assistant__model" value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model" data-testid="assistant-model">
            {models.map((m) => <option key={m.id} value={m.id}>{m.label || m.id}</option>)}
          </select>
        )}
      </div>
      <div className="assistant__log" ref={logRef}>
        {!status?.chatConfigured && (
          <div className="assistant__hint" data-testid="assistant-unconfigured">
            The assistant is off. Ask this instance&apos;s operator to set <code>PRISM_AI_API_KEY</code> on the server.
          </div>
        )}
        {messages.map((m, i) => <AssistantMessage key={i} message={m} />)}
        {streaming && <AssistantMessage message={{ role: 'assistant', content: streamText || '…', ts: Date.now() }} />}
        {error && <div className="assistant__error" data-testid="assistant-error">{error}</div>}
      </div>
      <div className="assistant__input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder={status?.chatConfigured ? 'Ask the assistant… (Enter to send)' : 'Assistant not configured'}
          disabled={!status?.chatConfigured}
          rows={3}
          data-testid="assistant-input"
        />
        <button className="btn btn--primary" onClick={send} disabled={disabled} data-testid="assistant-send">Send</button>
      </div>
    </div>
  );
}
