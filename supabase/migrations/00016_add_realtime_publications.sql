-- Add message_reactions and profiles to the Supabase Realtime publication.
-- Without this, reaction changes and profile updates are never broadcast
-- to subscribed clients (reactions appear non-realtime).
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.profiles;
