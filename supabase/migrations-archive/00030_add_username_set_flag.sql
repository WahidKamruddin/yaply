-- ─── First-login username prompt ───────────────────────────────────────────
-- Neither signup path (email/password or Google OAuth) ever collects a
-- chosen username anymore — handle_new_user() seeds a placeholder from the
-- email's local part, and username_set = false on every fresh signup tells
-- the client to prompt for a real one on first login regardless of provider.
-- Existing rows default to true — they're not retroactively prompted.
--
-- username/display_name are NOT NULL on the live profiles table, and the
-- prior handle_new_user() had no fallback for either — any signup that
-- doesn't send `username` in auth metadata (i.e. every signup now, since
-- the client stopped sending it) would crash the trigger with a not-null
-- violation. This also preserves avatar_url from OAuth metadata (Google)
-- and de-duplicates the fallback username with a per-user suffix so two
-- people sharing an email local-part don't collide on profiles_username_key.

alter table public.profiles
  add column if not exists username_set boolean not null default true;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
begin
  insert into public.profiles (id, username, display_name, avatar_url, username_set)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1) || '_' || substr(new.id::text, 1, 6)),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
