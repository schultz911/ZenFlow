# Firestore-only workspace deployment

## Storage and migration

Firestore is authoritative. The backend reads a fresh database snapshot for each API operation, applies the existing authorized workflow, then commits changed documents and create-only audit records atomically before returning success or broadcasting SSE. In-memory state is a request working copy. Local JSON and NDJSON files are no longer storage sources and are excluded from images.

A revision document at `workspace/state` prevents overlapping deployments from silently overwriting one another. Conflicting writes return 503 for retry. One operation is bounded to 500 Firestore writes including audit records and revision; oversized member remaps/deletions fail atomically. This design favors correctness for the current workspace; full-snapshot reads per operation have a Firestore read cost that grows with workspace size.

On the first startup, existing `users` and `tasks` documents are copied to private `workspace_backups/native-v1/{users|tasks}/{id}` subcollections with saved tokens excluded. Retired integration fields are removed using document update-time preconditions. IDs, task content, parent links, statuses, dates, timer totals and activity history are retained. The migration marker is `workspace/native-v1`. The private webhook registry is removed. The external service's tasks are untouched; any old external webhook registration receives 410 from ZenFlow.

The database is never repopulated from a local seed or merged with stale deleted records. A new database only bootstraps the owner account. Uploaded credentials and runtime database switching are removed; credentials are deployment configuration.

## Deploy

1. Confirm the existing storage project and database. Production currently targets `zen-flow-7173d` / `(default)`, Firestore Standard, Mumbai (`asia-south1`).
2. Configure `FIREBASE_SERVICE_ACCOUNT_KEY`, `FIREBASE_PROJECT_ID` and `FIREBASE_DATABASE_ID` on Railway. Admin IAM must allow `users`, `tasks`, `compliance_audit_logs`, `workspace`, `workspace_backups` and removal of the retired `server_secrets/clickup_webhooks` document. Startup requires successful database reads and migration writes.
3. Deploy the same tested client/server revision to the existing Railway service. Use `/api/health` as the deployment healthcheck.
4. Inspect the migration counts, private backup, deployed health and authenticated Firestore status. Compare native record IDs before/after deployment.
5. Verify Google login, member management, tasks, delegation, timers, audit export and SSE reconnect. Anonymous API reads/writes and caller-header spoofing must remain denied. Retired integration routes return 410 and make no external requests.

## Security

Google identity verification is fixed to `zen-flow-7173d`, independently of storage credentials. A verified identity must be a registered member. API/SSE sessions use HttpOnly same-origin cookies; mutations require the same-origin non-simple request header. Bearer API clients are supported. Superadmin, Creative Director and owner permission boundaries remain enforced server-side. All registered members retain independent cross-board delegation and workspace visibility.

The existing live Firestore rules deny all direct client access, including authenticated and claimed-admin clients. IAM-authenticated Admin access bypasses these rules and is constrained by backend authorization. Backups, revisions and audits inherit the same default deny policy. No rule relaxation is needed for this release.

## Tests

`npm test` runs workflow/permission/SSE/offline and database failure tests. `npm run test:rules` verifies anonymous, authenticated and claimed-admin access remains denied. `npm run test:persistence` runs Firestore/Auth emulators, tests migration/atomic commits/conflicts/deletes, then starts the compiled production server for authenticated CRUD, delegation, audit export and restart recovery. Credentials and identities are synthetic; these tests never mutate production.

Windows' older direct-gRPC rule harness can report HTTP/2 protocol errors; count those as failures. Linux CI uses Node 22 / Java 21. Persistence and compiled-server tests use the current SDK's emulator transport. A successful build alone is not evidence of authenticated production workflow behavior.

## Recovery

Retain authenticated APIs and deny-all client rules. The private metadata backup excludes saved personal tokens, so restoration cannot reconnect an external integration. Restore native records through Admin access after identifying the specific failed operation; do not re-enable a local JSON merge or broadly restore deleted records. Cloud audit history is create-only and exported from Firestore in bounded pages.
