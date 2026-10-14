export interface AttendanceRecord {
  id: string
  employeeId?: string
  employeeName: string
  date: string
  status: 'present' | 'absent'
  checkInAt: string | null
  checkOutAt: string | null
  overtimeHours?: number | null
  workingHoliday?: boolean
  checkInIp?: string | null
  checkInOffSite?: boolean
}
