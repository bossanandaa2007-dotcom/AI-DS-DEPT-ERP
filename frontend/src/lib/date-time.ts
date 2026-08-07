export function getAppNow() {
  return new Date()
}

/** Local calendar date as `YYYY-MM-DD`; `toISOString` would shift the day either side of UTC. */
export function toIsoDate(date = getAppNow()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Timetable days run 1-7 from Monday, matching `timetable_entries.day_of_week`. */
export function weekdayOf(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const index = new Date(year, month - 1, day).getDay()
  return index === 0 ? 7 : index
}

/** The date carrying `weekday` inside the same Monday-to-Sunday week as `isoDate`. */
export function shiftToWeekday(isoDate: string, weekday: number) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const target = new Date(year, month - 1, day)
  target.setDate(target.getDate() + (weekday - weekdayOf(isoDate)))
  return toIsoDate(target)
}
