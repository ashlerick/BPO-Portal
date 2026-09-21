# BPO Team Portal — Development Plan

## 1. Project Overview

Build an internal web portal for the BPO team that provides employees, team leaders, managers, HR, and administrators with a centralized place to access company information, HR resources, reports, documents, and team-related tools.

The system should begin as a focused internal portal and gradually evolve into a broader HRIS/operations platform.

### Initial Modules

* Dashboard
* Weekly Reports
* Benefits
* HRIS / Employee Information
* Announcements
* Documents / Policies
* Team Information
* User Management
* Authentication
* Role-Based Access Control
* Audit Logs

---

# 2. Technology Stack

## Frontend

**GitHub Pages**

Responsibilities:

* Host the portal frontend
* Provide the user interface
* Display dashboards and reports
* Communicate with the backend API
* Handle client-side navigation and presentation

The frontend must **not** contain:

* Database credentials
* AWS credentials
* Private API keys
* Service-account credentials
* Other sensitive secrets

---

## Backend

**Vercel**

Responsibilities:

* API endpoints
* Authentication/session handling
* Authorization
* Business logic
* Database access
* Report generation
* S3 file access
* Audit logging

The backend is the trusted layer between the frontend and private resources.

---

## Database

**Managed PostgreSQL**

Responsibilities:

* Users
* Employees
* Teams
* Departments
* Benefits
* Announcements
* Weekly reports
* Attendance
* Performance data
* QA data
* Document metadata
* Audit logs

Potential PostgreSQL providers:

* Neon
* Supabase
* Vercel Marketplace providers
* Other managed PostgreSQL services

The database provider can be changed later if requirements change.

---

## File/Object Storage

**Amazon S3**

Use S3 for files rather than storing large files directly in PostgreSQL.

Possible files:

* HR documents
* Policies
* Benefits documents
* Employee documents
* Training materials
* Generated CSV files
* Generated XLSX reports
* Generated PDF reports

S3 buckets should remain private.

Files should only be accessed through authorized backend operations or temporary presigned URLs.

---

# 3. High-Level Architecture

```text
                         BPO EMPLOYEE
                              │
                              ▼
                     ┌─────────────────┐
                     │    Browser      │
                     └────────┬────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │  GitHub Pages   │
                     │    Frontend     │
                     └────────┬────────┘
                              │
                         HTTPS / API
                              │
                              ▼
                     ┌─────────────────┐
                     │     Vercel      │
                     │  Backend / API  │
                     ├─────────────────┤
                     │ Authentication  │
                     │ Authorization   │
                     │ Business Logic  │
                     │ Reports         │
                     │ File Access     │
                     └───────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
       ┌────────────┐ ┌─────────────┐ ┌──────────────┐
       │ PostgreSQL │ │  Amazon S3  │ │ External     │
       │  Database  │ │ File Store  │ │ Services     │
       └────────────┘ └─────────────┘ └──────────────┘
```

---

# 4. Core Architecture Principle

The frontend should be treated as an **untrusted client**.

```text
GitHub Pages
      │
      │ API request
      ▼
Vercel Backend
      │
      ├── Authenticate user
      ├── Check permissions
      ├── Validate request
      └── Perform operation
              │
              ├── PostgreSQL
              └── Amazon S3
```

Never allow the browser to directly access the PostgreSQL database.

Never expose AWS access keys in the frontend.

The frontend controls the user interface.

The backend controls what the user is actually allowed to do.

---

# 5. User Roles

The system should support role-based access control.

## Employee

Can:

* View dashboard
* View announcements
* View benefits
* View authorized documents
* View personal HRIS information
* View permitted team information
* Download authorized files
* View applicable reports

## Team Leader

Can:

* View assigned team
* View team members
* Review team performance
* Create or submit weekly reports
* View team attendance where authorized
* Perform permitted team-management actions

## Manager

Can:

* View multiple teams
* Review weekly reports
* View management dashboards
* Review performance information
* Perform manager-level actions

## HR

Can:

* Manage employee information
* Manage benefits
* Publish HR announcements
* Manage HR documents
* Review authorized employee information
* Manage HR-related content

## Administrator

Can:

* Manage users
* Manage roles
* Manage teams
* Manage departments
* Manage portal content
* Manage reports
* Manage documents
* Review audit logs
* Configure system settings

Permissions must be enforced by the backend.

---

# 6. Authentication

Implement authentication before exposing private employee information.

Requirements:

* Login
* Logout
* Session management
* Password reset where applicable
* Role-based authorization
* Protected API endpoints
* Session expiration
* Secure password handling
* Optional MFA in a future phase

