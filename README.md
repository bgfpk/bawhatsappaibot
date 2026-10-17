# Black Arrow — Conversion 08 review source

Complete converted application exported from Contabo2 source commit `ee7256dc45f1a2c19d7d7b3e67780c948f068553`. This private repository is for independent source review. Its new publication commit deliberately has no server history. No runtime state, customer records, secrets, compiled bundles or reference snapshots are included. Publication-only sanitization differences are listed in the provenance document.

## Review entry points

- [Connection engine and worker orchestration](src/connections/engine.ts)
- [Actual shared WhatsApp socket implementation](src/connections/socket.ts), [SDK factory](src/connections/baileys.ts), [transferred connection service](src/services/whatsapp-connection.ts)
- [Encrypted authentication state](src/connections/auth.ts), [persisted lifecycle](src/connections/state.ts), [inbound normalization](src/connections/incoming.ts), [worker](src/connections/worker.ts), [durable delivery](src/connections/delivery.ts)
- [QR panel integration](src/connections/ui/NumberConnection.tsx) and [transferred QR interface](src/instance-hub/qr/QrPairingPanel.tsx)
- [Connection integration tests](src/connections/engine.test.ts), [UI/boundary checks](src/connections/interface.test.tsx)
- [Existing Gemini generator](src/conversation/generation.ts), [conversation pipeline](src/conversation/pipeline.ts), [migrations](src/campaigns/migrations)
- [Conversion 08 handoff](docs/conversion/CONVERSION-08-HANDOFF.md)

The application includes React/Vite, the Express backend, the copied Next application under `apps/`, deployment configuration and source-derived services. The converted runtime selects `BLACKARROW_STAGE=1`; copied legacy feature code remains available for inspection. The incomplete skeleton transport is not used by the converted connection engine.

## Reproduce a non-sending review

Use Node.js 24, npm and Python 3 for Python deployment-tool inspection. Native `better-sqlite3` dependencies may require the platform C++ toolchain if no matching prebuilt package is available. Run from this repository root. No production credentials are needed.

PowerShell:

```powershell
npm ci
$env:BLACKARROW_STAGE = '1'
$env:BLACKARROW_DISPOSABLE_TEST = '1'
npm run lint
node --import tsx --test src/connections/engine.test.ts src/connections/interface.test.tsx src/services/reply-price-evidence.test.ts src/numbers/numbers.test.ts src/conversation/pipeline.test.ts src/conversation/boundaries.test.ts src/gemini/gemini.test.ts src/staging/public-auth.test.ts
node deploy/build-stage.mjs
```

On Linux/macOS, set these two environment variables with `export` before the same commands. The build disk guard requires at least 10 GB and 15% free space on Linux. The focused tests use disposable databases, synthetic transport events and local fake Gemini endpoints; they do not pair WhatsApp or spend Google quota. They verify scoped routing, publication grounding, state recovery, auth encryption, leases, duplicate prevention, retries and delivery evidence. The real-Google acceptance reported in the handoff was performed separately before publication.

`.env.example` contains blank/offline placeholders and is reference material, not a working production configuration. Do not copy production custody or sessions. The converted server intentionally requires fresh private `/state/custody.json`, a SQLite state directory and controlled socket/egress wiring; see `src/staging/runtime.ts`, `src/staging/account-bootstrap.ts` and `deploy/setup-stage.py`. Deployment tools reference the existing server paths and must not be run against production for this review. The commands above compile and exercise the application without starting deployed services.

For the two copied legacy mock-provider fixture suites, initialize only an in-memory staging document store:

```powershell
node --import tsx --import ./scripts/review-staging-fixture.mjs --test src/services/gemini-provider-service.test.ts src/services/gemini-tts-service.test.ts
```

The fixture bootstrap requires the same disposable flags and never opens server state.

## Current acceptance boundary

Real Gemini generation was verified through the campaign pipeline. The QR interface and non-sending connection architecture are implemented. Real WhatsApp pairing and customer delivery remain blocked pending independently verified platform authorization for an eligible transport and separate owner activation approval. Synthetic captures are not live delivery. No new conversion stage is authorized by this publication.

Existing third-party license notices are preserved in source. No project license grant is added by this private publication. See [publication security checks](docs/review/PUBLICATION-SECURITY.md) and [source provenance](docs/review/SOURCE-PROVENANCE.json).
