import { prisma } from '../prisma.js'
import { formatDisplayName } from '../names.js'

// Who has a birthday today (Manila time). Birthdays are shown only in the BPO Time desktop app (device.ts,
// /hr/device-feed); the portal dashboard no longer has a birthday card. It only ever returns names, never the
// date, age or anything else about the person.
export async function birthdaysToday(myEmployeeId: string | undefined) {
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000) // Manila
  const month = today.getUTCMonth() + 1
  const day = today.getUTCDate()
  const year = today.getUTCFullYear()
  const leapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  // A Feb 29 birthday is celebrated on Feb 28 in non-leap years.
  const feb28InCommonYear = month === 2 && day === 28 && !leapYear

  const rows = await prisma.employee.findMany({
    where: { status: 'active', birthDate: { not: null } },
    select: { id: true, birthDate: true, user: { select: { firstName: true, middleName: true, lastName: true } } },
  })

  return rows
    .filter((r) => {
      const b = r.birthDate as Date
      const bm = b.getUTCMonth() + 1
      const bd = b.getUTCDate()
      return (bm === month && bd === day) || (feb28InCommonYear && bm === 2 && bd === 29)
    })
    .map((r) => ({
      name: formatDisplayName(r.user.firstName, r.user.middleName, r.user.lastName),
      firstName: r.user.firstName,
      isMe: r.id === myEmployeeId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