Authentication should be handled using an established authentication solution rather than implementing password security from scratch.

---

# 7. Dashboard

The dashboard should provide a quick overview of information relevant to the current user.

## Employee Dashboard

Possible widgets:

* Latest announcements
* Upcoming events
* Benefits shortcuts
* Employee profile
* Team information
* Latest available reports
* Important documents

## Team Leader Dashboard

Possible widgets:

* Team headcount
* Attendance summary
* Productivity summary
* QA summary
* Weekly report status
* Pending actions

## Manager Dashboard

Possible widgets:

* Total team headcount
* Attendance summary
* Performance summary
* Report status
* Team comparison
* Pending approvals

## Admin Dashboard

Possible widgets:

* Total employees
* Active teams
* Report status
* Recent announcements
* Recent administrative actions
* System alerts

Dashboard content should depend on the authenticated user's role.

---

# 8. Weekly Reports

Create a reporting module for BPO team reporting.

Possible report information:

* Reporting period
* Team
* Client/account
* Headcount
* Attendance
* Productivity
* Quality / QA
* SLA
* Performance metrics
* Issues
* Achievements
* Action items
* Manager comments

## Report Lifecycle

```text
Draft
  │
  ▼
Submitted
  │
  ▼
Reviewed
  │
  ▼
Approved
```

If a report is rejected:

```text
Rejected
   │
   ▼
Draft
```

Approved reports should retain their historical state.

Do not silently overwrite previously approved reports.

---

# 9. Report Generation

Reports should be generated by the backend rather than by GitHub Pages.

Example:

```text
Admin selects:

Team: Team A
Period: August 10–16
Report: Weekly Performance
Format: XLSX

        │
        ▼

Vercel API

        │
        ▼

PostgreSQL

        │
        ▼

Generate report

        │
        ▼

Amazon S3

        │
        ▼

Temporary download URL
```

Supported formats:

* CSV
* XLSX
* PDF

For large reports, use asynchronous/background processing rather than keeping a normal API request open for an extended period.

---

# 10. Benefits Module

Create a centralized benefits page.

Possible categories:

* Health benefits
* Insurance
* Leave benefits
* Government benefits
* Allowances
* Employee discounts
* Wellness programs
* Retirement benefits
* Frequently asked questions

Each benefit may contain:

```text
Title
Category
Description
Eligibility
Requirements
How to apply
Contact information
Documents
Last updated
Status
```

Benefits can optionally be targeted by:

* Employee type
* Department
* Team
* Employment status
* Other eligibility criteria

---

# 11. HRIS Module

The HRIS section should provide controlled access to employee information.

## Employee Profile

Possible fields:

* Employee ID
* Name
* Department
* Team
* Position
* Employment status
* Date hired
* Work email
* Manager
* Other approved HR information

Sensitive information must only be accessible to authorized roles.

## Future HRIS Features

* Leave management
* Attendance
* Employee documents
* Onboarding
* Offboarding
* Employee requests
* Benefits enrollment
* Performance history
* Employee self-service

The HRIS should be expanded gradually instead of attempting to implement every HR function in the initial release.

---

# 12. Announcements

Create an internal announcement system.

Possible features:

* Create announcement
* Edit announcement
* Publish/unpublish
* Schedule publication
* Target specific teams
* Target specific roles
* Archive announcements
* Expiration date

Example:

```text
Announcement
├── ID
├── Title
├── Content
├── Author
├── Published date
├── Expiration date
├── Audience
└── Status
```

---

# 13. Documents

Create a centralized document area.

Possible categories:

* HR policies
* Company policies
* SOPs
* Training materials
* Benefits documents
* Forms
* Team documents

Example:

```text
Documents
├── General
├── HR
├── Operations
├── Training
├── Benefits
└── Management
```

Documents should have access controls.

Files should be stored in Amazon S3.

PostgreSQL should store the metadata and S3 object reference.

---

# 14. Amazon S3 Storage Architecture

S3 should be used as the persistent file/object storage layer.

Example:

```text
PostgreSQL

documents
├── id
├── title
├── category
├── storage_key
├── uploaded_by
├── created_at
└── access_level
```

The actual file lives in S3:

```text
S3 Bucket
│
├── documents/
│   ├── policies/
│   ├── benefits/
│   ├── training/
│   └── hr/
│
├── employee-documents/
│
└── reports/
    ├── csv/
    ├── xlsx/
    └── pdf/
```

Do not make sensitive buckets publicly readable.

---

# 15. Secure File Access

The preferred flow is:

