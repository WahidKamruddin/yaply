# yaply — Codebase Reference

## What This Is

yaply is a web-based E2E encrypted messaging application. It is a Progressive Web App (PWA-capable) built with React and backed entirely by Supabase. It lives as the web platform in a planned monorepo that will eventually include `yaply-ios` (Swift/SwiftUI) and `yaply-android` (Kotlin). All platforms share one Supabase project.

---

## Tech Stack

### Frontend Framework: TanStack Start + React 19

**What it is:** TanStack Start is a full-stack meta-framework built on top of Vite, TanStack Router, and React. It is similar to Next.js or Remix but from the TanStack ecosystem.

**Why it was chosen over Next.js or Remix:**
- **TanStack Router** is type-safe at the route level — params, search params, and loader data are all fully typed. Next.js's router is not type-safe by default.
- **TanStack Query** (react-query) integration is first-class — the same team builds both, so SSR + client hydration of server-fetched data works without glue code.
- **Vite-based** — faster dev server cold starts than Webpack-based setups.
- The project does not rely on server-side rendering in a meaningful way (Supabase handles all data), so the "meta-framework" features of Next.js were not necessary.

**Why not a plain Vite + React SPA:** TanStack Start was chosen for future flexibility — it can do SSR or server functions if needed later without a full migration. For now it runs as a client-side app deployed to Netlify.

### Routing: TanStack Router (file-based)

Routes live in `src/routes/`. The router auto-generates `routeTree.gen.ts` from the file structure — never edit that file manually. There are only three routes:

| File | Path | Purpose |
|------|------|---------|
| `__root.tsx` | (layout wrapper) | HTML shell, loads auth state |
| `index.tsx` | `/` | Redirects to `/chat` |
| `auth.tsx` | `/auth` | Sign in / sign up |
| `chat.tsx` | `/chat` | Main app: conversation list + chat |

### State Management: Jotai + TanStack Query

Two separate state layers are used intentionally:

**TanStack Query** (`@tanstack/react-query`) manages **server state** — data that comes from Supabase and needs caching, pagination, and background refetch. Examples: conversation list, message pages.

**Jotai** manages **UI state** — ephemeral client-side state that doesn't belong in a query cache. Examples: which conversation is currently active, which message is being replied to.

**Why not Redux or Zustand for UI state:** Jotai's atom model requires zero boilerplate for simple state like `activeConversationIdAtom`. Redux and Zustand are better fits for complex state machines; Jotai is better for isolated pieces of UI state.

**Why not useState everywhere:** The active conversation ID needs to be shared across `ConversationListView` (which sets it) and `ChatView` (which reads it). Lifting that state up to a common parent works, but Jotai atoms let both components reach it without prop drilling through the page-level component.

### Styling: Tailwind CSS v4 + Radix UI

**Tailwind CSS v4** is used via the Vite plugin (`@tailwindcss/vite`). Version 4 is a major rewrite — configuration is done in CSS (`@theme`) rather than `tailwind.config.js`. The project uses a custom blue-slate color palette (`#1a2744`, `#5b8def`, `#dce7f8`, `#edf1fa`) defined inline via class values.

**Radix UI** provides headless, accessible primitives: Avatar, Dialog, Dropdown Menu, Scroll Area, Tabs, Tooltip. These are unstyled components that handle keyboard navigation, focus trapping, and ARIA roles. Tailwind classes are applied on top. This was chosen over shadcn/ui (which wraps Radix) to keep direct control over the markup.

**Lucide React** provides icons.

### Backend: Supabase

Supabase serves as the entire backend. No custom server is needed. It provides:

- **PostgreSQL** — primary database with Row-Level Security (RLS) policies
- **Auth** — email/password auth with session management
- **Realtime** — WebSocket-based Postgres change subscriptions
- **Storage** — S3-compatible file storage for media, avatars, stickers

**Why Supabase over Firebase:** PostgreSQL's relational model fits the schema well (foreign keys, JOINs, complex queries). Firestore's document model would require significant denormalization to handle the conversation + member + message relationships.

**Why not a custom Node.js API:** RLS policies in Postgres enforce authorization at the database level, so there is no need for a middleware layer. The client talks directly to Supabase. This removes an entire layer of infrastructure to maintain.

### Encryption: Web Crypto API (ECDH + AES-GCM)

Messages are encrypted end-to-end. The encryption lives in `packages/crypto/src/`.

**Algorithm:**
- **Key exchange:** ECDH (Elliptic Curve Diffie-Hellman) with P-256 curve
- **Message cipher:** AES-GCM with 256-bit key, 12-byte random nonce per message

