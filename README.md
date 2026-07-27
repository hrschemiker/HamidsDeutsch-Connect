<div align="center">

<img src="public/logo.png" alt="Manfaz VPN" width="112" height="112">

# Manfaz VPN

### Reliable Windows connectivity, backed by sing-box and verified by real network state.

[![Version](https://img.shields.io/badge/version-2.18.0-087f72?style=flat-square)](../../releases/latest)
[![Windows](https://img.shields.io/badge/Windows-10%20%2F%2011-0078D4?style=flat-square&logo=windows&logoColor=white)](https://microsoft.com/windows)
[![sing-box](https://img.shields.io/badge/powered%20by-sing--box-1f2937?style=flat-square)](https://github.com/SagerNet/sing-box)
[![License](https://img.shields.io/badge/license-MIT-f2c055?style=flat-square)](LICENSE)

[Releases](../../releases) · [Getting started](#getting-started) · [Issues](../../issues)

</div>

---

Manfaz is a Windows connectivity client built around a simple rule: the reported state must match the real network state. It manages sing-box connections, system routing, DNS, recovery, and updates as one lifecycle—and verifies the public route before declaring a VPN connection successful.

## Core capabilities

- **Verified VPN sessions** — public-IP confirmation, connection health monitoring, latency ranking, and controlled recovery.
- **Multiple connection sources** — personal subscriptions, manual nodes, and a refreshed pool of tested public configurations.
- **Full routing coverage** — TUN for device-wide traffic, System Proxy for proxy-aware applications, and automatic fallback.
- **DNS as a real connection mode** — built-in or user-defined resolvers can be applied without starting a VPN.
- **Per-adapter DNS recovery** — the original Windows DNS configuration is captured once and restored on disconnect or shutdown.
- **Split routing** — direct domains and applications are compiled into sing-box routing rules for VPN bypass.
- **Censorship resilience** — TLS record fragmentation, handshake fragmentation, uTLS, ECH, SNI override, and Cloudflare IP discovery.
- **Failure-safe recovery** — Windows proxy repair, orphan-process cleanup, firewall state recovery, and explicit reconnect boundaries.
- **Permission-first updates** — background version checks, deferred retry after connectivity returns, consent before download, and restart-to-install.
- **Operational visibility** — live throughput, connection history, structured diagnostics, and service-access checks.

## Connection models

| Model | Network effect | Elevation |
|---|---|---:|
| **Auto** | Chooses TUN when available and falls back according to policy | Optional |
| **TUN** | Routes device traffic through the sing-box tunnel | Required |
| **System Proxy** | Routes proxy-aware applications through a local endpoint | No |
| **DNS only** | Changes resolver settings on active Windows adapters; no VPN starts | Required |

DNS profiles remain available while a VPN is active. When a profile is applied, Manfaz records the resolver configuration of every affected adapter. Disconnecting the DNS session, disconnecting the VPN, or exiting the application restores that exact baseline.

## Reliability model

Connection changes are treated as transactions:

1. validate the selected server or resolver;
2. capture the Windows state that may be changed;
3. apply routing, proxy, firewall, or DNS configuration;
4. verify the resulting network behavior;
5. roll back safely on failure or explicit disconnect.

The Kill Switch arms only after a verified VPN session exists. Expected stops, mode transitions, failed startup attempts, and ordinary application shutdown do not leave a stale firewall block behind.

## DNS profiles

Built-in profiles include Cloudflare, Cloudflare Family, Google, AdGuard, Shecan, Radar, and Electro. Custom IPv4 resolver pairs are validated before application, stored locally, prioritized over built-in profiles, and can be used either independently or alongside a VPN connection.

Cloudflare is the safe default when no custom profile exists.

## Rescue and routing tools

- TLS record and handshake fragmentation
- Controlled DPI-bypass retry
- Provider-supplied SNI override
- Global uTLS fingerprint and ECH controls
- SOCKS5 and HTTP upstream proxy chaining
- Cloudflare clean-IP scanner with scheduling
- Subscription conversion
- Direct-domain and direct-application routing
- Network repair and settings backup

## Getting started

1. Install Manfaz VPN on Windows 10 or 11 x64.
2. Run with Administrator access when using TUN, Kill Switch, or system DNS.
3. Add a compatible subscription, choose a tested public server, or select a DNS-only profile.
4. Connect and wait for verification.

## Build

```powershell
npm ci
npm run lint
npm run build
npm run dist:win
```

The local Windows installer is created in `release/`. Public releases contain the tagged source and release notes; installer distribution is maintained separately.

## Requirements

- Windows 10 or Windows 11, x64
- Administrator access for TUN, Kill Switch, and system DNS changes
- A compatible subscription for private VPN connections

## License

Released under the [MIT License](LICENSE).
