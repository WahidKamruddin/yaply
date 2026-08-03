-- ─── Fix FKs blocking user deletion ────────────────────────────────────────
-- conversations.created_by, events.created_by, polls.created_by, and
-- message_receipts.user_id referenced profiles(id) with the default
-- ON DELETE NO ACTION, so deleting a user's auth.users row (which cascades
-- to their profiles row) would fail with a foreign key violation as soon as
-- that user had created a conversation/event/poll or left a read receipt.
-- Every other creator FK on profiles(id) already uses CASCADE (or SET NULL
-- for messages.sender_id, so a departed sender's messages stay visible to
-- the rest of the conversation) — these four were simply missed.
--
-- conversations.created_by gets SET NULL rather than CASCADE: it's the only
-- nullable one, and deleting an entire conversation just because its
-- creator's account was removed would also wipe it out for every other
-- still-active member. events/polls/message_receipts are NOT NULL columns,
-- so CASCADE is used there — matches the tasks_created_by_fkey precedent.

alter table public.conversations drop constraint conversations_created_by_fkey;
alter table public.conversations add constraint conversations_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.events drop constraint events_created_by_fkey;
alter table public.events add constraint events_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete cascade;

alter table public.polls drop constraint polls_created_by_fkey;
alter table public.polls add constraint polls_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete cascade;

alter table public.message_receipts drop constraint message_receipts_user_id_fkey;
alter table public.message_receipts add constraint message_receipts_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;
