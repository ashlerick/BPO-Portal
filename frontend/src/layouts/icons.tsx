export type IconName =
  | 'dashboard'
  | 'announcements'
  | 'attendance'
  | 'leave'
  | 'documents'
  | 'reports'
  | 'benefits'
  | 'requests'
  | 'performance'
  | 'notifications'
  | 'calendar'
  | 'profile'
  | 'settings'
  | 'people'
  | 'recruitment'
  | 'onboarding'
  | 'offboarding'
  | 'shield'
  | 'alert'
  | 'payroll'
  | 'audit'
  | 'menu'
  | 'logout'
  | 'chevron'
  | 'moon'
  | 'sun'
  | 'clock'

// Outline icons on a 24px grid, drawn as plain strokes.
const ICONS: Record<IconName, string> = {
  dashboard: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  announcements: 'M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zM15 9a4 4 0 010 6M18 6.5a8 8 0 010 11',
  attendance: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  leave: 'M5 5h14v15H5zM5 9h14M9 3v4M15 3v4M9 14l2 2 4-4',
  documents: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  reports: 'M5 20V10M12 20V4M19 20v-7',
  benefits: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7C10 3 7 4 8 6s4 1 4 1zM12 7c2-4 5-3 4-1s-4 1-4 1z',
  requests: 'M9 4h6l1 2h3v15H5V6h3zM9 12h6M9 16h4',
  performance: 'M4 17l5-5 4 4 7-8M15 8h5v5',
  notifications: 'M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6zM10 19a2 2 0 004 0',
  calendar: 'M5 5h14v15H5zM5 9h14M9 3v4M15 3v4',
  profile: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  people: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20a7 7 0 0114 0M16 4.5a3.5 3.5 0 010 6.5M18 14c2 .8 4 2.6 4 6',
  recruitment: 'M10 11a4 4 0 100-8 4 4 0 000 8zM3 21a7 7 0 0114 0M19 8v6M16 11h6',
  onboarding: 'M15 4h4v16h-4M10 8l4 4-4 4M14 12H4',
  offboarding: 'M9 4H5v16h4M15 8l4 4-4 4M19 12H9',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  alert: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  payroll: 'M3 7h18v10H3zM12 14a2 2 0 100-4 2 2 0 000 4zM6 10v.01M18 14v.01',
  audit: 'M5 5h14M5 10h14M5 15h9M5 20h6',
  menu: 'M4 6h16M4 12h16M4 18h10',
  logout: 'M9 4H5v16h4M15 8l4 4-4 4M19 12H9',
  chevron: 'M9 6l6 6-6 6',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
}

export function Icon({ name, className = 'h-[18px] w-[18px]' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={ICONS[name]} />
    </svg>
  )
}
