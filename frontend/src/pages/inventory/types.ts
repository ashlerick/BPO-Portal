export interface InventoryItem {
  id: string
  assetTag: string
  name: string
  category: string | null
  serialNumber: string | null
  status: 'available' | 'assigned' | 'repair' | 'lost' | 'retired'
  notes: string | null
  assignedToId: string | null
  assignedToName: string | null
  updatedAt: string
}

export interface InventoryDetail extends InventoryItem {
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
