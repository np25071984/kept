import type { LucideIcon } from 'lucide-react'

// An icon-only button for an action everyone recognises (VISION.md §4.C); the label is its tooltip and accessible name.
// `primary` is a section's own action, such as adding to it: outlined and in the accent colour, unlike the quiet row icons.
export function IconButton({ icon: Icon, label, onClick, danger, primary, disabled }: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean; primary?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={`icon-btn${danger ? ' danger' : ''}${primary ? ' outlined' : ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <Icon size={primary ? 18 : 16} strokeWidth={primary ? 2.25 : 2} aria-hidden="true" />
    </button>
  )
}
