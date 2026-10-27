# Readiness hardening deployment

The implementation closes API identity/permission bypasses, restricts direct Firestore access, bounds SSE output, and reads only the recent audit-log tail for sub-millisecond retrieval. All workspace data (`users`, `tasks`) and SOC2 compliance audit logs persist directly to Google Cloud Firestore in standalone mode.

## Deploy in this order

1. Configure `FIREBASE_SERVICE_ACCOUNT_KEY` for the intended Firestore project. The backend requires Firestore Admin/IAM access to `users`, `tasks`, and `compliance_audit_logs`. Identity verification always uses the Google login project `zen-flow-7173d`, regardless of the storage project. An uploaded database credential cannot change identity trust.
2. Back up the existing store/audit data. If relying on local persistence, mount a persistent volume and set `ZENFLOW_DATA_DIR` to that directory. Local mode remains usable but does not provide cloud persistence; the connection status reports this explicitly. `serviceAccountKey.json` uploads remain supported for Superadmin only; prefer the environment credential for redeployment persistence.
3. Deploy the client and server together. Check Google sign-in and `/api/firestore/status` with a registered account; confirm `mode: admin`, `connected: true`, and actual successful writes before changing live database rules. Do not treat successful compilation or SDK initialization alone as proof of database access.
4. Deploy the reviewed rules using `npx firebase deploy --only firestore:rules --project YOUR_STORAGE_PROJECT`. All direct client reads/writes, including authenticated ones, are denied. Only the authorized backend serves app data. The Admin SDK bypasses these rules through IAM. These rules are committed source changes; pushing GitHub alone does not deploy them.
5. Check task creation/edit/reorder, universal cross-board subtasks, pipeline/retainer behavior, member management, and audit log downloads. Confirm reconnection recovers changes/deletions.

## Authentication and permissions

- Google identities must be signed for `zen-flow-7173d`, verified, unexpired, from the Google provider, and already registered in ZenFlow.
- A verified ID token is exchanged for an HttpOnly, SameSite=Strict cookie scoped to `/api`. HTTPS requests receive Secure cookies. The cookie lasts no longer than the ID token. Every request verifies its identity and current membership; caller-supplied role/email/ID assertions cannot authorize an action.
- Cookie mutations require a same-origin non-simple request header. Bearer-token API clients are also supported. SSE and downloads use the HttpOnly cookie, keeping tokens out of URLs.
- Regular members edit their own tasks. CDs can edit their assigned team's tasks/members. Only Superadmin changes email/CD privileges, remaps accounts, or changes Firebase credentials. All registered members retain cross-board subtask delegation and workspace/free-pool visibility.
- Public user payloads use a strict allowlist.
- Offline queues are scoped to the member who created them; previous queued work is migrated under the original cached member ID. A reconnect snapshot overlays pending changes before FIFO replay. Auth failures retain queued work.

## Verification

Run Node 22 and Java 21:

```sh
npm ci
npm test
npm run test:rules
npm run lint
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm run build
node --expose-gc --import tsx tests/benchmark-audit.ts
```

The ordinary test suite executes actual extracted server handlers behind the real authorization middleware with fixture identity/persistence, plus actual client session logic, real HTTP SSE tests, offline reconciliation, and audit-tail edge cases. It never accesses production credentials or services. The emulator suite compiles the real rules and checks anonymous/authenticated/claimed-admin operations and server-owned seed writes against the emulator rules engine. CI repeats verification on Linux with Node 22 / Java 21. The initial GitHub run passed all 25 tests, all 63 emulator-denial checks, type checks, build and production smoke checks. Local Windows emulator HTTP/2 transport failed; its failures were not counted as passes. The final head also includes the large-workspace handshake regression test.

Measured on Node 22.23.4: a 45,889,000-byte / 100,000-record synthetic log read fell from 40.89 ms to 2.17 ms median over five runs (94.7% less time), preserving the last 100 entries. This is a local synthetic benchmark, not a production SLA. Stalled SSE output is bounded to 256 KiB plus one large event; healthy connections can receive a snapshot larger than the bound. Audit history is not deleted or rotated.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for server-owned persistence because all direct client access is denied and backend access is checked independently. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

## Rollback

Do not restore public Firestore rules or trusted caller headers. If a functional regression occurs, retain authenticated access and use the prior data backup with a compatible secured server/client release. Webhook registration secrets must remain private during rollback.
