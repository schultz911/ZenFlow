# zenFlow

zenFlow is a standalone workload and task manager for content and design teams. Cloud Firestore stores members, tasks, ownership, deadlines, timers, activity history and compliance audit records. The authenticated Node backend controls access and broadcasts committed changes over SSE.

## Run

Use Node.js 22 or later. Set `FIREBASE_SERVICE_ACCOUNT_KEY` to the existing storage project's service-account JSON, base64 JSON, or a private file path. Set `FIREBASE_PROJECT_ID` and `FIREBASE_DATABASE_ID` when needed. Credentials belong in Railway variables, never the client bundle or Git.

```sh
npm ci
npm run dev
```

Google sign-in remains tied to `zen-flow-7173d`. Workspace membership and permissions are checked server-side. Direct browser Firestore reads and writes remain denied. There is no local-file database fallback: startup fails if Firestore cannot be initialized or read, and failed writes return errors.

## Workflows

- Content/design boards, workload scoring, WIP limits, deadlines and free-pool visibility.
- Pipeline and retainer tasks without mandatory deadlines.
- Independent cross-board subtasks for all registered members.
- Billable timers, task activity history and cloud audit exports.
- Member-owned offline mutation queues with snapshot reconciliation. Queued changes are visibly offline until acknowledged by the backend.

## Verify

```sh
npm test
npm run lint
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm run build
npm run test:rules
npm run test:persistence
```

Emulator tests require Java 21 or later. CI uses Node 22 and Java 21 on Linux. Tests cover actual authorization/workflow handlers, SSE, offline replay, database failure rollback, Firestore atomicity, migration, compiled-server CRUD and restart recovery. See [deployment and persistence details](docs/READINESS.md).

## Railway

The existing `web` service builds this repository and starts `node dist/server.cjs`. `/api/health` probes Firestore and returns 503 when unavailable. Deploy the matching client and server together. Do not include `data/`, service-account files or `.env` files in the container.

The October 2026 transition removes ClickUp sync, API proxies, webhooks, tokens, mapping controls, destination selectors and cloud-link fields. Retired `/api/clickup/*` URLs return 410. Existing native records retain their IDs and ownership; pre-transition metadata is backed up privately without tokens. No tasks in the external service are modified or deleted.
