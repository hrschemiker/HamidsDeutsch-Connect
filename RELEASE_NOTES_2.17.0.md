# Manfaz VPN 2.17.0 — Routing That Goes Where You Expect

This release tightens the connection experience from the first click to the final route, with focused interface refinements and a substantial Windows networking pass.

## Connection workspace

- Centered live session time, upload, download, and speed-test metrics in the home hero.
- Moved Disconnect beneath the Manfaz connection mark and removed the redundant connection-type caption.
- Added clearer spacing between the language and appearance controls.

## Settings clarity

- Removed duplicate appearance controls already available in the application header.
- Removed the duplicate split-routing shortcut from Settings; its dedicated workspace remains the single source of truth.
- Moved long setting descriptions into compact information controls.
- Rebuilt information popovers as focused, dismissible overlays that cannot be clipped by cards.
- Simplified information icons to a single visual ring.

## Windows TUN and direct routing

- Let sing-box allocate a fresh TUN interface name to avoid collisions with stale Windows adapters.
- Switched to the Windows system network stack with a safer 1400 MTU.
- Relaxed strict routing while retaining DNS interception, avoiding known Windows DNS and application compatibility failures.
- Added protocol sniffing before domain routing so direct-site rules work even when the original hostname is not preserved by Windows.
- Removed the silent 500-domain truncation; up to 5,000 normalized entries are now honored.
- Separated IP/CIDR rules from domain rules and corrected subdomain suffix matching.
- Matched bypass applications by both executable name and full executable path.

## Automatic updates

- Added a GitHub API fallback through Electron's network stack when the standard updater feed is unreachable.
- Added streamed installer downloads with progress reporting and SHA-256 verification when GitHub provides a digest.
- Added an installer fallback that closes Manfaz only after the user explicitly chooses to install.
- Improved connected-state errors so a failed manual check no longer claims it is merely waiting for a VPN connection.
