export function getAppNow() {
  return new Date()
}

export function getCheckInWindowState(date = getAppNow()) {
  const minutes = date.getHours() * 60 + date.getMinutes()
  if (minutes < 540) return 'before_window' as const
  if (minutes <= 585) return 'open' as const
  return 'closed' as const
}
