import { prisma } from './prisma.js'

// New employees start on the default shift (the one HR marks as default on the Shifts page), so HR does not have to
// pick it for every hire. Someone who already has any shift keeps it; with no default shift nothing is assigned.
export async function assignDefaultShift(employeeId: string, effectiveFrom: Date, assignedBy: string): Promise<void> {
  const shift = await prisma.shift.findFirst({ where: { isDefault: true, active: true }, select: { id: true } })
  if (!shift) return
  if ((await prisma.shiftAssignment.count({ where: { employeeId } })) > 0) return
  await prisma.shiftAssignment.create({ data: { employeeId, shiftId: shift.id, effectiveFrom, assignedBy } })
}

/** The default shift's id, or null. Used where a form may leave the shift out. */
export async function defaultShiftId(): Promise<string | null> {
  return (await prisma.shift.findFirst({ where: { isDefault: true, active: true }, select: { id: true } }))?.id ?? null
}
