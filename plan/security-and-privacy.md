# What we use and how we protect your data

A plain-language document for HR. Written 2026-10-17 from what the system actually does today, checked against the
code and settings, not from what we hope it does. Where something is missing, it says so.

This is not legal advice. The Philippines Data Privacy Act (RA 10173) applies, and HR or legal needs to approve the
policy and the notice to employees (see the last section).

## 1. What we use, in simple terms

| What | What it does for us | What data it holds |
|---|---|---|
| **GitHub** | Stores the program code, hosts the portal website (GitHub Pages) and hosts the BPO Time app installer | The code and the installer. **No passwords or personal data.** |
| **Vercel** | Runs the portal's server programs (the part that checks logins and reads or writes data) | Nothing stored; it passes data between the website, the app and the database. Our secret settings are kept here, not in the code. |
| **Neon** | The database: the real records | Employees, attendance, breaks, leave, shifts, announcements, notifications, the audit log |
| **Backblaze B2** | File storage for uploaded files, for example documents and resumes | The files |
| **Gmail** | Sends the portal's emails, for example the link a new hire uses to set a password | The email content |
| **BPO Time** (Windows app) | A small panel on the desktop for clocking in and out, breaks, announcements | Nothing permanent on the PC except a sign-in key (see section 4) |

- **The code is public** on GitHub. That is normal, and safe, because the code contains no passwords or keys. Those
  live in Vercel's private settings. The code repository has only blank example files, not real ones.
- **Everything travels encrypted** (the website, the server and the database all use HTTPS or encrypted connections).
- **Not checked yet:** where the servers physically are (the region), and how long the database keeps backups. Both
  depend on the plans on the accounts and should be confirmed.

## 2. How people sign in

- **Email and password.** Passwords are stored scrambled, so nobody can read them, including administrators and us.
  At least 8 characters.
- **A sign-in lasts 8 hours**, then the person signs in again.
- **New hires do not get a login until HR presses Activate.** Then a link is emailed to set the password. The link works
  for 48 hours.
- **Forgot a password?** A reset link is emailed, or an administrator can send one.
- **A deactivated person cannot sign in.** See the gap below about sessions already open.

## 3. Who can see what

Five roles: **Employee, Team Leader, Manager, HR, Administrator.**

- Everyone sees their own records.
- Team Leaders and Managers see what their role needs (for example their team's requests and reports).
- **HR and Administrator** manage employee records, shifts, announcements and attendance corrections.
- **Only Administrators** manage user accounts, the menu and the audit log.
- **Payroll and Employee Relations** are meant to be HR-only. That switch is **not on yet**: today an Administrator can
  open them too. It is turned on before go-live (see the list at the end).
- **The audit log** records who did what and when (for example "HR assigned a shift"). It records the action, not the
  values, so it does not copy personal data into itself.
- **The Freedom Wall is anonymous.** The author of a note is not stored at all, not even for administrators. Reactions
  there are stored in a way that does not show who made them.
- **Announcement reactions are not anonymous.** Everyone can see who reacted. HR can also see who has pressed "Got it".
- **Files** are downloaded through links that stop working after 5 minutes.

## 4. The BPO Time app

- **It never sees a password.** The person is signed in to the portal, presses **Launch App**, and the portal gives the
  app a one-time code. The code works once and expires after 60 seconds.
- **Each PC gets its own key.** It is stored on the PC encrypted by Windows, and on the server only a scrambled copy is
  kept. A PC can be **disconnected** from the portal (Settings, Desktop app) and then stops working at once.
- **If an account is deactivated, the app stops working** for that person.
- **The app can only do app things:** clock in and out, breaks, and read its own shift, announcements and counts. Its key
  does not open the rest of the portal.
- **It records time only:** clock in, clock out, break starts and ends. **No screenshots, no keystrokes, no window or app
  names, no websites.** The person can always see what it shows.
- **Links to the app are limited** to a short list of safe actions. A web page cannot make it open files or run anything.
- **Updates come only from our own GitHub releases**, and the app checks each update against a fingerprint before
  installing it.
- **The installer is not signed yet.** Windows shows "protected your PC" on the first install (More info, then Run
  anyway). Updates do not show it.

## 5. What we record about people

- **Attendance:** clock in and out times, breaks (which, how long, whether over the limit), the shift, lateness.
- **The internet address (IP) at clock-in and clock-out** is recorded. HR sees a flag when it is not an office address,
  once the office addresses are entered. **Employees must be told** this is recorded.
- **Employee records:** the details HR enters (position, department, dates, contact details, birthday and so on).
- **Birthdays** show in the BPO Time panel as a name only, never the date or age.
- **Nothing is deleted automatically.** There is no retention rule yet (see the list below).

## 6. Known gaps and what is planned

This is the honest list. None of it is hidden, but several items matter before a wide rollout.

| Gap | What it means | Plan |
|---|---|---|
| **No second login step** (no two-factor) | A stolen password is enough to sign in | Add before wide rollout, at least for HR and Administrators |
| **No lock-out after wrong passwords** | Someone could try many passwords | Add a limit on attempts |
| **A deactivated person's open session lasts up to 8 hours** on the portal website | Deactivating stops new sign-ins and the app at once, but a person already signed in on the website can keep going until their 8 hours end | Check the account on each request |
| **Payroll and Employee Relations are open to Administrators too** | Should be HR-only | Turn on the HR-only setting before go-live |
| **No automatic retention or deletion rules** | Old data stays | HR and legal decide how long to keep things |
| **Backups not confirmed** | We have not checked how far back the database can be restored | Confirm with the database plan; set a restore test |
| **App installer unsigned** | The Windows warning on first install | Buy a code-signing certificate (about USD 100 to 400 a year) |
| **Testing happens on live data** | A test clock-in is real | Set up a separate test copy (steps in `STAGING.md`) |
| **Break rules not yet confirmed by HR** | Live, but unconfirmed | HR confirms (see `hr-guide.md`) |

## 7. What HR needs to do

1. **Approve a written privacy policy** and send a **notice to employees** that explains what is recorded, why, who sees
   it and for how long. This is required by RA 10173 and should be done before rollout.
2. **Tell employees about the IP recording** and about what BPO Time does and does not record.
3. **Deactivate leavers the same day.** Do not rely on the 8-hour limit.
4. **Keep the HR and Administrator roles to as few people as possible.** Review them every few months.
5. **Look at the audit log now and then.** It is the record of who changed what.
6. **Decide how long records are kept**, so a retention rule can be built.
