<div align="center">

<img src="public/logo.png" alt="Manfaz VPN" width="112" height="112">

# Manfaz VPN

### A focused Windows client for resilient, verifiable connectivity.

[![Version](https://img.shields.io/badge/version-2.14.0-087f72?style=flat-square)](../../releases/latest)
[![Windows](https://img.shields.io/badge/Windows-10%20%2F%2011-0078D4?style=flat-square&logo=windows&logoColor=white)](https://microsoft.com/windows)
[![sing-box](https://img.shields.io/badge/sing--box-1.13-1f2937?style=flat-square)](https://github.com/SagerNet/sing-box)
[![License](https://img.shields.io/badge/license-MIT-f2c055?style=flat-square)](LICENSE)

[Explore releases](../../releases) · [Read the guide](#quick-start) · [Report an issue](../../issues)

</div>

---

Manfaz turns sing-box into a clean desktop workflow: add a subscription, choose a verified server, or connect through a continuously refreshed pool of free configurations. Every successful connection is checked against the real public IP before the app calls it online.

## Why Manfaz

- **Verified connections** — public-IP confirmation after every connection attempt.
- **Two paths online** — personal subscriptions and a self-refreshing free-config pool.
- **Resilient routing** — System Proxy, full-device TUN, DNS-aware direct routes, fallback control, smart reconnect, and upstream proxy chaining.
- **Censorship tooling** — native TLS record/handshake fragmentation, uTLS, ECH, SNI override, and clean Cloudflare IP discovery.
- **Safe recovery** — Windows proxy restoration, orphan-engine cleanup, and a verified-session Kill Switch that never arms during connection setup.
- **Permission-first updates** — background release discovery, post-connection retry, explicit download consent, progress reporting, and one-click restart.
- **Useful diagnostics** — live traffic, latency ranking, connection history, and structured logs.

## Quick start

1. Install Manfaz VPN on Windows 10 or 11 x64.
2. Add a V2Ray-compatible subscription, or open **Servers** and use the free pool.
3. Pick a server or let Manfaz race the best candidates.
4. Wait for IP verification; the status changes only after traffic is proven.

> Administrator access is required for TUN mode and the firewall-backed Kill Switch. System Proxy mode works without elevation.

## Connection modes

| Mode | Best for | Administrator |
|---|---|---:|
| **Auto** | Sensible fallback between available modes | Optional |
| **TUN** | Full-device routing | Required |
| **System Proxy** | Browsers and proxy-aware apps | No |

## Rescue profile

The rescue profile is deliberately opt-in. It can apply native sing-box TLS record fragmentation, full handshake fragmentation with a controlled fallback delay, and a provider-supplied SNI override. Auto DPI Bypass retries a failed, verified connection once with the stronger rescue profile.

Use the lightest option that works:

1. TLS Record Fragment
2. TLS Handshake Fragment
3. Custom SNI only when your provider supplies one

## Built-in tools

- Real service-access checks for Gemini, Telegram, X, and Instagram
- Cloudflare clean-IP scanner with optional background scheduling
- Subscription format converter
- SOCKS5 / HTTP upstream proxy
- Global uTLS and ECH controls
- Settings, subscriptions, manual nodes, free-pool and safety backup
- One-click network repair
- Browser virtual-location companion extension

## Building from source

```powershell
npm ci
npm run lint
npm run build
npm run dist:win
```

The Windows installer is written to `release/`. GitHub releases contain the tagged source and release notes; installer distribution is handled separately by the maintainer.

## Security notes

- Kill Switch arms only after a connection is verified, treats an absent firewall rule as a clean state, and releases safely before reconnecting.
- Custom SNI values are validated and should match a certificate accepted by the destination.
- Imported backups accept only Manfaz-owned settings files.
- No connection is marked successful until public-IP verification passes.

## Requirements

- Windows 10 or Windows 11, x64
- Administrator access for TUN and Kill Switch
- A V2Ray-compatible subscription, or access to the built-in free-config pool

## License

Released under the [MIT License](LICENSE).
