# Changelog — @jay-framework/wix-media

## Unreleased

### Added

1. **`WIX-MEDIA-NO-DIMENSIONS` warning** in the `media-optimization` validator: an `<img src>` or
   `<video poster>` bound to a `wix-image` tag with no reserved space (no `width`+`height`, no
   inline `aspect-ratio` or `width`+`height`) causes layout shift. Suppress per page with
   `wix-media: { allow-unsized-media: true }`. New guide section `wix-media.md` → Reserve space (CLS).

### Fixed

1. Validator messages pointed at `agent-kit/wix-media.md`, which does not exist; they now point at
   `agent-kit/designer/wix-media.md`.
