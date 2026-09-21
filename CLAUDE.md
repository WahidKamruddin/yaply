# yaply — Codebase Reference

## Working Mode & Workflow Rules

### Platform Context

**"ios"**, **"swift"**, **"native"/"mobile"** → work only in `yaply-ios/` (its own repo); don't touch the web root. **"web"** → work only in this repo; ignore `yaply-ios/`.

**Tags:** `(w)` = web, `(i)` = iOS, `(wi)` = both. The user prefixes each item in a request with one.

`yaply-ios/` is the active iOS client. The React Native rewrite (`yaply-native/`) was abandoned 2026-08-03 and deleted; any reference to it, or to `yaply-ios` being deprecated, is stale.

Web and yaply-ios are independent repos: separate git histories, GitHub remotes, and issue trackers. File every bug or feature request against the correct repo — never mix them.

- Web: https://github.com/WahidKamruddin/yaply
- iOS: https://github.com/WahidKamruddin/yaply-ios

### GitHub Issues

When the user describes a problem or request, determine which platform(s) it affects and push the issue to that repo's GitHub only. Categorize by label (bug, enhancement, etc.) using the repo's existing labels.

### Committing & Pushing

When the user says **"both apps are good"**:
1. Stage changed files in each repo separately.
2. Propose a conventional-commits message (`feat(): …`, `fix(): …`, `refactor(): …`) and ask the user what to change before committing.
3. **Never include "Co-authored-by: Claude" or any AI attribution in commit messages.**
4. After approval, commit and push to `main`. Branch only if the user asks.

### Feature Completion Reminder

After every feature is finished and the user confirms it's good, ask: "Want to commit and push?" Then follow the steps above.

### UI Verification

Do not launch the dev server, open a browser, or otherwise check UI changes live — the user reviews all UI changes themselves. Verify with `tsc`/`lint` and code review only, unless the user explicitly asks for a live check.

---

## What This Is

yaply is a web-based E2E encrypted messaging app (PWA-capable), built with React and backed entirely by Supabase. It shares one Supabase project with `yaply-ios`. **This file is the canonical backend and cross-platform contract** — `yaply-ios/CLAUDE.md` points here for schema, RPCs, and wire formats and only holds iOS-specific notes.

---

## Tech Stack

- **TanStack Start + React 19** (Vite-based). Chosen for route-level type safety and TanStack Query integration. Runs as a prerendered client-side SPA on Netlify; SSR features are not relied on.
- **TanStack Router, file-based.** Routes in `src/routes/`; `routeTree.gen.ts` is generated — never edit it. Routes: `/` (marketing landing), `/auth`, `/chat` (main app), `/friends`, `/settings`, `/profile/$username`, `/link` (pairing QR deep link), plus `__root.tsx` (HTML shell, auth state).
- **TanStack Query** for server state (conversations, message pages); **Jotai** for UI state (active conversation id, reply target) — atoms shared without prop drilling.
- **Tailwind CSS v4** via `@tailwindcss/vite`; config lives in CSS (`@theme`), not `tailwind.config.js`. App palette: `#1a2744`, `#5b8def`, `#dce7f8`, `#edf1fa`. **Radix UI** headless primitives (Avatar, Dialog, Dropdown, Scroll Area, Tabs, Tooltip) styled directly — deliberately not shadcn. **Lucide** icons.
- **Supabase** is the entire backend: Postgres + RLS, Auth, Realtime, Storage. No custom server; the client talks to Supabase directly and authorization lives in RLS policies and `SECURITY DEFINER` RPCs.
- **Web Crypto API** (`crypto.subtle`) for all crypto — built in, no bundle cost. Supabase does zero crypto.

### Packages (npm workspaces)

- `@yaply/crypto` (`packages/crypto/src/`: `encryption.ts`, `keyStore.ts`, `pairing.ts`, with tests) — key generation, envelope seal/unseal, IndexedDB key store, pairing primitives. **It is the specification** every platform must reproduce, not just the web implementation.
- `@yaply/shared` (`packages/shared/src/`) — canonical types, constants, validators.

### Build & Deploy

Vite builds to `dist/client/`. Netlify serves it as a **prerendered SPA**: `vite build && node scripts/generate-html.mjs` renders `/` once at build time over `dist/client/index.html`, and a catch-all `/* → /index.html` (200) serves that shell for every route. The Netlify SSR function is built but never invoked.

Consequently **route loaders must not depend on request-time data** — `auth.tsx`/`chat.tsx` guard `beforeLoad` with `if (typeof document === 'undefined') return` so session state is never baked into the static shell.

---

## Encryption: envelope scheme, wire format v2

Primitives in `packages/crypto/src/`; protocol glue in `src/features/chat/hooks/useEncryption.ts`. Introduced by migration `00029_multi_device_envelopes.sql`, which wiped all pre-v2 data — there is no legacy data to support; any stray `iv`-set/`enc_v`-NULL row renders as `decryptFailed`.

**Why v2 exists:** the old scheme stored one identity key per user (`device_id` hard-coded to 1) and every login overwrote it, permanently orphaning every message sealed to the previous key — including the user's own sent history.

