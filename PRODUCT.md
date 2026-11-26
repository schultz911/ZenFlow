# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Internal ZenSciences agency teams:
- **Creative Directors, Cluster Leads, Business Leads, and Team Leads:** oversee delivery boards, balance daily cognitive load, assign work from shared pipelines, and review deliverables.
- **Account Managers (Accounts):** create pipeline deliverables, track client accounts/projects, and monitor delivery status without directly editing specialist boards.
- **Content & Design Specialists:** execute assigned tasks across swimlanes, log billable hours, and delegate subtasks across boards.
- **Superadmin & Administrators:** provision accounts, manage roles and Firebase/ClickUp connections, and audit compliance logs.

## Product Purpose

zenFlow is an internal real-time workload orchestration platform for ZenSciences. It exists to prevent team overload, surface idle capacity, and coordinate creative delivery across Content, Design, and Accounts. Success means leads can spot capacity bottlenecks before deadlines slip, allocate work fairly without manual status chasing, and keep ClickUp deliverables in sync.

## Positioning

Unlike using ClickUp or a standard kanban board directly, zenFlow pairs cognitive-load scoring (`Low = 1`, `Medium = 1.5`, `High = 2`), WIP limit alarms, and a live cross-board Free Pool (`< 3h/day` assigned) with two-way ClickUp parent/subtask synchronization.

## Operating Context

- **Daily agency ops:** Teams work across multi-stage swimlanes (`Pipeline`, `Retainer`, `To Do`, `In Progress`, `In Review`, `Done & Archived`) and centralized `TeamPipeline` queues.
- **ClickUp integration:** Pipeline deliverables generate canonical `ParentTask` records (shared brief and brand guidelines link) synced to ClickUp with hash-based conflict protection.
- **Real-time collaboration:** Server-Sent Events (SSE) keep boards live across tabs, backed by optimistic UI and offline FIFO replay.
- **Data & compliance:** Google Identity authentication (`HttpOnly`, `SameSite=Strict` session cookies), Google Cloud Firestore primary persistence with atomic local fallback (`data/store.json`), and append-only SOC2 compliance audit logs (`data/audit.ndjson`).

## Capabilities and Constraints

- **Scope:** Internal ZenSciences tool only; no external client-facing views or multi-tenant SaaS requirements.
- **RBAC & Zero-Trust:** Server-owned Firestore security rules (`allow read, write: if false` for direct client access); strict role-based permissions for board editing, pipeline creation, user provisioning, and superadmin-only database purge.
- **Metrics:** Working-day daily estimated hour splits, team utilization (at least 3 assigned hours per day), individual and team efficiency (estimated hours divided by billable hours for completed work with both values), and executive analytics with locked historical snapshots.
- **Theme parity:** Must maintain both light and dark modes across all surfaces.

## Brand Commitments

- **Product & Organization:** `zenFlow` by ZenSciences.
- **Binding constraints:** Preserve ZenSciences identity, light/dark mode parity, and zero-trust RBAC / SOC2 audit trail.

## Evidence on Hand

- Production codebase: `src/` (React 19, TypeScript, Tailwind CSS v4, Motion), `server.ts` and `server/` (Express 4, Node 22, Firebase Admin).
- Documentation: `README.md`, `AGENTS.md`, `docs/READINESS.md`, `docs/UI-REFINEMENT.md`.
- Automated test suite: `tests/` (unit, RBAC security, session, SSE/audit resources, analytics, shared pipelines, Firestore rules emulator, UI preview).
- No external marketing testimonials, public pricing, or third-party case studies exist; do not fabricate them.

## Product Principles

1. **Protect cognitive capacity first:** Surface load pressure, WIP breaches, and underutilized capacity (`< 3h/day`) before work is assigned.
2. **One source of truth per deliverable:** Keep shared briefs and brand guidelines on canonical parent tasks and sync cleanly with ClickUp instead of duplicating across teams.
3. **Role-appropriate clarity:** Show each role the controls and scope they own—strictly enforcing RBAC without cluttering specialist views with admin noise.
4. **Operational reliability over ornament:** Favor real-time accuracy, zero-trust auditability, and fast daily scanning in both light and dark modes.
