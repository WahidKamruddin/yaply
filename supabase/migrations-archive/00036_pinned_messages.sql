-- ─── Pinned messages ─────────────────────────────────────────────────────────
-- A conversation member can pin a message; the pin is visible to every member
-- and shown in a banner at the top of the conversation. Any member can unpin.
--
-- A separate table rather than a `messages.pinned_at` column on purpose: the
-- `messages` UPDATE policy is deliberately narrow (sender-only soft delete), and
-- widening it so every member can write to `messages` just to toggle a pin would
-- also hand them a path to touch `content`. Pin state lives in its own table
-- with its own membership-scoped policies and never touches `messages`.

create table if not exists public.pinned_messages (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id      uuid not null references public.messages(id) on delete cascade,
  pinned_by       uuid references public.profiles(id) on delete set null,
  pinned_at       timestamptz not null default now(),
  primary key (conversation_id, message_id)
);

create index if not exists pinned_messages_conversation_idx
  on public.pinned_messages (conversation_id, pinned_at desc);

alter table public.pinned_messages enable row level security;

-- Any member of the conversation can see its pins.
create policy "pinned_messages: members can view"
  on public.pinned_messages for select
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = pinned_messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

-- Any member can pin a message; pinned_by must be the caller.
create policy "pinned_messages: members can pin"
  on public.pinned_messages for insert
  with check (
    auth.uid() = pinned_by
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = pinned_messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

-- Any member can unpin (not just whoever pinned it).
create policy "pinned_messages: members can unpin"
  on public.pinned_messages for delete
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = pinned_messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

-- Realtime so a pin/unpin on one device reflects on the others immediately.
alter publication supabase_realtime add table public.pinned_messages;
