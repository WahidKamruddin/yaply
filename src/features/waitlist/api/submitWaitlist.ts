import { supabase } from '@/lib/supabase'

export async function submitWaitlist(name: string, email: string): Promise<void> {
  const { error } = await supabase.functions.invoke('join-waitlist', {
    body: { name, email },
  })
  if (error) throw error
}
