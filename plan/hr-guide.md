# BPO Portal and BPO Time: a guide for HR

A plain-language guide to what we built, how it works, what rules we set, and what still needs HR's decision.
Written 2026-10-17. The app version at the time is 0.1.1 (beta).

## 1. What it is

- **The BPO Portal** is the company website: announcements, calendar, attendance, leave, onboarding, employee records
  and more. People sign in with their email and password.
- **BPO Time** is a small Windows app. It sits on the right edge of the desktop and is where people **clock in and out**,
  take **breaks and lunch**, and see highlighted announcements. Clocking in and out is done **only** in BPO Time. The
  portal no longer has check-in or check-out buttons, and logging in to the portal does not clock anyone in.

How the two connect: BPO Time sends clock-ins and breaks to the portal, so the portal's Attendance page and HR's reports
show the same records.

## 2. Who can do what

| Role | In short |
|---|---|
| **Employee** | Sees and edits their own information, files leave, uses BPO Time |
| **Team Leader / Manager** | Also sees their team's requests and weekly reports |
| **HR** | Manages employee records, shifts, announcements, onboarding and attendance corrections |
| **Administrator** | Everything HR does, plus user accounts, the menu and the audit log |

## 3. The BPO Time app, for employees

**Getting it:** open the portal on a Windows PC, press **Launch App (BETA)** at the top right. If the app is not
installed it offers a **Download**. The first install shows a Windows warning because the app is not signed yet (More
info, then Run anyway). After that, the app updates itself.

**Signing in:** press **Launch App** in the portal while signed in. No second password is needed.

**What the panel shows, top to bottom:**
- **Name and status**, and the **Philippines and California clocks.**
- **The timer** ("worked today") with the day of the shift above it (for a night shift this stays on the day the shift
  started, even after midnight).
- **A row of small chips:** whether the clock-in was **On time** or **Late by N min**, the shift hours (Philippines time;
  hover for California), and how long is **left** in the shift. Before the shift it says when it starts.
- **Clock out:** slide the knob to the end, then tap the red bar within 8 seconds. Sliding alone never clocks out.
- **Three break buttons** (see section 4).
- **Notifications and to-dos** counts (click to open them in the portal; the small arrow refreshes them).
- **Quick links** to Attendance, Leave, Calendar, HR Requests, Documents and the Freedom Wall.
- **Announcements:** only the ones HR **highlighted**, and only until the person reacts to them.
- **Birthdays today** as a banner (names only). The ✕ hides it until the next clock-in.
- **More:** what the app records, open the portal, light or dark mode, copy-to-chat messages on or off, sign out.

**Copy-to-chat messages** (can be turned off in More): clocking in copies "Good morning, clock in!", clocking out
"Good night, clock out!", and breaks copy "Taking my break" / "Taking my lunch" and "Back from break" / "Back from lunch",
so people can paste them into the team chat.

**What it records:** clock in and out and break times only. No screenshots, no keystrokes, no window names, no websites.

## 4. The rules we set (HR to confirm)

**Breaks and lunch**
- Three a day, in order: **morning break 10 minutes, lunch 30 minutes, afternoon break 10 minutes.** Each used once.
- A **fixed 50 minutes** is taken off the worked time every day, whether each break was taken, skipped or cut short.
- Starting a later break closes any earlier unused one as **"not taken"**. Clocking out ends a running break and marks
  unused ones "not taken".
- **Going over:** a **60-second grace** past the limit. Inside the grace the timer is amber and nothing is flagged. Past
  it, the timer turns red and the full time over is recorded. Going over only flags; it takes no extra time off.
- Returning early is never flagged.
- Only start and end times are stored.
- **Not done yet:** the portal's attendance reports and Excel export still work out hours from clock in and clock out
  only; they do not subtract the 50 minutes yet.

**Shifts**
- The standard shift is **5:00 AM to 1:30 PM California time, Monday to Friday.** In the Philippines that is
  **8:00 PM to 4:30 AM now** and **9:00 PM to 5:30 AM from Monday, Nov 2**, because California moves its clocks back on
  Sunday, Nov 1. The portal works the change out by itself and shows both times everywhere a shift is chosen.
- Everyone with no shift started on it from **Oct 16, 2026**; anyone HR had already given a shift kept theirs. Earlier
  days are not measured.
- **Grace for lateness is 10 minutes.** Within it, a clock-in counts as on time (early is fine too). Past it, the full
  lateness is recorded, and it shows as "Late by N min" in the app and in HR's late report.
- A shift has start, end, working days, break minutes, grace and a time zone. HR can edit all of it.
- **New hires start on the default shift** automatically; HR can change it in the form.

## 5. HR tasks and where to do them

| Task | Where |
|---|---|
| Post an announcement | **Announcements**, the form at the top |
| Pin it so it shows first and in the app | **Highlight** button on the announcement (or tick Highlight when posting). Emergency announcements are always highlighted |
| See who has pressed "Got it" | On policy, important and emergency notices: "Acknowledged by X of Y (who?)" |
| Add a holiday or event | **Calendar**, Add an event |
| Hire someone | **Onboarding**, New hire. It creates an inactive account, the employee record and the checklist. Then **Waiting for activation**, press **Activate** |
| Edit an employee (position, status, department, team, date hired, **SIL balance**) | **Employee Management**, Employees: click the person's row. The window also changes their shift |
| Define, edit or assign shifts | **Employee Management**, Shifts tab |
| Fix an attendance record, mark absent, export to Excel | **Attendance**, Corrections and History and reports |
| Late report | **Attendance**, History and reports |
| Approve leave | **Leave Requests** |
| Disconnect a PC from BPO Time | The person's **Settings**, Desktop app |
| User accounts, menu, audit log | **Administrator** only: Users, Menu Management, Audit Logs |

## 6. Waiting for HR's decision

1. **Confirm the break rules** in section 4 (10, 30, 10 minutes; a fixed 50-minute deduction; the 60-second grace).
2. **How overtime is counted:** by hours worked beyond the required hours, or by time past the shift's end time. The two
   differ when someone arrives late. This decides the "stop at the required hours, then show extra time" idea.
3. **Does time before the shift start count as paid work** when someone clocks in early?
4. **Grace at the end of a shift** for leaving a few minutes early or late (undertime and overtime), the same way
   lateness has one.
5. **Holiday types and pay rules,** and **where employees work** (which city or municipality), so local holidays can
   be handled. See `holidays.md`.
6. **The privacy policy, the notice to employees, and how long records are kept.** See `security-and-privacy.md`.
7. **Who cannot run BPO Time** (it is Windows only) and needs another way to clock in.

## 7. Not built yet

- Break limits and grace editable by HR on the Shifts page (they are fixed in the system now).
- Reports and Excel export that subtract the 50-minute break deduction.
- Holiday types, Panay local holidays, and holiday pay flags.
- The "required hours, then extra" timer.
- A "please update" message for very old app versions.
- A separate test copy of the system, so testing never touches real data (`STAGING.md`).
- A signed installer, two-step login and login attempt limits (see `security-and-privacy.md`).
