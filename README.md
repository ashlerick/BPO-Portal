# BPO Portal

Internal portal for the JAE Philus OPC / Philus BPO Services team: attendance, leave, HR records, recruitment, onboarding, performance, payroll, inventory and more, in one place.

- **Project plan:** [bpo_plan.md](./bpo_plan.md) (architecture and phases) and [new_plan.md](./new_plan.md) (HR's feature list and what was built).
- **Desktop time-tracking app (planned, not built):** [desktop_app_plan.md](./desktop_app_plan.md).
- **Transferring the project or going live:** [HANDOFF.md](./HANDOFF.md), the runbook for ownership transfer, the Gmail connection, the go-live switch and the monthly reminder.

## Live

- Frontend: https://ashlerick.github.io/BPO-Portal/
- Careers page (public, no login): https://ashlerick.github.io/BPO-Portal/careers
- Backend: https://backend-xi-six-41.vercel.app

## Stack

- **Frontend** (`frontend/`): React 19 + Vite + TypeScript + Tailwind CSS 4, deployed to GitHub Pages.
- **Backend** (`backend/`): TypeScript serverless functions on Vercel, Prisma ORM.
- **Database:** PostgreSQL on Neon (provisioned through Vercel's marketplace).
- **File storage:** Backblaze B2 (S3-compatible API): resumes, job posters, documents, payslip attachments.
- **Email:** Gmail API via OAuth (account setup and password reset links).
- **Auth:** JWT bearer tokens (frontend and backend are on different domains, so no cookies).
- **Libraries worth knowing:** `qrcode` (sticker QR codes), `jsqr` (camera and photo QR scanning), `exceljs` (attendance export), `zod` (request validation).

## Repo layout

```text
frontend/   React SPA (GitHub Pages)
backend/    Vercel serverless API + Prisma schema and migrations
HANDOFF.md  Transfer / go-live runbook
bpo_plan.md, new_plan.md  Plans
```

`frontend/` and `backend/` are independent npm projects (not a workspace), so each deploys to its own host.

### Backend

- `backend/api/*.ts`: the serverless entry points. **Vercel Hobby allows 12 functions and we are at 12**, so new features are *not* new files. They go into a handler under `backend/lib/handlers/` and are routed by one of the dispatchers (`content`, `portal`, `hr`, `restricted`) via `?resource=` and the rewrites in `vercel.json`.
- `backend/lib/handlers/*.ts`: one file per feature (`inventory`, `todos`, `recruitment`, `freedomWall`, `payroll`, `disciplinary`, ...). Each does its own role checks.
- `backend/lib/handlers/util.ts`: shared helpers: `parseBody` (validation with readable messages), role checks, `restrictedRoles()`.
- `backend/lib/email.ts`, `notify.ts`, `audit.ts`, `s3.ts`, `aliases.ts`: email sending, in-app notifications, audit log, storage, Freedom Wall names.
- `backend/prisma/schema.prisma` and `backend/prisma/migrations/`: the database (see "Database migrations").

### Frontend

- `frontend/src/pages/<feature>/`: one folder per page.
- `frontend/src/components/ui/`: shared building blocks (see "UI conventions").
- `frontend/src/layouts/`: the signed-in shell (sidebar, phone header) and `nav.ts` (the menu).
- `frontend/public/404.html` + `index.html`: the GitHub Pages deep-link redirect (see "Hosting quirks").

## Features

**General (everyone):** Dashboard (pending tasks, to-dos, announcements, notifications, reminders, overview), Announcements, Attendance (time in/out, history, late/undertime, shifts, weekly tracker, corrections), Leave Requests, Calendar, Weekly Reports, Performance (KPI scorecard, evaluations, coaching), My Profile, Benefits, HR Requests, Documents, Forms (**Freedom Wall**), Notifications, Settings.

**HR / Admin:** Employee Management, Recruitment (job openings with posters, applicants, interviews, decisions), Onboarding and Offboarding checklists, Payroll (payslip links, salary history), Benefits Administration, Employee Relations / Disciplinary, **Inventory**.

**Admin:** Users, Menu Management, Audit Logs.

**Public (no login):** the careers page: browse open positions, view the poster, apply (name, contact, birthday, gender, resume file or link, who referred you as free text).

### Inventory

- Fields follow the company property label: **Asset ID** (`EQ-0001`, auto-numbered unless typed), **Item description**, **Brand / model**, **Serial number**, **Date of purchase**, optional Category and Notes.
- **QR stickers** print in the label's layout. The QR holds the item's fields as **JSON** (`assetTag, name, brandModel, serialNumber, purchaseDate, category, url`) plus the portal link. Click a QR thumbnail for a large view and a PNG download named after the Asset ID.
- **Scan QR** (a tab, plus a phone-header shortcut for HR/Admin): the camera stops after one scan and the item opens in a pop-up as a table with its live status, holder and condition. Photo upload and pasted text work too.
- **Monthly condition check:** each item is checked once a month (Good / Fair / Poor / Damaged). On the 1st a cron notifies holders and HR (`CRON_SECRET` required).
- **Assign / return** with history, **Admin-only edit and soft delete**, list grouped by person or flat.

### Freedom Wall

Anonymous board for everyone to read and post. **Each post gets a random "Anonymous <Adjective> <Animal>" name and animal emoji, chosen at post time and never derived from the author**, so nobody including HR can tell who wrote what. Posts show as colour sticky notes; people react with 😂 ❤️ 👏 🔥 😮 (one per person per note, stored as an HMAC of user and post, never the user id). HR can hide or delete posts. No author is recorded anywhere. Do not add one.

### To-dos

Assign to one, many or everyone (HR/Admin: anyone, supervisors: direct reports) with description, due date, link and priority. Assignees tick them off with an Undo; reopening is a deliberate button; the assigner is notified; both sides can comment; "Assigned by me" shows progress; the assigner or HR/Admin can soft-delete a task made in error.

## Access model

- **Roles:** `employee`, `team_leader`, `manager`, `hr`, `admin`. The role decides what each page and endpoint allows; the API enforces it, the UI only hides things.
- **Payroll and Employee Relations / Disciplinary** are the highly restricted areas. Until go-live they are open to HR **and** Admin so Admin can test. Set `RESTRICTED_HR_ONLY=1` in the backend's Production environment and redeploy to make them HR-only. It is an environment variable on purpose, so an admin cannot switch it back from the app.
- Every read and change in those areas is audit-logged.

## Environments

Production and local development use **separate** Postgres databases and storage buckets, so local testing cannot touch real data:

| | Production / Preview | Development (local) |
|---|---|---|
| Database | Neon project (original) | Neon project `bpo-portal-dev` |
| File storage | B2 bucket `bpo-portal-lerick-2026` | B2 bucket `bpo-portal-lerick-2026-dev` |

The production `DATABASE_URL` is a Vercel *sensitive* variable: `vercel env pull` returns it masked. Production is migrated by the Vercel **build**, not from a laptop (see below). Running `prisma migrate deploy` locally migrates the *development* database only.

## Local development

Easiest: double-click `start-all.bat` at the repo root. Or run each one:

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev   # http://localhost:4300
```

### Backend

```bash
cd backend
npx vercel link                                  # first time only
npx vercel env pull .env.local --environment=development
cp .env.local .env
# append ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_FIRST_NAME / ADMIN_LAST_NAME for the seed script
npm install
npm run prisma:migrate   # creates tables from prisma/schema.prisma
npm run prisma:seed      # first admin user + sample data
npm run local            # http://localhost:4310 (via `vercel dev`)
npm run typecheck        # tsc --noEmit
```

Fixed ports (`4300`, `4310`) use `strictPort` so a collision fails loudly. The backend's dev script is named `local` because Vercel CLI refuses a `dev` script that itself runs `vercel dev`.

### Environment variables (backend)

See `backend/.env.example`. The important ones: `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (direct connection, used for migrations), `JWT_SECRET`, `CORS_ORIGIN`, `FRONTEND_URL`, `S3_*`, `GMAIL_*`, `CRON_SECRET`, `RESTRICTED_HR_ONLY`, and `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` (Production; avoids a Neon lock timeout during the build's migration).

**Managing env vars:** `npx vercel env add/rm/ls <NAME> <environment>` from `backend/`. ⚠️ Vars added through a Marketplace integration (Neon) are one record spanning all environments: `vercel env rm <NAME> development` on one deletes it from **all** of them. Vars added individually with `vercel env add` (JWT_SECRET, S3_*, GMAIL_*, CRON_SECRET, ...) are safe to remove per environment. Check `vercel env ls` first.

## Deploying changes

Deploys are manual and deliberate, one batch at a time. Nothing deploys itself on commit.

- **Frontend:** `git push` to `main` with changes under `frontend/`: GitHub Actions builds and deploys to Pages (about a minute). Re-run with `gh workflow run deploy-frontend.yml`.
- **Backend:** no git integration. From `backend/`: `npx vercel deploy --prod --yes`. The build runs `prisma migrate deploy` (with one retry) then `prisma generate`, so **a deploy applies any new migration to production**. Order for a release with a migration: deploy the backend first, then push the frontend.
- Check the result with `npx vercel ls` (look for `Ready`) and `gh run list --workflow deploy-frontend.yml`.

## Database migrations

- Change `schema.prisma`, then add a folder under `backend/prisma/migrations/<timestamp>_<name>/migration.sql`. Prefer additive changes (new nullable columns, new tables) so the old backend keeps working while a deploy is in flight.
- `schema.prisma` sets `directUrl = env("DATABASE_URL_UNPOOLED")` so migrations use Neon's direct connection; the pooled one times out on Postgres advisory locks.
- **Soft delete:** items, job openings, to-dos and similar user-created records are deleted by setting `deletedAt`. Every query filters `deletedAt: null`. Do not hard-delete user data.

## UI conventions

These are shared on purpose. Use them instead of building new variants:

- **`Section` / `SectionStack`:** a stack of two or more sections renders as **tabs** automatically (`group="..."` merges several sections into one tab; `tabs={false}` keeps a plain stack). Pages never show a long scroll of cards.
- **`Tabs`:** remembers the last tab per browser. Supports controlled mode.
- **`Modal`:** centred through a portal. **A click outside does not close a form dialog** (typed data is easy to lose); pass `closeOnBackdrop` only for read-only viewers.
- **`Toast` (`useToast()`):** every action that saves, assigns or deletes reports success or the specific error. Success toasts can carry an **Undo**.
- **`FilePicker`:** the visible, button-style file input. Do not use a bare `<input type="file">`.
- **Validation errors** from the API name the field and what is wrong (`describeIssue` in `util.ts`), never "Invalid input".
- **Mobile first:** check every change at phone width. No fixed or floating elements that cover content on a phone, lists become cards, tables scroll inside their own container, forms collapse to one column.
- **Forms** follow the order of the paper document they replace (the inventory form mirrors the property label).

## Hosting quirks (GitHub Pages)

- Pages cannot serve client routes such as `/BPO-Portal/inventory`, so `404.html` redirects to `/?/inventory` and `index.html` restores the URL. The redirect adds a changing `_cb` value so a browser cannot answer it from a stale cached copy of the entry page and show the previous release after a deploy. Keep that behaviour if you touch either file.
- Hashed asset files cache forever by name; only the entry page needs to be fresh.

## Email

Account setup, activation and password reset links are sent through Gmail (OAuth). If the refresh token expires (`invalid_grant`) the API answers with a clear message instead of failing: admins see "the portal's email connection needs to be re-authorised". Re-authorise with `backend/scripts/gmail-oauth-setup.mjs` (steps in HANDOFF.md) and set the OAuth consent screen to **In production** or the token expires again after 7 days.

## Scheduled jobs

A Vercel cron (`vercel.json`) calls `/api/hr/inventory-reminders` on the 1st of each month. It asks item holders to check their items and tells HR what is outstanding. It refuses every request unless `CRON_SECRET` is set.

## Status

The features in `new_plan.md` are built. What is left:

- **Petty Cash Liquidation** is not built (needs a layout from HR). When it is, add its link to the Forms group in `frontend/src/layouts/nav.ts`. The old Forms hub page is gone: `/forms` redirects to the Freedom Wall.
- **Email notifications:** notifications are in-app only.
- **Custom domain:** not set up (needs a purchased domain).
- **User acceptance testing and production launch** are for the team to do; remember the go-live switch (`RESTRICTED_HR_ONLY=1`) and the Google OAuth consent screen.

See `bpo_plan.md` section 26 for the phase-by-phase checklist and the known gaps.