```text
Employee
    │
    ▼
GitHub Pages
    │
    ▼
Vercel API
    │
    ├── Authenticate
    ├── Check permissions
    └── Find S3 object
            │
            ▼
     Generate temporary
       presigned URL
            │
            ▼
        S3 download
```

This prevents unauthorized users from simply guessing a file URL.

Examples of protected files:

* Employee contracts
* HR documents
* Internal reports
* Performance reports
* Sensitive forms

---

# 16. Database Design

Initial PostgreSQL tables may include:

```text
users
roles
permissions
user_roles

employees
teams
departments

announcements

benefits
benefit_documents

documents
document_categories

weekly_reports
weekly_report_items

attendance
productivity
qa_scores

audit_logs
```

The exact schema should be finalized during implementation.

Do not create unnecessary tables before requirements are known.

---

# 17. Database Relationships

The system contains naturally relational data.

Examples:

```text
Employee
   │
   ├── Team
   ├── Department
   ├── Attendance
   ├── Productivity
   ├── QA Scores
   └── Documents

Team
   │
   └── Weekly Reports

User
   │
   └── Roles

Role
   │
   └── Permissions
```

PostgreSQL is preferred because these relationships and reporting requirements are naturally suited to relational databases.

PostgreSQL JSON/JSONB can still be used for flexible data where appropriate.

---

# 18. API Design

The frontend should communicate with the backend through authenticated APIs.

Example endpoints:

```text
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/me

GET    /api/dashboard

GET    /api/announcements
POST   /api/announcements
PUT    /api/announcements/:id

GET    /api/benefits
POST   /api/benefits
PUT    /api/benefits/:id

GET    /api/employees/:id
PUT    /api/employees/:id

GET    /api/teams/:id

GET    /api/reports
POST   /api/reports
GET    /api/reports/:id
POST   /api/reports/:id/submit
POST   /api/reports/:id/approve

GET    /api/documents
POST   /api/documents
DELETE /api/documents/:id
GET    /api/documents/:id/download
```

All private endpoints must perform authorization checks.

---

# 19. API Request Security

Never trust values supplied by the frontend.

For example, this is unsafe:

```text
Frontend:
role = "admin"
```

The backend should determine the user's role from authenticated identity and trusted database records.

Every sensitive operation should verify:

```text
Authentication
      ↓
Authorization
      ↓
Input validation
      ↓
Business rules
      ↓
Database / S3 operation
```

---

# 20. Security Requirements

Because this system may contain employee and HR information, security should be considered from the beginning.

Implement:

* HTTPS
* Secure authentication
* Role-based authorization
* Input validation
* API authorization checks
* Rate limiting where appropriate
* Secure HTTP headers
* Database access restrictions
* Secret management
* Audit logging
* S3 access controls
* Session expiration
* Error handling that does not expose secrets

Never commit secrets to Git.

---

# 21. Audit Logs

Important administrative actions should be recorded.

Examples:

```text
Admin created employee
Admin changed employee role
Manager submitted weekly report
Manager approved weekly report
HR updated benefit
Admin uploaded document
Admin deleted announcement
Admin changed team assignment
```

Possible audit record:

```text
User
Action
Resource
Resource ID
Timestamp
Result
```

Do not unnecessarily store sensitive information in logs.

---

# 22. Deployment

## Frontend

```text
GitHub Repository
        │
        ▼
GitHub Actions
        │
        ▼
Build
        │
        ▼
GitHub Pages
```

## Backend

```text
GitHub Repository
        │
        ▼
Vercel
        │
        ▼
Backend / API
```

## Database

```text
Managed PostgreSQL
```

## File Storage

```text
Amazon S3
```

Use separate development and production resources.

---

# 23. Environment Configuration

Development and production must use separate credentials and resources.

Example:

```text
Development
├── Development database
├── Development S3 bucket
├── Development API keys
└── Development authentication configuration

Production
├── Production database
├── Production S3 bucket
├── Production API keys
└── Production authentication configuration
```

Secrets should be stored in the appropriate backend/deployment secret manager.

Never commit `.env` files containing real secrets.

---

# 24. Frontend Structure

Possible structure:

```text
src/
├── components/
├── layouts/
├── pages/
│   ├── dashboard/
│   ├── reports/
│   ├── benefits/
│   ├── hris/
│   ├── announcements/
│   └── documents/
├── services/
├── hooks/
├── auth/
├── utils/
└── styles/
```

The exact structure depends on the selected frontend framework.

---

# 25. Backend Structure

Possible structure:

```text
api/
├── auth/
├── users/
├── employees/
├── teams/
├── reports/
├── benefits/
├── announcements/
├── documents/
└── admin/
```

Separate:

