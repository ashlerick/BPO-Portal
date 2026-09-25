# BPO Portal — New Plan (from HR's feature document)

Source: HR's scanned feature list (`.samples/plan/`, 10 photos). This plan restructures the
portal around it and is meant to sit alongside `bpo_plan.md`, not replace it yet.

## 0. Build status (2026-09-25)

Everything in sections 3 and 4 is now built and typechecks, but **none of it has been run
against a database or in a browser yet**. Test before relying on it.

| Area | State |
|---|---|
| Shared `Section` (header + dropdown) component, grouped sidebar nav, notification bell | Built |
| Dashboard, Announcements (categories + history), Attendance (corrections, absences, summary), Leave (balance, calendar, types), Documents, Weekly Reports, Benefits, My Profile | Restructured into sections |
| Notifications, Calendar, Settings | Built (new backend + pages) |
| HR Requests (Pending → Processing → Completed → Closed) | Built |
| Employee Management (full record page: ID, supervisor, dates, dependents, history, requirements, documents) | Built |
| Recruitment, Onboarding, Offboarding, Performance, Benefits Administration | Built |
| Employee Relations / Disciplinary, Payroll / Compensation | Built, restricted + every read audit-logged |

Known gaps / decisions still open:
- **Late / undertime records** (Attendance): needs shift schedules, which the portal doesn't have. The
  section explains this instead of showing fake data.
- **Admin access to Disciplinary and Payroll**: currently HR **and** Admin. One line in
  `backend/lib/handlers/util.ts` (`RESTRICTED_ROLES`) makes it HR-only.
- **Vercel Hobby function cap**: the backend is now at exactly 12 functions. Anything new must go into an
  existing dispatcher (`content`, `portal`, `hr`, `restricted`) or the plan must be upgraded.
- Notifications are in-app only (no email), and are created for: leave requests/decisions, report
  approvals/rejections, new announcements, HR request updates, performance review steps.

---

## 1. Core UI idea

Every page is a **stack of collapsible sections**. Each section is a **header with a dropdown
(chevron)**; the **bullets under that header in HR's document become the content inside it**.

```
Page
├─ ▸ Section header            (collapsed by default, click to expand)
│    └─ content for that bullet group
├─ ▸ Section header
└─ ▸ Section header
```

- HR's headings (Dashboard, Attendance, Leave Requests, …) are the **pages / nav items**.
- HR's bullets are the **sections (or fields) inside those pages**. Where a bullet is a simple
  data point (e.g. "Employee ID"), it is a field inside a section instead of its own section.
- One shared `Accordion` / `Section` component (chevron, expand/collapse, remembers open state
  per page, keyboard accessible) used everywhere so all pages behave the same.
- Access is decided per page **and** per section, so a section can be hidden from roles that
  should not see it (Payroll, Disciplinary) even inside a page others can open.

## 2. Access tiers (from HR's document)

| Tier | Who | Meaning |
|---|---|---|
| **General** | Employees, supervisors, HR, management | Whole-company functions; content scoped by role |
| **HR-specific** | HR / Admin only | Sensitive areas |
| **Highly restricted** | HR only (Admin optional — see open questions) | Employee Relations / Disciplinary, Payroll |

## 3. General pages (whole company)

Status key: **Exists** = already built · **Extend** = built, needs more from HR's list · **New**.

| Page | Sections (header dropdowns) | Status |
|---|---|---|
| **Dashboard** | Company announcements · Quick links · Pending tasks · Notifications · Important reminders · Employee/team overview (by role) | Extend — announcements and role overview likely exist; quick links, tasks, reminders new |
| **Announcements** | Company announcements · Policy updates · Holidays · Important notices · Emergency announcements · Announcement history | Extend — add category and history |
| **Attendance** | Time in / Time out · Attendance history · Late/undertime records · Absences · Attendance corrections · Attendance summary | Extend — corrections and summary likely new |
| **Leave Requests** | File leave · Leave balance · Leave history · Approval/rejection · Leave calendar · Leave types | Extend — calendar and types likely new |
| **Documents** | Company documents · SOPs · Policies · Forms · Employee-accessible documents · Download/upload where appropriate | Extend — group by these categories |
| **Weekly Reports** | Employee weekly reports · Team reports · Report history | Extend — FOA per-author reports and department filter already built |
| **Benefits** | Available company benefits · HMO/health benefits · Dependents · Benefit information · Enrollment/status | Extend — dependents and enrollment status new |
| **Notifications** | In-app feed. Examples: Leave approved · Leave rejected · Announcement posted (HR: "add this as a dedicated feature") | New — dedicated page plus bell in the header |
| **Calendar** | Holidays · Company events · Meetings · Training · Important deadlines | New — can also show approved leave |
| **My Profile** | Personal information · Contact information · Emergency contact · Position · Department · Supervisor · Employment information | Extend — HRIS "My Profile" tab exists; add emergency contact, supervisor |
| **Settings** | Account settings · Password/security · Notification preferences · Dark/light mode · Profile settings | Extend — theme toggle and password change exist; the rest new |

