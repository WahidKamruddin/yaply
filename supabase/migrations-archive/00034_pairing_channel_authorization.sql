-- Live device pairing: Realtime Authorization for the pairing channel.
--
-- Pairing transfers identity key material from an already-linked device to a
-- newly signed-in one over a Realtime broadcast channel. The pairing code that
-- names the channel is shown on screen (and encoded in a QR), so it is NOT a
-- secret — anyone who can read it off a screen knows the topic. The first line
-- of defence is therefore that the channel is PRIVATE and scoped to the
-- account: only sessions authenticated as the user named in the topic may
-- subscribe or broadcast on it.
--
-- Topic format: 'pairing:<user_id>:<code>'
--
-- This is not the only defence. The payload is AES-GCM encrypted under an
-- ECDH secret both devices derive, and both display a 6-digit SAS the human
-- must compare before the sending device releases anything — that is what
-- stops a second compromised session on the SAME account (which would pass
-- this policy) from impersonating the receiving device.
--
-- Note: realtime.messages had no policies at all before this migration, so
-- private channels were entirely unusable. Every existing channel in the app
-- (typing, presence, message invalidation) is public and unaffected — RLS on
-- realtime.messages only applies to channels opened with private: true.
-- Realtime evaluates these policies inside a transaction it rolls back; no
-- message is ever persisted to realtime.messages.

create policy "pairing_channel_read"
  on realtime.messages
  for select
  to authenticated
  using ((select realtime.topic()) like ('pairing:' || (select auth.uid())::text || ':%'));

create policy "pairing_channel_write"
  on realtime.messages
  for insert
  to authenticated
  with check ((select realtime.topic()) like ('pairing:' || (select auth.uid())::text || ':%'));
