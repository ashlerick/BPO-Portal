import type { Role } from '../../auth/types'

export interface ManagedUser {
  id: string
  email: string
  firstName: string
  middleName: string | null
  lastName: string
  name: string
  roles: Role[]
  passwordSet: boolean
  active: boolean
  createdAt: string
}
