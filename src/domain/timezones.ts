// The time zone picker's list: zones grouped by region, sorted by today's
// GMT offset west to east, labelled "(GMT−04:00) New York", and a search that ignores case and accents.

export interface ZoneOption {
  id: string
  region: string
  place: string
  offset: number
  label: string
}

// Minutes east of GMT for `zone` at `at`.
function offsetMinutes(zone: string, at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+'
  const abs = Math.abs(minutes)
  return `GMT${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

// "America/Argentina/Buenos_Aires" → region "America", place "Buenos Aires, Argentina".
export function splitZone(id: string): { region: string; place: string } {
  const parts = id.split('/').map((p) => p.replaceAll('_', ' '))
  if (parts.length === 1) return { region: 'Other', place: parts[0]! }
  const [region, ...rest] = parts
  return { region: region!, place: rest.reverse().join(', ') }
}

export function zoneOptions(ids: string[], at: Date): ZoneOption[] {
  return ids
    .map((id) => {
      const { region, place } = splitZone(id)
      const offset = offsetMinutes(id, at)
      return { id, region, place, offset, label: `(${formatOffset(offset)}) ${place}` }
    })
    .sort((a, b) => a.region.localeCompare(b.region) || a.offset - b.offset || a.place.localeCompare(b.place))
}

export const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function searchZones(options: ZoneOption[], query: string): ZoneOption[] {
  const q = fold(query.trim())
  if (!q) return options
  return options.filter((o) => fold(o.place).includes(q) || fold(o.region).includes(q) || fold(o.id).includes(q))
}
