// The create-household page's time zone picker: the same search as the web app's (VISION.md §3.6), built over the
// page's <select>, which stays the form field and works without JavaScript. Matches on place, region or zone ID,
// ignoring case and accents, as searchZones in src/domain/timezones.ts does. ↑/↓ and Enter pick, Escape closes.

export const ZONE_PICKER_SCRIPT = `(() => {
  const select = document.getElementById('timezone')
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if ([...select.options].some((o) => o.value === zone)) select.value = zone
  const fold = (s) => s.normalize('NFD').replace(/\\p{Diacritic}/gu, '').toLowerCase()
  const options = [...select.options].map((o) => ({ id: o.value, label: o.text, region: o.parentElement.label || '', place: o.text.replace(/^\\([^)]*\\) /, '') }))
  const el = (tag, cls, text) => {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
  }
  const picker = el('div', 'picker')
  const trigger = el('button', 'picker-trigger')
  trigger.type = 'button'
  trigger.id = 'timezone-picker'
  trigger.setAttribute('aria-haspopup', 'listbox')
  trigger.setAttribute('aria-expanded', 'false')
  const panel = el('div', 'picker-panel')
  panel.hidden = true
  const search = el('input')
  search.type = 'search'
  search.placeholder = select.dataset.search
  search.setAttribute('aria-label', select.dataset.search)
  const list = el('ul')
  list.setAttribute('role', 'listbox')
  panel.append(search, list)
  picker.append(trigger, panel)
  select.hidden = true
  select.after(picker)
  document.querySelector('label[for="timezone"]').htmlFor = 'timezone-picker'

  let shown = options
  let active = 0
  const showSelected = () => {
    const o = options.find((x) => x.id === select.value)
    trigger.replaceChildren(el('span', 'off', o ? o.label.slice(0, o.label.indexOf(') ') + 1) : ''), el('span', '', o ? o.place : select.value), el('span', 'detail', o ? o.region : ''))
  }
  const render = () => {
    const q = fold(search.value.trim())
    shown = q ? options.filter((o) => fold(o.place).includes(q) || fold(o.region).includes(q) || fold(o.id).includes(q)) : options
    let region = ''
    list.replaceChildren()
    shown.forEach((o, i) => {
      if (o.region !== region) {
        region = o.region
        const head = el('li', 'region', region)
        head.setAttribute('role', 'presentation')
        list.append(head)
      }
      const item = el('li', (i === active ? 'active' : '') + (o.id === select.value ? ' selected' : ''))
      item.setAttribute('role', 'option')
      item.setAttribute('aria-selected', String(o.id === select.value))
      item.dataset.index = String(i)
      item.append(el('span', 'off', o.label.slice(0, o.label.indexOf(') ') + 1)), o.place)
      item.addEventListener('pointermove', () => { if (active !== i) { active = i; render() } })
      item.addEventListener('pointerdown', (e) => e.preventDefault())
      item.addEventListener('click', () => pick(o.id))
      list.append(item)
    })
    if (!shown.length) list.append(el('li', 'region', select.dataset.none.replace('{query}', search.value)))
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' })
  }
  const open = () => {
    search.value = ''
    active = Math.max(0, options.findIndex((o) => o.id === select.value))
    panel.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    render()
    search.focus()
  }
  const close = () => {
    panel.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
  }
  const pick = (id) => {
    select.value = id
    showSelected()
    close()
    trigger.focus()
  }
  trigger.addEventListener('click', () => (panel.hidden ? open() : close()))
  search.addEventListener('input', () => { active = 0; render() })
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') active = Math.min(shown.length - 1, active + 1)
    else if (e.key === 'ArrowUp') active = Math.max(0, active - 1)
    else if (e.key === 'Enter') { if (shown[active]) pick(shown[active].id) }
    else if (e.key === 'Escape') { close(); trigger.focus() }
    else return
    e.preventDefault()
    if (!panel.hidden) render()
  })
  document.addEventListener('pointerdown', (e) => { if (!picker.contains(e.target)) close() })
  showSelected()
})()`

export const ZONE_PICKER_STYLE = `
  .picker { position: relative; }
  .picker-trigger { display: flex; width: 100%; gap: 8px; align-items: center; margin: 0; padding: 12px; text-align: left; white-space: nowrap; overflow: hidden; font-weight: 400; background: transparent; color: inherit; border: 1px solid var(--line); }
  .picker-trigger[aria-expanded="true"] { outline: 2px solid var(--accent); outline-offset: 1px; }
  .picker-trigger .detail { margin-left: auto; color: var(--muted); font-size: 13px; }
  .picker-panel { position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 20; padding: 6px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 12px 32px rgb(0 0 0 / 0.16); }
  .picker-panel input { padding: 8px 10px; }
  .picker-panel ul { list-style: none; margin: 6px 0 0; padding: 0; max-height: 260px; overflow-y: auto; }
  .picker-panel li { display: flex; gap: 8px; padding: 6px 8px; border-radius: 6px; font-size: 14px; cursor: pointer; }
  .picker-panel li.region { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; cursor: default; padding-top: 10px; }
  .picker-panel li.active { background: color-mix(in srgb, var(--line) 50%, transparent); }
  .picker-panel li.selected { color: var(--accent); font-weight: 600; }
  .picker .off { font-variant-numeric: tabular-nums; color: var(--muted); min-width: 92px; }
  .picker-trigger .off { min-width: 0; }
  .picker li.selected .off { color: inherit; }
`
