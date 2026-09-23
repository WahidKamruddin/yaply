import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export async function submitWaitlist(email: string): Promise<void> {
  const { error } = await supabase.functions.invoke('join-waitlist', {
    body: { email },
  })
  if (!error) return
  // invoke's own message is a generic "non-2xx status code"; surface the
  // function's `{ error }` body instead when there is one.
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null
    if (body?.error) throw new Error(body.error)
  }
  throw new Error('Something went wrong. Try again.')
}
