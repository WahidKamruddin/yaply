import { Shield } from 'lucide-react'

const SECTIONS = [
  {
    title: 'What we store',
    body: 'Your profile (name, username, avatar, bio, birthdate), device public keys, and message metadata (who a conversation is with, timestamps, and conversation membership) are stored in our database. Message text content is end-to-end encrypted — we store ciphertext, not plaintext.',
  },
  {
    title: 'What we can and cannot see',
    body: "We cannot read the text of your messages. Encryption keys are generated and stored on your own devices; our servers only ever see encrypted content. We can see who you talk to, when, and how often, since that metadata isn't encrypted. Media (images, files, stickers) is not currently encrypted.",
  },
  {
    title: 'Third parties',
    body: 'We use Supabase for database, auth, and storage, and Resend to deliver bug report emails you submit. We do not sell your data or share it with advertisers.',
  },
  {
    title: 'Your controls',
    body: 'You can edit or delete your profile information at any time from Account settings. Deleting a conversation removes it and its messages from your view; deleting your account removes your profile data.',
  },
  {
    title: 'Changes to this policy',
    body: "This is a placeholder policy while yaply is in active development. We'll notify you in-app before any material change takes effect.",
  },
]

export default function PrivacyPolicySettings() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-8 h-8 flex items-center justify-center rounded-full bg-tint flex-shrink-0">
          <Shield size={15} className="text-text-subtle" />
        </span>
        <p className="text-sm font-semibold text-text">Privacy Policy</p>
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
