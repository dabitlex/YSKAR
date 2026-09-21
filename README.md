# YSKAR Node Core 0.3.1

Native Windows desktop application for the YSKAR Full Node.

## What changed

- Native Electron desktop window instead of Microsoft Edge.
- Modern desktop UI inspired by Bitcoin Core / Electrum, with a cleaner 2026 visual language.
- Sidebar navigation: Overview, Blockchain, Peers, Settings.
- Existing YSKAR Full Node classes remain the backend.
- Data stays in `%LOCALAPPDATA%\YSKAR\Node`.
- Node Core configuration stays in `%LOCALAPPDATA%\YSKAR\Node Core\config.json`.
- P2P default port: 8646.
- Node API default port: 8645 on localhost.
- Default seed: `80.145.155.104:8646`.

## Build on Windows

Requirements:

- Node.js 22 or newer
- Windows 10/11
- The full YSKAR repository one directory above `node-core`
- Internet access for the first `npm install` so Electron can be downloaded

From `YSKAR-main\node-core`:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-desktop.ps1
```

The finished installer is created under:

`node-core\release\YSKAR-Node-Core-Setup-0.3.1.exe`

## Development

```powershell
npm install
npm start
```

Do not open the GUI URL manually. The application creates its own native desktop window.
