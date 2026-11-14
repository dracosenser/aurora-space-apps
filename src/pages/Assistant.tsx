import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot, Send, Trash2, User, Cpu } from 'lucide-react'
import type { AssistantMessage } from '../types'
import { useMission, ASTRONAUTS, EVENTS, MISSION } from '../hooks/useMission'
import { answerQuestion, SUGGESTED_QUESTIONS } from '../lib/assistant'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Disclaimer } from '../components/ui/Misc'
import { Logo } from '../components/layout/Sidebar'

export function Assistant() {
  const m = useMission()
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [m.chat.length, thinking])

  const ask = (q: string) => {
    const text = q.trim()
    if (!text || thinking) return
    const userMsg: AssistantMessage = { id: `u-${Date.now()}`, role: 'user', text, timestamp: Date.now() }
    m.setChat((c) => [...c, userMsg])
    setInput('')
    setThinking(true)
    window.setTimeout(() => {
      const ans = answerQuestion(text, {
        records: m.visibleRecords,
        astronauts: ASTRONAUTS,
        alerts: m.alerts,
        statuses: m.statuses,
        asOfDay: m.viewDay,
        mission: MISSION,
        events: EVENTS,
        lastScenario: m.lastScenario,
      })
      const botMsg: AssistantMessage = { id: `a-${Date.now()}`, role: 'assistant', text: ans.text, reasoning: ans.reasoning, facts: ans.facts, hypotheses: ans.hypotheses, suggestions: ans.suggestions, timestamp: Date.now() }
      m.setChat((c) => [...c, botMsg])
      setThinking(false)
    }, 350)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    ask(input)
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[560px] flex-col">
      <PageHeader title="AI Mission Assistant" description="Ask questions about the data loaded in AURORA. Answers are computed from the current mission view with the reasoning shown and facts separated from hypotheses." />
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-4">
        <Card className="flex min-h-0 flex-col xl:col-span-3" flush bodyClassName="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Cpu className="h-3.5 w-3.5 text-accent" />
              <span>
                Local rule-based engine · computing over MD {m.viewDay} data · {m.visibleRecords.length} records · {m.alerts.length} alerts
              </span>
            </div>
            <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => m.setChat(() => [])} disabled={m.chat.length === 0}>
              Clear
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {m.chat.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <Logo size={44} />
                <p className="text-sm font-semibold text-text-strong">How can I help with the {MISSION.name} crew data?</p>
                <p className="max-w-md text-xs text-muted">I answer from the records, alerts and simulator state in this application. I explain my reasoning and I never diagnose. Try one of the questions on the right.</p>
              </div>
            )}
            {m.chat.map((msg) => (
              <Message key={msg.id} msg={msg} onSuggest={ask} />
            ))}
            {thinking && (
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">Computing over mission data…</div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-border p-3">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about crew health, alerts, radiation, the mission, or the simulator…" className="h-10 flex-1 rounded-md border border-border-strong bg-surface-2 px-3 text-sm text-text-strong outline-none placeholder:text-muted focus:border-accent" aria-label="Question" />
            <Button type="submit" variant="primary" icon={<Send className="h-4 w-4" />} disabled={!input.trim() || thinking}>
              Ask
            </Button>
          </form>
        </Card>
        <div className="space-y-4 overflow-y-auto">
          <Card title="Suggested questions">
            <div className="flex flex-col gap-1.5">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button key={q} onClick={() => ask(q)} className="rounded-md border border-border bg-surface-2 px-2.5 py-2 text-left text-xs text-text transition-colors hover:border-accent/50 hover:text-text-strong">
                  {q}
                </button>
              ))}
            </div>
          </Card>
          <Disclaimer>
            <strong className="text-text-strong">No external AI model is connected.</strong> This assistant matches your question to a set of analytical intents and computes the answer from AURORA's own data. It cannot browse, cannot invent research, and will say so when a question falls outside the loaded data.
          </Disclaimer>
        </div>
      </div>
    </div>
  )
}

function Message({ msg, onSuggest }: { msg: AssistantMessage; onSuggest: (q: string) => void }) {
  const [showWhy, setShowWhy] = useState(false)
  const isUser = msg.role === 'user'
  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-surface-3 text-text' : 'bg-accent/15 text-accent'}`}>{isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</div>
      <div className={`max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block rounded-lg border px-3.5 py-2.5 text-left text-sm leading-relaxed ${isUser ? 'border-accent/30 bg-accent/10 text-text-strong' : 'border-border bg-surface-2 text-text'}`}>
          <Markdown text={msg.text} />
        </div>
        {!isUser && (msg.reasoning?.length || msg.facts?.length || msg.hypotheses?.length) ? (
          <div className="mt-1.5">
            <button onClick={() => setShowWhy((s) => !s)} className="text-[11px] font-medium text-accent hover:underline">
              {showWhy ? 'Hide' : 'Show'} reasoning, facts & hypotheses
            </button>
            {showWhy && (
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <Panel title="Reasoning" tone="accent" items={msg.reasoning ?? []} />
                <Panel title="Facts" tone="ok" items={msg.facts ?? []} />
                <Panel title="Hypotheses & caveats" tone="warn" items={msg.hypotheses ?? []} />
              </div>
            )}
          </div>
        ) : null}
        {!isUser && msg.suggestions?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.suggestions.map((s) => (
              <button key={s} onClick={() => onSuggest(s)} className="rounded-full border border-border-strong bg-surface px-2.5 py-1 text-[11px] text-muted hover:border-accent/50 hover:text-text-strong">
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Panel({ title, items, tone }: { title: string; items: string[]; tone: 'accent' | 'ok' | 'warn' }) {
  return (
    <div className="rounded-md border border-border bg-surface p-2.5">
      <Badge tone={tone}>{title}</Badge>
      {items.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-muted">None.</p>
      ) : (
        <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-text">
          {items.map((it) => (
            <li key={it} className="flex gap-1.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Minimal renderer for the assistant's **bold**, bullets and paragraphs. */
export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/)
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-4">
              {lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l.slice(2)} />
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                <Inline text={l} />
                {j < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i} className="font-semibold text-text-strong">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}
    </>
  )
}
