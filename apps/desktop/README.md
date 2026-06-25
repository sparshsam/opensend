# OpenSend Desktop (Windows)

Electron-based desktop wrapper for the OpenSend web app. Provides native Windows features: installer, file dialogs, drag-and-drop, file associations, and auto-update.

## Prerequisites

- Node.js 22+
- npm
- Windows build tools (for electron-builder on Windows)

## Quick Start

```bash
# 1. Install dependencies
npm run desktop:install

# 2. Build the web app (static export)
npm run build

# 3. Generate icons
npm run desktop:icons

# 4. Run in development
npm run desktop:start

# 5. Build Windows installer
npm run desktop:build
```

## Output

Build artifacts go to `dist/desktop/`:
- `OpenSend-0.7.0-x64.exe` — NSIS installer
- `OpenSend-0.7.0-x64-portable.exe` — Portable version (no install)
- `OpenSend-0.7.0-x64.msix` — Microsoft Store package

## File Associations

The installer registers `.opensend` file extension with OpenSend. Double-clicking
an `.opensend` file opens the app.

## Auto-Update

Uses `electron-updater` with GitHub releases as the update source.
On startup, the app checks `github.com/sparshsam/opensend/releases/latest`
for a newer version.

## Store Metadata

Store listing assets are in `public/`:
- `play-store-feature-graphic.png` (can be reused)
- `play-store-icon.png`

For Microsoft Store, additional assets needed:
- Store logo (300x300)
- Screenshots (1280x800 minimum)
- Promotional images

## Architecture

```
apps/desktop/
├── package.json          # Dependencies + electron-builder config
├── electron/
│   ├── main.js           # Main process (window, menu, IPC)
│   └── preload.js        # Context bridge for renderer
├── resources/
│   └── icon.ico          # Windows icon (16-256px)
root../
├── out/                  # Next.js static export (built separately)
└── public/               # Web app public assets
```

The desktop app loads the static web export from `out/index.html`.
All API calls go to `https://send.kovina.org` (production server).
