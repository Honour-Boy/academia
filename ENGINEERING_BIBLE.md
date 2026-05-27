# Engineering Bible

> Canonical engineering reference. Read this before writing any code in any project.
> When this file and a project's `CLAUDE.md` conflict, the project's `CLAUDE.md` wins (it's the override).

---

## Stack

### Default SaaS profile

| Layer | Tool | Notes |
|-------|------|-------|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui | Always App Router. Never Pages Router. |
| Backend | Node.js, Express, TypeScript | Zod for I/O contracts (the TS equivalent of Pydantic). |
| Database | Supabase (PostgreSQL + RLS) | Supabase JS client on frontend, Supabase client or direct PG on backend. |
| Auth | Clerk (frontend identity) → Supabase JWT (backend auth) | Clerk handles sign-in. Backend Express middleware validates Supabase JWTs. |
| Client-side cache | React Query (TanStack Query) | 5min default staleTime. Invalidate on mutations. |
| Server-side cache | Redis | Session caching, rate limiting, job queues. |
| Realtime | Socket.IO (when needed) | Attached to same Express HTTP server. |
| Product analytics & flags | PostHog | Product analytics, session replay, feature flags, experiments, LLM analytics. |
| LLM routing | OpenRouter | Tiered: cheap models for simple tasks, frontier for reasoning. |
| Code quality | FORGE / vibe2prod | Scan before every push. |

### Marketing / Portfolio profile

| Layer | Tool | Notes |
|-------|------|-------|
| Frontend | Next.js (App Router), TypeScript, Tailwind | Same as default |
| Hosting | Vercel only | No backend, no database |
| Fonts | `next/font/local` | Self-host, no Google Fonts CDN |
| Assets | `public/` | Images, OG cards, favicons, CV PDFs |
| CSS tokens | Locked tokens file with pre-commit validator | See `docs/design-system-locking.md` |
| Analytics | PostHog (optional) | Only if the site needs web analytics or session replay |

**Removed from marketing profile:** Express, Supabase, Redis, Clerk, Sentry. None belong in a static marketing site.

---

## Infrastructure

| Component | Host | Details |
|-----------|------|---------|
| Frontend | Vercel | Auto-deploys from Git. Global CDN. |
| Backend | Oracle Cloud VM (Always Free) | 24GB RAM, 4 OCPU ARM. Docker containers via Coolify. |
| Database | Supabase Cloud | Separate staging and production databases. |
| Secrets | Doppler | All secrets managed here. Synced to Vercel and Coolify. No `.env` files in production. |
| Automation | n8n (self-hosted on Oracle VM) | Webhook routing, scheduled workflows, notification routing. |
| Monitoring (errors) | Sentry → n8n → Slack | Error tracking, distributed tracing. Auto-creates GitHub Issues in `#tasks`. |
| Monitoring (product) | PostHog Cloud → n8n → Slack | Product analytics, session replay, feature flags. Alerts to `#product`. |
| Uptime | UptimeRobot | Pings frontend + backend URLs. Alerts via Slack. |
| User feedback | Sleekplan | Webhooks → n8n → GitHub Issues. |
| Multi-tenant OAuth | Nango (when needed) | For SaaS where users connect external accounts. |

---

## Repo Structure

Separate repos per project. No monorepos. Frontend and backend may share a repo.

```
project/
├── frontend/                  # Next.js
│   └── .env.example
├── backend/                   # Express + TypeScript
│   └── .env.example
├── supabase/                  # Migrations
├── CLAUDE.md                  # Project-specific agent context
├── handoff.md                 # Living project state
├── ENGINEERING_BIBLE.md       # This file (or @ reference to it)
└── docker-compose.yml         # Resource limits required per service
```

---

## Database Rules (SaaS profile)

1. **All schema changes go through Supabase CLI migrations.** Run `supabase migration new <name>`, write the SQL, commit the file.
2. Never modify the schema directly via dashboard, raw SQL, or any other method.
3. Migration files live in `supabase/migrations/` and are committed to Git.
4. Apply to staging first: `supabase db push`. Apply to production only after staging validation.
5. Both frontend and backend talk to the same database. Migrations are language-agnostic.
6. Row Level Security (RLS) must be configured on all user-facing tables.
7. Do NOT use Prisma or other ORMs that abstract the schema. Raw SQL or Supabase client only.

---

## Secrets and Environment Variables

1. **All secrets live in Doppler**, organized by project and environment (staging/production).
2. Deployed apps receive secrets from Vercel (frontend) and Coolify (backend), synced from Doppler.
3. For local development: `doppler run -- <command>`. No `.env` files for production secrets.
4. To list variables: `doppler secrets --only-names`.
5. Each directory has its own `.env.example`:
   - `frontend/.env.example` — Clerk publishable key, Supabase URL, API URL, etc.
   - `backend/.env.example` — Supabase service key, JWT secret, OpenRouter key, etc.
6. Never commit secrets. Never hardcode secrets. Never access production secrets locally.

---

## Git Workflow

1. `main` (production) ← `staging` ← `feature/issue-N-description`.
2. Never push directly to `main` or `staging`. Always use PRs.
3. Feature branches created from `staging`: `feature/issue-<number>-<short-description>`.
4. Micro-commits: each commit does one thing with a descriptive imperative message.
5. PR description includes `Closes #<number>` to auto-close the linked Issue.
6. Tests must pass in GitHub Actions before merge.

---

## API Design

1. REST over HTTPS between frontend and backend.
2. Express with Zod request/response schemas. Every endpoint validates input and output against a Zod schema.
3. CORS configured between Vercel origin and backend.
4. Auth: Clerk session token (frontend) → Supabase JWT validation (backend middleware).
5. Long-running operations: background tasks + SSE (or Socket.IO) for progress.
6. See `docs/backend-security.md` for the three non-negotiable rules: auth on every route, pagination required, safe error responses.

---

## Deployment

1. **Frontend**: Push → Vercel auto-deploys. Staging branch = preview. Main = production.
2. **Backend**: Push → Coolify auto-deploys Docker containers. Resource limits required:
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '1.0'
         memory: 4G
       reservations:
         memory: 2G
   ```
3. Coolify deploys from `staging` and `main` branches only.
4. GitHub Actions runs tests on every PR. Failing tests block merge.

---

## Testing

1. Every new API endpoint includes at least one test.
2. Every database mutation (create/update/delete) includes at least one test.
3. Authentication and payment flows are always tested.
4. Tests run in GitHub Actions on every PR. Failing tests block merge.
5. Local: `doppler run -- npm test` (or `pytest` for any Python tooling).

---

## Observability Rules

See `docs/observability.md` for full detail. Summary:

1. **Sentry owns errors. PostHog owns behaviour.** Don't cross the streams.
2. **One SDK per concern on the frontend.** `@sentry/nextjs` for errors. `posthog-js` for everything else.
3. **Feature flags live in PostHog.** Not in Doppler.
4. **LLM calls through OpenRouter are captured in PostHog LLM analytics.** Wire at the OpenRouter-calling layer.
5. **Provision via Vercel Marketplace where possible.** PostHog and Sentry both have Marketplace integrations.
6. **Alerts route through n8n.** Sentry → `#tasks`. PostHog → `#product`.

---

## FORGE / vibe2prod

FORGE scans code for security, quality, and architecture issues. Run it locally via Claude Code before pushing.

### Setup

```bash
pip install vibe2prod
vibe2prod setup          # Interactive TUI — configures CLI + registers MCP server in Claude Code
```

### CLI

```bash
vibe2prod scan ./repo    # Full scan
vibe2prod report ./repo  # View last report
vibe2prod status ./repo  # Real-time progress
vibe2prod update         # Self-update + skill/hook sync
```

### The /forge Skill

After scanning, use `/forge` in Claude Code to autonomously fix findings. It reads the scan report, prioritizes by severity, and applies fixes with micro-commits.

### Quality Gates

Three profiles: `forge-way` (default), `strict`, `startup`. Composite score: A (80+), B (60-79), C (40-59), D (20-39), F (0-19).

### Suppression

Use `.forgeignore` (YAML v2) for false positives with pattern matching, expiry dates, and audit trail.

### Workflow

1. Build feature on branch
2. `vibe2prod scan .` or use `forge_scan` MCP tool
3. `/forge` to let Claude Code fix findings with micro-commits
4. Push clean code → PR → GitHub Actions runs tests

---

## Architecture Coaching: /architect Skill

Before building substantial features, use the `/architect` skill. It walks through 7 questions to define what needs to be built before code is written: new data, backend endpoints, frontend pages, auth, real-time needs, background work, and external services. It never answers for you — it coaches your thinking.

**When to suggest /architect:**
- The user describes a NEW feature involving schema changes, new endpoints, or external services
- The user says "I want to add..." or "I need..." followed by a feature that touches multiple parts of the system
- The user seems unsure where to start

**When NOT to suggest /architect:**
- Bug fixes (the architecture exists, something is broken)
- UI-only changes (styling, layout, copy, component tweaks)
- Adding a field to an existing form with an existing endpoint
- Simple additions to existing patterns (another CRUD endpoint matching existing ones)
- The user has already defined the architecture in a GitHub Issue

---

## Development Lifecycle

1. **Define** (15-30 min): GitHub Issue — problem, solution, definition of done.
2. **Architect** (scale to complexity): Skip for small. `/architect` for medium/large. Outputs into the Issue.
3. **Build**: Read Issue → read `CLAUDE.md` → `doppler run` → feature branch → implement → tests → FORGE scan → `/forge` fixes → PR with `Closes #N`. Update `handoff.md` after each issue.
4. **Review**: GitHub Actions runs tests. Agent reviews post comments. Summary in Slack `#dev-feed`.
5. **Deploy**: Merge to staging → Coolify → test → merge to main → Coolify → production.
6. **Verify**: Sentry for errors, PostHog for behaviour. Slack `#deploys` for confirmation.

---

## Task Tracking

- All tasks = GitHub Issues. Labels: `bug`, `feature`, `security`, `feedback`.
- Priority: `priority:high`, `priority:low`.
- Auto-created via n8n from: Sentry errors, PostHog regression-tagged alerts, Sleekplan feedback.
- GitHub Projects for kanban view.

---

## Principles

- **Simple first, complex later.** Write the minimum code that solves the problem.
- **Separate what fails independently.** Frontend and backend deploy separately.
- **Zod contracts everywhere.** Every API boundary has a schema.
- **Budget-aware.** Free tiers first. Tiered model routing.
- **No direct schema changes.** Every change is a migration file.
- **One place to look.** Everything routes to Slack through n8n.
- **One database vendor per stack.** Supabase is the default for Postgres + Auth + RLS.
- **Scan before you push.** FORGE runs locally, not just in CI.
- **Update `handoff.md` after every meaningful change.** State decays without it.

---

## Cross-Cutting References

For depth on specific areas, see:

- `docs/ui-standards.md` — Skeleton loaders, optimistic UI, tooltips
- `docs/caching.md` — Client-side (React Query) and server-side (Redis) rules
- `docs/backend-security.md` — Auth, pagination, safe errors
- `docs/seo-and-entity.md` — Metadata, JSON-LD, sitemaps, /llms.txt
- `docs/mobile-responsiveness.md` — Breakpoints, required QA
- `docs/design-system-locking.md` — Token discipline, pre-commit pattern
- `docs/handoff-protocol.md` — How `handoff.md` works
- `docs/agent-behavior.md` — Think before coding, simplicity, surgical changes
- `docs/observability.md` — Sentry, PostHog, alert routing
