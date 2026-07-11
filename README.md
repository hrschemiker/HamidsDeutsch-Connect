<div align="center">

<img src="public/logo.png" alt="HamidsDeutsch Connect" width="110" height="110">

# HamidsDeutsch Connect

**Free Internet Access for Windows — One Click, Zero Configuration**

[![Platform](https://img.shields.io/badge/Windows-10%2F11%20x64-0078D4?logo=windows&logoColor=white)](https://microsoft.com/windows)
[![Electron](https://img.shields.io/badge/Electron-v42-47848F?logo=electron&logoColor=white)](https://electronjs.org)
[![sing‑box](https://img.shields.io/badge/sing--box-v1.13-FF6B35)](https://github.com/SagerNet/sing-box)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)
[![Version](https://img.shields.io/badge/Version-2.4.2-f2c055)](../../releases/latest)

[**⬇ Download Latest Release**](../../releases/latest)

</div>

---

## What is it?

HamidsDeutsch Connect is a Windows desktop application that gets you past internet censorship. It wraps [sing-box](https://github.com/SagerNet/sing-box) in a clean UI and supports six different connection methods — from free public servers to fully auto-deployed private panels on Cloudflare Workers — all manageable from a single window.

---

## Connection Methods

| | Method | Cost | Setup |
|---|---|---|---|
| 📋 | **V2Ray Subscription** | Free / Paid | Paste a subscription URL |
| 🆓 | **Free Servers** | Free | Zero — just click |
| ☁️ | **BPB Panel** | Free | Cloudflare account |
| ⚡ | **Zeus Panel** | Free | Cloudflare account |
| 🌀 | **Cloudflare WARP** | Free | One-time account creation |
| 🐙 | **GitHub Codespace** | Free (120h/mo) | GitHub account |

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

1. Go to [**Releases**](../../releases/latest) and download `HamidsDeutsch-Connect-Setup-2.4.2-x64.exe`
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
<summary><b>🆓 Free Servers</b></summary>

Click **Free Server** on the home screen. The app fetches configs from public repositories, tests them, and connects to the fastest one automatically.

On disconnect it finds a replacement without any action from you.

**Telegram auto-source:** while you are connected through *any* method, the app quietly reads the latest ~200 posts of a curated Telegram configs channel through your active tunnel (Telegram is blocked in Iran, so this only works once you're already connected). Working configs it finds are added to your pool and shown first, so your next free connection uses fresh, hand-picked servers.

</details>

<details>
<summary><b>☁️ BPB Panel — Auto Deploy</b></summary>

BPB is a free VLESS/Trojan proxy panel that runs on Cloudflare Workers.

**Prerequisite:** A free [Cloudflare](https://cloudflare.com) account

1. Open the **BPB** menu item (left sidebar) — this is where setup and settings live
2. Click **Login to Cloudflare** — a browser window opens
3. Authorize the app in Cloudflare
4. Click **Deploy Panel** — the app creates the Worker automatically
5. Back on the **home screen**, the **BPB Panel** button now connects (and stops) directly — no need to reopen the menu

</details>

<details>
<summary><b>⚡ Zeus Panel — Auto Deploy</b></summary>

Zeus is a free VLESS panel that runs on Cloudflare Workers. The app handles the entire deployment — no manual steps.

**Prerequisite:** A free [Cloudflare](https://cloudflare.com) account

1. Open the **Zeus Panel** menu item (left sidebar) — this is where setup and settings live
2. Click **Login to Cloudflare & Deploy Panel**
3. Log into Cloudflare in the browser that opens
4. The app automatically creates a D1 database, deploys the Worker, creates your account, and generates a subscription URL
5. Back on the **home screen**, the **Zeus Panel** button now connects (and stops) directly

</details>

<details>
<summary><b>🌀 Cloudflare WARP</b></summary>

WARP is a free WireGuard tunnel to Cloudflare's network — no panel or subscription needed.

1. Open **Tools** → **WARP** and click **Create Account** (one time only)
2. Click **Cloudflare WARP** on the home screen to connect

</details>

<details>
<summary><b>🐙 GitHub Codespace</b></summary>

Runs a private proxy inside a GitHub Codespace — no VPS or external server required.

**Prerequisite:** A free [GitHub](https://github.com) account

1. Go to GitHub → **Settings** → **Developer settings** → **Personal access tokens (classic)**
2. Generate a token with `repo` and `codespace` scopes
3. In the app go to **Settings** → **GitHub**, enter your token and save
4. Click **GitHub Codespace** on the home screen

> Free GitHub accounts include 120 hours/month of Codespace usage.

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
