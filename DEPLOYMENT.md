# Deploying SmartClinic (Free Tier, No Credit Card)

This guide gets a **public live demo** running on free-tier services, none of
which require a credit card:

| Layer | Service | Free? | Card required? |
|---|---|---|---|
| Database (Postgres + pgvector) | [Neon](https://neon.tech) | ✅ Always-on free tier | No |
| Backend API (NestJS, Docker) | [Back4app Containers](https://www.back4app.com) | ✅ 256MB RAM, 100GB transfer, 600 hrs/month | **No** |
| Frontend (React SPA) | [Vercel](https://vercel.com) | ✅ Free hobby tier | No |

> **Why not Render?** Render's free *web services* (the compute tier this app
> needs) require a credit card for signup — only their static-site hosting is
> card-free. If you're fine giving Render a card (it won't charge you unless
> you exceed free limits, which a demo app like this won't), [`render.yaml`](render.yaml)
> is still in the repo and works exactly as described in the old version of
> this guide. This version uses **Back4app Containers** instead, which has a
> genuinely free, no-card container hosting tier.

The repo already contains the config needed ([`frontend/vercel.json`](frontend/vercel.json),
a `/health` probe). You only need to create three accounts and paste a few
values between them. **Total time: ~20 minutes.**

> Throughout, replace `<...>` placeholders with the real values each service gives you.

---

## Step 1 — Database on Neon

1. Sign up at **https://neon.tech** (log in with GitHub — easiest).
2. Create a new project (any name, e.g. `smartclinic`). Pick a region near you.
3. Once created, open **Dashboard → Connection Details** and copy the
   **connection string**. It looks like:
   ```
   postgresql://neondb_owner:XXXX@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Save this — it's your **`DATABASE_URL`**. You'll paste it into Back4app (Step 2)
   and use it once locally to seed demo data (Step 4).

> pgvector is available on Neon by default — the app's migration enables it
> automatically on first boot.

---

## Step 2 — Backend on Back4app Containers

1. Sign up at **https://www.back4app.com** (GitHub login works, **no card asked**).
2. From the dashboard, choose **Containers** → **New App** → connect your GitHub
   account and select the **`SmartClinic`** repository.
3. Configure the app:
   - **Branch**: `main`
   - **Root Directory**: **`backend`** — important, since the Dockerfile lives at
     `backend/Dockerfile`, not the repo root.
   - App name: anything, e.g. `smartclinic-api`.
4. Add environment variables (Back4app's dashboard has an "Environment
   Variables" section during setup, or under the app's Settings afterward):
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | your Neon connection string from Step 1 |
   | `JWT_ACCESS_SECRET` | any random string, e.g. generate one at [randomkeygen.com](https://randomkeygen.com) |
   | `JWT_REFRESH_SECRET` | a different random string |
   | `JWT_ACCESS_TTL` | `900s` |
   | `JWT_REFRESH_TTL` | `7d` |
   | `AI_PROVIDER` | `openai` |
   | `AI_MODEL` | `llama-3.3-70b-versatile` |
   | `AI_BASE_URL` | `https://api.groq.com/openai/v1` |
   | `AI_API_KEY` | your free Groq key from https://console.groq.com (leave blank to demo graceful degradation instead) |
   | `CORS_ORIGIN` | leave as a placeholder for now (e.g. `https://localhost`); you'll set the real Vercel URL in Step 5 |
   | `PORT` | `3000` |
5. Deploy. The first build takes a few minutes (it's building the same Docker
   image you already tested locally). When done, Back4app gives you a public
   URL (something like `https://smartclinic-api-xxxx.back4app.io`). Open
   `<that-url>/health` — you should see `{"status":"ok","db":"up",...}`.
6. Save this backend URL — it's your **`VITE_API_URL`** for Step 3.

> **Free tier limit to know about:** Back4app's free container tier includes
> 600 active hours/month (~20 hours/day, not full 24/7). That's fine for a
> portfolio demo people check out occasionally — just skip the keep-alive
> trick from the old Render-based version of this guide, since pinging it
> constantly would burn through the monthly hours faster, not slower.

---

## Step 3 — Frontend on Vercel

1. Sign up at **https://vercel.com** (log in with GitHub).
2. **Add New… → Project**, import the **`SmartClinic`** repo.
3. Set **Root Directory** to **`frontend`** (click *Edit* next to Root Directory).
   Vercel auto-detects Vite via [`frontend/vercel.json`](frontend/vercel.json).
4. Under **Environment Variables**, add:
   - `VITE_API_URL` = your Back4app backend URL from Step 2
     (e.g. `https://smartclinic-api-xxxx.back4app.io`).
5. **Deploy.** You'll get a URL like **`https://smart-clinic.vercel.app`**.

---

## Step 4 — Seed demo data (run once)

The database is empty until seeded. Run this **once** from your machine, pointing
at the Neon database:

```bash
cd backend
# Windows PowerShell:
$env:DATABASE_URL="<your Neon connection string>"; npm run seed
$env:DATABASE_URL="<your Neon connection string>"; npm run seed:knowledge
# macOS/Linux:
DATABASE_URL="<your Neon connection string>" npm run seed
DATABASE_URL="<your Neon connection string>" npm run seed:knowledge
```

`seed` creates the demo accounts, doctors, rooms, and historical appointments.
`seed:knowledge` embeds and loads the RAG knowledge base used by the Smart
Recommender and SOAP assistant (first run downloads a small embedding model,
~25MB, cached after).

---

## Step 5 — Connect frontend ↔ backend (CORS)

1. Back in **Back4app → smartclinic-api → Environment Variables**, set
   **`CORS_ORIGIN`** to your exact Vercel URL from Step 3 (e.g.
   `https://smart-clinic.vercel.app`).
2. Save/redeploy — Back4app rebuilds and restarts the container.

---

## Step 6 — Optional: Redis for intake chat sessions (Upstash, free)

The intake chatbot's conversation state is held in a session store that falls
back to in-process memory if no Redis is configured — fine for a demo on a
single backend instance, but it's lost on every restart/redeploy. To make it
durable:

1. Sign up at **https://upstash.com** (free tier) → create a Redis database.
2. Copy its connection string (starts with `rediss://`).
3. In **Back4app → smartclinic-api → Environment Variables**, set
   **`REDIS_URL`** to that value.

---

## Done ✅

Open your Vercel URL and log in with a demo account (see the main
[README](README.md#demo-accounts)). Every push to `main` now auto-redeploys both
the backend (Back4app) and frontend (Vercel).

### Demo login quick reference

| Role | Email | Password |
|---|---|---|
| Admin | `admin@smartclinic.test` | `Password1!` |
| Receptionist | `reception@smartclinic.test` | `Password1!` |
| Doctor | `dr.khan@smartclinic.test` | `Password1!` |
| Patient | `patient@smartclinic.test` | `Password1!` |

---

## Troubleshooting

- **Frontend loads but every request fails / CORS error** → `CORS_ORIGIN` on
  Back4app doesn't exactly match the Vercel URL (check `https://`, no trailing slash).
- **`/health` shows `db: down`** → `DATABASE_URL` is wrong or missing `?sslmode=require`.
- **Login says "invalid credentials"** → the database wasn't seeded (Step 4).
- **First request after idle is slow** → normal free-tier cold start behavior;
  the app itself boots in a few seconds once the container is running (verified
  locally — see `docker compose logs backend`), most of the delay is the
  platform spinning the container back up.
- **Build fails on the backend** → if you're following along after cloning this
  repo, note that `backend/Dockerfile` deliberately uses `node:20-bookworm-slim`,
  not an Alpine image — the local embedding library (`onnxruntime-node`) crashes
  on Alpine's musl libc. Don't "optimize" this back to Alpine.
