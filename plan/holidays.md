# Holidays: notes and plan

Researched 2026-10-17. For HR and for whoever builds the holiday feature. Nothing here is built yet except the
Calendar's existing Holidays tab, which HR fills by hand.

## What "major" and "minor" mean

In Philippine payroll these are two different kinds of day, and the pay rules differ:

| Kind | Also called | Pay rule (general Labor Code rule; DOLE's yearly advisory is the authority) |
|---|---|---|
| **Regular holiday** | "major" | Paid even if not worked. Higher rate if worked. |
| **Special non-working day** | "minor" | No work, no pay, unless company policy is more generous. A 30% premium if worked. |
| **Special working day** | | An ordinary working day; no premium. |

Local holidays (a city or province) are special non-working days that apply only to that place.

## National holidays

- Set each year by a presidential proclamation. For 2026 it is **Proclamation No. 1006** (signed 2025-09-03): 10 regular
  holidays, several special non-working days (Chinese New Year, Black Saturday, Ninoy Aquino Day, All Saints' Day,
  All Souls' Day, Christmas Eve, Immaculate Conception, New Year's Eve) and one special working day (Feb 25, EDSA).
  DOLE issues the pay guidelines.
- **Eid'l Fitr and Eid'l Adha** are not in the base proclamation. They are declared separately once the Islamic
  calendar fixes the dates.
- Authoritative list: Official Gazette, "Nationwide Holidays" page for the year (`officialgazette.gov.ph/nationwide-holidays/2026/`).
  It refuses automated requests, so it has to be opened in a browser.
- Secondary sources used: Payroll Solutions PH, PTV News, Gulf News (2026 calendar articles).

## Free data sources

| Source | What it gives | Limits |
|---|---|---|
| **Nager.Date** (`https://date.nager.at/api/v3/PublicHolidays/2026/PH`) | Free, no key. Philippines dates and English/Filipino names as JSON. Tested live. | Marks every day just "Public": it does **not** say regular or special. No Islamic holidays before they are declared. No local holidays. |
| **Calendarific** | Philippines holidays by API | Needs sign-up and a key |
| **DOLE** | Yearly labor advisory with the pay rules | No API found; documents only |

## Panay (Iloilo, Capiz, Aklan, Antique) local holidays

What could be confirmed, and what could not:

| Date | Holiday | Status |
|---|---|---|
| Feb 11 every year | Governor Evelio B. Javier Day, special non-working day in Antique, Capiz, Aklan and Iloilo | By law (Republic Act 7601) |
| Aug 25 | Iloilo City Charter Day (Iloilo City only) | Listed in a 2020 Panay guide. Not confirmed for 2026; only House bills found. |
| Dec 20 | "Capiz Liberation Day" | A House bill only. Not confirmed. |
| Mar 14, 2026 | Passi, Iloilo founding anniversary | Special non-working day by proclamation (March 2026 batch) |
| January | Dinagyang (Iloilo City), Ati-Atihan (Kalibo) | **No 2026 declaration found.** Do not treat as holidays until HR sees one. |

How local holidays arrive: presidential proclamations, usually in monthly batches for named towns, announced only days or
weeks ahead; or a Republic Act for a recurring charter day. They apply only to the place named. So no yearly list can be
complete.

## Plan (agreed direction, not built)

1. **Prefill each year from Nager.Date** as a draft in the Calendar's Holidays tab; HR confirms against the proclamation.
2. **A type on every holiday:** regular, special non-working, special working, or local. HR chooses it. This is the
   missing label.
3. **An area on local holidays** (for example Iloilo City or Passi), and show only the ones that apply to where the
   people work.
4. **A monthly reminder to HR** to check for new local proclamations.
5. **Later, use it for pay:** show "Regular holiday" in the BPO Time panel on the day, and flag holiday attendance for
   HR. This needs HR to confirm the pay rules first.

## Open question for HR

Where do the employees work: one office (which city or municipality) or people spread across Panay? That decides which
local holidays apply. The portal does not store a work location yet.
