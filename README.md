<div align="center">

<img src="public/logo.png" alt="Manfaz VPN" width="112" height="112">

# Manfaz VPN

### A Windows client that refuses to claim a connection it has not proven.

[![Version](https://img.shields.io/badge/version-2.25.0-087f72?style=flat-square)](../../releases/latest)
[![Windows](https://img.shields.io/badge/Windows-10%20%2F%2011-0078D4?style=flat-square&logo=windows&logoColor=white)](https://microsoft.com/windows)
[![sing-box](https://img.shields.io/badge/powered%20by-sing--box-1f2937?style=flat-square)](https://github.com/SagerNet/sing-box)
[![License](https://img.shields.io/badge/license-MIT-f2c055?style=flat-square)](LICENSE)

### [⬇ Download the installer for Windows](https://github.com/hrschemiker/ManfazVpn-Windows/releases/latest/download/Manfaz-VPN-Setup-x64.exe)

That link always points at the newest build. You can also browse every version on the
[releases page](https://github.com/hrschemiker/ManfazVpn-Windows/releases/latest).

</div>

---

Manfaz is a VPN client for Windows built around one rule: what the interface says must match
what the network is actually doing. A green indicator means traffic was observed leaving the
machine through the tunnel, not that a process started and a port opened.

It runs sing-box by default and can use Xray instead. Routing, DNS, failure recovery and
updates are handled as one lifecycle rather than as separate features that each leave their
own mess behind on Windows.

## What is in the box

The installer ships both engines, so nothing is downloaded on first launch:

| Component | Version | Purpose |
|---|---|---|
| sing-box | 1.13.12 | Default engine. Required for TUN. |
| Xray | bundled | Optional engine for VLESS, VMess, Trojan and Shadowsocks |
| wintun | bundled | Virtual adapter used by TUN mode |

## Connection modes

| Mode | What it does to the machine | Administrator |
|---|---|---:|
| **Auto** | Tries TUN, falls back to System Proxy if that is not possible | Optional |
| **TUN** | Routes all device traffic through a virtual adapter | Required |
| **System Proxy** | Routes proxy-aware applications through a local endpoint | Not needed |
| **DNS only** | Changes resolvers on active adapters and starts no tunnel | Required |

## How a connection is verified

Connecting is treated as a transaction with a rollback, not a fire and forget:

1. The selected node is compiled into an engine configuration and validated by the engine
   itself before anything on the system is touched.
2. Any Windows state that is about to change, including the proxy settings and per-adapter
   DNS, is captured first.
3. The engine starts and routing, proxy or DNS configuration is applied.
4. A public address service is queried through the tunnel. Reaching it proves that traffic
   leaves the machine and comes back. Where the address can also be read outside the tunnel,
   the two are compared and must differ.
5. Anything that fails at any step is rolled back to the captured state.

A health check runs while connected. It tolerates a run of failed probes before acting,
because the address services used for verification are regularly unreachable for a few
seconds at a time and a single timeout is not evidence that a tunnel has died.

## Kill Switch

The Kill Switch arms only after a session has been verified. It does not arm during startup,
during a mode change, or after a connection attempt that never succeeded, so a failed attempt
cannot leave the machine cut off.

When a tunnel drops without being asked to, every outbound connection is blocked with a
Windows Firewall rule. The application then raises its window, posts a notification, and adds
an entry to its tray menu, because the one thing you cannot rely on at that moment is the
ability to look something up online. Two choices are offered: reconnect through the VPN, or
lift the block and go back online without it. The block is verified as actually removed
before the app reports that the internet is back.

Removing the rule needs Administrator rights, so the setting is shown as unavailable, with
the reason, when the app is not elevated.

## DNS

DNS can be used on its own or alongside a tunnel, and the two behave differently on purpose.

**DNS only** changes the resolvers on every active Windows adapter. Before anything is
applied, the resolver is queried for real to confirm it answers. The previous configuration
of each adapter is recorded once and restored when the DNS session ends, when a VPN starts,
or when the application exits. If the app finds at startup that a saved configuration is no
longer applied everywhere, it restores the recorded baseline rather than leaving some
adapters pointed at a resolver nothing will clean up later.

**DNS with a tunnel** resolves names inside the engine instead of on the machine, so queries
do not travel to the local network's resolver. Encrypted transports are used where the
resolver supports them, and the server name and path are taken from the resolver you actually
selected. Built-in profiles cover Cloudflare, Cloudflare Family, Google, AdGuard, Shecan,
Radar and Electro. Custom IPv4 pairs are validated before they are stored.

Cloudflare Smart is the default. It scans Cloudflare's edge for an address that responds well
from your network and accepts one only after a real encrypted query succeeds, with 1.1.1.1 as
the fallback.

## Cloudflare clean addresses

Many configurations point at a hostname that resolves into Cloudflare's network, where some
edge addresses perform far better than others depending on the operator you are on. Manfaz
scans that space, keeps the best result, and substitutes it for the address in the
configuration when the hostname really does resolve into Cloudflare.

The substitution keeps everything the edge needs to route the request: the original hostname
stays as the TLS server name, and as the Host header for WebSocket and HTTP transports. This
applies to both System Proxy and TUN.

## Working around interference

- TLS record and handshake fragmentation
- A controlled DPI bypass retry when a first attempt passes no traffic
- Provider supplied SNI override
- Global uTLS fingerprint and ECH controls
- SOCKS5 and HTTP upstream proxy chaining
- Direct routing for chosen domains and applications, compiled into engine rules
- Subscription format conversion

## When something goes wrong

Windows keeps state that a crashed VPN client can leave behind, so the app cleans up after
itself and after previous runs: a stuck local proxy setting, orphaned engine processes holding
the ports, a leftover firewall block, and modified adapter DNS. There is also a one click
repair that runs all of it on demand.

Diagnostics record every attempt with its outcome, and connection history is kept per session
with duration, server and protocol.

## Getting started

1. Download and run the installer on Windows 10 or 11, 64 bit.
2. Start the app as Administrator if you want TUN, the Kill Switch, or system DNS changes.
   Without elevation the app still works over System Proxy.
3. Add a subscription link, paste a single configuration by hand, or pick a DNS profile.
4. Press connect. The progress panel shows which step is running, which server is being
   tried, and how long it has been working on it.

## Building from source

```powershell
npm ci
npm run lint
npm run build
npm run dist:win
```

The installer is written to `release/`. Note that `resources/sing-box/sing-box.exe` is not
kept in this repository. Put the official Windows build there before packaging, or let the
release workflow fetch it for you.

Releases are built by GitHub Actions on a Windows runner. Pushing a `v*` tag, or running the
Release workflow by hand with a tag name, produces the installer and publishes it.

## Requirements

- Windows 10 or Windows 11, x64
- Administrator access for TUN, the Kill Switch, and system DNS changes
- A subscription or configuration of your own

## License

Released under the [MIT License](LICENSE).
