// A real moment written out in both of the team's zones, for things said in only one (an event at 1:30 PM California is
// 4:30 AM the next day in Manila).
const fmt = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso))

export const inBothZones = (iso: string) => `${fmt(iso, 'America/Los_Angeles')} California · ${fmt(iso, 'Asia/Manila')} Manila`

export const ZONE_OPTIONS = [
  { value: 'Asia/Manila', label: 'Philippines time' },
  { value: 'America/Los_Angeles', label: 'California time' },
] as const
