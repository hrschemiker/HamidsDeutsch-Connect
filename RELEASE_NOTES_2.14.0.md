# Manfaz VPN 2.14.0 — Signal & Route

This release tightens the parts of a VPN client that have to be boringly reliable: disconnect safety, split routing, desktop-app coverage, and updates.

## Highlights

- Rebuilt Kill Switch lifecycle around verified sessions. It no longer arms during startup, configuration checks, server changes, or Direct Sites reloads.
- Made Windows Firewall cleanup idempotent. A missing `ManfazVPN Kill Switch` rule is now a successful clean state instead of a noisy `netsh` failure.
- Fixed Direct Sites in TUN mode with DNS interception, direct-domain DNS rules, and matching exact/suffix route rules.
- Routed TUN DNS through the proxy by default while keeping bypass-domain resolution direct, preventing DNS leaks without breaking local routes.
- Upgraded service-access diagnostics from a proxy handshake test to real TLS + HTTP response validation.
- Added first-class Gemini and Telegram compatibility checks, including accurate 403 detection.
- Added a permission-first application updater: background checks at launch, retry after a verified connection, explicit download approval, progress, and install/restart.
- Introduced a custom Manfaz SVG icon system for navigation, connection states, protocol badges, safety, and diagnostics.
- Removed superseded release notes and internal integration leftovers from the repository.

## Notes

- TUN remains the recommended mode for Telegram Desktop and other applications that do not consistently follow the Windows System Proxy.
- A 403 returned by Gemini is an exit-IP policy response. Manfaz now identifies it correctly so the user can switch to a compatible server instead of seeing a false “reachable” result.
- Automatic installation requires the NSIS installer and `latest.yml` to be present on the configured update provider. The maintainer’s local installer remains outside this GitHub release.
