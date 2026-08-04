import { FileText } from 'lucide-react'

const SECTIONS = [
  {
    title: '1. Acceptance of terms',
    body: 'By using yaply you agree to these terms. yaply is currently in active development — features, availability, and these terms may change without prior notice.',
  },
  {
    title: '2. Your account',
    body: "You're responsible for keeping your login credentials secure and for activity that happens under your account. You must be able to legally use messaging services in your jurisdiction.",
  },
  {
    title: '3. Acceptable use',
    body: 'No harassment, spam, illegal content, or attempts to disrupt or reverse-engineer the service. We may suspend accounts that violate this.',
  },
  {
    title: '4. Content ownership',
    body: 'You retain ownership of the messages, media, and content you send. Encrypted content is unreadable to us; unencrypted media you upload is stored to provide the service and is not used for any other purpose.',
  },
  {
    title: '5. No warranty',
    body: 'yaply is provided "as is" during development, without warranty of any kind, including around uptime, data retention, or fitness for a particular purpose.',
  },
  {
    title: '6. Termination',
    body: 'You may stop using yaply and delete your account at any time. We may suspend accounts for violations of these terms.',
  },
]

export default function TermsSettings() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-8 h-8 flex items-center justify-center rounded-full bg-tint flex-shrink-0">
          <FileText size={15} className="text-text-subtle" />
        </span>
        <p className="text-sm font-semibold text-text">Terms of Service</p>
      </div>
      <p className="text-xs text-text-subtle mb-5">Draft — last updated for preview purposes only.</p>

      <div className="space-y-5">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <p className="text-sm font-semibold text-text mb-1">{s.title}</p>
            <p className="text-sm text-text-muted leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
