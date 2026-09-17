import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { apnsJwt, sendToDevice } from './apns.ts'
import {
  buildPayload,
  buildSimplePayload,
  type MessageContext,
  type SimpleTarget,
  type Target,
} from './payload.ts'

// Kinds with no encrypted content; resolved by a single RPC that returns both
// the recipient tokens and the text to display.
const SIMPLE_KINDS = ['friend_request', 'friend_accepted', 'task_assigned', 'event_confirmed', 'reminder']

interface Deliverable {
  token: string
  environment: 'sandbox' | 'production'
  device_id: number
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-secret',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// This endpoint is deployed with verify_jwt = false so the database trigger can
// reach it, which makes the shared secret the only gate — compare it without
// leaking length or position through timing.
function secretMatches(provided: string, expected: string): boolean {
  const a = new TextEncoder().encode(provided)
  const b = new TextEncoder().encode(expected)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

const CONCURRENCY = 16
const MAX_TARGETS = 500

async function fanout<T extends Deliverable>(
  targets: T[],
  makePayload: (target: T) => string,
  collapseId: string,
  admin: SupabaseClient,
): Promise<{ sent: number; pruned: number; failed: number }> {
  const queue = targets.slice(0, MAX_TARGETS)
  if (targets.length > MAX_TARGETS) {
    console.warn(`fanout truncated: ${targets.length} targets for ${collapseId}`)
  }

  const stats = { sent: 0, pruned: 0, failed: 0 }
  let cursor = 0

  // Bounded concurrency: APNs is HTTP/2 so these multiplex over one connection,
  // but an unbounded Promise.all over a large group would exhaust the isolate's
  // socket budget and trip 429.
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (cursor < queue.length) {
      const target = queue[cursor++]
      try {
        const result = await sendToDevice(target.token, target.environment, makePayload(target), collapseId)

        if (result.outcome === 'sent') {
          stats.sent++
          await admin
            .from('push_tokens')
            .update({ fail_count: 0, last_success_at: new Date().toISOString() })
            .eq('token', target.token)
        } else if (result.outcome === 'prune') {
          stats.pruned++
          await admin.from('push_tokens').delete().eq('token', target.token)
        } else {
          stats.failed++
          console.error(`APNs failed for device ${target.device_id}: ${result.reason}`)
          await admin.rpc('push_token_record_failure', { p_token: target.token })
        }
      } catch (e) {
        stats.failed++
        console.error('send failed:', e instanceof Error ? e.message : String(e))
      }
    }
  })

  await Promise.all(workers)
  return stats
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const expectedSecret = Deno.env.get('PUSH_WEBHOOK_SECRET')
  if (!expectedSecret) return json({ error: 'Push is not configured' }, 500)

  const providedSecret = req.headers.get('x-push-secret') ?? ''
  if (!secretMatches(providedSecret, expectedSecret)) return json({ error: 'Forbidden' }, 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return json({ error: 'Invalid body' }, 400)

  // Credential probe: mints a provider token and returns its prefix so the
  // .p8 / key id / team id can be verified without a device or a real message.
  if (body.kind === 'jwt_check') {
    try {
      const token = await apnsJwt()
      return json({ ok: true, jwt_prefix: token.slice(0, 40), signature_chars: token.split('.')[2].length })
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceRoleKey) return json({ error: 'Push is not configured' }, 500)
  const admin = createClient(supabaseUrl, serviceRoleKey)

  if (SIMPLE_KINDS.includes(body.kind)) {
    const { data, error } = await admin.rpc('push_simple_notification', {
      p_kind: body.kind,
      p_payload: body,
    })
    if (error) {
      console.error('simple lookup failed:', error.message)
      return json({ error: 'Lookup failed' }, 500)
    }
    const targets = (data ?? []) as SimpleTarget[]

    // Collapse per subject, so re-firing the same trigger replaces rather than
    // stacks. Keyed on the subject of the notification, not its recipient —
    // collapsing friend requests on target_id would merge requests from
    // different people into one banner.
    const subjectId = (body.task_id ?? body.event_id ?? body.reminder_id ?? body.actor_id ?? '') as string
    const collapseId = `${body.kind}:${subjectId}`

    if (body.dry_run === true) {
      return json({
        ok: true,
        kind: body.kind,
        target_count: targets.length,
        targets: targets.map((t) => ({
          device_id: t.device_id,
          recipient_id: t.recipient_id,
          environment: t.environment,
          token: `${t.token.slice(0, 6)}…${t.token.slice(-4)}`,
          payload: JSON.parse(buildSimplePayload(body.kind, t).json),
        })),
      })
    }

    if (targets.length === 0) return json({ ok: true, target_count: 0 })
    const stats = await fanout(targets, (t) => buildSimplePayload(body.kind, t).json, collapseId, admin)
    return json({ ok: true, kind: body.kind, target_count: targets.length, ...stats })
  }

  if (body.kind !== 'message') return json({ error: `Unsupported kind: ${body.kind}` }, 400)
  if (typeof body.message_id !== 'string') return json({ error: 'Missing message_id' }, 400)

  const { data: ctxData, error: ctxError } = await admin.rpc('push_message_context', {
    p_message_id: body.message_id,
  })
  if (ctxError) {
    console.error('context lookup failed:', ctxError.message)
    return json({ error: 'Lookup failed' }, 500)
  }
  // Deleted between insert and dispatch, or never existed. Not an error.
  if (!ctxData) return json({ ok: true, skipped: 'message not found' })
  const ctx = ctxData as MessageContext

  const { data: targetData, error: targetError } = await admin.rpc('push_targets_for_message', {
    p_message_id: body.message_id,
  })
  if (targetError) {
    console.error('target lookup failed:', targetError.message)
    return json({ error: 'Lookup failed' }, 500)
  }
  const targets = (targetData ?? []) as Target[]

  // Runs the whole fanout and payload builder but stops short of Apple, so the
  // size logic, per-device envelope matching and every suppression rule are
  // verifiable from a terminal with no device and no certificate.
  if (body.dry_run === true) {
    return json({
      ok: true,
      kind: 'message',
      target_count: targets.length,
      targets: targets.map((t) => {
        const built = buildPayload(ctx, t)
        return {
          device_id: t.device_id,
          recipient_id: t.recipient_id,
          environment: t.environment,
          token: `${t.token.slice(0, 6)}…${t.token.slice(-4)}`,
          bytes: built.bytes,
          degraded: built.degraded,
          payload: JSON.parse(built.json),
        }
      }),
    })
  }

  if (targets.length === 0) return json({ ok: true, target_count: 0 })

  const stats = await fanout(targets, (t) => buildPayload(ctx, t).json, ctx.message_id, admin)
  return json({ ok: true, target_count: targets.length, ...stats })
})
