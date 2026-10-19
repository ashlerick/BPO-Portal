import { holidayTheme } from '../../utils/holidayTheme'

// "Holiday today" banner for the dashboard, in the day's colours (index.css). Confetti for New Year, snow for Christmas;
// reduced motion hides them. Nothing here changes any other colour in the portal.
const CONFETTI = ['#fbbf24', '#e5534b', '#34d399', '#a78bfa', '#ffffff']

export function HolidayBanner({ name }: { name: string }) {
  const theme = holidayTheme(name)
  const flecks = theme === 'newyear' || theme === 'christmas' ? Array.from({ length: 18 }, (_, i) => i) : []
  return (
    <div className="holiday-banner mb-4" role="status">
      {flecks.map((i) => (
        <i
          key={i}
          aria-hidden
          className={`holiday-fleck ${theme === 'newyear' ? 'holiday-fleck-confetti' : 'holiday-fleck-snow'}`}
          style={{
            left: `${3 + i * 5.4}%`,
            animationDelay: `${(i * 0.31).toFixed(2)}s`,
            ...(theme === 'newyear' ? { background: CONFETTI[i % CONFETTI.length] } : {}),
          }}
        />
      ))}
      <div className="relative z-10">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--holiday-ink)]">Holiday today</div>
        <div className="text-xl font-bold text-[var(--holiday-ink)]">{name}</div>
        <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
          On the company holiday list. Check with HR if you are unsure.
        </p>
      </div>
    </div>
  )
}
