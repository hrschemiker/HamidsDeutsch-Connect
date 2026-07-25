# Manfaz VPN 2.13.0 — Clearer by Day. Safer by Design.

This release tightens the parts of Manfaz that matter most when a connection becomes unreliable: recovery, visual clarity, and honest system feedback.

## Highlights

### A Kill Switch you can recover from

The firewall guard now steps aside before a reconnect attempt, allowing sing-box to establish a fresh tunnel instead of blocking its own recovery path. Failed firewall activation is no longer presented as an active lock, TUN reconnects correctly clear stale rules, and Network Repair reports partial failures instead of a false success.

### Rescue controls that do real work

TLS Record Fragment and TLS Handshake Fragment now map to sing-box's native `record_fragment` and `fragment` options. The configured fallback delay is applied to full handshake fragmentation, while Auto DPI Bypass keeps its stronger one-time retry behavior.

### A cleaner light theme

- White-on-teal labels for filled green actions
- White-on-amber labels for filled warning actions
- Light neutral surfaces for domain import, engine versions, extension steps, and custom SNI
- Consistent corner radii across all four components
- More breathing room between server states, Safety, Rescue, and Tools sections

### Safer settings and recovery tools

- Settings backups now cover app preferences, subscriptions, manual and hidden nodes, split tunneling, Kill Switch state, the free pool, uTLS, scanner, and upstream proxy settings
- Restore accepts only known Manfaz settings files
- Network Repair identifies the exact recovery step that failed
- Kill Switch toggle failures roll back cleanly in the interface

## Under the hood

- Updated product copy and project documentation
- Refined responsive spacing without removing any existing feature
- Added stricter recovery-state handling around engine startup
- Kept production build and lint checks clean
