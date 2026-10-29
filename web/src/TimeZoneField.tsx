import { locale } from './i18n.js'
import { ChevronDown, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { searchZones, zoneOptions } from './lib/timezones.js'
import { t } from './i18n.js'

// A searchable time zone picker: grouped by region, sorted by today's
// offset, typed to filter; ↑/↓ and Enter pick, Escape closes. Shows the time there, so a wrong pick shows at once.
export function TimeZoneField({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (zone: string) => void }) {
  const options = useMemo(() => zoneOptions(Intl.supportedValuesOf('timeZone'), new Date()), [])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const shown = useMemo(() => searchZones(options, query), [options, query])
  const selected = options.find((o) => o.id === value)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => root.current?.contains(e.target as Node) || setOpen(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])
  useEffect(() => {
    const row = list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const openPicker = () => {
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.id === value)))
    setOpen(true)
  }
  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') setActive((i) => Math.min(shown.length - 1, i + 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
    else if (e.key === 'Enter') shown[active] && pick(shown[active].id)
    else if (e.key === 'Escape') setOpen(false)
    else return
    e.preventDefault()
  }
  const time = new Intl.DateTimeFormat(locale(), { timeZone: value, hour: 'numeric', minute: '2-digit' }).format(new Date())

  let region = ''
  return (
    <div className="picker" ref={root}>
      <button type="button" className="picker-trigger" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? setOpen(false) : openPicker())}>
        <span className="off">{selected?.label.split(') ')[0]})</span> {selected?.place ?? value}
        <span className="detail">{selected?.region}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <span className="small muted">{t("It's {time} there.", { time })}</span>
      {open && (
        <div className="picker-panel">
          <span className="search-field">
            <Search size={16} aria-hidden="true" />
            <input autoFocus type="search" placeholder={t('Search time zones')} aria-label={t('Search time zones')} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0) }} onKeyDown={onKey} />
          </span>
          <ul ref={list} role="listbox" aria-label={t('Time zones')}>
            {shown.map((o, i) => {
              const heading = o.region !== region ? (region = o.region) : null
              return [
                heading && <li key={`r-${heading}`} className="region" role="presentation">{heading}</li>,
                <li key={o.id} data-index={i} role="option" aria-selected={o.id === value} className={`${i === active ? 'active' : ''}${o.id === value ? ' selected' : ''}`}
                  onPointerMove={() => setActive(i)} onPointerDown={(e) => e.preventDefault()} onClick={() => pick(o.id)}>
                  <span className="off">{o.label.split(') ')[0]})</span>{o.place}
                </li>,
              ]
            })}
            {shown.length === 0 && <li className="region" role="presentation">{t('No time zone matches "{query}"', { query })}</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
