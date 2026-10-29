import { describe, expect, it } from 'vitest'
import { formatOffset, searchZones, splitZone, zoneOptions } from '../../src/domain/timezones.js'

const at = new Date('2026-10-29T12:00:00Z')

describe('time zone picker', () => {
  it('labels and splits zones', () => {
    expect(formatOffset(-240)).toBe('GMT−04:00')
    expect(formatOffset(330)).toBe('GMT+05:30')
    expect(splitZone('America/Argentina/Buenos_Aires')).toEqual({ region: 'America', place: 'Buenos Aires, Argentina' })
    expect(splitZone('UTC')).toEqual({ region: 'Other', place: 'UTC' })
  })

  it('sorts by region, then by today\'s offset, west to east', () => {
    const ids = zoneOptions(['America/New_York', 'Europe/Berlin', 'America/Los_Angeles', 'Asia/Kolkata'], at).map((o) => o.label)
    expect(ids).toEqual(['(GMT−07:00) Los Angeles', '(GMT−04:00) New York', '(GMT+05:30) Kolkata', '(GMT+01:00) Berlin'])
  })

  it('searches by place, region or id, ignoring accents', () => {
    const options = zoneOptions(['America/Sao_Paulo', 'Europe/Berlin'], at)
    expect(searchZones(options, 'são').map((o) => o.id)).toEqual(['America/Sao_Paulo'])
    expect(searchZones(options, 'europe').map((o) => o.id)).toEqual(['Europe/Berlin'])
  })
})
