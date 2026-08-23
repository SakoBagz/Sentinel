# Deploy Sentinel on Vercel (frontend)

Sentinel's **Next.js UI** runs on Vercel. The **API, PostgreSQL, Redis, and simulator**
must run elsewhere (Render is the reference backend in this repo). Vercel alone cannot
host the full stack.

## Architecture

```text
Browser → Vercel (Next.js) → Render API (FastAPI + sim)
                              ↓
                         PostgreSQL + Redis
```

## Prerequisites

1. GitHub repo pushed and public (or connected to Vercel).
2. A Render account (or another host for the API).
3. Managed PostgreSQL and Redis (Render, Neon, Upstash, etc.).

---

## Step 1 — Deploy the backend (Render)

1. In [Render](https://render.com), create a **PostgreSQL** database and a **Redis**
   instance (or use external providers and copy connection URLs).
2. Create a **Web Service** from this repo using
   [`../render/render.yaml`](../render/render.yaml), or manually:
   - **Runtime:** Docker
   - **Dockerfile:** `./apps/api/Dockerfile`
   - **Docker context:** repository root
   - **Health check path:** `/api/health`
3. Set environment variables on the API service:

```text
APP_ENV=production
PUBLIC_DEMO=true
WEB_ORIGIN=https://YOUR-PROJECT.vercel.app
AUTH_SECRET=<generate-a-long-random-secret>
DATABASE_URL=<postgres-connection-string>
REDIS_URL=<redis-connection-string>
ANALYSIS_PROVIDER=mock
```

Generate a secret locally:

```bash
openssl rand -hex 32
```

4. Wait for deploy. Confirm health:

```text
https://YOUR-API.onrender.com/api/health
```

**Important:** `WEB_ORIGIN` must exactly match your final Vercel URL (no trailing slash).
Update it after Vercel gives you a domain if you guessed wrong on the first pass.

---

## Step 2 — Deploy the frontend (Vercel)

### Option A — Vercel Dashboard (recommended)

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repository.
2. **Project settings:**
   - **Framework Preset:** Next.js
   - **Root Directory:** `apps/web`
   - **Node.js Version:** 22.x (matches [`.nvmrc`](../../.nvmrc))
3. **Environment variables** (Production + Preview):

```text
NEXT_PUBLIC_API_BASE_URL=https://YOUR-API.onrender.com
NEXT_PUBLIC_WS_BASE_URL=wss://YOUR-API.onrender.com
```

These are baked in at **build time**. Redeploy after changing them.

4. Click **Deploy**.

### Option B — Vercel CLI

From the repository root:

```bash
npm i -g vercel
cd apps/web
vercel link
vercel env add NEXT_PUBLIC_API_BASE_URL production
vercel env add NEXT_PUBLIC_WS_BASE_URL production
vercel --prod
```

---

## Step 3 — Wire CORS and smoke test

1. Set Render `WEB_ORIGIN` to your live Vercel URL if it changed.
2. Open the Vercel URL.
3. Confirm **SENTINEL** landing loads.
4. Click **Launch seeded run** → map and telemetry update.
5. Inject a fault → audit panel shows `failure.inject`.
6. Complete the run → open **Replay** and **Debrief**.

---

## Custom domain (optional)

1. Add the domain in Vercel → **Settings → Domains**.
2. Update Render `WEB_ORIGIN` to `https://your-domain.com`.
3. Redeploy the API service (or restart) so CORS picks up the new origin.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| API calls fail / CORS errors | `WEB_ORIGIN` on Render must match the Vercel URL exactly. |
| WebSocket never connects | Use `wss://` (not `ws://`) in `NEXT_PUBLIC_WS_BASE_URL`. |
| Stale API URL after env change | Redeploy Vercel (NEXT_PUBLIC_* vars are build-time). |
| Render cold start | First request after idle may take 30–60s; retry or use a keep-alive ping. |
| 401 on mutations | Browser auto-issues a demo JWT; ensure API `AUTH_SECRET` is set. |

---

## Cost notes (reference layout)

| Service | Typical free tier |
| --- | --- |
| Vercel | Hobby — static/SSR frontend |
| Render | Free web service (spins down on idle) |
| PostgreSQL / Redis | Provider free tiers with storage limits |

Hosted limits (`PUBLIC_DEMO=true`): 50 vehicles, 5 Hz telemetry, 5 runs per session.
See [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md).