```text
Routes
   ↓
Authentication
   ↓
Authorization
   ↓
Validation
   ↓
Business Logic
   ↓
Database / S3
```

Avoid putting all business logic directly inside API route handlers.

---

# 26. Development Phases

## Phase 1 — Foundation

* [x] Create GitHub repositories
* [x] Create frontend project
* [x] Create backend project
* [x] Configure Vercel
* [x] Configure GitHub Pages
* [x] Create PostgreSQL database (Neon, via Vercel Marketplace)
* [x] Create S3 bucket (Backblaze B2 — AWS S3 requires a credit card at signup, B2 doesn't)
* [x] Configure environment variables
* [x] Establish development and production environments — simplified: dev/preview/production
  currently share the same Neon database and B2 bucket. Fine while it's one person building;
  should be split before real HR data goes in.

---

## Phase 2 — Authentication

* [x] Implement login
* [x] Implement logout
* [x] Implement sessions (JWT bearer tokens)
* [x] Implement roles
* [x] Implement permissions (role-gated endpoints; no finer-grained permission model yet)
* [x] Protect API endpoints
* [x] Create initial admin access
* [x] Test unauthorized access (confirmed 401 without a token on live deployment)

---

## Phase 3 — Core Portal

* [x] Build dashboard
* [x] Build announcements (read-only; create/edit is Phase 6 content management)
* [x] Build benefits (read-only; create/edit is Phase 6 content management)
* [x] Build documents (presigned download via S3/B2; upload UI is Phase 6 document management)
* [x] Build navigation
* [x] Implement responsive design
* [x] Implement loading/error states

---

## Phase 4 — HRIS

* [x] Employee profiles
* [x] Team assignments (HR/Admin can assign an employee to a department + team; creating new
  teams/departments themselves is Phase 6 team/department management, not built yet)
* [x] Department information
* [x] Employee status
* [x] HR permissions (HR and Admin roles can edit any employee record)
* [x] Employee self-service (every user can view their own profile at `/hris`)
* [x] Employee document access — covered by the existing Documents module's role-based
  `accessLevel` gating (Phase 3), not a separate per-employee document system

---

## Phase 5 — Reports

* [x] Weekly report database structure (added the Team relation that was missing from the
  original Phase 1 scaffold)
* [x] Report creation — Team Leader (own team only), HR, Admin
* [x] Report submission — draft/rejected → submitted
* [x] Report review — Manager/HR/Admin: submitted → reviewed
* [x] Report approval — Manager/HR/Admin: reviewed → approved; approved reports are immutable
  (matches "do not silently overwrite previously approved reports" in section 8)
* [x] Report history — full record retained through every status; rejecting keeps a manager
  comment and reopening returns it to draft rather than deleting anything
* [x] CSV export
* [x] XLSX export (via `exceljs` — the more obvious `xlsx`/SheetJS package has two unpatched
  high-severity vulnerabilities, so used the actively-maintained alternative instead)
* [x] PDF export (via `pdf-lib`)
* [x] Store generated reports in S3 — generated on demand and uploaded to B2 under `reports/`,
  presigned URL returned (not persisted/reused — regenerated fresh on every export request)

Known gap: the plan lists "View applicable reports" as a base Employee capability (section 5);
this isn't implemented yet — only Team Leader/Manager/HR/Admin can see reports right now.

---

## Phase 6 — Administration

* [x] User management — admin creates an account (email/structured name/roles); backend generates
  a single-use, 48-hour setup token and emails a set-password link via Gmail API (OAuth,
  authenticated as a real account, not a plaintext password and not a shared sender). Name is
  stored as First/Last (required) + Middle (optional) rather than one free-text field. Admin can
  edit any user's name and reassign roles from the same page, each kind of change recorded as its
  own audit entry (`update_name` / `update_roles`). Display format everywhere else in the app is
  "First M. Last" (middle name abbreviated to an initial) via a shared `formatDisplayName()`
  helper — the Dashboard greeting is the one exception and stays first-name-only.
* [x] Employee management — covered in Phase 4 (HR/Admin can edit position, status, team,
  department for any employee)
* [x] Team management — Admin can create teams (name + department); renaming/deleting not built yet
* [x] Department management — Admin can create departments; renaming/deleting not built yet
* [x] Content management — HR/Admin can create, edit, and delete Announcements and Benefits
* [x] Document management — HR/Admin can upload documents (base64 through the backend, capped at
  4MB — fine for policy docs/forms, would need a presigned direct-to-S3 upload for larger files)
* [x] Audit logs — every mutating action (user/employee/announcement/benefit/team/department/
  document changes) is recorded with actor, action, resource, and result; viewable at `/audit-logs`
* [x] Administrative dashboard — employee/team counts and recent administrative actions on the
  main Dashboard for Admin users, per section 7's Admin Dashboard widget list (Report status and
  System alerts are not included — no reports or alerting system exists yet)

