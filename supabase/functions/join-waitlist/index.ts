// Public waitlist signup — no session required (this runs while sign-in is
// locked). Appends {name, email, timestamp} to a Google Sheet via a service
// account. See google.ts for the token/append logic.
import { appendWaitlistRow } from './google.ts'

const MAX_NAME_LEN = 100
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

  let body: { name?: unknown; email?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!name || !email) return json({ error: 'Name and email are required' }, 400)
  if (name.length > MAX_NAME_LEN) return json({ error: 'Name is too long' }, 400)
  if (email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return json({ error: 'Enter a valid email address' }, 400)
  }

  try {
    await appendWaitlistRow(name, email)
  } catch (err) {
    console.error('join-waitlist failed:', err)
    return json({ error: 'Failed to record signup' }, 502)
  }

  return json({ ok: true })
})
