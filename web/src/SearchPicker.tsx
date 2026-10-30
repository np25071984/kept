import { ChevronDown, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

export interface PickerOption {
  id: string
  // Shown muted before the label: a zone's offset, a currency's code.
  note: string
  label: string
  group?: string
}

// A dropdown you can type into (VISION.md §4.C): the options grouped under headings, filtered as you type;
// ↑/↓ and Enter pick, Escape closes.
export function SearchPicker({ kind, options, search, value, disabled, placeholder, empty, onChange }: {
  // Names the picker for styling: a zone's offset needs a wider note column than a currency's code.
  kind: string
  options: PickerOption[]
  search: (query: string) => PickerOption[]
  value: string
  disabled?: boolean
  placeholder: string
  empty: (query: string) => string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const shown = useMemo(() => search(query), [search, query])
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

  let group: string | undefined = ''
  return (
    <div className={`picker picker-${kind}`} ref={root}>
      <button type="button" className="picker-trigger" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? setOpen(false) : openPicker())}>
        <span className="off">{selected?.note}</span> {selected?.label ?? value}
        <span className="detail">{selected?.group}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="picker-panel">
          <span className="search-field">
            <Search size={16} aria-hidden="true" />
            <input autoFocus type="search" placeholder={placeholder} aria-label={placeholder} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0) }} onKeyDown={onKey} />
          </span>
          <ul ref={list} role="listbox" aria-label={placeholder}>
            {shown.map((o, i) => {
              const heading = o.group && o.group !== group ? (group = o.group) : null
              return [
                heading && <li key={`g-${heading}`} className="region" role="presentation">{heading}</li>,
                <li key={o.id} data-index={i} role="option" aria-selected={o.id === value} className={`${i === active ? 'active' : ''}${o.id === value ? ' selected' : ''}`}
                  onPointerMove={() => setActive(i)} onPointerDown={(e) => e.preventDefault()} onClick={() => pick(o.id)}>
                  <span className="off">{o.note}</span>{o.label}
                </li>,
              ]
            })}
            {shown.length === 0 && <li className="region" role="presentation">{empty(query)}</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
