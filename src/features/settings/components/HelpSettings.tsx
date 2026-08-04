import { useState } from 'react'
import { HelpCircle, ChevronDown, Bug } from 'lucide-react'

const FAQS = [
  {
    q: 'Are my messages actually private?',
    a: 'Text messages are end-to-end encrypted — the app encrypts them on your device before sending, and only your and your recipients\' devices can decrypt them. We (and anyone who might access our database) only ever see ciphertext. Media like images and files are not encrypted yet.',
  },
  {
    q: 'Why can\'t I read old messages on a new device?',
    a: 'Each device generates its own encryption keys. Messages sent before a new device existed were sealed to your other devices\' keys, so a brand-new device can\'t retroactively decrypt them. This is a known limitation — key backup/escrow would be needed to fix it, and we haven\'t built that yet.',
  },
  {
    q: 'I signed in with Google — can I set a password?',
    a: "No — password changes only apply to accounts created with email/password. Google accounts sign in through Google, so there's no yaply password to change.",
  },
  {
    q: 'How do I change my username?',
    a: 'Go to Settings → Account and edit the username field, then Save changes. Usernames must be unique, at least 3 characters, and can only contain lowercase letters, numbers, underscores, dots, and hyphens.',
  },
  {
    q: 'Can I recover a deleted conversation?',
    a: "No — deleting a conversation removes it and its messages for you. If everyone in a direct message has left, the conversation and its messages are permanently deleted for both sides.",
  },
  {
    q: 'How do reminders, tasks, and events work?',
    a: 'These live in the panel next to a conversation — accessible via the conversation header, or by typing slash commands like /remind, /create, /plan and /event directly in the message box.',
  },
  {
    q: 'Something\'s broken — what do I do?',
    a: 'Check the known issues list below first — it might already be tracked. If not, use Report a Problem to send us the details directly.',
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 py-3.5 text-left"
      >
        <span className="text-sm font-medium text-text">{q}</span>
        <ChevronDown
          size={16}
          className={`flex-shrink-0 text-text-subtle transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <p className="text-sm text-text-muted leading-relaxed pb-3.5 pr-6">{a}</p>}
    </div>
  )
}

export default function HelpSettings() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-8 h-8 flex items-center justify-center rounded-full bg-tint flex-shrink-0">
          <HelpCircle size={15} className="text-text-subtle" />
        </span>
        <p className="text-sm font-semibold text-text">Frequently asked questions</p>
      </div>
      <p className="text-sm text-text-subtle mb-2">
        Can't find what you're looking for? Use Report a Problem to reach out directly.
      </p>

      <div className="mt-4">
        {FAQS.map((f) => (
          <FaqItem key={f.q} q={f.q} a={f.a} />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-2.5 rounded-2xl border border-border bg-card p-4">
        <span className="w-8 h-8 flex items-center justify-center rounded-full bg-tint flex-shrink-0">
          <Bug size={14} className="text-text-subtle" />
        </span>
        <p className="text-sm text-text-muted">
          Still stuck? Head to <span className="font-medium text-text">Report a Problem</span> in the sidebar — bugs there are actively worked on.
        </p>
      </div>
    </div>
  )
}
