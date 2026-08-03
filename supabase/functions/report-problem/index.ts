// Relays a "Report a Problem" submission to the developer's inbox via Resend,
// so the destination address never appears in client code.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const REPORT_RECIPIENT = 'wahidkamruddin101@gmail.com'
const MAX_SUBJECT_LEN = 150
const MAX_MESSAGE_LEN = 5000

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

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Not authenticated' }, 401)
  const reporter = userData.user

  let body: { subject?: unknown; message?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!subject || !message) return json({ error: 'Subject and message are required' }, 400)
  if (subject.length > MAX_SUBJECT_LEN) return json({ error: 'Subject is too long' }, 400)
  if (message.length > MAX_MESSAGE_LEN) return json({ error: 'Message is too long' }, 400)

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return json({ error: 'Email delivery is not configured' }, 500)

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'yaply Bug Reports <onboarding@resend.dev>',
      to: [REPORT_RECIPIENT],
      reply_to: reporter.email ?? undefined,
      subject: `[yaply bug report] ${subject}`,
      text: `From: ${reporter.email ?? 'unknown'} (user id: ${reporter.id})\n\n${message}`,
    }),
  })

  if (!resendResponse.ok) {
    const detail = await resendResponse.text()
    console.error('Resend delivery failed:', detail)
    return json({ error: 'Failed to send report' }, 502)
  }

  return json({ ok: true })
})