**Send:**
1. Each install registers its own `devices` row: a P-256 identity keypair + random 31-bit `device_id`, stored locally. The upsert conflicts only on `(user_id, device_id)`, so an install can only touch its own row.
2. Fetch **every active device of every member, including all the sender's own devices** (mandatory, or the sender's other installs can't read it). Generate a random 256-bit message key (mk), encrypt the plaintext once, wrap mk per device.
3. `send_message_with_envelopes` RPC inserts the message and all envelopes atomically; it **rejects an empty envelope set or a NULL iv**.
4. **Decrypt:** find the envelope whose `recipient_fp` is one of this device's candidate fingerprints, unwrap mk, decrypt content. **No matching envelope on an `enc_v = 2` message is a legitimate, permanent state** (sealed before this device existed) and renders as an honest "couldn't decrypt" (`DecryptedMessage.decryptFailed`), never raw ciphertext.

**Wire format (every platform must match byte-for-byte):**
```
messages.content       = base64( AES-GCM(mk, plaintext) ciphertext + tag[16] )
messages.iv            = base64( nonce[12] )
messages.enc_v         = 2   (NULL = phase-1; iv must then also be NULL)
envelope.eph_pub       = JSON-stringified JWK of the per-message ephemeral P-256 public key
envelope.key_iv        = base64( nonce[12] )
envelope.wrapped_key   = base64( AES-GCM(KEK, raw 32-byte mk) + tag[16] )
envelope.recipient_fp  = JWK x + '.' + y of the recipient device's identity key
KEK                    = raw 32-byte ECDH(eph_priv, device_pub) shared secret — NO HKDF
```
One ephemeral keypair per message; fresh random mk and nonces every time. iOS: CryptoKit `P256.KeyAgreement`, raw shared-secret bytes as the AES key (never `hkdfDerivedSymmetricKey`).

**Invariants (each guards a real regression):**
- `enc_v = 2` ⟺ envelopes exist ⟺ `iv` non-NULL. Phase-1 is always `enc_v = NULL` **and** `iv = NULL`; the RPC enforces this server-side.
- Decrypt branches on `enc_v` **first**, then `iv = NULL` (phase-1), anything else is `decryptFailed` — identically at all three decrypt sites: `ChatView`'s effect, `ThreadView.loadReplies`, and sidebar previews in `api/conversations.ts`.
- Sender's own devices are always recipients (`encryptForMembers` unions the sender's id and adds the local device key even if the DB read races registration).
- Media/sticker/gif/file/voice/system messages never enter v2: `content: ''`, `iv: null`, `enc_v = NULL`.
- Fan-out bound: only devices with `last_active_at` within 90 days receive envelopes.
- Groups and DMs are sealed identically — there is no group/DM split in the crypto path.

**Phase-1 fallback:** if **any** member has zero registered devices (never logged in), send plain base64 (`enc_v = NULL`, `iv = NULL`) so they aren't handed undecryptable ciphertext. Always `TextEncoder`/`TextDecoder` — never `btoa()`/`atob()` on raw text (breaks on non-Latin-1). Decode via `decodePhase1`.

**Editing (contract only, no UI):** a re-seal — fresh mk, new `content`/`iv`, replace ALL envelopes in one transaction (future `edit_message_with_envelopes` RPC). Never reuse the old mk.

**Registration must be single-flight (critical):** `useEncryption` is mounted by both `ChatView` and `ThreadView`, so concurrent calls on a fresh install would each generate a different keypair and race to publish, desyncing the stored private key from the published public key. `registrationInFlight: Map<userId, Promise>` shares one registration; `encryptForMembers` and `decryptV2ForUser` **await** it so a message right after login is never downgraded to phase-1 or reported as a false failure. iOS applies the same rule.

**Key storage:** IndexedDB via `idb`, DB `yaply-keys` **version 3**, store `identity`, scoped per user: `pub:<userId>`, `priv:<userId>`, `deviceId:<userId>`, `escrow:<userId>` (array of `{ deviceId, pub, priv }` adopted via pairing).

**In-memory caches must be keyed by userId (critical):** `identityPairMemCache` is a `Map<userId, pair>`. It used to be one mutable slot plus a "clear when a different user shows up" owner check; signing out and into another account in one tab let a straggling async call (e.g. sidebar preview decryption) repopulate the slot with the old account's keypair, so every decrypt for the new account failed. `devicesMemCache` (60s TTL) is intentionally global since a user's public device list is the same for any requester. No platform may use single-slot-plus-owner-check for a per-user cache.

---

## Live device pairing (history sync across devices)

A new install can't read messages sealed before it existed. Live pairing lets an already-linked device (*sender*) hand its key material to a newly signed-in one (*receiver*) over an ephemeral, authenticated Realtime channel. **Nothing is stored server-side** — no PIN, vault, or recovery blob. Code: `packages/crypto/src/pairing.ts`, `src/features/pairing/`, `src/features/settings/components/DevicePairingSettings.tsx`, `src/routes/link.tsx`.