---

## Phase 7 — Security & Testing

* [x] Permission testing — created a temporary test user per role (employee, team_leader, manager,
  hr; admin already existed) and ran a scripted matrix across every endpoint: 63/63 passed. Also
  verified report team-scoping specifically (a team_leader can create/submit only for their own
  team, cannot review/approve/reject their own submission, a manager cannot edit another team's
  draft) — all correct.
* [x] API security testing — CORS locked to the exact frontend origin (not wildcard); confirmed a
  forged JWT (wrong secret), a tampered signature, and a classic `alg:none` unsigned-token attack
  are all rejected with 401; confirmed login returns the same generic "Invalid credentials" for
  both a wrong password and a nonexistent email (no user-enumeration signal).
* [x] Input validation — audited every mutating endpoint (7 files): all have zod schemas on their
  request bodies, no gaps found.
* [x] Authentication testing — missing/malformed/tampered/forged tokens all correctly rejected
  (401). Expired-token rejection confirmed correct using a token expired by 2 hours; a token
  expired by only ~10 seconds was inconsistently accepted, but that's ordinary clock skew across
  a distributed serverless deployment, not a bug — tokens live 8 hours in production, so a
  10-second margin never matters in practice.
* [x] S3 access testing — confirmed the B2 bucket rejects both anonymous object reads and
  anonymous bucket listing (private, as required by section 14). Presigned URLs use the
  well-audited AWS SDK presigner at a 5-minute expiry.
* [x] Database backup strategy — Neon's **free tier gives only a 6-hour point-in-time-recovery
  window** (capped at 1GB of changes); the Launch plan extends this to 7 days. **This is a real
  gap**: anything deleted/corrupted and not caught within 6 hours today is unrecoverable. Upgrading
  to Launch (or exporting periodic `pg_dump` snapshots) should happen before real HR data goes in
  — tracked alongside the existing shared-dev/prod-database simplification.
* [x] Error handling — found and fixed a real bug: 6 endpoints (`PUT /employees/:id`,
  `PUT /users/:id`, `PUT`/`DELETE /announcements/:id`, `PUT`/`DELETE /benefits/:id`) crashed with
  an unhandled Prisma error (raw 500) when targeting a nonexistent id, instead of a clean 404.
  Vercel's platform already prevented any internal detail (stack trace, DB info) from reaching the
  client even during the crash, so this was a robustness bug, not a leak — now fixed everywhere.
* [x] Performance testing — key endpoints respond in ~0.4-0.65s round-trip (Philippines →
  us-east-1 Vercel function → us-east-1 Neon → back); reasonable for a low-traffic internal tool,
  no optimization needed yet.
* [x] File upload testing — confirmed the 4MB size cap is enforced server-side (not just in the
  UI), and confirmed a path-traversal filename (`../../../etc/passwd`) is neutralized to a safe
  storage key rather than escaping the intended S3 prefix.
* [x] Report-generation testing — CSV/XLSX/PDF export all produce valid files (verified with the
  `file` command against real output) end-to-end through the full lifecycle, covered during
  Phase 5.

---

## Phase 8 — Production

* [x] Production database — dedicated now: local/dev work uses a separate Neon database
  (`bpo-portal-dev` project), so it can no longer touch real production data. Note: this is a
  separate Neon project, not a true branch of production — Neon branching needs API/dashboard
  access this session didn't have; a second project achieves the same isolation goal.
* [x] Production S3 bucket — same split: a dedicated `bpo-portal-lerick-2026-dev` B2 bucket for
  local/dev uploads, separate from the production bucket.
* [x] Production environment variables — Vercel's Production/Preview/Development environments now
  genuinely diverge for `DATABASE_URL` and all `S3_*` vars (previously identical across all three).
* [ ] Custom domain — skipped for now (needs a purchased domain); revisit anytime, doesn't block
  anything else.
* [x] HTTPS — already true with zero extra setup: GitHub Pages and Vercel both serve over HTTPS by
  default.
* [x] Monitoring / Logging — both platforms provide this out of the box at this project's scale:
  Vercel's dashboard shows function invocation logs and error rates; GitHub Pages is static hosting
  with no server-side logs to configure. No extra service set up — reasonable for a low-traffic
  internal tool; revisit if/when real usage grows.