**How it works:**
1. On first login, each client generates a P-256 key pair (public + private).
2. The public key (in JWK format) is uploaded to the `devices` table (`identity_key` column).
3. When sending a message, the sender fetches the recipient's public key from `devices`, runs ECDH with their own private key to derive a 32-byte shared secret, and uses that raw 32 bytes directly as an AES-256 key.
4. The message is encrypted as: `AES-GCM(key, plaintext)` → `base64(nonce[12] + ciphertext + gcm_tag[16])`.
5. That base64 string is stored as `encrypted_content` in the `messages` table.

**Wire format (critical for cross-platform compatibility):**
```
stored in DB: base64( nonce[12 bytes] + ciphertext + GCM tag[16 bytes] )
```
The GCM tag is appended to the ciphertext (Web Crypto AES-GCM bundles them). This must be reproduced identically on iOS/Android or cross-platform decryption breaks.

**Key derivation:** Web Crypto's `deriveKey(ECDH)` for AES-GCM-256 uses the raw 32-byte ECDH shared secret (x-coordinate of the shared EC point) directly as the AES key — no HKDF is applied. iOS/Android must mirror this exactly.

**Key storage:** Private key and derived shared keys are stored in **IndexedDB** via the `idb` library (browser equivalent of a local database). Store name `identity` holds the keypair JWKs; store name `derived` holds cached per-conversation AES keys keyed by conversation ID.

**Fallback (phase-1):** If either party has no key established yet, the client encodes the plaintext instead of encrypting. **Always use `TextEncoder` / `TextDecoder` for phase-1 encoding — never `btoa()` / `atob()`.** `btoa()` breaks on any non-Latin-1 character (emoji, CJK, etc.). Decryption tries AES-GCM first, falls back to `new TextDecoder().decode(Uint8Array.from(atob(content), c => c.charCodeAt(0)))`, then falls back to returning the raw string.

**Why Web Crypto and not a JS crypto library (e.g. TweetNaCl, forge):**
- Web Crypto is built into every modern browser — no bundle size cost.
- It runs in a secure context and the private key can be marked non-extractable in theory (though the current implementation exports to JWK for IndexedDB storage, a trade-off for now).

### Packages (Monorepo)

The project is a pnpm workspace monorepo with two internal packages:

| Package | Path | Contents |
|---------|------|---------|
| `@yaply/crypto` | `packages/crypto/` | `generateKeyPair`, `deriveSharedKey`, `encryptMessage`, `decryptMessage`, `storeIdentityKeyPair`, `loadIdentityKeyPair`, `storeDerivedKey`, `loadDerivedKey`, `clearAllKeys` |
| `@yaply/shared` | `packages/shared/` | TypeScript type definitions, constants, validators |

**Why a monorepo:** The iOS and Android apps will need to understand the same data shapes. `packages/shared/types.ts` is the canonical type reference. The `packages/crypto` package documents the encryption contract that all platforms must implement (even though iOS and Android use different crypto libraries, the same wire format and key derivation logic applies).

### Build & Deploy

- **Vite 8** builds the app. The output goes to `dist/client/` (configured in `netlify.toml`).
- **Netlify** hosts the app. The `netlify.toml` specifies `vite build` as the build command and `dist/client` as the publish directory.
- **`@netlify/vite-plugin-tanstack-start`** handles Netlify-specific SSR adapter concerns.

---

## Database Schema

The migrations in `supabase/migrations/` match the live database. All runtime code uses the column names below.

**`conversations` table:**
```
id          uuid
type        text   ('direct' | 'group' | 'ai')
name        text
avatar_url  text
created_by  uuid
created_at  timestamptz
updated_at  timestamptz
```

**`conversation_members` table:**
```
conversation_id  uuid
user_id          uuid
role             text   ('owner' | 'admin' | 'member')
joined_at        timestamptz
last_read_at     timestamptz
muted_until      timestamptz   — null = not muted; future date = muted until then; 8640000000000 ms epoch = muted forever
```

**`messages` table:**
```
id              uuid
conversation_id uuid
sender_id       uuid
type            text   ('text' | 'image' | 'gif' | 'sticker' | 'file' | 'system' | 'ai')
content         text   — base64(AES-GCM ciphertext+tag) or plaintext
iv              text   — base64(nonce[12]); NULL = phase-1 fallback (plain base64 content)
media_url       text
media_mime      text
reply_to_id     uuid
thread_id       uuid
edited_at       timestamptz
deleted_at      timestamptz
created_at      timestamptz
```

