export type CalendarEventKind = 'holiday' | 'event' | 'meeting' | 'training' | 'deadline'

export const CALENDAR_KINDS: { key: CalendarEventKind; label: string; plural: string }[] = [
  { key: 'holiday', label: 'Holiday', plural: 'Holidays' },
  { key: 'event', label: 'Company event', plural: 'Company events' },
  { key: 'meeting', label: 'Meeting', plural: 'Meetings' },
  { key: 'training', label: 'Training', plural: 'Training' },
  { key: 'deadline', label: 'Important deadline', plural: 'Important deadlines' },
]

export interface CalendarEventRecord {
  id: string
  title: string
  kind: CalendarEventKind
  startDate: string
  endDate: string | null
  description: string | null
}
