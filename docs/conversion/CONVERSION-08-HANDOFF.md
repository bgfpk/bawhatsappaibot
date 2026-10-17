# Black Arrow Conversion 08 handoff

Deployed source SHA: `ee7256dc45f1a2c19d7d7b3e67780c948f068553` at https://app.blackgoldfertilizer.com . Public service: `blackarrow-converted-public`; release directory: `/opt/blackarrow-conversion/releases/conversion-08-0m14raa2`; development/staging source remains `/opt/blackarrow-conversion/implementation`.

| Transferred component | Actual integration |
| --- | --- |
| `src/services/whatsapp-connection.ts` | Delegates its real socket construction/event binding to `src/connections/socket.ts`. The scoped factory uses the same core with SDK auth/cache/socket options and approved network injection; legacy plaintext auth folders are blocked in converted mode. The skeleton provider is excluded. |
| `bot-worker.ts` | Shares the extracted notify filter. `connections/incoming.ts` and `worker.ts` adapt notify/fromMe/group/status filtering, the transferred normalizer and trusted socket identity resolution into campaign jobs. The large legacy CRM/order worker is not loaded by the converted engine. |
| `bot-worker-lifecycle-service.ts` | Used by `ConnectionEngine` with scoped eligibility, intentional stops and restart/backoff. Persisted paired/desired/retry state, independent number workers and lease/epoch fencing protect recovery. |
| `QrPairingPanel.tsx` | Reused inside the number connection panel. It supports unpaired, connecting, QR required, connected, disconnected and re-pairing. Backend and browser expiry remove stale codes. Synthetic evidence can render neither a real QR nor a Connected claim. |
| Existing Gemini/conversation engine | Actual `CampaignConversationGenerator`, account Gemini custody, immutable published instructions/catalogue, scoped encrypted memory, quality validation, durable jobs and retries are reused. No replacement provider or scripted responder was added. |

New boundary modules are under `src/connections`. Credentials/Signal buffers are encrypted in SQLite and bound to account, number, auth generation, key kind and ID. Pairing resets revoke old writers; identity claims prevent simultaneous duplicate ownership. No source sessions, secrets or customer records were imported from the original VPS.

Incoming socket notification → normalized customer → assigned campaign/publication → catalogue + memory → Gemini → validated reply → persistent job/outbox → bounded send attempt → correlated authenticated delivery receipt. A socket send return is insufficient proof of delivery. Unknown outcomes are held without automatic replay; known not-attempted retries reuse the saved reply and stable message ID. Reset/reassignment/restart fences stale work. Synthetic captures remain CAPTURED, never SENT.

Acceptance: 29 focused checks, full TypeScript/application build, targeted QR-expiry and final lifecycle builds, compiled Express auth/origin/ownership/reset/restart checks and real SDK protocol fixtures passed. A separate owner-requested disposable synthetic session made exactly one genuine Google request: `gemini-3.5-flash-lite`, 636 reported tokens, a 146-character validated response, one job and one non-sending capture despite duplicate ingress. No public owner data was modified by this test. No WhatsApp network connection or send occurred. Disposable key/database copies were removed.

Final lifecycle checks also verified that authenticated heartbeat renewal preserves owner-edit revisions and stale grants are rejected. The QR panel stays open during number status refreshes.

Testing exposed a price-evidence bug: sentence-final punctuation caused valid published prices to be rejected. Complete amount comparison now handles punctuation and rejects partial-number matches; the quality guard sees current published instructions as well as the catalogue. No quotas, settings or unrelated features were added.

Public key ciphertext, custody, campaign drafts/publications/catalogue, numbers and assignments are preserved. A concurrent successful dashboard Gemini connection test updated only last_test_at and verified_at, and increased the owner Google audit count from 2 to 3. Original production source/configuration/accounts/credential/container fingerprints are unchanged. Existing public Test Assistant remains operational. The additive migration is `006_connection_engine.sql`; rollback never restores an old owner database. Prior hashed assets remain available to already-open browsers.

Rollback: `sudo -n python3 /var/lib/blackarrow-converted-public/recovery/conversion-08-20261017T154307Z/restore.py`. It restores prior code/build/service/routing, retains a current owner-data copy and leaves additive tables intact. The encrypted pre-release archive is `/var/backups/blackarrow/blackarrow-conversion-08-before-20261017T154307Z.tar.age`; authenticated decryption/full archive read and SQLite integrity/foreign-key checks passed. Protected earlier backups remain intact.

Real platform connection: BLOCKED. The selected copied Baileys transport has no independently verified WhatsApp platform authorization; its maintainers explicitly disclaim authorization: https://github.com/WhiskeySockets/Baileys#disclaimer . No separately approved owner activation or reviewed WhatsApp network boundary is configured. The deployed verifier/activation gates are closed, and both application services retain network-none isolation with Gemini-only restricted egress. An eligible authorized QR-first factory/network boundary and explicit pairing/sending approval are required before real connection acceptance; an adapter install or boolean flag alone is insufficient.

Real customer end-to-end delivery: NOT VERIFIED. The genuine Gemini test was a synthetic, non-sending session and is not live WhatsApp evidence.

Owner tests now: refresh WhatsApp Numbers, use View QR Connection, inspect the precise Unpaired/authorization blocker and refresh status. Campaign assignments and confirmed local pairing reset are available where applicable. Continue using the existing public Test Assistant. No genuine QR will appear until the activation requirements are satisfied.

Final case-insensitive Windows and Contabo2 content/path/archive scans, plus the new Git objects, found zero remaining legacy-brand matches. Earlier protected backups and third-party license notices remain intact. Source archive SHA-256: `4dace2bf0a74fc63774d62d94c630098234084641ebe6e564cc954814618391d`.

Stop after Conversion 08. Do not begin other features.
