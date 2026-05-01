-- ─── Messages ─────────────────────────────────────────────────────────────────

create type public.message_type as enum ('text', 'image', 'gif', 'sticker', 'file', 'system', 'ai');

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete set null,
  type            public.message_type not null default 'text',
  content         text not null,          -- AES-GCM ciphertext (base64) or system plaintext
  iv              text,                   -- base64 AES-GCM IV; NULL = phase-1 fallback (base64 only)
  media_url       text,
  media_mime      text,
  reply_to_id     uuid references public.messages (id) on delete set null,
  thread_id       uuid references public.messages (id) on delete set null,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_idx       on public.messages (sender_id);
create index messages_thread_idx       on public.messages (thread_id) where thread_id is not null;

-- ─── Message reactions ────────────────────────────────────────────────────────
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- ─── Update last_message_at on conversations ──────────────────────────────────
create or replace function public.update_conversation_last_message()
returns trigger language plpgsql security definer as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      updated_at      = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_update_conversation
  after insert on public.messages
  for each row execute function public.update_conversation_last_message();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;

create policy "messages: member can select"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

create policy "messages: member can insert"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_id
        and cm.user_id = auth.uid()
    )
  );

create policy "messages: sender can update"
  on public.messages for update
  using (auth.uid() = sender_id);

create policy "message_reactions: member can select"
  on public.message_reactions for select
  using (
    exists (
      select 1
      from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = message_id
        and cm.user_id = auth.uid()
    )
  );

create policy "message_reactions: member can insert"
  on public.message_reactions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = message_id
        and cm.user_id = auth.uid()
    )
  );

create policy "message_reactions: self can delete"
  on public.message_reactions for delete
  using (user_id = auth.uid());
