# Ownership Transfer Guide

This project runs across five independent services, each under its own account, none linked to
each other by design (see `bpo_plan.md`'s Development Rules). There's no single "transfer
ownership" button — each service needs its own step. This guide walks through all of them.

## Services involved

| Service | Current owner | What it provides |
|---|---|---|
| GitHub | `ashlerick` (personal account) | Source code + GitHub Pages (frontend hosting) |
| Vercel | `ashlerick` (separate account, deliberately not linked to GitHub) | Backend hosting |
| Neon | Provisioned via Vercel Marketplace | Postgres database (production + dev) |
| Backblaze B2 | Separate account | File storage (production + dev buckets) |
| Gmail | `lerickashleycorpuz@gmail.com` | Sends account-setup emails via OAuth |

None of these need to move together — do them one at a time, in whatever order is convenient, and
verify after each before moving to the next.

## Before starting — what the client needs ready

- [ ] A GitHub account, to receive the repository
- [ ] A Vercel account, to receive the backend project (doesn't need to be linked to their GitHub —
  can sign up with email instead, same as this project's current setup)
- [ ] A Backblaze B2 account (or a decision to keep files on the developer's B2 account, less ideal
  long-term)
- [ ] A Gmail or Google Workspace address they want portal emails to send from
- [ ] A decision on custom domain, if any — simpler to add *before* transferring than after

## 1. GitHub repository

Settings → General → Danger Zone → **Transfer ownership**, or via the API:

```bash
gh api -X POST repos/ashlerick/BPO-Portal/transfer -f new_owner=<new-github-username>
```

The new owner gets an invitation they must accept (check their GitHub notifications, or the email
tied to their account). Repo history, commits, GitHub Actions run history, and Pages settings all
carry over automatically — but **the Pages URL changes** to match the new owner
(`https://<new-owner>.github.io/BPO-Portal/`), and the previous owner is automatically added back
as a collaborator with write access (remove them manually once you're sure everything works, if
they should lose access).

After transfer:
```bash
git remote set-url origin https://github.com/<new-owner>/BPO-Portal.git
```

Trigger a fresh Pages deploy to be safe:
```bash
gh workflow run deploy-frontend.yml --repo <new-owner>/BPO-Portal
```

## 2. Vercel (backend hosting)

Two options — pick based on what's easier at transfer time:

**Option A — Transfer the project.** Vercel Project Settings → Transfer Project, to the client's
Vercel account or a Team they control. Untested by this project so far — verify the Neon Marketplace
integration (see step 3) actually comes along with it before relying on this path; if it doesn't,
fall back to Option B for the database specifically.

**Option B — Fresh deploy under the client's account** (more certain, more manual). The client logs
into their own Vercel account, links the (now client-owned) GitHub repo or the local `backend/`
folder (`npx vercel link`), and you copy over the environment variables — see the table in
`backend/.env.example` for the full list. This also means re-provisioning Neon and re-uploading to
a new B2 bucket, since those are tied to the Vercel/Backblaze accounts, not portable — see steps 3
and 4.

Either way, **update `CORS_ORIGIN` and `FRONTEND_URL`** (Production + Preview) to match the new
GitHub Pages URL from step 1 — the backend will otherwise reject the frontend's requests. This
project's own GitHub transfer needed exactly this fix; the pattern:

```bash
cd backend
npx vercel env rm CORS_ORIGIN production --yes
npx vercel env rm CORS_ORIGIN preview --yes
printf '%s' "https://<new-owner>.github.io" | npx vercel env add CORS_ORIGIN production
printf '%s' "https://<new-owner>.github.io" | npx vercel env add CORS_ORIGIN preview
# same pattern for FRONTEND_URL, but with the full path:
# https://<new-owner>.github.io/BPO-Portal
npx vercel deploy --prod
```

⚠️ **Before removing any env var this way**, check `vercel env ls` first. Vars added individually
(`CORS_ORIGIN`, `FRONTEND_URL`, `JWT_SECRET`, `S3_*`, `GMAIL_*`) show as separate rows per
environment and are safe to remove one environment at a time. Vars connected via a Marketplace
integration (all the Neon/Postgres ones) show as **one row spanning all three environments** —
running `vercel env rm <name> development` on one of these deletes it from **all three
environments at once**, including production. This actually happened during this project's own
Phase 8 work and briefly broke the live site until caught and restored. If in doubt, don't remove —
ask first, or test on a var you can easily re-add.

## 3. Neon (Postgres database)

If Option A above didn't cleanly bring the database with it, provision fresh:

```bash
cd backend
npx vercel install neon --non-interactive   # under the client's new Vercel account/project
```

Then migrate the schema and bring over real data:

```bash
npx prisma migrate deploy   # against the new DATABASE_URL

# Move data from the old database to the new one:
pg_dump "<old DATABASE_URL>" --data-only --no-owner > data.sql
psql "<new DATABASE_URL>" < data.sql
```

Do **not** run `prisma/seed.ts` against a database that already has real data — it's meant for a
fresh install only (creates a fixed admin account + placeholder sample content).

## 4. Backblaze B2 (file storage)

B2 doesn't support transferring a bucket between accounts. Two paths:

**Option A — New account, copy the files.** Client creates a B2 account, creates a private bucket
(same settings as this project's: Private, Default Encryption Enabled, Object Lock Disabled),
creates a scoped Application Key for it. Then sync the actual files over — `rclone` (supports B2
natively) is the simplest tool for this, or write a small script using the AWS SDK to list and copy
objects between the two buckets. Update the `Document.storageKey` values in Postgres only if the
key *paths* change (they won't, if you copy with the same key structure) — but the bucket name
(`S3_BUCKET_NAME` env var) does need updating.

**Option B — Keep the developer's B2 account.** Simpler short-term, but means the developer retains
operational control of file storage indefinitely — only reasonable as an interim step, not a real
handoff.

Update env vars after migrating:
```bash
npx vercel env rm S3_BUCKET_NAME production --yes
printf '%s' "<new-bucket-name>" | npx vercel env add S3_BUCKET_NAME production
# repeat for S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_REGION if the new bucket is
# in a different account/region
npx vercel deploy --prod
```

## 5. Gmail sender (account-setup emails)

The portal sends emails as a specific Gmail account, authorized via OAuth (not a password) — see
`backend/scripts/gmail-oauth-setup.mjs`. To send as the client's own address instead of the
developer's:

```bash
cd backend
node scripts/gmail-oauth-setup.mjs <GMAIL_CLIENT_ID> <GMAIL_CLIENT_SECRET>
```

This opens a URL — whoever runs it should log in with the **new sending account** (the client's
Gmail or Workspace address) when the Google consent screen appears. It prints a new
`GMAIL_REFRESH_TOKEN`; update that plus `GMAIL_SENDER` in Vercel env vars (Production + Preview).

The `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET` identify the *Google Cloud project* the OAuth consent
screen belongs to (currently in "Testing" publishing status, which requires the sending account's
email to be added as a test user in that project first — Google Cloud Console → APIs & Services →
OAuth consent screen → Test users). If the client wants full independence from the developer's
Google Cloud project too, they'd need to create their own OAuth client there instead of reusing
this one — a bigger step, only worth it if full separation matters more than convenience.

## 6. In-app admin account

Once the backend points at the (migrated or fresh) database:

1. Log in with the existing seeded admin account (`ADMIN_EMAIL`/`ADMIN_PASSWORD` from the original
   `.env`, or whatever admin account already exists in the migrated data).
2. Go to **Users** → create a new account for the client with the `admin` role, using their real
   email. They'll receive a setup-link email (step 5 must be working first) and set their own
   password.
3. Once confirmed working, either delete the developer's original admin account or demote it to a
   role with no administrative access, via the same Users page.

## 7. Rotate secrets

`JWT_SECRET` was generated by the developer and has never been shared outside this codebase's env
vars, but rotating it at handoff is good practice — it invalidates every existing login session
(everyone has to log in again once, harmless) and ensures a clean break:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Set the result as `JWT_SECRET` (Production + Preview + Development) and redeploy.

## Post-transfer verification checklist

- [ ] Live frontend URL loads and login works
- [ ] Client's new admin account can log in and see real data (employees, announcements, etc.)
- [ ] Creating a test user and receiving the setup email both work
- [ ] Uploading and downloading a document works (confirms the new B2 bucket is wired correctly)
- [ ] `git push` from the client's machine succeeds (confirms they have real write access, not just
  a pending invitation)
- [ ] Old admin/developer accounts are removed or demoted, in both the app and each service

## What the developer should revoke access to, once everything above is verified

- GitHub: remove themselves as a collaborator (Settings → Collaborators)
- Vercel: remove themselves from the project/team, or delete their original project if a fresh
  deploy was used (Option B)
- Neon: if data was migrated to a fresh database, the old one can be deleted once the client
  confirms everything works — keep it around unused for a week or two first, just in case
- Backblaze B2: same — don't delete the old bucket immediately, keep it as a safety net briefly
- Google Cloud / Gmail OAuth: if the client created their own OAuth client (see step 5), the
  developer's original Google Cloud project's grant for this app can be revoked at
  https://myaccount.google.com/permissions

## Deploying the October 2026 changes (database migrations)

This release adds database tables and columns (payslip links, employee legal entity/level, to-dos,
KPI scorecard, Freedom Wall, attendance overtime/working holiday, inventory). **Apply the
migrations before the new backend serves traffic**, otherwise the new pages return errors:

```
cd backend
npx prisma migrate deploy
```

Then deploy the backend, then the frontend. The KPI migration also seeds the starting KPI list
(6 core values, 17 KPIs), which HR can edit in Performance → KPI settings.

Payslips are Google Drive links, not uploaded files. The portal decides who sees the *link*; Google
Drive decides who can *open* it, so each file must be shared with that employee in Drive.

## Optional: upgrade Vercel to Pro and split the endpoints

The backend runs on Vercel Hobby, which caps a deployment at **12 serverless functions**. We are at
exactly 12, so new features have been folded into four "dispatcher" functions (`content`, `portal`,
`hr`, `restricted`) that route by `?resource=` (see `backend/vercel.json` rewrites). That works, but
it is a workaround for the cap, not a design choice.

**Option for the owner:** move the Vercel project to a **Pro** plan (~$20/month per member; check
current pricing). Besides lifting the function cap, Pro is the plan Vercel's terms expect for
commercial use (see "Ongoing costs" below), and it allows longer `maxDuration` than the 10s
configured today. After upgrading, the dispatchers can be split into one function per resource.
This is optional: the portal works as-is on Hobby, and nothing below is required.

### Current functions (12)

| Function | Serves |
|---|---|
| `auth/login`, `auth/set-password` | Login, forgot/reset/change password |
| `users`, `employees`, `directory` | Accounts, employee HRIS, departments & teams |
| `documents`, `reports`, `leave` | Documents, weekly reports, leave + attendance |
| `content` | announcements, benefits |
| `portal` | me, notifications, calendar, settings, menu, audit-logs |
| `hr` | hr-requests, employee-records, enrollments, checklists, recruitment, performance |
| `restricted` | disciplinary, payroll |

### Proposed split (about 25 functions)

| New function | Taken from | Why separate |
|---|---|---|
| `announcements`, `benefits` | `content` | Independent resources |
| `notifications`, `calendar`, `settings`, `menu`, `me`, `audit-logs` | `portal` | `notifications` is polled by the bell, so it benefits from its own cold-start and logs |
| `hr-requests`, `employee-records`, `enrollments` | `hr` | Heaviest daily HR use |
| `checklists` (onboarding/offboarding), `recruitment`, `performance` | `hr` | Different workflows, rarely used together |
| `disciplinary`, `payroll` | `restricted` | **Highest value**: separate logs, errors and access reviews for the most sensitive data |
| `attendance`, `leave-requests` | `leave` | Attendance is the highest-traffic path (time in/out) |
| `inventory` | new | Planned asset-tag/QR module; no need to add to a dispatcher |

Keep `auth/*`, `users`, `employees`, `directory`, `documents` and `reports` as they are.

### How to do it safely

1. Handlers already live in `backend/lib/handlers/*.ts` and are called by the dispatchers, so each
   new function is a thin file in `backend/api/` that imports one handler. No handler logic changes.
2. Update `backend/vercel.json` rewrites to point each public path at its own file, keeping the
   public URLs (`/api/hr/hr-requests`, `/api/restricted/payroll`, ...) unchanged so the frontend
   needs no changes.
3. Do it in stages (restricted first, then `leave`, then `hr`, `portal`, `content`), deploying and
   verifying after each, not all at once.
4. Delete a dispatcher only after its rewrites no longer reference it.
5. Re-check `RESTRICTED_ROLES` in `backend/lib/handlers/util.ts` and the audit-logging on
   disciplinary and payroll after the split; every read there must still be logged.

### Things the split does not fix

- Neon's connection limits: more functions means more concurrent connections, so confirm the
  pooled connection string is in use (and consider a paid Neon tier, see below).
- Cold starts get slightly more frequent per function because traffic is spread thinner.

## Ongoing costs after transfer

Everything here runs on free tiers as of this writing — GitHub Pages, Vercel Hobby, Neon Free,
Backblaze B2 Free, Gmail API. Two things to watch:

- **Vercel Hobby's terms restrict it to personal/non-commercial use** — if this becomes a real
  company's internal tool (which it is), that's arguably commercial use requiring a Pro plan
  (~$20/month). Worth reviewing Vercel's current terms before calling this "launched" for real
  business use.
- **Neon's free tier gives only a 6-hour backup/recovery window** (see `bpo_plan.md` Phase 7) —
  worth upgrading before this holds real HR data at any real organization's scale.

## Monthly inventory check reminder

A Vercel cron (`vercel.json`, 1st of each month, 01:00 UTC) calls `/api/hr/inventory-reminders`.
It notifies each item holder to check their items' condition and sends HR/Admin a summary.
It needs a `CRON_SECRET` environment variable (Production); without it the endpoint refuses
every call and no reminders are sent. Vercel adds the matching `Authorization` header itself.
