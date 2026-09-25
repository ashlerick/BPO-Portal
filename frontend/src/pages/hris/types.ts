export interface MyEmployeeProfile {
  id: string
  name: string
  email: string
  department: string | null
  team: string | null
  teamId: string | null
  position: string | null
  status: string
  dateHired: string | null
  silBalance: number
  phone: string | null
  address: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
}

export interface EmployeeRecord {
  id: string
  name: string
  email: string
  departmentId: string | null
  department: string | null
  teamId: string | null
  team: string | null
  position: string | null
  status: string
  dateHired: string | null
  silBalance: number
  phone: string | null
  address: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
}

export interface Team {
  id: string
  name: string
  departmentId: string
  department: string
}

export interface Department {
  id: string
  name: string
}
