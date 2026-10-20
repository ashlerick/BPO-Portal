export interface AttendanceRecord {
  id: string
  employeeId?: string
  employeeName: string
  date: string
  status: 'present' | 'absent'
  checkInAt: string | null
  checkOutAt: string | null
  overtimeHours?: number | null
  // Overtime HR gave, in hours (on top of overtimeHours, which HR types in).
  overtimeGivenHours?: number
  workingHoliday?: boolean
  // Breaks and lunch taken in the BPO Time app.
  breaks?: import('../../utils/breaks').BreakEntry[]
  checkInIp?: string | null
  checkInOffSite?: boolean
}
