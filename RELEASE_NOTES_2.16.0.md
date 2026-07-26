# Manfaz VPN 2.16.0 — A Calmer, Clearer Workspace

This release is a comprehensive interface refinement focused on clarity, accessibility, consistency, and dependable everyday use.

## Highlights

- Rebuilt the home connection hero with a clearer status hierarchy, stable live metrics, balanced connection choices, and a compact branded connection control.
- Reorganized Settings with a sticky section navigator, stronger visual grouping, clearer state labels, and more predictable control behavior.
- Replaced platform-dependent symbols and emoji with a unified set of custom Manfaz vector icons.
- Added full keyboard semantics and focus treatment to the interactive connection control.
- Improved light and dark theme contrast, spacing, responsive behavior, disabled states, and reduced-motion support.
- Added explicit ON/OFF labels to switches and accessible names to interactive settings.
- Clarified update status so a version is never described as current before the first successful check.
- Localized previously mixed English section labels throughout the Persian interface.

## Reliability

- Hardened automatic-update state handling against missing, malformed, or partial responses.
- Fixed the renderer crash caused by an unavailable update state.
- Kept technical crash details available on demand without exposing raw diagnostics as the primary error message.
- Consolidated the final hero and settings presentation layer to prevent theme and breakpoint overrides from drifting apart.

## Validation

- TypeScript production build
- ESLint
- Light-theme visual review
- Dark-theme contrast review
- Home and Settings interaction review
- Renderer console error check
- Windows NSIS installer build