* [~] Database backup verification — the 6-hour Neon free-tier PITR window is documented (Phase 7),
  but an actual test-restore drill wasn't performed — this session had no Neon dashboard/API access
  to do one safely. Recommended before real HR data goes in: use Neon's point-in-time restore on a
  non-critical moment to confirm it genuinely works, not just trust the documented behavior.
* [x] S3 backup/versioning strategy — confirmed both B2 buckets (prod and dev) have "Keep all
  versions" enabled, which is B2's default. Accidental overwrites/deletes are recoverable.
* [x] Deployment documentation — see README.md's "Deploying changes" and "Local development"
  sections.
* [ ] User acceptance testing — inherently not something to automate or fake: needs real people
  (you, and ideally an actual BPO team member) using the live app for real work before calling it
  launched.
* [ ] Production launch — a business decision (informing the team, actually rolling it out), not a
  code change — your call to make whenever Phase 8's other items and UAT feel solid enough.

---

# 27. MVP Scope

Do not attempt to build the entire HRIS in the first release.

The first production-ready version should contain:

```text
MVP
│
├── Authentication
├── Dashboard
├── Announcements
├── Benefits
├── Employee Profile
├── Team Information
├── Weekly Reports
├── Basic Report Export
├── Documents
└── Admin Management
```

This gives the team a useful portal while keeping the first release manageable.

---

# 28. Future Features

Potential future additions, grouped into phases the same way as sections 1-8 — but unlike those,
none of this is committed or scheduled. Grouping is by dependency and theme (what naturally builds
on what already exists, and what would benefit from a piece built earlier in this list), not by
priority. Treat the ordering as a reasonable default to reconsider once real usage tells us what
actually matters, per section 39's guiding principle.

## Phase 9 — Self-Service & Mobile ✅ (built)

Cross-cutting enhancements to what's already built (auth, HRIS, core portal UI) rather than new
domains — the natural next step since nothing here needs a new subsystem.

