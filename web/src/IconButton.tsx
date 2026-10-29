import type { LucideIcon } from 'lucide-react'

// An icon-only button for an action everyone recognises (VISION.md §4.C); the label is its tooltip and accessible name.
export function IconButton({ icon: Icon, label, onClick, danger, disabled }: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={`icon-btn${danger ? ' danger' : ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <Icon size={16} aria-hidden="true" />
    </button>
  )
}
