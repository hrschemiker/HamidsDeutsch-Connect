# HamidsDeutsch Connect

A secure Windows desktop VPN client built with Electron, React, and TypeScript — powered by [sing-box](https://github.com/SagerNet/sing-box) and optimized for [BPB Panel](https://github.com/bia-pain-bache/BPB-Worker-Panel) with native Cloudflare support.

## Features

- One-click connection to BPB / Cloudflare-based proxies
- Automatic sing-box binary management (auto-download & update)
- Bulk import of direct domains
- Native Windows system integration (tray icon, auto-start)
- Automatic browser virtual location sync with connection state
- Clean, minimal React UI with real-time connection status

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **Desktop Shell:** Electron
- **Proxy Core:** sing-box
- **Packaging:** electron-builder (NSIS installer for Windows x64)

## Development

```bash
# Install dependencies
npm install

# Run in development mode (Vite + Electron)
npm run start

# Build and package (Windows installer)
npm run dist:win

# Build without installer (directory output)
npm run pack:win
```

## Requirements

- Windows 10/11 x64
- Node.js 18+ (for development)
- Internet connection to download sing-box binary on first run

## License

MIT
