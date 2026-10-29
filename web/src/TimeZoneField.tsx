// The household's time zone; the search picker comes in its own step.
export function TimeZoneField({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (zone: string) => void }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {Intl.supportedValuesOf('timeZone').map((zone) => <option key={zone} value={zone}>{zone}</option>)}
    </select>
  )
}
