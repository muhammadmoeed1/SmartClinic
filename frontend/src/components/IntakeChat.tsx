import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TriageSummary } from '../types';
import * as aiApi from '../api/ai';
import { getErrorMessage, isAiFallback } from '../utils';
import Modal from './Modal';
import Button from './Button';
import Spinner from './Spinner';
import TriageSummaryCard from './TriageSummaryCard';
import { IconSparkle } from './Icons';
import { toast } from '../store/toasts';

interface IntakeChatProps {
  appointmentId: string;
  onClose: () => void;
}

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
}

type Mode = 'starting' | 'chat' | 'fallback' | 'done';

export default function IntakeChat({ appointmentId, onClose }: IntakeChatProps) {
  const [mode, setMode] = useState<Mode>('starting');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [summary, setSummary] = useState<TriageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    aiApi
      .intakeStart()
      .then((res) => {
        if (cancelled) return;
        setSessionId(res.sessionId);
        setMessages([{ role: 'assistant', text: res.message }]);
        setMode('chat');
      })
      .catch((err) => {
        if (cancelled) return;
        if (isAiFallback(err)) {
          setMode('fallback');
        } else {
          setError(getErrorMessage(err));
          setMode('chat');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, mode]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !sessionId || sending) return;
    setInput('');
    setError(null);
    setMessages((m) => [...m, { role: 'user', text }]);
    setSending(true);
    setStreaming(false);

    let streamed = '';
    let bubbleStarted = false;
    try {
      await aiApi.intakeMessageStream(sessionId, text, (event) => {
        if (event.type === 'text') {
          streamed += event.delta;
          setMessages((m) => {
            if (!bubbleStarted) {
              bubbleStarted = true;
              setStreaming(true);
              return [...m, { role: 'assistant', text: streamed }];
            }
            const next = [...m];
            next[next.length - 1] = { role: 'assistant', text: streamed };
            return next;
          });
        } else if (event.type === 'done') {
          if (event.completed) {
            setSummary(event.summary ?? null);
            setMode('done');
          }
        } else if (event.type === 'error') {
          if (event.fallback) {
            toast('The assistant is unavailable — switching to the standard form.', 'info');
            setMode('fallback');
          } else {
            setError('Something went wrong — please try again.');
          }
        }
      });
    } catch (err) {
      if (isAiFallback(err)) {
        toast('The assistant is unavailable — switching to the standard form.', 'info');
        setMode('fallback');
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setSending(false);
      setStreaming(false);
    }
  };

  return (
    <Modal title="Pre-visit intake" onClose={onClose} wide>
      {mode === 'starting' && <Spinner block label="Starting your intake session…" />}

      {(mode === 'chat' || mode === 'done') && (
        <div className="chat">
          <div className="chat-head">
            <span className="chat-head__icon">
              <IconSparkle size={18} />
            </span>
            <span className="chat-head__text">
              <strong>AI Intake Assistant</strong>
              <span className="chat-head__status">
                <span className="pulse-dot" aria-hidden="true" />
                {mode === 'done' ? 'Intake complete' : 'Online — answers shared with your doctor'}
              </span>
            </span>
          </div>
          <div className="chat__messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat__bubble chat__bubble--${m.role}`}>
                {m.text}
              </div>
            ))}
            {sending && !streaming && (
              <div className="chat__bubble chat__bubble--assistant chat__bubble--typing">
                <span className="typing-dots" aria-label="Assistant is typing">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )}
            {mode === 'done' && summary && (
              <div className="chat__summary">
                <h4>Intake summary — shared with your doctor</h4>
                <div className="chat__summary-card">
                  <TriageSummaryCard summary={summary} />
                </div>
                <Button onClick={onClose}>Done</Button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          {error && <p className="inline-error">{error}</p>}
          {mode === 'chat' && (
            <form className="chat__input-row" onSubmit={(e) => void send(e)}>
              <input
                className="input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your answer…"
                autoFocus
                disabled={sending || !sessionId}
              />
              <Button type="submit" disabled={!input.trim() || !sessionId} loading={sending}>
                Send
              </Button>
            </form>
          )}
        </div>
      )}

      {mode === 'fallback' && (
        <FallbackIntakeForm appointmentId={appointmentId} onDone={onClose} />
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function FallbackIntakeForm({
  appointmentId,
  onDone,
}: {
  appointmentId: string;
  onDone: () => void;
}) {
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [durationDays, setDurationDays] = useState('1');
  const [severity, setSeverity] = useState(5);
  const [history, setHistory] = useState('');
  const [medications, setMedications] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await aiApi.intakeManual({
        appointmentId,
        chiefComplaint: chiefComplaint.trim(),
        symptomDurationDays: Math.max(0, Number(durationDays) || 0),
        severity,
        relevantHistory: history.trim(),
        currentMedications: medications.trim(),
        redFlags: [],
      });
      toast('Intake form submitted. Thank you!', 'success');
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="stack" onSubmit={(e) => void submit(e)}>
      <div className="info-banner">
        The AI assistant is currently unavailable — please fill in this short form instead.
      </div>
      <label className="form-group">
        <span>What brings you in? (chief complaint)</span>
        <textarea
          className="input"
          rows={2}
          required
          value={chiefComplaint}
          onChange={(e) => setChiefComplaint(e.target.value)}
        />
      </label>
      <div className="form-row">
        <label className="form-group">
          <span>How many days have you had symptoms?</span>
          <input
            className="input"
            type="number"
            min={0}
            required
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
          />
        </label>
        <label className="form-group">
          <span>
            Severity: <strong>{severity} / 10</strong>
          </span>
          <input
            type="range"
            min={1}
            max={10}
            value={severity}
            onChange={(e) => setSeverity(Number(e.target.value))}
          />
        </label>
      </div>
      <label className="form-group">
        <span>Relevant medical history</span>
        <textarea
          className="input"
          rows={2}
          value={history}
          onChange={(e) => setHistory(e.target.value)}
        />
      </label>
      <label className="form-group">
        <span>Current medications</span>
        <textarea
          className="input"
          rows={2}
          value={medications}
          onChange={(e) => setMedications(e.target.value)}
        />
      </label>
      {error && <p className="inline-error">{error}</p>}
      <div className="actions-row">
        <Button type="submit" loading={saving}>
          Submit intake form
        </Button>
      </div>
    </form>
  );
}