**Two independent role axes:** *trust role* (sender holds keys, receiver needs them) and *rendezvous role* (presenter shows the code, entrant scans or types it). All four combinations work because the code carries only a short rendezvous id, never key material — small enough to type, so a camera is optional. "Scan QR" renders only when `enumerateDevices()` reports a `videoinput`.

**Contract (web and iOS must match byte-for-byte):**
- **Code:** 8 chars Crockford base32 (`0-9A-Z` minus I/L/O/U), displayed `XXXX-XXXX`. `normalizePairingCode` is lenient: case-insensitive, strips dashes/spaces, folds `O→0`, `I,L→1`. A rendezvous id, **not a secret**.
- **QR deep link:** `https://<origin>/link#c=<code>` — in the **fragment** so it never reaches server logs, proxies, or Referer. `/link` reads `window.location.hash`.
- **Channel:** `pairing:<userId>:<code>`, opened with `{ config: { private: true } }`. Migration `00034_pairing_channel_authorization.sql` adds RLS on `realtime.messages` scoping SELECT/INSERT to `pairing:<auth.uid()>:%`. Only `private: true` channels are affected; typing/presence/invalidation channels stay public.
- **Keys:** ephemeral P-256 per side, **memory-only**. `secret` = raw 32-byte ECDH shared secret used directly as the AES-256-GCM key (no HKDF).
- **SAS:** `SHA-256(secret ‖ "yaply-sas-v1")`, first 4 bytes big-endian, `mod 1_000_000`, zero-padded to 6 digits.
- **Payload:** `ciphertext = base64(AES-GCM(secret, JSON.stringify(EscrowedKey[])) + tag)`, `iv = base64(nonce[12])`, `EscrowedKey = { deviceId, pub: JsonWebKey, priv: JsonWebKey }` (JWKs, not DER/SEC1).
- **Handshake:** sender broadcasts `ready` on subscribe; receiver broadcasts `hello { ephPub }` on subscribe **and** on `ready` (neither can assume it joined first); sender derives secret+SAS and sends `ack { ephPub }`; receiver derives independently; human compares codes and confirms **on the sender**; sender sends `payload { iv, ciphertext }`; receiver merges into escrow and sends `done`.
- **TTL** 90s, single-use; expiry shows an explicit "code expired" state.

**Invariants:**
- **The SAS step is load-bearing.** It stops a *second authenticated session on the same account* (stolen JWT, logged-in tab) — which passes RLS — from impersonating the receiver. A relay holds two different secrets and produces two different codes. Never ship a skip path.
- **Abort on a second joiner:** a different `ephPub` on a live session cancels it. Never pick a winner.
- **Escrowed keys are decrypt-only:** never published to `devices`, never used as a recipient.
- **Import merges, never overwrites** (`mergeEscrowedKeys`, de-duped by fingerprint).
- **Candidate fingerprints:** `getCandidateFingerprints()` returns own fp first, then escrowed; `fetchEnvelopesForMessages` filters `.in('recipient_fp', candidateFps)` and `decryptV2ForUser` picks the private key matching `envelope.recipient_fp` — at all three decrypt sites.

**Accepted limitation:** both devices must be online at once. Lose every linked device and history is permanently `decryptFailed` — the deliberate trade for storing no recovery secret. Anyone with an unlocked linked device can mint new ones, as in Signal/WhatsApp.

---

## Device management (naming + revocation)

Settings → Devices lists the user's `devices` rows, renameable inline, revocable behind a confirm dialog. Code: `src/features/pairing/api/devices.ts`, `hooks/useDeviceRevocation.ts` (mounted in `routes/chat.tsx`), `src/lib/deviceName.ts`. Migration `00035_device_management.sql`. iOS mirrors it in `Features/Devices/`.

- **Naming** is generated from the user agent (`Chrome on macOS (Web)`) at **first registration only**; `doRegisterDevice` includes `device_name` in its upsert only for a new row, or a renamed device silently reverts. `platform` is stored separately so a rename can't lose it.
- **Revocation needs all three parts** — deleting the row alone is theatre, since the device keeps its session and re-registers from local storage:
  1. **`revoke_device` RPC** deletes the `devices` row *and* its `auth.sessions` row (cascading `auth.refresh_tokens`). Never a direct DELETE.
  2. **Realtime watcher** reacts to the DELETE, filtered to the install's **own row id** (delete events carry only the PK and aren't RLS-filtered). Without it the device stays usable until its access token expires.
  3. **Local key wipe** (`clearAllKeys`) on revocation, plus an **orphan check** at startup: a local `deviceId` with no matching row means it was revoked offline → wipe keys and register fresh.
- **A failed query is never "revoked."** Only a *successful* empty result counts.
- The row records the access token's `session_id` claim so revoke can find the session.

---

## Security Model — Known Gaps & Limitations

E2E here means **text message content is encrypted between a user's active devices** — do not overstate it. These are documented limitations, not bugs:

- **Out of scope:** cold-start history recovery (needs key escrow, deliberately rejected); pruning stale `devices` rows; message editing.
- **No key verification UI:** an active or compromised server could substitute public keys. Protects against a passive server only.
- **No forward secrecy / ratchet:** identity keys never rotate, so a leaked device key exposes past and future messages to it.
- **Metadata is plaintext:** who talks to whom, timing, membership, reply chains, sizes.
- **Private keys are extractable JWKs in IndexedDB** — exfiltratable via XSS.
- **Media is not encrypted:** images, files, voice, stickers are public Storage URLs. Reactions are plaintext.
- **No "log out everywhere";** offline revocation takes effect at next launch.
- **Group membership changes:** new members can't read pre-join history; removed members aren't cryptographically cut off.
- **Push payloads carry ciphertext through APNs** (plus that device's `wrapped_key`), stored up to 24h by Apple. Still E2E, but a threat-model change versus no pushes. Non-message pushes are plaintext.
- **Search** covers only loaded, decrypted messages. **Fan-out** is messages × recipients × devices.
- **Browser-E2E trust:** the server ships the crypto JS, so a malicious update could exfiltrate keys — an active, detectable attack.

---

## Database Schema

Migrations in `supabase/migrations/` match the live DB. `src/lib/database.types.ts` is generated and may lag; `src/features/chat/types.ts` is the runtime source of truth.

**`conversations`:** `id, type ('direct'|'group'|'ai'), name, avatar_url, created_by, created_at, updated_at`

**`conversation_members`:** `conversation_id, user_id, role ('owner'|'admin'|'member'), joined_at, last_read_at, muted_until, request_state ('accepted'|'pending'|'declined', default 'accepted')`. `muted_until`: null = not muted, future = muted until then, `8640000000000` ms epoch (JS max Date) = forever.

**`messages`:** `id, conversation_id, sender_id, type ('text'|'image'|'gif'|'sticker'|'file'|'voice'|'system'|'ai'), content, iv, enc_v, media_url, media_mime, reply_to_id, thread_id, edited_at, deleted_at, created_at`. `voice` added in `00037`. See the wire format above for `content`/`iv`/`enc_v`.

**`message_envelopes`:** `id, message_id (FK ON DELETE CASCADE), recipient_user_id, recipient_fp, eph_pub, key_iv, wrapped_key, created_at`. UNIQUE `(message_id, recipient_user_id, recipient_fp)`; index `(recipient_user_id, message_id)`. RLS: SELECT for recipient or the message's sender; INSERT/DELETE for the sender.

**`message_reactions`:** PK `(message_id, user_id, emoji)`, so a user may hold several. iOS enforces one-per-user client-side (delete then insert); web allows multiple. To unify, add a `(message_id, user_id)` constraint and update both clients.

**`pinned_messages`:** `conversation_id (FK CASCADE), message_id (FK CASCADE), pinned_by (FK SET NULL), pinned_at`, PK `(conversation_id, message_id)`, index `(conversation_id, pinned_at desc)`. Any member pins/unpins; `pinned_by = auth.uid()` on insert. **A separate table on purpose** — widening the deliberately narrow `messages` UPDATE policy would also expose `content`. In the realtime publication. Migration `00036`. Both platforms: most-recently-pinned first, idempotent pin (upsert on `conversation_id,message_id`), any member can unpin, every realtime event is a refetch trigger, banner previews only a pin whose message is loaded.

**`profiles`:** `id, username (UNIQUE — the real enforcement), display_name, avatar_url, bio, birthdate (00032), public_key, is_online, last_seen_at, created_at, updated_at`. RLS is `using (true)` deliberately (see Friends). No DELETE policy — rows are only removed by the `auth.users` cascade.

**`devices`:** `user_id, device_id (int, random per install), identity_key (JSON JWK), key_fingerprint (JWK x.y), signed_prekey, device_name, platform ('web'|'ios'|'android'), session_id, last_active_at, created_at`. UNIQUE `(user_id, device_id)`, index `(user_id, key_fingerprint)`. RLS: owner manages own rows; any authenticated user can read (needed to encrypt to peers). In the realtime publication since `00035`. **Never hard-code `device_id = 1`.**

**`push_tokens`:** `id, user_id, device_id, token, platform ('ios'|'android'), environment ('sandbox'|'production'), fail_count, last_success_at, created_at, updated_at`. UNIQUE `(user_id, device_id)`; composite FK `(user_id, device_id) → devices ON DELETE CASCADE`. Owner-only RLS, **no world-readable select** — a token is a capability to push to a phone. Migration `00038`. Load-bearing: **the cascade is a security property** (a revoked-but-unwiped install still holds its key, and pushes carry its `wrapped_key`); **`environment` is per row** (wrong APNs host → `400 BadDeviceToken` → hard prune); **a token identifies an install, not a user** (a trigger deletes any other row holding the same token, or A keeps getting B's messages after a sign-in switch).

`push_subscriptions` (00019) is Web Push (VAPID) only (`platform = 'web'` check). The client half (`usePushNotifications.ts`, `public/sw.js`) exists; the VAPID sender is not built.

**Productivity tables:**
- **`notes`:** `id, user_id, conversation_id, title, content, event_id, created_at, updated_at` — owner-only RLS (`user_id`, not `created_by`).
- **`tasks`:** `id, conversation_id, created_by, assigned_to, title, description, status ('todo'|'in_progress'|'done'), priority ('low'|'medium'|'high'), due_at, completed_at, created_at, updated_at` — members SELECT, creator/assignee UPDATE, creator DELETE.
- **`reminders`:** `id, user_id (creator), conversation_id, message, remind_at, status ('pending'|'sent'|'dismissed'), created_at` — all members view/update/delete since `00022`. No `target_type`.
- **`events`** (00020): `id, conversation_id, created_by, name, description, location, status ('planning'|'confirmed'), starts_at, ends_at, created_at, updated_at`. `planning` = when2meet mode.
- **`event_availability`:** `id, event_id, user_id, slots (jsonb ISO strings), updated_at`, UNIQUE `(event_id, user_id)`.
- **`event_rsvp`:** `id, event_id, user_id, response ('going'|'maybe'|'not_going'|'pending'), updated_at`, UNIQUE `(event_id, user_id)`.
- **`albums`:** `id, conversation_id, name, created_by, created_at, event_id`; **`album_media`:** `id, album_id, message_id, media_url, media_mime, created_at`.
- **`budgets`:** `id, conversation_id, name, total_amount, currency, created_by, created_at, event_id`; **`expenses`:** `id, budget_id, paid_by, description, amount, category (enum), split_between (uuid[]), created_at`.
- `albums/notes/budgets.event_id` are `ON DELETE SET NULL` (00021) — deleting an event detaches them.

**Account deletion cascade:** every FK to `profiles(id)` is `ON DELETE CASCADE` except `conversations.created_by` and `messages.sender_id` (`SET NULL` — the conversation and messages stay for others). `00031` closed the last gaps. Deleting `auth.users` (only via the `delete-account` function) triggers the whole cascade.

**Orphan cleanup trigger:** `trg_delete_empty_conversation` (AFTER DELETE on `conversation_members`) deletes a conversation with no members left — including all its messages. This is why declining must never delete a membership row.

### Key RPCs

- `find_or_create_direct_conversation(target_user_id)` — always use for DMs. Raises `blocked`, `cannot message yourself`. Recipient's `request_state` is `'accepted'` if friends, else `'pending'`. If the caller previously declined, resets **their own** side to `'accepted'`.
- `send_message_with_envelopes(p_conversation_id, p_content, p_iv, p_envelopes jsonb, p_type, p_reply_to_id, p_thread_id, p_media_url, p_media_mime)` — the only path for encrypted sends. Rejects empty envelopes or NULL iv; gates on `can_send_in_conversation()` (raises `cannot send in this conversation`). Plain `messages` inserts are only for phase-1/system/media.
- `create_group_conversation(p_name, p_member_ids)` / `add_group_member(p_conversation_id, p_user_id)` — raise `can only add friends to groups`.
- `send_friend_request(p_recipient_id)` / `accept_friend_request(p_request_id)` / `block_user(p_user_id)` — the only writes into `friendships`. Send auto-accepts a reverse pending request; raises `friend request already exists`, `blocked`, `cannot friend yourself`. Block inserts the block and deletes any friendship atomically.
- `get_relationships(p_user_ids uuid[])` → `(user_id, status, request_id, mutual_friends)`, status ∈ `none | pending_out | pending_in | friends | blocked | blocked_by`. **Batched — one call per list, never per row.**
- `search_users(p_query)` — username or display_name, excludes blocks in either direction. Use instead of querying `profiles`.
- `get_friend_suggestions(p_limit)` — friends-of-friends by mutual count + shared-group co-members.
- `revoke_device(p_device_id)` — signs out one of the **caller's own** devices. Security definer because `auth.sessions` is unreachable otherwise; the internal `auth.uid()` filter is the only guard, so it must never take a user id argument.

**Helpers** (security definer, used by RLS and RPCs): `are_friends`, `is_blocked_between`, `mutual_friend_count`, `can_send_in_conversation`. Per `00028`'s recursion lesson, a policy on table T may never `EXISTS` over T — route cross-table checks through a helper. `sync_direct_request_state(a,b)` is **revoked from `anon`/`authenticated`** (no `auth.uid()` guard; exposing it would let anyone accept requests for others).

### Friends System (migration 00033)

Two consent mechanisms that are easy to conflate:
- **Friend requests** (`friendships`) — the social relationship. Required to join a group; drives friends list, suggestions, mutual counts.
- **Message requests** (`conversation_members.request_state`) — permission to talk. A DM from a non-friend lands with the recipient's row `'pending'`: readable, **not repliable until accepted**. Accepting does not create a friendship.

**`friendships`:** `id, requester_id, recipient_id, status ('pending'|'accepted'), created_at, updated_at`. One row per pair, direction preserved; functional unique index on `(least, greatest)`. **No `declined` status** — decline, cancel and unfriend all DELETE so a later re-request works. RLS: participants SELECT/DELETE; **no INSERT/UPDATE policy** (writes go through RPCs, a direct write silently fails). In the realtime publication.

**`user_blocks`:** `blocker_id, blocked_id, created_at`, PK both. RLS limits everything to `blocker_id = auth.uid()`, so the blocked user never sees the row.

**`request_state`:** `'accepted'` normal (default). `'pending'` — read-only, excluded from unread counts and notification banners, shown in a "Message requests" section. `'declined'` — hidden, and `can_send_in_conversation` returns false for **everyone**, so the sender can't keep messaging into a wall; the decliner can reopen by starting the chat again. **Accept/decline is an UPDATE of your own row — never a DELETE** (the orphan trigger would delete the conversation).

**Blocks (v1):** sends blocked both ways, new DMs raise `blocked`, friendship deleted, blocked user hidden from search/suggestions. History is kept. The blocked party gets no signal; their send fails with "You can't message this person right now." `blocked_by` must render identically to `none`.

**`profiles` RLS stays `using (true)`:** tightening it would null out the nested `profiles(...)` joins in `fetchConversations`, message senders, and device lookups. Block-hiding lives in `search_users` plus client filtering. Accepted limitation: a blocked user can read the blocker's profile row.

**All gating is server-side.** The conversation RPCs are `SECURITY DEFINER` and bypass RLS, and iOS shares this backend — add rules to RPC bodies or RLS, never only to a client. (`00033` also fixed the `messages` INSERT policy, whose subquery compared `cm.conversation_id = cm.conversation_id` and was always true.)

---

## Feature Map

Features live in `src/features/<name>/` with `api/`, `components/`, `hooks/`. Only the non-obvious parts are listed.

- **Auth** (`routes/auth.tsx`, `src/lib/auth.ts`, `src/lib/passwordStrength.ts`): signup requires all 5 password checks. Email signups must click a confirmation link before sign-in; Google OAuth is exempt. **Enforced by the Supabase Dashboard "Confirm email" toggle, not app code** — no migration can set it. Unconfirmed logins surface a "Resend confirmation email" action.
- **Waitlist lockdown** (`src/lib/waitlistMode.ts`, `VITE_WAITLIST_MODE`): while the app isn't open, set this **only on the production Netlify site's env vars** to lock everything behind a waitlist form — mirrors `VITE_STAGING_GATE`'s dead-code-elimination pattern (unset = the sign-in/sign-up UI and route guards compile away entirely). `/auth` renders `WaitlistForm` (`src/features/waitlist/`) instead of the sign-in card, and **every** protected route (`chat`, `settings`, `friends`, `profile.$username`, `link`) redirects to `/auth` regardless of session — an already-authenticated visitor is turned away too, not just new sign-ups. Submissions POST `{name, email}` to the `join-waitlist` edge function (`verify_jwt = false`, anonymous by design — there's no session yet), which appends a row to a Google Sheet via a hand-signed service-account JWT (RS256, same DIY `crypto.subtle` approach as `send-push/apns.ts`'s APNs JWT — no `googleapis` dependency). Secrets `GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`/`GOOGLE_SHEET_ID` via `supabase secrets set`; the sheet must be shared with the service account's email as Editor. No de-dup or rate-limiting — a resubmission just appends another row — and no local DB copy; the sheet is the sole store.
- **Chat** (`features/chat/`): `ConversationList`, `ChatView`, `MessageBubble`, `MessageInput`; 50/page pagination (`useMessages`); realtime via `useRealtimeMessages` (invalidation only). Soft delete own messages (`deleted_at`) behind a Radix confirm. Replies via `replyToMessageIdAtom`. Swipe-to-delete a conversation removes only your own membership row.
- **Message grouping** (`chat/lib/messageGrouping.ts`, iOS `BubblePosition`, must match): same sender, non-system, same day, ≤5 min → `single|first|middle|last`. Name on first (groups only; DMs never show it), avatar on last; tail corner bottom/both/top.
- **Collapsible sidebar** (desktop only): `sidebarCollapsedAtom`, persisted.
- **Chat settings modal:** tapping the `ChatView` header opens `GroupInfoModal` (groups) or `DmSettingsModal` (DMs): members list, mute toggle (`muteConversation`, JS-max-Date sentinel for forever), self-only leave/delete. DMs add Block; groups keep admin controls and "Delete group for everyone."
- **Pinned messages:** `api/pins.ts`, `hooks/usePins.ts` (optimistic, rollback by refetch), `PinnedBanner.tsx` below the search bar. Pin/Unpin is a hover action for all members. `useRealtimeMessages` also invalidates `['pins', …]`.
- **Username availability:** `useUsernameAvailability` debounces a `profiles` lookup (excluding own id when editing) so Save is blocked before a write; both call sites (`UsernameSetupModal`, `AccountSettings`) still catch `23505`.
- **Slash commands** (`features/commands/`): feedback is local-only (`commandFeedbackAtom`); success is the pill.
- **Productivity panel** (`ConversationPanel.tsx` tabs: Tasks, Notes, Reminders, Events, Albums, Budgets). Reminders poll every 60s + Web Notifications. Events: `/plan` → `planning` (when2meet grid, `AvailabilityCalendar.tsx`), `/event` → `confirmed`. Budgets include Splitwise (`src/lib/splitwise.ts`). Every destructive action uses a Radix confirm dialog.
- **Item-created pills** (`chat/lib/systemItem.ts`): every create path calls `postItemCreated`. Pill and Dashboard rows → `openItemRequestAtom` → `ChatView`: task/reminder open the tab, plan/event the `EventModal`, album/budget/note via `conversationPanelTargetAtom.itemId`.
- **Settings** (`routes/settings.tsx`, `features/settings/components/`): Account (name, username, avatar to `avatars` bucket, bio, birthdate, email-only password change, account deletion via `delete-account`), Devices, Billing/Privacy/Terms (sample content), Help, Report a Problem (`report-problem` function).
- **`Avatar`** is the only avatar renderer: photo or silhouette placeholder, never initials.
- **Friends** (`routes/friends.tsx`, `features/friends/`): tabs Friends/Requests/Sent/Discover/Blocked plus search; `ProfileModal` is the only profile card (public fields only). Entry is the Users icon + badge in the `ConversationList` header. Non-friend DMs appear under "Message requests"; `ChatView` swaps `MessageInput` for `MessageRequestBar` while pending.
- **Composer** (`MessageInput.tsx`): a `Plus` toggle reveals File · Camera · Voice · Image and collapses on focus/typing; an in-field emoji button opens `ExpressionPicker` (GIFs live, Stickers live, Voice notes "coming soon"). Optional props default to no-ops; `showAttachments={false}` gives a plain composer. Voice swaps the composer for `VoiceRecorderBar`.
- **Media sends** all go through `ChatView.sendMedia` with optimistic render, never encrypted. Images use `uploadMediaFile` (compressed); files and voice use `uploadRawFile` (original MIME). `type='file'` renders as a download link, `type='voice'` as `<audio controls>`. GIFs and stickers render frameless.
- **GIFs (Giphy):** `rating=g`, sends the `downsized` rendition. `hasGiphyKey` treats the `.env.example` placeholder as unset. CSP already allows `*.giphy.com`.
- **Voice recording** stops all mic tracks on cancel/send/unmount; mic denial surfaces as `sendError`.

**Not yet integrated:** `DragDropZone` (built, not mounted); reusable saved voice notes; AI conversations (`ai_conversations` is schema-only, no UI or API).

---

## Landing Page (`src/routes/index.tsx`)

A single-file marketing page: markup, demos, and a template-literal `<style>` scoped under `.lp` (not Tailwind). Own dark-navy/mint palette with a `.lp-light` override persisted to `localStorage['yaply-theme']`.

- **Font:** Bricolage Grotesque, self-hosted at `public/fonts/` — the CSP's `font-src 'self'` would block Google Fonts.
- **Progressive enhancement (every interactive element):** server-render the *final, legible* state, then a `useEffect` rewinds and replays the animation when scrolled into view (`IntersectionObserver`). The prerendered HTML is never empty or mid-animation. Respect `prefers-reduced-motion` via `prefersReducedMotion()`. After changes, re-run the build + `scripts/generate-html.mjs` and spot-check `dist/client/index.html`.
- **Demos are decorative** local state (`ChatMock`, `EventFlowDemo`, `GroupCarousel`, `KothaDemo`, `EncryptWire`, `DecryptText`). `EncryptWire` locks each glyph as the sweep passes so the end state equals the sealed display; `DecryptText` is used only on the "Sealed, end to end." header.
- **Landing copy is not a source of truth.** Kotha AI and "built-in translation" are forward-looking marketing; neither exists in the app.

---

## Cross-Platform Contracts (iOS)

Per-feature iOS how-to lives in `yaply-ios/CLAUDE.md`; encryption, pairing, devices, friends, pins and reactions contracts are above. Also:

- **Events availability slot keys:** UTC ISO string of the slot start (`"2025-06-10T14:00:00.000Z"`), 8am–10pm local in 30-min steps, 7 days × 28 rows. iOS builds local-time `Date`s then formats with `ISO8601DateFormatter`, `timeZone = UTC`, `.withFractionalSeconds`. Drift breaks heatmap overlap.
- **Reminders:** creator is `user_id`; all members view/dismiss. Web polls every 60s; iOS schedules a local `UNNotificationRequest` and marks `status='sent'`. Same parsing (`30m`, `2h`, `tomorrow` = next 9am).
- **System messages:** `type='system'`, `iv = NULL`, `deleted_at = now + 7d`, `content = base64(UTF-8 JSON {"v":1,"kind","id","title"})`, kind ∈ task|note|album|budget|plan|event|reminder. Non-JSON = legacy text (tab link). Previews check `system` before `deletedAt`.
- **Stickers:** iOS has no library; it uploads a dropped/pasted *system* sticker as transparent PNG, `type='sticker'`, which web renders as-is.
- **Voice (`type='voice'`):** iOS records AAC `.m4a`, `media_mime='audio/mp4'`; web records mp4 or webm. Both play either. Container/mime changes must land on both.
- **Splitwise:** REST `https://secure.splitwise.com/api/v3.0/`, OAuth2 client credentials. The payer's `paid_share` maps by index in the members array (not always 0); `simplified_debts` may be null.

---

## Push notifications

```
messages INSERT
  └─ trg messages_notify_push → notify_new_message()            [00040]
       └─ enqueue_push() → pg_net net.http_post (fire-and-forget, x-push-secret)
            └─ send-push
                 ├─ push_message_context(id)      [00039]  shared metadata
                 └─ push_targets_for_message(id)  [00039]  one row per (token × its envelope)
                      → POST api.push.apple.com/3/device/<token>
                           payload = metadata + ciphertext + THAT device's envelope + mutable-content: 1
                                        └─ iOS Notification Service Extension decrypts
```

- **Payload is per device:** each token gets the one envelope whose `recipient_fp` matches its `devices.key_fingerprint` — that's why `push_tokens` has `device_id`. `aps.alert.body` is always a safe placeholder ("New message", "📷 Photo"); the extension overwrites it, and every failure leaves the placeholder.
- **Server-side suppression mirrors the clients exactly:** never the sender, never `request_state <> 'accepted'`, never muted (`muted_until > now()`), never across a block, never `type = 'system'`. An `enc_v = 2` message with no envelope for a device is dropped. iOS's `ConversationListViewModel.handleIncomingMessage` applies the same filters.
- **Over the 4096-byte cap (~2,100 chars of plaintext)** the push deliberately shows `Sent a message` with the sender as title and drops `mutable-content`. Server-side truncation is impossible (ciphertext, AES-GCM is all-or-nothing). Extension fetch (the Signal/WhatsApp pattern) fails because supabase-swift gives the extension a 1-hour JWT with a rotating refresh token; a sender-sealed preview blob is a wire-format change not justified by a rare case.
- `apns-collapse-id` = message id (a retried trigger yields one banner); `thread-id` = conversation id.
- **Badge** = recipient's **total** unread across accepted, unmuted conversations (`00044`). iOS recomputes the same figure locally; the definitions must move together.
- **Other kinds** — `friend_request`, `friend_accepted`, `task_assigned`, `event_confirmed` (`00041`) and `reminder` (pg_cron, `00042`) — go through `push_simple_notification(kind, payload)`. Plaintext, no `mutable-content`. Reminder dispatch is exactly-once: `status = 'pending'` is both queue and lock (`for update skip locked` + atomic flip to `'sent'` in the same transaction), failing toward loss rather than duplication.
- **Secrets:** `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID` (`wahid.yaply`), `APNS_PRIVATE_KEY` (`.p8`), `PUSH_WEBHOOK_SECRET` via `supabase secrets set --env-file` (a shell-mangled multiline `.p8` causes permanent `403 InvalidProviderToken`). **The key must be "Sandbox & Production"** — a sandbox-only key fails every TestFlight token with `403 BadEnvironmentKeyInToken` (hit on the first TestFlight build, 2026-09-17). Every 403 is treated as provider-side and leaves `fail_count` alone; only `BadDeviceToken`/`Unregistered` blame the token. The function URL and secret also live in **Vault** (`push_fn_url`, `push_webhook_secret`) read by `push_config()`; until both exist, `enqueue_push` is a harmless no-op.
- ⚠️ Deno's ECDSA `crypto.subtle.sign` already returns IEEE P1363 `r||s` (the JOSE encoding). Don't DER-decode — porting a Node example here produces a permanent `InvalidProviderToken`.
- **Testing without a device:** `send-push` accepts `dry_run: true` (returns the exact per-target JSON) and `kind: "jwt_check"` (mints a provider token). Both need `x-push-secret`.

---

## Supabase Edge Functions

In `supabase/functions/`, deployed with `supabase functions deploy <name>`, for logic needing a secret the client must never see.

- **`report-problem`** — emails the Report a Problem form via Resend so the developer's address never appears in client code. Secret `RESEND_API_KEY` (not a `VITE_*` var). Sends from `onboarding@resend.dev` until a domain is verified.
- **`delete-account`** — identifies the caller **from their own JWT** (never a user id from the body), then uses a separate service-role client to best-effort remove `avatars` objects and call `auth.admin.deleteUser`. The `auth.users` delete cascades everything; that's why `profiles` has no DELETE policy.
- **`send-push`** — the APNs sender (above). The only function with `verify_jwt = false` (in `supabase/config.toml`), because a DB trigger invokes it with no user JWT.

---

## Environment & Development

`.env` (from `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GIPHY_API_KEY`.

```bash
npm install       # npm workspaces
npm run dev       # dev server on :3000 (Netlify Dev on :8888) — user runs this, not Claude
npm run build     # production build → dist/client/
npm run test      # Vitest
npm run lint      # ESLint
npm run format    # Prettier + ESLint fix
```

---

## Key Architectural Patterns

- **Feature folders:** each domain under `src/features/` owns its API, components, hooks, and types; cross-feature code in `src/lib/` and `src/components/`.
- **Raw vs display types:** `DbMessage` holds encrypted fields; `DecryptedMessage` is what the UI renders. The UI never touches ciphertext.
- **Realtime as invalidation:** channel events trigger a TanStack Query refetch rather than parsing the (encrypted) payload, so decryption logic isn't duplicated.
- **Parity:** the web `.gitignore` excludes `yaply-ios/`. Any wire-format or schema change must be reflected in both CLAUDE.md files and implemented on both platforms.
