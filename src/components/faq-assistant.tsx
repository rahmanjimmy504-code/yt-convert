'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  MessageCircle,
  Trash2,
  Copy,
  Check,
  Loader2,
  Lightbulb,
  ArrowRight,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  related?: string[];
}

const SUGGESTED: string[] = [
  'How do I download a YouTube video to MP3?',
  'Which platforms are supported?',
  'Is YT Convert safe and legal?',
  'Why is my link not recognized?',
  'How do I install YT Convert as an app?',
  'What does the Working / Unavailable badge mean?',
  'Can YT Convert be used without internet?',
  'How does auto-copy work?',
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export default function FaqAssistant() {
  const [llmInfo, setLlmInfo] = useState<{ llm: string; model: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hi! I'm the YT Convert Assistant 🤖 — ask me anything about YT Convert. I can explain how converters work, supported platforms, troubleshooting, privacy, legal, PWA install, shortcuts, and more. I answer from the official docs and FAQ, so you get accurate info even if your question isn't listed above.",
      related: SUGGESTED.slice(0, 3),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/faq-assistant')
      .then(r => r.json())
      .then(d => {
        if (d.llm && d.model) setLlmInfo({ llm: d.llm, model: d.model });
      })
      .catch(() => {});
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  const send = useCallback(
    async (q: string) => {
      const question = q.trim();
      if (!question || loading) return;
      if (question.length > 500) {
        setError('Question too long — max 500 characters.');
        return;
      }
      setError('');
      setInput('');
      const userMsg: Message = { id: uid(), role: 'user', content: question };
      setMessages(m => [...m, userMsg]);
      setLoading(true);

      try {
        const res = await fetch('/api/faq-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
        });
        const data = (await res.json()) as {
          answer?: string;
          sources?: string[];
          related?: string[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || 'Failed to get answer');
        }
        const assistantMsg: Message = {
          id: uid(),
          role: 'assistant',
          content: data.answer || 'Sorry, I had trouble answering that.',
          sources: data.sources,
          related: data.related,
        };
        setMessages(m => [...m, assistantMsg]);
      } catch (e) {
        setMessages(m => [
          ...m,
          {
            id: uid(),
            role: 'assistant',
            content:
              e instanceof Error
                ? `Oops — ${e.message}. Try rephrasing, or pick a question from the FAQ above.`
                : 'Sorry, something went wrong. Try again.',
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const clear = () => {
    setMessages([
      {
        id: uid(),
        role: 'assistant',
        content:
          "Chat cleared! Ask me anything about YT Convert — supported platforms, how downloading works, why a link isn't recognized, privacy, legal, badges, etc.",
        related: SUGGESTED.slice(0, 3),
      },
    ]);
    setError('');
    inputRef.current?.focus();
  };

  return (
    <div className="mt-10 rounded-[24px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      {/* header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/20 shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              YT Convert AI Assistant <Sparkles className="w-3.5 h-3.5 text-red-500" />
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2 flex-wrap">
              <span>Ask anything not covered above — instant, privacy-friendly</span>
              {llmInfo && llmInfo.llm !== 'local' && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-[9px] font-bold tracking-wide">
                  {llmInfo.llm === 'groq' ? '⚡ GROQ' : llmInfo.llm.toUpperCase()} · {llmInfo.model}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:flex text-[10px] px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Online
          </span>
          <button
            onClick={clear}
            title="Clear chat"
            className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* messages */}
      <div
        ref={listRef}
        className="max-h-[420px] overflow-y-auto px-4 py-4 space-y-4 bg-gradient-to-br from-gray-50/50 to-white dark:from-gray-900 dark:to-gray-950 scroll-smooth"
      >
        {messages.map(m => (
          <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm relative group ${
                m.role === 'user'
                  ? 'bg-gradient-to-r from-red-500 to-red-600 text-white rounded-br-md'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-bl-md'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.content}</p>

              {m.role === 'assistant' && (m.sources?.length || m.related?.length) ? (
                <div className="mt-3 space-y-2">
                  {m.sources && m.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.sources.map(s => (
                        <span
                          key={s}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600"
                          title="Source FAQ"
                        >
                          📄 {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.related && m.related.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-700">
                      <p className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                        <Lightbulb className="w-3 h-3" /> Related questions
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {m.related.map(rq => (
                          <button
                            key={rq}
                            onClick={() => void send(rq)}
                            className="text-[11px] text-left px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-100 dark:border-red-800 transition-colors"
                          >
                            {rq}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {m.role === 'assistant' && (
                <button
                  onClick={() => void copy(m.content, m.id)}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shadow-sm flex items-center justify-center text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Copy answer"
                  aria-label="Copy answer"
                >
                  {copiedId === m.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>
            {m.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[11px] font-bold">You</span>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="flex items-center gap-1">
                Thinking
                <span className="animate-bounce">.</span>
                <span className="animate-bounce [animation-delay:0.2s]">.</span>
                <span className="animate-bounce [animation-delay:0.4s]">.</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* suggested chips */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
        <p className="text-[11px] text-gray-400 mb-2 flex items-center gap-1">
          <MessageCircle className="w-3 h-3" /> Try asking
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED.map(s => (
            <button
              key={s}
              onClick={() => void send(s)}
              disabled={loading}
              className="text-[11px] px-2.5 py-1 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-red-300 dark:hover:border-red-700 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* input */}
      <form onSubmit={onSubmit} className="p-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex gap-2 items-center">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about YT Convert — e.g. 'Why is my TikTok link not recognized?'"
            className="w-full h-11 pl-4 pr-10 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm placeholder:text-gray-400 dark:text-white"
            maxLength={500}
            disabled={loading}
          />
          {input && (
            <button
              type="button"
              onClick={() => setInput('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Clear input"
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="h-11 px-4 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Ask
        </button>
      </form>

      {error && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
            {error}
          </p>
        </div>
      )}

      <div className="px-5 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <p className="text-[10px] text-gray-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />{' '}
          {llmInfo?.llm === 'groq'
            ? `Powered by Groq ${llmInfo.model} — fast, privacy-friendly, falls back to local docs`
            : llmInfo?.llm === 'openai'
              ? `Powered by ${llmInfo.model} — falls back to local docs`
              : 'Privacy-friendly — answers from local docs, upgrades to Groq/OpenAI if key set'}
        </p>
        <p className="text-[10px] text-gray-400 hidden sm:block">Press Enter to send</p>
      </div>
    </div>
  );
}
