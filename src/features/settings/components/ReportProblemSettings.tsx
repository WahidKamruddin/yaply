import { useState } from 'react'
import { Bug, Send, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function ReportProblemSettings() {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSending(true)
    try {
      const { error: invokeError } = await supabase.functions.invoke('report-problem', {
        body: { subject: subject.trim(), message: message.trim() },
      })
      if (invokeError) throw invokeError
      setSent(true)
      setSubject('')
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send report')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-3 h-64">
        <div className="w-12 h-12 rounded-full bg-accent-mint/15 flex items-center justify-center">
          <Check size={22} className="text-accent-mint" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text">Report sent</p>
          <p className="text-sm text-text-subtle mt-1 max-w-xs">Thanks — we'll take a look. Replies will go to your account email.</p>
        </div>
        <button
          onClick={() => setSent(false)}
          className="text-sm font-medium text-primary-text hover:underline underline-offset-2"
        >
          Send another
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-8 h-8 flex items-center justify-center rounded-full bg-tint flex-shrink-0">
          <Bug size={15} className="text-text-subtle" />
        </span>
        <p className="text-sm text-text-muted">Found a bug or something not working right? Let us know below.</p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div>
          <label htmlFor="report-subject" className="block text-xs font-medium text-text-subtle mb-1.5">Subject</label>
          <input
            id="report-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Short summary"
            required
            maxLength={150}
            className="w-full px-3 py-2.5 rounded-xl bg-tint border border-border text-sm text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-[#5b8def]/50 focus:border-[#5b8def]/50 transition"
          />
        </div>
        <div>
          <label htmlFor="report-message" className="block text-xs font-medium text-text-subtle mb-1.5">What happened?</label>
          <textarea
            id="report-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Steps to reproduce, what you expected, what you saw…"
            required
            rows={6}
            maxLength={5000}
            className="w-full px-3 py-2.5 rounded-xl bg-tint border border-border text-sm text-text placeholder:text-text-subtle outline-none resize-none focus:ring-1 focus:ring-[#5b8def]/50 focus:border-[#5b8def]/50 transition"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={sending || !subject.trim() || !message.trim()}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {sending ? (
            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <>
              <Send size={14} />
              Send report
            </>
          )}
        </button>
      </form>
    </div>
  )
}
