export type Condition = 'good' | 'fair' | 'poor' | 'damaged'

export interface InventoryItem {
  id: string
  assetTag: string
  name: string
  category: string | null
  serialNumber: string | null
  status: 'available' | 'assigned' | 'repair' | 'lost' | 'retired'
  notes: string | null
  condition: Condition | null
  conditionCheckedAt: string | null
  checkedThisMonth: boolean
  assignedToId: string | null
  assignedToName: string | null
  updatedAt: string
}

export interface InventoryDetail extends InventoryItem {
  checks: { id: string; month: string; condition: Condition; note: string | null; checkedAt: string }[]
  history: { id: string; employeeName: string; assignedAt: string; returnedAt: string | null; returnNote: string | null }[]
}

export const STATUS_LABEL: Record<InventoryItem['status'], string> = {
  available: 'Available',
  assigned: 'Assigned',
  repair: 'In repair',
  lost: 'Lost',
  retired: 'Retired',
}

export const STATUS_TONE: Record<InventoryItem['status'], 'green' | 'blue' | 'amber' | 'red' | 'gray'> = {
  available: 'green',
  assigned: 'blue',
  repair: 'amber',
  lost: 'red',
  retired: 'gray',
}

export const CONDITIONS: Condition[] = ['good', 'fair', 'poor', 'damaged']

export const CONDITION_LABEL: Record<Condition, string> = {
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  damaged: 'Damaged',
}

export const CONDITION_TONE: Record<Condition, 'green' | 'blue' | 'amber' | 'red' | 'gray'> = {
  good: 'green',
  fair: 'amber',
  poor: 'red',
  damaged: 'red',
}
