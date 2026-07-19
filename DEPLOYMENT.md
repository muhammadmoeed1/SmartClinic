# Deploying SmartClinic (Free Tier)

This guide gets a **public live demo** running on free-tier services:

| Layer | Service | Free? |
|---|---|---|
| Database (Postgres + pgvector) | [Neon](https://neon.tech) | ✅ Always-on free tier |
| Backend API (NestJS, Docker) | [Render](https://render.com) | ✅ Free web service |
| Frontend (React SPA) | [Vercel](https://vercel.com) | ✅ Free hobby tier |

The repo already contains all the config needed ([`render.yaml`](render.yaml),
[`frontend/vercel.json`](frontend/vercel.json), a `/health` probe, and a
keep-alive workflow). You only need to create the three accounts and paste a few
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
4. Save this — it's your **`DATABASE_URL`**. You'll paste it into Render (Step 2)
   and use it once locally to seed demo data (Step 4).

> pgvector is available on Neon by default — the app's migration enables it
> automatically on first boot.

---

## Step 2 — Backend on Render

1. Sign up at **https://render.com** (log in with GitHub).
2. Click **New +  → Blueprint**.
3. Connect your GitHub and select the **`SmartClinic`** repository. Render detects
   [`render.yaml`](render.yaml) and shows the `smartclinic-api` service.
4. Click **Apply**. Render will ask for the values marked `sync: false`:
   - **`DATABASE_URL`** → paste the Neon connection string from Step 1.
   - **`AI_API_KEY`** → your Groq key (free — get one at
     https://console.groq.com). Leave blank to demo the graceful-degradation
     fallbacks instead.
   - **`CORS_ORIGIN`** → leave as a placeholder for now (e.g. `https://localhost`);
     you'll set it to the real Vercel URL in Step 5.
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are generated automatically.
5. Deploy. First build takes a few minutes. When done you'll get a URL like
   **`https://smartclinic-api.onrender.com`**. Open `https://<that-url>/health` —
   you should see `{"status":"ok","db":"up",...}`.
6. Save this backend URL — it's your **`VITE_API_URL`** for Step 3.

---

## Step 3 — Frontend on Vercel

1. Sign up at **https://vercel.com** (log in with GitHub).
2. **Add New… → Project**, import the **`SmartClinic`** repo.
3. Set **Root Directory** to **`frontend`** (click *Edit* next to Root Directory).
   Vercel auto-detects Vite via [`frontend/vercel.json`](frontend/vercel.json).
4. Under **Environment Variables**, add:
   - `VITE_API_URL` = your Render backend URL from Step 2
     (e.g. `https://smartclinic-api.onrender.com`).
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

1. Back in **Render → smartclinic-api → Environment**, set **`CORS_ORIGIN`** to
   your exact Vercel URL from Step 3 (e.g. `https://smart-clinic.vercel.app`).
2. Save — Render redeploys automatically.
3. (Optional, keeps the demo fast) In **GitHub → your repo → Settings → Secrets
   and variables → Actions → Variables**, add a variable **`BACKEND_URL`** set to
   your Render URL. The included keep-alive workflow then pings `/health` every
   14 minutes so the free backend never cold-starts for visitors.

---

## Step 6 — Optional: Redis for intake chat sessions (Upstash, free)

The intake chatbot's conversation state is held in a session store that falls
back to in-process memory if no Redis is configured — fine for a demo on a
single Render instance, but it's lost on every restart/redeploy. To make it
durable:

1. Sign up at **https://upstash.com** (free tier) → create a Redis database.
2. Copy its connection string (starts with `rediss://`).
3. In **Render → smartclinic-api → Environment**, set **`REDIS_URL`** to that value.

---

## Done ✅

Open your Vercel URL and log in with a demo account (see the main
[README](README.md#demo-accounts)). Every push to `main` now auto-redeploys both
the backend (Render) and frontend (Vercel).

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
  Render doesn't exactly match the Vercel URL (check `https://`, no trailing slash).
- **`/health` shows `db: down`** → `DATABASE_URL` is wrong or missing `?sslmode=require`.
- **Login says "invalid credentials"** → the database wasn't seeded (Step 4).
- **First request after idle is slow (~50s)** → Render free tier cold start;
  set up the keep-alive variable in Step 5.3 to avoid it.
