import { WatchingSection } from './Memory.js'

// Preferences, from the user menu: what the member's assistant watches for and reminds them about (VISION.md §4.C).
export function PreferencesPage() {
  return (
    <>
      <div className="page-head"><h1>Preferences</h1></div>
      <p className="muted small">What your assistant watches for and reminds you about. Only you see these; set them here or tell your assistant.</p>
      <WatchingSection />
    </>
  )
}