## 4. HR-specific pages (HR/Admin only)

| Page | Sections (header dropdowns) | Notes |
|---|---|---|
| **Employee Management** ("one of your main HR sections") | Complete employee records · Employee ID · Position · Department · Supervisor · Date hired · Employment status · Probation date · Regularization date · Salary information · Emergency contacts · Dependents · Employment history · Government/HR requirements · Employee documents | Extend the HRIS Employees tab. Salary information should follow the Payroll restriction |
| **Recruitment** | Job openings · Applicants · Applicant information · Interview schedule · Interview notes · Applicant status · Hiring decision · Recruitment history | New |
| **Onboarding** | Checklist: Employment contract · Government requirements · IDs/documents · Orientation · Company policies acknowledgment · Training · HMO/benefits enrollment | New. **Removed by HR (crossed out):** Account creation, Equipment |
| **Performance Management** | Performance evaluation · Employee self-assessment · Supervisor evaluation · HR review · Performance history · Coaching · Improvement plans | New. **Removed by HR (crossed out):** Goals |
| **Employee Relations / Disciplinary** | Incident reports · Employee explanation · Written warning · Final warning · Corrective action · Case status · Supporting documents · Case history | New. **HR-only or highly restricted** |
| **Payroll / Compensation** | Salary history · Salary changes · Allowances · Bonuses · Deductions · Payslips · Payroll history | New. **"Access should be very restricted."** HR wrote "if your IT system is going to handle payroll", so confirm scope first |
| **Benefits Administration** | HMO enrollment · Dependents · Effective dates · Enrollment status · Changes · Benefit history · Provider information | New. Separate from the employee-facing Benefits page |
| **HR Requests** | Employee-submitted: Certificate of Employment · Salary certificate · Employment verification · Document requests · Benefit concerns · HR concerns · Other HR requests. HR tracks status: **Pending → Processing → Completed → Closed** | New. Employees submit, HR works a queue |
| **Offboarding / Separation** | Resignation · Termination · Clearance · Exit interview · Final pay status · Company property return · Account deactivation · Separation documents | New |

## 5. What already exists (for reference)

Nav today: Dashboard, Announcements, Benefits, HRIS, Weekly Reports, Leave Requests, Attendance,
Documents, Users, Audit Logs. Not in HR's document but kept: **Users** and **Audit Logs**
(admin), **Departments & Teams** (inside HRIS).

Rough mapping: HRIS → Employee Management + My Profile; Users → account admin (part of
Settings/admin).

## 6. Build order (suggested)

1. **Shared foundation** — `Accordion` section component, per-section role gating, restyled
   selects (done), nav grouped by General / HR.
2. **Restructure existing pages** into header-dropdown sections (Dashboard, Announcements,
   Attendance, Leave, Documents, Reports, Benefits, My Profile). Mostly re-layout plus small
   additions.
3. **Notifications + Calendar + Settings** (new, general).
4. **HR Requests** (highest daily value: employee submits, HR tracks status).
5. **Employee Management extensions** (dates, supervisor, dependents, employment history,
   government requirements).
6. **Onboarding**, then **Offboarding** (checklist-style, share one checklist component).
7. **Recruitment**, **Performance Management**.
8. **Employee Relations / Disciplinary** and **Payroll** last: they need the strictest access
   and audit logging, and the payroll scope isn't settled.

## 7. Cross-cutting requirements

- **Audit logging** on all HR-specific pages; mandatory for Disciplinary and Payroll (who
  viewed and changed what).
- **Field-level privacy**: salary, payroll and disciplinary data never returned by the API to
  roles that lack access, not merely hidden in the UI.
- **Files** (payslips, separation docs, supporting documents, applicant files) go through the
  existing B2/S3 storage with presigned URLs.
- **Status workflows** (HR Requests, Recruitment, Disciplinary case status, Onboarding
  checklists) should share one status/transition pattern, like weekly reports do.

## 8. Open questions for HR / the client

1. Should **Admin** see Disciplinary and Payroll, or **HR only**? (HR wrote "HR-only or highly
   restricted" and "very restricted", not naming Admin.)
2. Is **Payroll** in scope for this system at all? HR's wording is conditional.
3. Some bullets look crossed out on the scans (Leave rejected, Policy updates, Contact
   information, Date hired, Government requirements, Dependents under Benefits Administration).
   They are on paper creases or blurred and read as normal text, so they are **kept**. Only
   Goals, Account creation and Equipment (orange-highlighted and circled) are treated as
   removed. Please confirm.
4. **Recruitment**: are applicants ever given portal accounts, or is this internal HR
   tracking only?
5. **Supervisor**: is this the same as Team Leader, or a separate reporting line per employee?
6. **Notifications**: in-app only, or email as well? (Email sending already exists for account
   setup.)
7. Should sections remember expanded/collapsed per user, or always start collapsed?
