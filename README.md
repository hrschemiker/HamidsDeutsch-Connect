<div align="center">

<img src="public/logo.png" alt="Manfaz VPN" width="110" height="110">

# Manfaz VPN

**Free Internet Access for Windows — One Click, Zero Configuration**

[![Platform](https://img.shields.io/badge/Windows-10%2F11%20x64-0078D4?logo=windows&logoColor=white)](https://microsoft.com/windows)
[![Electron](https://img.shields.io/badge/Electron-v42-47848F?logo=electron&logoColor=white)](https://electronjs.org)
[![sing‑box](https://img.shields.io/badge/sing--box-v1.13-FF6B35)](https://github.com/SagerNet/sing-box)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)
[![Version](https://img.shields.io/badge/Version-2.7.0-f2c055)](../../releases/latest)

[**⬇ Download Latest Release**](../../releases/latest)

</div>

---

## What is it?

Manfaz VPN is a Windows desktop application that gets you past internet censorship. It wraps [sing-box](https://github.com/SagerNet/sing-box) in a clean UI with two connection methods — your own V2Ray subscription, and a self-updating pool of free configs curated from Telegram — all in a single window.

---

## Connection Methods

| | Method | Cost | Setup |
|---|---|---|---|
| 📋 | **V2Ray Subscription** | Free / Paid | Paste a subscription URL |
| 🆓 | **Free Configs** | Free | Zero — just click |

---

## Features

- **Auto Cloudflare IP Scan** — runs in the background at startup, silently replaces server IPs with the fastest clean Cloudflare IP for your ISP
- **Race-dial** — tests top 3 servers in parallel, connects to whichever responds first
- **uTLS + ECH + Fragment** — TLS fingerprint spoofing, encrypted SNI, and packet fragmentation to defeat deep packet inspection
- **TUN Mode** — system-level network routing; captures all traffic, not just browser traffic (requires Administrator)
- **Bandwidth Monitor** — live upload/download speed bar while connected
- **IP Verification** — confirms your IP actually changed after every connection
- **Smart Reconnect** — detects drops and automatically tries a replacement server
- **QR Code sharing** — tap any server to show its QR code
- **Settings Backup** — export and restore all settings as a single JSON file
- **Upstream Proxy** — chain through an existing SOCKS5 or HTTP proxy

---

## Installation

1. Go to [**Releases**](../../releases/latest) and download `Manfaz-VPN-Setup-2.7.0-x64.exe`
2. Run the installer — no extra dependencies required
3. The app launches automatically after installation

> For TUN Mode and complete firewall control, right-click the app and choose **Run as Administrator**.

---

## Connection Guide

<details>
<summary><b>📋 V2Ray Subscription</b></summary>

1. Open the **Subscriptions** tab and paste your subscription URL
2. Servers load automatically — click ▶ next to any server to connect
3. Or press **Connect to Best Server** on the home screen for auto race-dial

The app automatically swaps `workers.dev` server IPs with the fastest clean Cloudflare IP found during the background scan.

</details>

<details>
<summary><b>🆓 Free Configs (Telegram-powered)</b></summary>

Free configs are curated from two Telegram channels and kept fresh automatically:

1. **First run:** connect once through your own **subscription**. As soon as you're online, the app reads the latest ~200 posts of each channel *through your tunnel* (Telegram is blocked in Iran, so this only works once you're connected) and stores every config it finds.
2. **Testing:** press **Test** — the app warns you it will disconnect, then connects to each config one-by-one, keeps the ones that actually pass traffic, and deletes the rest.
3. **From then on:** every time you connect (subscription *or* free), it looks for new posts and saves them; every time you disconnect or reopen the app, it re-tests.

Configs are shown as a random 6-digit id plus the **country flag** of the server IP — never a name. Connecting to a free config is identical to connecting to a subscription config.

</details>

---

## Advanced Tools

<details>
<summary><b>uTLS, ECH and Fragment</b></summary>

Available in the **Tools** tab:

- **uTLS Fingerprint** — make your TLS handshake look like Chrome, Firefox, or Safari
- **ECH** — encrypt the server name inside the TLS handshake
- **Fragment** — split TLS ClientHello packets into fragments to defeat stateful DPI

</details>

<details>
<summary><b>Cloudflare IP Scanner</b></summary>

Runs automatically at startup. Scans Cloudflare IP ranges and caches the lowest-latency clean IP for your network. All connections to `workers.dev` and `pages.dev` nodes use this IP automatically.

You can trigger a manual scan or configure a recurring schedule from the **Tools** tab.

</details>

<details>
<summary><b>Settings Backup & Restore</b></summary>

**Tools** → **Backup** — export all settings (subscriptions, TLS config, proxy settings, WARP account) to a JSON file. Import it on any other machine to restore everything instantly.

</details>

<details>
<summary><b>Upstream Proxy</b></summary>

**Tools** → **Upstream Proxy** — route all app traffic through an existing SOCKS5 or HTTP proxy before it reaches the remote server.

</details>

---

## Requirements

- Windows 10 or 11 (64-bit)
- Administrator rights for TUN Mode only

---

## License

[MIT](LICENSE)