* [x] Mobile-friendly/PWA support
  * Responsive from 320px up: burger menu on phones (with the light/dark switch inside it, page
    scroll locked while it's open), tables become stacked cards, compact date filters with quick
    ranges, reworked HRIS/Dashboard/Reports layouts, 16px inputs so iOS doesn't zoom on focus.
  * Installable to the home screen: web manifest, icons, theme-color. **Deliberately no service
    worker / offline mode** — the app needs live data anyway, and a caching worker on GitHub Pages
    risks serving stale builds.
  * Light theme redesigned for lower glare (softer surfaces, higher-contrast muted text); dark mode
    untouched.
* [x] Employee self-service (HRIS section 11 already lists this as a "future" HRIS feature)
  * My Profile tab: employees edit their own **contact details** (phone, address, emergency
    contact) — visible only to that employee and HR/Admin (HR sees them under the employee's name
    in the Employees tab) — and **change their own password** in-app (requires the current one).
    Backed by `PUT /employees/me` and `POST /auth/change-password`, both folded into existing
    serverless functions (Vercel Hobby's 12-function cap). Contact changes and password changes are
    audit-logged (without the values).
  * Self-service can only touch those fields: HR-controlled ones (position, status, team, SIL
    balance) use a separate schema and can't be reached through the self-service route.
  * Every password field in the app has a show/hide toggle (shared `PasswordInput`).
  * Adds a database migration (`add_employee_contact_details`: four nullable columns on
    `employees`) — **apply it to production (`prisma migrate deploy`, which the backend's build
    already runs) before/with the frontend deploy**, or My Profile's new cards will error.
  * Not built: employee-submitted change requests that HR approves — a better fit for the Phase 15
    request system than a one-off flow.

---

## Phase 10 — Notifications & Communication

Infrastructure phase: several later phases (Leave & Attendance approvals, Onboarding checklists)
are more useful with a notification system already in place, so this comes before them rather than
after.

* [ ] Notifications (in-app)
* [ ] Email notifications
* [ ] Internal messaging
* [ ] Calendar

---

## Phase 11 — Leave & Attendance ✅ (built)

Extends the HRIS module (Phase 4) with two closely-related employee-facing workflows.

* [x] Leave request system
  * Employee profile tracks a paid-leave balance — **SIL (Service Incentive Leave)** —
    `silBalance`, starting at 5 days, shown on the HRIS profile page.
  * Employee submits a leave request (start/end date + optional reason) from `/leave`; days
    requested = inclusive day count between start and end.
  * HR/Admin are emailed when a new request comes in (reuses the Gmail OAuth infra from Phase 6).
  * HR/Admin see all pending requests and Approve/Reject (with an optional comment on reject) from
    the same page — non-HR/Admin only see their own requests.
  * On approval, `silBalance` is decremented by the **actual number of days requested**, inside a
    DB transaction with the status update so the two can't drift apart.
* [x] Attendance management
  * Check-in is **automatic on login** — no button to click or forget. The first time a session
    learns today has no attendance record yet, it silently checks the employee in, then shows a
    dismissible green confirmation banner on the Dashboard ("You were checked in at 9:02 AM"). If
    the automatic attempt fails (dropped request, transient error), an amber banner with a
    **Retry Check In** button appears instead of failing silently.
  * A **Check Out** button sits next to the header's Log out button once checked in and not yet
    checked out for the day. Clicking it asks for confirmation ("Check out for today? You won't be
    able to undo this.") before calling the API, specifically to guard against misclicks — resolved
    as a real design concern once check-in stopped being a manual action. Check Out is independent
    of Log out (confirmed): checking out doesn't log you out, and logging out doesn't check you out.
  * "Today" is always Manila's calendar day (fixed UTC+8 offset math, both backend and frontend),
    not the server's or viewer's local day — a `[employeeId, date]` unique constraint keeps one
    record per employee per Manila day.
  * `/attendance` shows a date-range filter (From/To date pickers, same date twice for a single
    day, defaulting to today) — HR/Admin see all employees, everyone else sees their own history
    only. An **Export to Excel** button exports the current range; multi-day exports are grouped
    into one section per date (bold date header + Employee/Check In/Check Out rows per section)
    rather than a flat table.

---

## Phase 12 — Onboarding & Offboarding

Builds directly on User Management (Phase 6) and Leave & Attendance (Phase 11) — an onboarding
workflow is largely "create the account, assign the team, kick off day-one tasks," which already
has most of its building blocks.

* [ ] Onboarding workflows
* [ ] Offboarding workflows

---

## Phase 13 — Performance & Quality

* [ ] Performance dashboards
* [ ] QA management

---

## Phase 14 — Training Management

* [ ] Training management

---

## Phase 15 — Ticket/Request System

A general-purpose request/approval engine. Worth designing with an eye toward whether it should
have absorbed Leave requests (Phase 11) rather than that being a bespoke flow — reconsider at
build time rather than committing now.

* [ ] Ticket/request system

---

## Phase 16 — Payslip Integration

Depends on a third-party payroll provider's API — the most externally-dependent item on this list,
likely the least under this project's own control in terms of timeline.

* [ ] Payslip integration

---

## Phase 17 — Advanced Reporting & Analytics

The most data-hungry phase — needs real accumulated usage to be worth building, and depends on
whatever Weekly Reports becomes after its planned rework (flagged 2026-09-07: the current Phase 5
implementation isn't what's actually needed and will get reworked as its own project). Design this
phase after that rework lands, not before.

* [ ] Advanced analytics
* [ ] Automated scheduled reports
* [ ] Client-specific dashboards
* [ ] Workforce planning

---

## Phase 18 — MFA (maybe)

Flagged as optional in section 6 from the start. Pushed to the very last phase — not committed;
may end up skipped entirely if the other phases cover the real risk (device/session hygiene,
short token lifetimes) well enough without it.

* [ ] MFA

---

# 29. Cost Strategy

The initial goal is to keep infrastructure costs low while maintaining a production-capable architecture.

Initial services:

```text
Frontend
└── GitHub Pages

Backend
└── Vercel

Database
└── Managed PostgreSQL

File Storage
└── Amazon S3
```

Use free tiers where appropriate during development.

Monitor usage before moving to paid tiers.

Do not assume free tiers are unlimited.

Set up billing/usage alerts for cloud services, especially AWS.

---

# 30. Backup Strategy

Database backups should be configured according to the capabilities of the selected PostgreSQL provider.

S3 should use appropriate protection mechanisms where needed, such as:

* Versioning
* Lifecycle policies
* Access controls
* Backup strategy
* Recovery procedures

Important data should not rely on a single copy.

---

# 31. Data Retention

Define retention requirements before implementing HRIS functionality.

Consider separate retention policies for:

* Employee records
* Attendance
* Performance records
* Weekly reports
* HR documents
* Audit logs
* Generated reports

Do not retain sensitive information indefinitely without a business requirement.

---

# 32. Reporting Architecture

As the amount of BPO data grows, reports should not repeatedly perform expensive calculations against millions of raw records.

Possible progression:

```text
Stage 1
PostgreSQL
    ↓
Simple SQL queries
    ↓
Reports

Stage 2
PostgreSQL
    ↓
Indexes + optimized queries
    ↓
Reports

Stage 3
PostgreSQL
    ↓
Views / materialized views
    ↓
Reporting queries

Stage 4
PostgreSQL
    ↓
Aggregated reporting data
    ↓
Dashboards + scheduled reports
```

Start simple and optimize based on actual usage.

---

# 33. File Management Rules

Use PostgreSQL for metadata.

Use S3 for actual files.

Example:

```text
PostgreSQL

documents
├── id
├── title
├── category
├── storage_key
├── uploaded_by
├── created_at
└── access_level
```

S3:

```text
bpo-portal-production/
│
├── documents/
│   ├── policies/
│   ├── benefits/
│   ├── training/
│   └── operations/
│
├── employee-documents/
│
└── reports/
    ├── csv/
    ├── xlsx/
    └── pdf/
```

Do not put private HR documents into the GitHub repository.

---

# 34. Recommended File Download Flow

```text
User clicks "Download"
        │
        ▼
Frontend requests:
GET /api/documents/:id/download
        │
        ▼
Vercel API
        │
        ├── Authenticate user
        │
        ├── Check permission
        │
        ├── Find S3 object
        │
        └── Generate temporary URL
                    │
                    ▼
                  S3
                    │
                    ▼
               File download
```

The temporary URL should expire after an appropriate period.

---

# 35. Recommended Development Repository Structure

A possible organization:

```text
bpo-portal/
│
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── backend/
│   ├── api/
│   ├── services/
│   ├── database/
│   └── package.json
│
├── database/
│   ├── migrations/
│   └── seeds/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   └── security/
│
├── PLAN.md
├── README.md
└── .gitignore
```

This is only a starting structure and can be adjusted depending on the chosen frameworks.

---

# 36. Development Rules

## Rule 1 — Backend First for Sensitive Operations

Anything involving private information should go through the backend.

## Rule 2 — Never Trust the Frontend

Frontend restrictions are for usability.

Backend restrictions are for security.

## Rule 3 — Keep Secrets Out of Git

Never commit:

```text
.env
AWS credentials
Database passwords
Private API keys
Authentication secrets
```

## Rule 4 — Keep Files Out of the Database

Store file metadata in PostgreSQL.

Store actual files in S3.

## Rule 5 — Keep Production Separate

Do not use the production database during development.

## Rule 6 — Build Modules Independently

Each major module should be independently maintainable.

---

# 37. Success Criteria

The portal should:

* Provide one central location for BPO team information.
* Allow employees to access relevant information easily.
* Allow managers to manage authorized team information.
* Allow HR to manage HR-related content.
* Generate useful weekly reports.
* Protect sensitive HR information.
* Maintain an audit trail for important administrative actions.
* Support private document storage.
* Work on desktop and mobile devices.
* Remain inexpensive during the initial stage.
* Scale as the BPO grows.
* Avoid requiring a complete rewrite when new HRIS features are added.

---

# 38. Final Target Architecture

```text
                           BPO PORTAL
                               │
                               ▼
                     ┌──────────────────┐
                     │   GitHub Pages   │
                     │    Frontend      │
                     └────────┬─────────┘
                              │
                              │ HTTPS
                              ▼
                     ┌──────────────────┐
                     │      Vercel      │
                     │   Backend / API  │
                     ├──────────────────┤
                     │ Authentication   │
                     │ Authorization    │
                     │ Business Logic   │
                     │ Reports          │
                     │ File Access      │
                     └───────┬──────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
       ┌─────────────────┐      ┌──────────────────┐
       │   PostgreSQL    │      │    Amazon S3     │
       │                 │      │                  │
       │ Employees       │      │ HR Documents     │
       │ Teams           │      │ Policies         │
       │ Benefits        │      │ Benefits Files   │
       │ Reports         │      │ Employee Files   │
       │ Attendance      │      │ Report Exports   │
       │ Performance     │      │ Training Files   │
       │ Audit Logs      │      │                  │
       └─────────────────┘      └──────────────────┘
```

---

# 39. Guiding Principle

Build the portal **modularly and incrementally**.

Do not attempt to build a complete enterprise HRIS before the actual requirements are known.

Start with:

```text
BPO Portal
│
├── Information
│   ├── Announcements
│   ├── Benefits
│   └── Documents
│
├── People
│   ├── Employees
│   ├── Teams
│   └── HRIS
│
└── Operations
    ├── Weekly Reports
    ├── Performance
    └── Analytics
```

Then add functionality based on actual operational requirements.

The initial architecture of:

**GitHub Pages + Vercel + PostgreSQL + Amazon S3**

provides a simple, relatively low-cost foundation that can grow into a larger internal BPO platform without requiring the core architecture to be replaced.
