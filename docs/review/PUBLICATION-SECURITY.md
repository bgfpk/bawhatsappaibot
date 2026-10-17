# Private publication security boundary

This publication exports only the tracked converted application from `/opt/blackarrow-conversion/implementation` at source commit `ee7256dc45f1a2c19d7d7b3e67780c948f068553`. The empty destination receives a new root commit. No server Git history, reference snapshot, unrelated application or original production tree is imported.

Before staging, all exported paths and files were scanned using checksum-verified Gitleaks 8.30.1 with its default rules, plus an inventory of private-state/data patterns and a case-insensitive legacy-brand scan. The complete new outgoing Git history is also scanned before push, including all reachable blobs. Reports are redacted and retained outside the repository.

Excluded: real `.env` files, API credentials, OAuth secrets, tokens, custody files, WhatsApp pairing/Signal authentication state, private cryptographic keys, databases/WAL/SHM, dumps, customer records/media, backups, private logs, dependencies, caches and compiled artifacts. The source export already excluded runtime state. Blank/offline `.env.example` and configuration examples remain. Six schema migrations are included; no database contents are included. Existing third-party notices are retained.

The copied public IndexNow verification token and its verification file are omitted. The optional submission utility now requires the owner's own external key and fails closed without one; its copied nginx route is a placeholder. Google-key-shaped constants in two mock-provider test files are constructed synthetic values. No real key is used or tested. `.gitleaks.toml` retains default detections and permits only exact, audited synthetic literals in named test files; it does not blanket-exclude tests or suppress live credentials.

See `SOURCE-PROVENANCE.json` for the source tree digest and precise publication-only sanitization differences. Core WhatsApp/Gemini implementation files are unchanged. Review/build instructions are in the root README. A scan result is evidence of the checks performed, not a guarantee about all future commits.

Publication uses the existing private `bgfpk/bawhatsappaibot` repository, with no force push. Production services, data, custody, backups, Gemini requests and WhatsApp connectivity are not changed by publication. Real transport activation remains blocked as described in the Conversion 08 handoff.

Local verification: the 9 connection engine/interface checks passed, and all 22 copied Gemini-provider/TTS fixture checks passed using the disposable in-memory bootstrap. The IndexNow utility was syntax-checked and its missing-key path verified without any HTTP call. No application rewrite, production deployment or paid acceptance request was performed for publication.
