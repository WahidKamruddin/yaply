import { supabase } from '@/lib/supabase'

export async function submitWaitlist(email: string): Promise<void> {
  const { error } = await supabase.functions.invoke('join-waitlist', {
    body: { email },
  })
  if (error) throw error
}
