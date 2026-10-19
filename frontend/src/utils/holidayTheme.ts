// Which look a holiday gets, from its name. Anything unrecognised (a local holiday HR typed in) gets the plain red and
// gold. The colours themselves live in index.css, keyed by the data-holiday attribute on <html>. Same keywords as the
// BPO Time panel, so the two always agree.
export type HolidayTheme = 'newyear' | 'holyweek' | 'christmas' | 'saints' | 'national' | 'labour' | 'other'

export function holidayTheme(name: string): HolidayTheme {
  const n = name.toLowerCase()
  if (/maundy|good friday|holy saturday|black saturday|holy (week|thursday|wednesday)/.test(n)) return 'holyweek'
  if (/christmas/.test(n)) return 'christmas'
  if (/new year|year.?s eve|last day of the year|chinese/.test(n)) return 'newyear'
  if (/all saints|all souls|immaculate|undas/.test(n)) return 'saints'
  if (/labou?r/.test(n)) return 'labour'
  if (/independence|valor|heroes|bonifacio|rizal|aquino|edsa|national|republic/.test(n)) return 'national'
  return 'other'
}

// A short, warm greeting for the day. Says nothing about pay or how the day is recorded: HR can change that.
// Same wording as the BPO Time panel.
export function holidayGreeting(name: string, theme: HolidayTheme): string {
  const n = name.toLowerCase()
  if (/rizal|aquino/.test(n)) return 'Remembering a hero of our country.'
  if (/chinese/.test(n)) return 'Gung hei fat choy!'
  if (/last day of the year|year.?s eve/.test(n)) return 'Wishing you a great end to the year.'
  switch (theme) {
    case 'newyear':
      return 'Happy New Year!'
    case 'holyweek':
      return 'Wishing you a peaceful, reflective day.'
    case 'christmas':
      return 'Merry Christmas! Wishing you a joyful day.'
    case 'saints':
      return 'Wishing you a quiet, peaceful day.'
    case 'national':
      return `Mabuhay! Happy ${name}.`
    case 'labour':
      return 'Thank you for all your hard work.'
    default:
      return 'Enjoy the holiday!'
  }
}
