import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  // Identify the caller from their own JWT — the id to delete is never taken
  // from the request body, so a caller can only ever delete their own account.
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })

  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Not authenticated' }, 401)
  const userId = userData.user.id

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceRoleKey) return json({ error: 'Account deletion is not configured' }, 500)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Best-effort cleanup of the user's avatar object(s); the profile row and
  // every other reference is removed by the FK cascades off auth.users once
  // the auth user itself is deleted below.
  const { data: avatarFiles } = await adminClient.storage.from('avatars').list(userId)
  if (avatarFiles?.length) {
    await adminClient.storage.from('avatars').remove(avatarFiles.map((f) => `${userId}/${f.name}`))
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
  if (deleteError) {
    console.error('Account deletion failed:', deleteError.message)
    return json({ error: 'Failed to delete account' }, 500)
  }

  return json({ ok: true })
})
