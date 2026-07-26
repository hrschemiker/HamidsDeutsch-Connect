# Manfaz VPN 2.15.0 — Resolver Control

DNS settings now behave like a system feature instead of a cosmetic preference.

## What’s new

- Added three widely used Iranian resolver profiles: Shecan, Radar Game, and Electro.
- Added custom primary and optional secondary IPv4 DNS fields.
- Every resolver is queried before it is applied. An unreachable or invalid server leaves the current Windows DNS untouched.
- DNS changes are applied to every active physical Windows adapter and read back for verification.
- Original adapter DNS values are persisted safely and restored after an app restart, profile change, or reset to automatic DNS.
- Partial failures now trigger an immediate rollback instead of leaving adapters in a mixed state.
- Windows DNS cache is cleared after both apply and restore operations.
- DoH-capable international profiles remain encrypted on supported Windows 11 systems; Iranian and custom profiles are identified accurately as standard system DNS.
- Added responsive, theme-aware custom DNS controls with clear validation and application feedback.

## Resolver profiles

| Profile | Primary | Secondary |
|---|---:|---:|
| Shecan | `178.22.122.100` | `185.51.200.2` |
| Radar Game | `10.202.10.10` | `10.202.10.11` |
| Electro | `78.157.42.100` | `78.157.42.101` |

Administrator access is required because Windows protects system adapter DNS settings.
