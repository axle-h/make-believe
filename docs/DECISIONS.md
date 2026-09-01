# Decisions made during implementation

Numbered, append-only. Record choices that `CLAUDE.md` does not already settle and that a later session might otherwise reopen. Do not re-record decisions already listed in `CLAUDE.md` under "Decisions already made".

Format:

```
## D-0NN — <short title> (2026-09-01, phase N)
**Context:** why a choice was needed.
**Decision:** what was chosen.
**Consequences:** what this rules in or out later.
```

## D-001 — Public hostname is `believe.ax-h.com` (2026-09-01, planning)
**Context:** the app needs a subdomain of `ax-h.com` for TLS and the PWA. `make-believe.ax-h.com` was the other candidate.
**Decision:** Alex chose `believe.ax-h.com`. Everything else that needs a name (namespace, image, deployment, service, TLS secret, middleware prefix) uses `make-believe`.
**Consequences:** the QR code, the Fire TV wrapper's `HOST_URL`, and the README all point at `https://believe.ax-h.com`. Renaming later would mean a new certificate and a new ddns entry.

## D-002 — TV wrapper lives in `androidtv/`, minSdk 28 (2026-09-01, planning)
**Context:** the wrapper was first planned as `firetv/`, but nothing in it is Fire-specific: leanback launcher, banner, WebView, ADB install and remote keycodes are all standard Android TV.
**Decision:** the folder is `androidtv/` and the app is a plain Android TV app. Target device is Alex's Fire TV Stick 4K Max 1st gen (AFTKA, Fire OS 7, Android 9, API 28), so `minSdk = 28`.
**Consequences:** any Android TV box on API 28+ can run it. Fire OS 5 sticks are not supported and nobody should lower the build target for them.
