export interface AuditLogEntry {
  id: string
  user: string
  action: string
  // What it was about, in words (who it affected, what changed). Older entries may have none.
  detail: string | null
  resource: string
  result: string
  createdAt: string
}

export interface AuditLogPage {
  entries: AuditLogEntry[]
  // Cursor for the next page, or null at the end.
  next: string | null
  total: number
  from: string
  to: string
}

export interface AuditFacets {
  users: { id: string; name: string }[]
  resources: string[]
  kinds: string[]
}
