# Kept app icon

`icon.svg` is the master: a gold coin with a speech-bubble tail on the brand green. `web/public` serves a copy for tabs and the header logo, plus square PNGs rendered from it for home screens (`apple-touch-icon.png` 180, `icon-192.png`, `icon-512.png`), listed in `manifest.webmanifest`. It is drawn to read at 16px, so it stays two or three bold shapes with no thin lines or text. The PNGs are not maskable: Android's circle crop would cut the tail.

`icon-large.svg` redraws the same coin on a 512 grid with the detail the master leaves out (shading, a milled rim, engraved lines, a shadow), for the documents and anywhere the icon is shown at 128px or more. Change the design in both files.