**Encryption wire format:** `content = base64(ciphertext + GCM tag[16])`, `iv = base64(nonce[12])` stored as separate columns. If `iv` is NULL, content is plain base64 plaintext (phase-1 fallback).

**`profiles` table:** id, username, display_name, avatar_url, bio, public_key, is_online, last_seen_at, created_at, updated_at.

**`devices` table:** user_id, device_id (int), identity_key (JSON — JWK format public key).

**Key RPCs:**
- `find_or_create_direct_conversation(target_user_id uuid)` — finds or creates a direct DM, inserts both members correctly. Security definer. Always use this instead of manual inserts for direct chats.

**Postgres trigger — orphan conversation cleanup:**
`trg_delete_empty_conversation` (AFTER DELETE on `conversation_members`, FOR EACH ROW) — calls `delete_conversation_if_empty()` which deletes the `conversations` row if no members remain. This means deleting your membership from a DM where the other user already left cascades to deleting all messages and the conversation itself. Migration: `delete_conversation_if_empty`.

---

## Feature Map

### Implemented

| Feature | Files |
|---------|-------|
| Auth (sign in / sign up) | `src/routes/auth.tsx`, `src/lib/auth.ts` |
| Conversation list | `src/features/chat/components/ConversationList.tsx`, `src/features/chat/hooks/useConversations.ts` |
| Direct messaging | `src/features/chat/components/ChatView.tsx` |
| Group conversations | `createGroupConversation` in `src/features/chat/api/conversations.ts` |
| Message pagination (50/page) | `src/features/chat/hooks/useMessages.ts` |
| Real-time messages | `src/features/chat/hooks/useRealtimeMessages.ts` |
| E2E encryption | `packages/crypto/`, `src/features/chat/hooks/useEncryption.ts` |
| Soft delete messages (own messages only) | `deleteMessage` in `src/features/chat/api/messages.ts`; deletes update `deleted_at` column |
| Delete message confirmation modal | Radix UI Dialog in `MessageBubble.tsx` — "Delete Message" / "This will delete the message for everyone." |
| Reply quotation with deleted-message handling | Reply block in `MessageBubble.tsx` — if `replyMessage.deletedAt` is set, shows italic "Message deleted" in the quotation |
| Message reply | `replyToMessageIdAtom`, `ReplyStrip` in `MessageInput` |
| Mute conversations | `muteConversation` in conversations API; `muted_until` column in `conversation_members` |
| Mark conversations read | `markConversationRead` in conversations API |
| Conversation swipe-to-delete | `ConversationItem.tsx` — pointer-event left swipe reveals red trash area; Radix UI Dialog confirms; calls `deleteConversation` |
| Delete conversation (self-only) | `deleteConversation` in `src/features/chat/api/conversations.ts` — deletes own row from `conversation_members`; DB trigger cleans up orphaned conversation |
| User presence (is_online) | Migration `00014_add_presence_to_profiles.sql` |
| User search | `searchUsers` in conversations API |
| Dev auth bypass | `VITE_DEV_BYPASS_AUTH=true` in `.env` |
| GIF picker (Giphy) | `src/features/media/` — UI exists, wired as phase 3 placeholder |
| Slash command system | `src/features/commands/` — parser + registry built |
| /remind, /mute, /thread | `src/features/commands/handlers/` |
| /create (task/note/album/budget) | `src/features/commands/handlers/createHandler.ts` |

### Built but not yet integrated (schema defined, UI is placeholder)

| Feature | Status |
|---------|--------|
| Media upload (images, files) | Service and drag-drop zone built; picker shown as "Phase 3" placeholder in ChatView |
| Sticker creation and picker | Components built; Supabase storage migration done |
| Tasks | Schema migrated; create handler exists; no list/detail view |
| Notes | Schema migrated; create handler exists; no list/detail view |
| Reminders | Schema migrated; handler exists; no scheduler/notification system |
| Albums | Schema migrated; create handler exists; no gallery view |
| Budgets | Schema migrated; create handler exists; no expense view |
| AI conversations | Schema migrated; no UI or AI API integration |
| Threads | Schema design done; no thread view UI |

---

## Project Structure

