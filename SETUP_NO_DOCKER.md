# SmartClinic — Setup WITHOUT Docker

Docker ki zaroorat nahi. Docker sirf database (PostgreSQL) chalane ke liye tha —
uski jagah hum PostgreSQL seedha (natively) install kar lenge. Baaki sab (backend +
frontend) waise hi `npm` se chalta hai.

Total 3 cheezein install karni hain: **Node.js**, **PostgreSQL**, aur project ka code.

---

## Step 1 — Node.js 20 install karein
- https://nodejs.org → **LTS** version (20 ya upar) download + install.
- Check: naya terminal khol kar `node --version` → v20+ aana chahiye.

## Step 2 — PostgreSQL 15 install karein (Docker ki jagah)
1. https://www.postgresql.org/download/windows/ → "Download the installer" (EDB) → PostgreSQL 15 ya 16.
2. Installer chalayein. Jo cheezein poochega:
   - **Password**: superuser (`postgres`) ka password set karein — **yaad rakhein** (misaal: `postgres`).
   - **Port**: `5432` (default rehne dein).
   - baaki sab default → Next → Install.
3. Install ho jane ke baad "Stack Builder" khule to **Cancel** kar dein (zaroorat nahi).

## Step 3 — Database banayein (ek dafa ka kaam)
Start menu mein **"SQL Shell (psql)"** search karke kholein. Ye poochега:
```
Server   [localhost]   → Enter
Database [postgres]    → Enter
Port     [5432]        → Enter
Username [postgres]    → Enter
Password               → wahi password jo install ke waqt set kiya, type karein (screen par nazar nahi aayega, normal hai)
```
Ab ye 2 lines paste karein (ek ek karke, Enter dabate hue):
```sql
CREATE USER smartclinic WITH PASSWORD 'smartclinic';
CREATE DATABASE smartclinic OWNER smartclinic;
```
Phir `\q` likh kar Enter — psql band ho jayega.

> Isse database aisi ban jati hai ke project ki default settings bina badle chalti hain.

## Step 4 — Project code
Zip (`SmartClinic-share.zip`) ko kahin extract karein, misaal `D:\SmartClinic`.

## Step 5 — Backend chalayein
Terminal (PowerShell) kholein:
```powershell
cd D:\SmartClinic\backend
copy .env.example .env
npm install
npm run migration:run
npm run seed
npm run start:dev
```
- `migration:run` tables banata hai, `seed` demo data daalta hai (ek hi dafa zaroori).
- `start:dev` ko chalta rehne dein → backend `http://localhost:3000` par (Swagger: `/api`).

## Step 6 — Frontend chalayein (NAYA terminal)
```powershell
cd D:\SmartClinic\frontend
npm install
npm run dev
```
Chalta rehne dein → app `http://localhost:5173` par.

## Step 7 — Browser mein kholein
`http://localhost:5173` → login:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@smartclinic.test | Password1! |
| Receptionist | reception@smartclinic.test | Password1! |
| Doctor | dr.khan@smartclinic.test | Password1! |
| Patient | patient@smartclinic.test | Password1! |

---

## AI features (optional)
`backend\.env` mein `AI_API_KEY=` ke aage key daalein:
- **Groq (free)**: https://console.groq.com se key le kar
  ```
  AI_PROVIDER=openai
  AI_MODEL=llama-3.3-70b-versatile
  AI_BASE_URL=https://api.groq.com/openai/v1
  AI_API_KEY=gsk_...
  ```
Key na ho to bhi app chalta hai (AI features "unavailable" fallback dikhate hain — ye khud ek project requirement hai).

---

## Agar koi masla aaye

- **`npm run migration:run` par "password authentication failed"** → aapne Step 3 wali `smartclinic`
  user/database nahi banayi, ya `.env` mein DB settings match nahi karti. `.env` mein ye hona chahiye:
  ```
  DB_HOST=localhost
  DB_PORT=5432
  DB_USER=smartclinic
  DB_PASSWORD=smartclinic
  DB_NAME=smartclinic
  ```
- **"port 5432 already in use"** → PostgreSQL pehle se chal raha hai, koi masla nahi.
- **`npm install` par error** → Node version check karein (20+ chahiye).
- **Frontend khaali/white page** → backend chal raha hai? Dono terminals khule hone chahiye.

---

## Rozana chalane ke liye (ek dafa setup ke baad)
Sirf do terminal:
```powershell
# Terminal 1
cd D:\SmartClinic\backend ; npm run start:dev
# Terminal 2
cd D:\SmartClinic\frontend ; npm run dev
```
PostgreSQL Windows service ke tor par background mein khud chalta rehta hai — usay dobara start karne ki zaroorat nahi.
