import { useCallback, useMemo } from 'react'
import { locale, t } from './i18n.js'
import { currencyOptions, searchCurrencies, type CurrencyOption } from './lib/currencies.js'
import { searchZones, zoneOptions, type ZoneOption } from './lib/timezones.js'
import { SearchPicker, type PickerOption } from './SearchPicker.js'

const zoneOption = (o: ZoneOption): PickerOption => ({ id: o.id, note: o.label.slice(0, o.label.indexOf(') ') + 1), label: o.place, group: o.region })
const currencyOption = (o: CurrencyOption): PickerOption => ({ id: o.id, note: o.id, label: o.name })

// The time zone picker: grouped by region, sorted by today's offset, typed to filter by place, region or zone ID.
// Shows the time there, so a wrong pick shows at once.
export function TimeZoneField({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (zone: string) => void }) {
  const zones = useMemo(() => zoneOptions(Intl.supportedValuesOf('timeZone'), new Date()), [])
  const options = useMemo(() => zones.map(zoneOption), [zones])
  const search = useCallback((query: string) => searchZones(zones, query).map(zoneOption), [zones])
  const time = new Intl.DateTimeFormat(locale(), { timeZone: value, hour: 'numeric', minute: '2-digit' }).format(new Date())
  return (
    <>
      <SearchPicker kind="timezone" options={options} search={search} value={value} disabled={disabled} onChange={onChange}
        placeholder={t('Search time zones')} empty={(query) => t('No time zone matches "{query}"', { query })} />
      <span className="small muted">{t("It's {time} there.", { time })}</span>
    </>
  )
}

// The currency picker: every code with its name in the page's language, typed to filter by either.
export function CurrencyField({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (code: string) => void }) {
  const currencies = useMemo(() => {
    const names = new Intl.DisplayNames(locale(), { type: 'currency' })
    return currencyOptions(Intl.supportedValuesOf('currency'), (code) => names.of(code))
  }, [])
  const options = useMemo(() => currencies.map(currencyOption), [currencies])
  const search = useCallback((query: string) => searchCurrencies(currencies, query).map(currencyOption), [currencies])
  return (
    <SearchPicker kind="currency" options={options} search={search} value={value} disabled={disabled} onChange={onChange}
      placeholder={t('Search currencies')} empty={(query) => t('No currency matches "{query}"', { query })} />
  )
}