```
yaply/
├── src/
│   ├── app/
│   │   └── Providers.tsx          # React Query client setup
│   ├── features/
│   │   ├── chat/                  # Core messaging feature
│   │   │   ├── api/               # Supabase calls (conversations.ts, messages.ts)
│   │   │   ├── components/        # UI (ChatView, MessageBubble, MessageInput, etc.)
│   │   │   ├── hooks/             # Data hooks (useConversations, useMessages, useEncryption, etc.)
│   │   │   ├── store/             # Jotai atoms (chat.atoms.ts)
│   │   │   └── types.ts           # Runtime types (source of truth for DB schema)
│   │   ├── commands/              # Slash command system
│   │   │   ├── commandParser.ts
│   │   │   ├── commandRegistry.ts
│   │   │   ├── components/        # CommandModal, CommandProvider
│   │   │   └── handlers/          # remindHandler, muteHandler, threadHandler, createHandler
│   │   └── media/                 # GIF, image, sticker media
│   │       ├── api/               # gifs.ts (Giphy), upload.ts (Supabase Storage)
│   │       ├── components/        # GifPicker, StickerPicker, MediaPicker, DragDropZone
│   │       └── hooks/             # useGifSearch, useStickers, useUpload
│   ├── lib/
│   │   ├── auth.ts                # getUser(), onAuthStateChange(), DEV_BYPASS flag
│   │   ├── supabase.ts            # Supabase client singleton
│   │   └── database.types.ts      # Auto-generated Supabase types (may be stale — see discrepancy note)
│   └── routes/                    # File-based routes (TanStack Router)
├── packages/
│   ├── crypto/src/
│   │   ├── encryption.ts          # generateKeyPair, deriveSharedKey, encryptMessage, decryptMessage
│   │   └── keyStore.ts            # IndexedDB read/write for identity and derived keys
│   └── shared/src/
│       ├── types.ts               # Canonical type definitions (aspirational schema)
│       └── constants/             # Command definitions, app constants
└── supabase/
    └── migrations/                # 14 SQL files — NOT all applied to live DB (see discrepancy note above)
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=         # From Supabase project settings
VITE_SUPABASE_ANON_KEY=    # From Supabase project settings (public/anon key)
VITE_GIPHY_API_KEY=        # From Giphy Developer Dashboard
VITE_DEV_BYPASS_AUTH=false # Set to true to skip Supabase auth entirely during local dev
```

When `VITE_DEV_BYPASS_AUTH=true`, all auth calls return a hardcoded dev user (`dev-user-00000000-0000-0000-0000-000000000000`). This is useful when testing UI changes without needing a live Supabase instance.

---

## Development

```bash
npm install       # Install dependencies (uses npm workspaces)
npm run dev       # Start dev server at http://localhost:3000
npm run build     # Production build → dist/client/
npm run test      # Vitest unit tests
npm run lint      # ESLint
npm run format    # Prettier + ESLint fix
```

The dev server is also accessible via Netlify Dev at port 8888 (configured in `netlify.toml`).

---

## Key Architectural Patterns

**Feature-folder structure:** Each product domain (chat, commands, media) is self-contained under `src/features/`. A feature owns its API layer, components, hooks, and local types. Cross-feature concerns live in `src/lib/`.

**No custom API server:** The client talks directly to Supabase. Authorization is enforced by RLS policies in Postgres. This eliminates backend infrastructure but means all auth-sensitive logic must be expressed as Postgres policies.

**Separation of raw DB types from display types:** `DbMessage` holds the raw encrypted fields from the database. `DecryptedMessage` holds the post-decryption display representation. The UI only touches `DecryptedMessage` — it never renders raw ciphertext.

**Real-time via Supabase channels:** Instead of parsing the Realtime payload (which contains the raw encrypted DB row), `useRealtimeMessages` uses the channel event as a trigger to invalidate and re-fetch via TanStack Query. This avoids having to maintain duplicate decryption logic in the realtime handler.

**Monorepo for cross-platform parity:** `packages/crypto` documents the encryption contract. `packages/shared/types.ts` documents the intended canonical schema. Even though the iOS/Android apps will use different crypto libraries (CryptoKit, BouncyCastle), they must reproduce the same wire format. These packages are the specification, not just the web implementation.

---

## Sister Projects (this monorepo)

| Directory | Platform | Status |
|-----------|----------|--------|
| `.` (root) | Web (React + Supabase) | Active |
| `yaply-ios/` | iOS (Swift + SwiftUI) | Active — own GitHub repo, gitignored here |
| `yaply-android/` | Android (Kotlin + Jetpack Compose) | Future |

The web repo's `.gitignore` excludes `yaply-ios/` and `yaply-android/` since they have their own GitHub repositories. The monorepo root exists so Claude Code can cross-reference all platforms in the same working directory.

`yaply-ios/CLAUDE.md` contains iOS-specific architecture notes. Any change to the encryption wire format or database schema **must be reflected in all platform CLAUDE.md files** and implemented consistently across all apps.
