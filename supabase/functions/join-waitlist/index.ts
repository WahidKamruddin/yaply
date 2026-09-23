// Public waitlist signup — no session required (this runs while sign-in is
// locked). Appends {email, timestamp} to a Google Sheet via a service
// account (google.ts), then sends a thank-you email via Resend (email.ts).
import { sendWaitlistThankYou } from './email.ts'
import { appendWaitlistRow, hasWaitlistEmail } from './google.ts'

const MAX_EMAIL_LEN = 254
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { email?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) return json({ error: 'Email is required' }, 400)
  if (email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return json({ error: 'Enter a valid email address' }, 400)
  }

  try {
    // A repeat signup gets the same success response (so the form doesn't
    // reveal who is on the list) but no new row and no second email.
    if (await hasWaitlistEmail(email)) return json({ ok: true })
    await appendWaitlistRow(email)
  } catch (err) {
    console.error('join-waitlist failed:', err)
    return json({ error: "Couldn't join the waitlist. Try again." }, 502)
  }

  // The signup is recorded at this point, so a mail failure is logged, not
  // surfaced — the user is on the list either way.
  try {
    await sendWaitlistThankYou(email)
  } catch (err) {
    console.error('join-waitlist thank-you email failed:', err)
  }

  return json({ ok: true })
})
