import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { api } from '../../services/api'

interface Birthday {
  name: string
  firstName: string
  isMe: boolean
}

// A light card for today's birthdays, shown above the to-do list. Names
// only (never age or date), and nothing at all when nobody has one.
export function BirthdayCard() {
  const [people, setPeople] = useState<Birthday[]>([])

  useEffect(() => {
    api
      .get<Birthday[]>('/hr/birthdays')
      .then(setPeople)
      .catch(() => setPeople([]))
  }, [])

  if (people.length === 0) return null

  const me = people.find((p) => p.isMe)
  const others = people.filter((p) => !p.isMe)

  return (
    <Card className="flex items-start gap-3 !border-gold-500/40">
      <span className="text-2xl" aria-hidden="true">
        🎂
      </span>
      <div className="min-w-0 text-sm">
        {me && <p className="text-base font-semibold text-gold-600 dark:text-gold-400">Happy birthday, {me.firstName}!</p>}
        {others.length > 0 && (
          <p className="text-gray-800 dark:text-gray-200">
            {me ? 'Also celebrating today: ' : "Today's birthday"}
            {!me && others.length > 1 ? 's: ' : !me ? ': ' : ''}
            <span className="font-medium">{others.map((p) => p.name).join(', ')}</span>
          </p>
        )}
      </div>
    </Card>
  )
}
