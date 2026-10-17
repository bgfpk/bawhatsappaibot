# Black Arrow — conversion dependencies and architecture

## Recommended composition

Keep the transferred Node/TypeScript, React/Vite and actual worker/service technology. Port the existing Black Arrow dark/gold React presentation, CSS, My Campaigns navigation and selected Campaign Workspace into Vite with React Router equivalents.

Preserve existing Black Arrow PostgreSQL data and its Fastify/session/authentication/campaign API authority initially. Narrow repository/internal API adapters should expose retained campaign functionality to the reused runtime. Do not migrate account data into a separate Appwrite installation merely to boot the copied monolith, duplicate session ownership or replace frameworks unnecessarily.

## Contracts for the next authorized step

| Boundary | Required contract |
|---|---|
| Identity | Server-verified existing Black Arrow account/session and CSRF rules. Preserve Argon2id hashes, cookie/session secret and records. Copied authentication namespaces must not replace the existing account authority. |
| Scope | Explicit account, campaign, number, conversation and worker epoch on every operation; revalidate ownership before send. |
| Publications | One published AI configuration per campaign, shared by its assigned numbers and coupled to published knowledge references. |
| AI key | One account-wide encrypted Google AI Studio key; masked Save/Replace/Remove/Test controls; plaintext stays server-side. Preserve current keyrings, adding separate conversion key custody only where needed. |
| Generation | Genuine Gemini SDK requests with bounded retry/timeout/usage limits. Remove DeepInfra-only routing, platform-key fallback and scripted sales shortcuts from the retained generation path. No environment-only fix is sufficient. |
| Knowledge/memory | Reuse existing campaign publication, knowledge grounding and encrypted conversation-memory contracts, without importing original customer data. |
| Transport | Real socket or HTTP/webhook transport behind explicit authorization gates; fresh encrypted number auth, durable receipts and stale-worker/crash dedup. Never a mock/skeleton represented as connected. |
| Media/automation | Campaign-owned media, configured welcome/keywords/sequences/follow-ups, consent/revalidation and durable delivery evidence. Keep deterministic templates distinct from generated AI output. |
| Mail | Existing SMTP verification capability is not password reset. Add secure expiring one-use reset flow and verified domain sender configuration later. |

## Branding contract changes already made

Black Arrow filenames/imports, CSS references, root/retained-website package names and lockfile metadata, configuration flags, internal identifiers, cookie names, local storage keys, integration key prefixes/redactors/schema field references and corresponding tests now agree. The shorthand `bai` denotes Black Arrow AI and preserves token-prefix length for existing masking contracts.

These are source changes only. No production schema, cookie, password, session, persisted customer record, old integration key or existing installation was migrated/reset. Source-specific renamed fields such as `blackarrowId` belong to the future independent runtime; never point that code at an existing external schema without an explicit adapter/migration contract. Existing Black Arrow protected data/schema stays unchanged.

## Runtime/dependency gates

- Retain pinned dependency manifests/lockfiles and transitive license notices. The original runtime was Node 20.20.2; isolated validation uses the existing Node 24 container image. A build is not proof of every native/audio library's runtime compatibility.
- Required source dependencies include Gemini SDK, Baileys, Express, React/Vite, Socket.IO, Appwrite SDK, Redis, SQLite/audio/ffmpeg packages. Do not prune on appearance alone.
- Dependency installation for amendment validation is isolated outside the finished project, uses `npm ci --ignore-scripts`, and receives no real service credentials. Subsequent checks use no network and no app startup.
- Appwrite database/user/config/storage imports still require scoped Black Arrow adapters. Redis realtime pub/sub is not proof of durable job storage. Allocate independent databases, Redis, private storage, network and free localhost ports before any next-step runtime.
- Copied configuration defaults remain unreachable and no actual `.env` is shipped. The Vite Gemini-key substitution must be removed before any real key is introduced; all generation and key decryption must be server-side.
- Root Vite build is independent of the retained marketing application's build. Import inspection found no dashboard import into that separate application; its generated route declaration remains intentionally absent. Shared auth/public/SEO imports still need careful pruning before removing source folders.
- CRM/inbox/manual chat, orders/commerce/couriers, customer subscription billing and unrelated personal assistant tools remain excluded from the final product. Retained inactive content is not approved marketing or proof of functionality.

## Connection and domain gates

Requested QR flow: campaign → number → explicit connect → ephemeral QR → intended account scan → verified status → fresh encrypted custody → scoped inbound/generation/outbound receipts and reconnect recovery. The inspected QR engine is a Web-session implementation; code presence is not independently verified platform authorization. Specific authorization and owner approval are still required.

A separate HTTP/webhook transport is a candidate only after current platform/account eligibility, provider credentials, webhook/signature validation and an explicitly approved controlled recipient are established. Neither transport was activated here.

Planned dashboard domain: `app.blackgoldfertilizer.com`. No DNS/TLS/routing change, email send, AI charge or WhatsApp message is part of Conversion 01.

Shortest next slice: isolated build/runtime boundary → existing campaign/session adapters → preserved shell/navigation → server-only Gemini-only key/generation boundary → durable real-transport adapter behind disabled send gates → focused isolation/recovery tests → separately authorized AI and message round-trip acceptance.
