// The "thanks for joining" email sent after a waitlist signup, via Resend.
// Copy lives in the constants below and feeds both the HTML and plain-text
// versions so they never drift; layout lives in renderHtml().

const SUBJECT = "You're on the Yaply waitlist"

const HEADLINE = "You're on the list."

const INTRO = [
  'Thanks for signing up for Yaply — a messenger where your conversations are sealed end to end, with the planning tools your group chat actually needs built right in.',
  "We're opening up in waves. When your spot comes up, we'll email you a link to create your account.",
]

const SIGN_OFF = ['Talk soon,', 'Wahid @ Yaply']

// Small icon links under the sign-off; each `icon` is public/email/<icon>.png.
// X and Instagram are placeholders until the real profiles exist.
const SOCIALS = [
  { icon: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com/in/wahid-kamruddin/' },
  { icon: 'x', label: 'X', url: 'https://x.com/' },
  { icon: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/' },
]

const FOOTER =
  "You're receiving this because this address was entered on the Yaply waitlist. If that wasn't you, you can safely ignore this email — we won't send anything else until Yaply is ready."

// Landing-page palette (src/routes/index.tsx, `.lp-light` theme); `blue` is
// its deeper accent.
const C = {
  bg: '#eef2fb',
  card: '#ffffff',
  cardLine: '#dde4f2',
  ink: '#17233f',
  dim: '#53688f',
  faint: '#667a9e',
  blue: '#2f6fe0',
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

const DEFAULT_SITE_URL = 'https://yaply.us'

// Resend's shared onboarding@resend.dev sender only delivers to the Resend
// account owner, so real signups need WAITLIST_FROM_EMAIL on a verified domain.
const DEFAULT_FROM = 'Yaply <onboarding@resend.dev>'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Table layout and inline styles: the only thing email clients render
// reliably. `siteUrl` hosts the header image; the override exists only for
// local previews. Exported for the same reason.
export function renderHtml(siteUrl = DEFAULT_SITE_URL): string {
  const site = siteUrl.replace(/\/+$/, '')

  // Logo + wordmark as one image (public/email/wordmark.png, 4x), because
  // Gmail and Outlook won't load the Bricolage Grotesque web font.
  const header = `<a href="${escapeHtml(site)}" style="display:inline-block;text-decoration:none;"><img src="${escapeHtml(site)}/email/wordmark.png" width="108" height="36" alt="yaply" style="display:block;border:0;width:108px;height:36px;font-size:24px;font-weight:600;color:${C.ink};"></a>`

  const socials = SOCIALS.map(
    (s) =>
      `<td style="padding-right:14px;"><a href="${escapeHtml(s.url)}" style="text-decoration:none;"><img src="${escapeHtml(site)}/email/${s.icon}.png" width="20" height="20" alt="${escapeHtml(s.label)}" style="display:block;border:0;width:20px;height:20px;font-size:11px;color:${C.dim};"></a></td>`,
  ).join('')

  const intro = INTRO.map(
    (p) =>
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:${C.dim};">${escapeHtml(p)}</p>`,
  ).join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(INTRO[1])}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background:${C.bg};">
    <tr><td align="center" style="padding:40px 16px;font-family:${FONT};">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 8px 24px;">
          ${header}
        </td></tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.card}" style="max-width:560px;background:${C.card};border:1px solid ${C.cardLine};border-radius:20px;">
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.blue};border-radius:20px 20px 0 0;">&nbsp;</td></tr>

        <tr><td style="padding:36px 40px 0;">
          <h1 style="margin:0 0 20px;font-size:34px;line-height:1.15;font-weight:700;letter-spacing:-1px;color:${C.ink};">${escapeHtml(HEADLINE)}</h1>
          ${intro}
        </td></tr>

        <tr><td style="padding:28px 40px 40px;">
          <p style="margin:0;font-size:15px;line-height:1.6;color:${C.dim};">${SIGN_OFF.map(escapeHtml).join('<br>')}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px;"><tr>${socials}</tr></table>
        </td></tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:24px 24px 0;text-align:center;font-size:12px;line-height:1.6;color:${C.faint};">
          ${escapeHtml(FOOTER)}
        </td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`
}

function renderText(): string {
  return [
    HEADLINE,
    '',
    ...INTRO.flatMap((p) => [p, '']),
    ...SIGN_OFF,
    '',
    ...SOCIALS.map((s) => `${s.label}: ${s.url}`),
    '',
    '—',
    FOOTER,
  ].join('\n')
}

export async function sendWaitlistThankYou(email: string): Promise<void> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) throw new Error('RESEND_API_KEY is not configured')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('WAITLIST_FROM_EMAIL') ?? DEFAULT_FROM,
      to: [email],
      subject: SUBJECT,
      html: renderHtml(),
      text: renderText(),
    }),
  })
  if (!res.ok) throw new Error(`Resend delivery failed: ${await res.text()}`)
}
