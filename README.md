# Trainee Loan Assistant — Performance Tracker
### Free, always-on, real-time, multi-device — no installs needed by anyone

This app now uses **two free services** instead of running on anyone's laptop:

- **Neon** — a free, permanent Postgres database (this is where all records live, forever, surviving restarts)
- **Render** — hosts the actual website for free, so anyone can open it from a normal web address

Nobody — not you, not your admins, not your trainees — needs to install Node.js
or anything else. Everyone just opens a link in a browser.

You will do this setup **once**. It takes about 20 minutes.

---

## Part 1 — Create your free database (Neon)

1. Go to **https://neon.tech** and click **Sign up** (you can sign up with Google or GitHub — no credit card required).
2. After signing up, it will ask you to create a project — accept the defaults and click **Create project**.
3. Once created, look for a **Connection string** — it looks like:
   ```
   postgresql://neondb_owner:AbCdEf123@ep-something-12345.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. **Copy that whole string somewhere safe** (a Notes app is fine) — you'll paste it into Render in Part 3.

That's it for Neon — you don't need to do anything else there.

---

## Part 2 — Put the code on GitHub (so Render can find it)

1. Go to **https://github.com** and sign up for a free account if you don't have one.
2. Click the **+** in the top-right → **New repository**.
3. Name it anything, e.g. `trainee-tracker`. Leave it **Public** (simplest) or **Private**, either is fine. Click **Create repository**.
4. On the next page, click **uploading an existing file**.
5. Open the `trainee-tracker-server` folder on your computer (the one from this download) and drag in:
   - `server.js`
   - `package.json`
   - `package-lock.json`
   - the whole `public` folder
   - this `README.md`

   (Do **not** upload a `node_modules` folder if one exists — Render creates that itself.)
6. Scroll down, click **Commit changes**.

---

## Part 3 — Deploy it on Render

1. Go to **https://render.com** and sign up (signing up with your GitHub account makes the next step easier).
2. Click **New +** → **Web Service**.
3. Connect your GitHub account if asked, then select the `trainee-tracker` repository you just created.
4. Fill in:
   - **Name:** anything, e.g. `trainee-tracker`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Scroll to **Environment Variables** and add these two:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | *paste the Neon connection string from Part 1* |
   | `SESSION_SECRET` | *any long random text you make up, e.g.* `kj3H9dpQmz8xV2Lw7tRn` |
6. Click **Create Web Service**.
7. Wait a couple of minutes while it builds. When it's done, you'll see a green "Live" status and a URL like:
   ```
   https://trainee-tracker.onrender.com
   ```

**That URL is your permanent link.** Share it with your admins and trainees — anyone, on any computer or phone, on any network, can open it and log in. No installation, ever, on their end.

---

## Signing in

Every account — including `admin` — starts with the same default password:
**`Welcome@123`**

The first time anyone logs in, they're automatically required to set their
own password before doing anything else.

| User ID | Role | Name |
|---|---|---|
| admin | Admin (full access) | Administrator |
| isha | Trainee | Isha Devkota |
| bidhi | Trainee | Bidhi Paudel |
| anushka | Trainee | Anushka Karki |

The **admin** account can view/edit every trainee's record, download the full
Excel report, and — from the **Manage users** tab — create new users, delete
users, or reset anyone's password back to the default (which forces them
through the "set your own password" step again).

Trainee accounts can only see their own record (read-only) and download
their own report.

---

## A note on the free tier

Render's free web service "sleeps" after 15 minutes without visitors and
takes about 30 seconds to wake up on the next visit — that's just a short
delay, not a data problem. Because your data now lives in Neon's database
(not on Render's server), **nothing is lost** when it sleeps, wakes, or
restarts. That's the whole point of this two-service setup.

If the 30-second wake-up delay ever becomes annoying, Render also offers a
paid tier (~$7/month) that stays awake permanently — but it's optional, not
required for your data to be safe.

---

## If you ever want to update the app

1. Make changes to the files.
2. Upload the changed files to the same GitHub repository (drag and drop again, or use "Add file → Upload files").
3. Render automatically redetects the change and redeploys within a minute or two — no other steps needed.
