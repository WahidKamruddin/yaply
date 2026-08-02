-- ─── First-login username prompt ───────────────────────────────────────────
-- Neither signup path (email/password or Google OAuth) ever collects a
-- chosen username anymore — handle_new_user() seeds a placeholder from the
-- email's local part, and username_set = false on every fresh signup tells
-- the client to prompt for a real one on first login regardless of provider.
-- Existing rows default to true — they're not retroactively prompted.

alter table public.profiles
  add column if not exists username_set boolean not null default true;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, display_name, username_set)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
