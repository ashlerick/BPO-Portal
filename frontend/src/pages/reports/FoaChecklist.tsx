import { FOA_CHECKLIST_DAYS, FOA_CHECKLIST_TASKS, type FoaReportData } from './foa'
import { softButton } from './foaUi'

type Checklist = NonNullable<FoaReportData['taskChecklist']>

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

// The weekly task checklist: a task by day grid where each cell is one large button, filled when done. "All week" ticks a whole task.
export function FoaChecklist({
  value,
  readOnly,
  onChange,
}: {
  value: Checklist
  readOnly?: boolean
  onChange: (next: Checklist) => void
}) {
  const isDone = (task: string, day: string) => !!value[task as keyof Checklist]?.[day as keyof NonNullable<Checklist[keyof Checklist]>]

  function setDay(task: string, day: string, done: boolean) {
    onChange({ ...value, [task]: { ...value[task as keyof Checklist], [day]: done } })
  }

  function setWeek(task: string, done: boolean) {
    onChange({ ...value, [task]: Object.fromEntries(FOA_CHECKLIST_DAYS.map((d) => [d, done])) })
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-y-1">
        <thead>
          <tr className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
            <th className="px-1 pb-1 text-left">Task</th>
            {SHORT.map((d) => (
              <th key={d} className="w-12 pb-1 text-center">
                {d}
              </th>
            ))}
            {!readOnly && <th className="w-24" />}
          </tr>
        </thead>
        <tbody>
          {FOA_CHECKLIST_TASKS.map((task) => {
            const all = FOA_CHECKLIST_DAYS.every((d) => isDone(task, d))
            return (
              <tr key={task} className="group">
                <td className="rounded-l-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-900 dark:bg-white/[0.07] dark:text-gray-100">{task}</td>
                {FOA_CHECKLIST_DAYS.map((day) => {
                  const done = isDone(task, day)
                  return (
                    <td key={day} className="bg-gray-100 px-1 py-1 text-center dark:bg-white/[0.07]">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => setDay(task, day, !done)}
                        aria-pressed={done}
                        aria-label={`${task}, ${day}: ${done ? 'done' : 'not done'}`}
                        className={`h-9 w-9 rounded-lg border-2 text-base font-bold transition ${
                          done
                            ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-400 dark:bg-brand-500'
                            : readOnly
                              ? 'border-gray-300 bg-transparent text-transparent dark:border-white/15'
                              : 'border-gray-400 bg-white text-transparent hover:border-brand-600 dark:border-white/35 dark:bg-black/30 dark:hover:border-brand-400'
                        } ${readOnly ? 'cursor-default' : ''}`}
                      >
                        {done ? '✓' : ' '}
                      </button>
                    </td>
                  )
                })}
                {!readOnly && (
                  <td className="rounded-r-lg bg-gray-100 px-2 py-1 text-right dark:bg-white/[0.07]">
                    <button type="button" onClick={() => setWeek(task, !all)} className={`${softButton} whitespace-nowrap`}>
                      {all ? 'Clear' : 'All week'}
                    </button>
                  </td>
                )}
                {readOnly && <td className="w-0 rounded-r-lg bg-gray-100 dark:bg-white/[0.07]" />}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
