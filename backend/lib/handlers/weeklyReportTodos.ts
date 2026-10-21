import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../prisma.js'
import { notifyUsers } from '../notify.js'
import { isFoaDepartment } from '../foaReport.js'
import { cronAuthorized } from './inventoryReminders.js'

// The weekly report to-do, called by a Vercel cron on Friday morning in Manila (see vercel.json).
//   - everyone who has to file a weekly report gets a to-do "Submit weekly report (Oct 19-25)", due the Monday after
//   - on a team that files one report per person (FOA) that is everyone on the team; on any other team it is the team leader
// The week range in the title is what stops duplicates: running the job twice adds nothing, and a to-do someone deleted is not made again.
// Submitting the report completes the to-do (see completeWeeklyReportTodos, called from the reports endpoint).

export const WEEKLY_REPORT_TODO = 'Submit weekly report'
// The to-dos are made by the system, not by a person: the panel shows them as coming from "BPO Portal" and the assignee cannot delete them.
export const SYSTEM_ACTOR = 'system'

const DAY_MS = 24 * 60 * 60 * 1000
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

// "Oct 19-25", or "Oct 26 - Nov 1" when the week crosses a month.
export function weekRangeLabel(monday: Date): string {
  const sunday = new Date(monday.getTime() + 6 * DAY_MS)
  const sameMonth = monday.getUTCMonth() === sunday.getUTCMonth()
  return sameMonth ? `${monthDay.format(monday)}-${sunday.getUTCDate()}` : `${monthDay.format(monday)} - ${monthDay.format(sunday)}`
}

// The Monday (as a UTC-midnight date) of the week that Manila's wall clock is in right now.
// Not todayInManila(): that one counts the hours before noon as the previous day, and this runs at 8 AM.
function mondayOfThisWeek(): Date {
  const manila = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const day = Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate())
  return new Date(day - ((manila.getUTCDay() + 6) % 7) * DAY_MS)
}

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (!cronAuthorized(req)) return res.status(401).json({ message: 'Unauthorized' })

  const monday = mondayOfThisWeek()
  const title = `${WEEKLY_REPORT_TODO} (${weekRangeLabel(monday)})`
  const due = new Date(monday.getTime() + 7 * DAY_MS)

  const employees = await prisma.employee.findMany({
    where: { status: 'active', teamId: { not: null }, user: { active: true } },
    select: { id: true, userId: true, user: { select: { roles: true } }, team: { select: { department: { select: { name: true } } } } },
  })
  const owners = employees.filter((e) => (e.team && isFoaDepartment(e.team.department.name)) || e.user.roles.includes('team_leader'))

  // Deleted ones count too, so a to-do someone removed is not made again.
  const existing = new Set(
    (await prisma.todo.findMany({ where: { createdBy: SYSTEM_ACTOR, title, employeeId: { in: owners.map((e) => e.id) } }, select: { employeeId: true } })).map(
      (t) => t.employeeId,
    ),
  )
  const fresh = owners.filter((e) => !existing.has(e.id))

  if (fresh.length > 0) {
    await prisma.todo.createMany({
      data: fresh.map((e) => ({
        employeeId: e.id,
        title,
        description: 'Fill in and submit your weekly report for this week. It is due Monday.',
        dueDate: due,
        priority: 'normal',
        createdBy: SYSTEM_ACTOR,
      })),
    })
    await notifyUsers(
      fresh.map((e) => e.userId),
      { type: 'todo', title: 'New to-do: ' + title, body: 'Due Monday.', link: '/reports' },
    )
  }

  return res.status(200).json({ title, due: due.toISOString().slice(0, 10), created: fresh.length, alreadyHad: owners.length - fresh.length })
}

// A submitted report completes the person's weekly-report to-do for that week: the one due after the report's period ends.
export async function completeWeeklyReportTodos(userId: string, periodEnd: Date): Promise<void> {
  try {
    const employee = await prisma.employee.findUnique({ where: { userId }, select: { id: true } })
    if (!employee) return
    await prisma.todo.updateMany({
      where: {
        employeeId: employee.id,
        createdBy: SYSTEM_ACTOR,
        title: { startsWith: WEEKLY_REPORT_TODO },
        status: 'open',
        deletedAt: null,
        dueDate: { gt: periodEnd, lte: new Date(periodEnd.getTime() + 7 * DAY_MS) },
      },
      data: { status: 'done', completedAt: new Date(), completedBy: userId },
    })
  } catch (err) {
    // A failed tidy-up must not fail the submit itself.
    console.error('Could not complete the weekly report to-do', err)
  }
}
