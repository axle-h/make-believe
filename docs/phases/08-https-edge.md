---
phase: 8
title: HTTPS at the edge
status: not-started
updated: 2026-09-01
---

# Phase 8 — HTTPS at the edge

## Goal

The app is reachable from phones and the TV at `https://believe.ax-h.com`, with the WebSocket upgrade passing through Traefik. This is a prerequisite for phase 9: Android Chrome will not register a service worker or offer to install a PWA on a plain `http://` origin. It also turns on Wake Lock and clipboard on phones.

## Read first

`CLAUDE.md` Deployment section, phase 7 (namespace and service names), and the two sibling ingresses: `~/projects/gb/k8s/ingress.yml` and `~/projects/make-movies/k8s/ingress.yml`. Copy the gb one; it is the newer of the two.

## How TLS already works here (verified 2026-09-01, do not re-discover)

- Every app is a subdomain of `ax-h.com`, DNS at Porkbun. Each subdomain is a public **A record pointing at the home's public IP** (`gb.ax-h.com`, `movies.ax-h.com`, `sso.ax-h.com`, `money.ax-h.com`, `home.ax-h.com`, `risk.ax-h.com`). There is no wildcard record, so `believe.ax-h.com` does not resolve until it is added.
- The records are maintained by a `ddns` CronJob in the `ddns` namespace, hourly. It takes the comma-separated `DOMAINS` list from the `ddns` ConfigMap and points each name at the current public IP via the Porkbun API. **Adding a hostname means adding it to that list.** The ConfigMap also holds credentials, so do not paste its contents into this repo, logs, or a handoff.
- The router forwards 80 and 443 to the k3s node (`10.0.0.10`), where Traefik's LoadBalancer service listens. LAN devices resolve the public IP and the router hairpins it back in; verified with `curl https://gb.ax-h.com/` from a LAN machine returning 200 with a valid certificate. So phones and the Fire TV on the LAN just use the public name. No local DNS involved.
- Certificates: cert-manager `ClusterIssuer` **`letsencrypt-production`** using an **HTTP-01** solver through the `traefik` ingress class. No DNS-01, no API keys needed by cert-manager. A new Ingress with the annotation gets its certificate within a minute or two once DNS resolves publicly.
- Each namespace has its own Traefik `Middleware` named `redirect-http-https` and the Ingress references it as `<namespace>-redirect-http-https@kubernetescrd`. The namespace name is therefore load-bearing.
- Ingresses use `ingressClassName: traefik`, TLS secret named `<app>-axh-com-tls`, backend `service.port.name: http`.
- **The ingress is public.** Anyone on the internet can open the pages; the 4-letter room code is the only thing gating a join. Acceptable for this app (no persistence, no accounts), but the relay must keep rejecting unknown codes and the host page must not leak the code anywhere but the TV.

## Tasks

- [ ] Hostname is **`believe.ax-h.com`**, decided by Alex on 2026-09-01. Do not use `make-believe.ax-h.com`; `make-believe` stays the name for the namespace, image, deployment, service, and secrets. Already recorded as D-001 in `DECISIONS.md`.
- [ ] DNS: add the hostname to `DOMAINS` in the `ddns` ConfigMap. The ConfigMap is applied from wherever Alex keeps the ddns manifests (probably `~/projects/ddns`), not edited live; find that file, add the name, apply it, then run the job now rather than waiting an hour:
  ```sh
  kubectl -n ddns create job --from=cronjob/ddns ddns-manual-$(date +%s)
  kubectl -n ddns logs job/<that job>
  dig +short believe.ax-h.com @1.1.1.1     # the public IP
  ```
- [ ] `k8s/redirect-http-https.yml`: the Traefik `Middleware`, copied verbatim from gb.
- [ ] `k8s/ingress.yml`: copied from gb with host `believe.ax-h.com`, service `make-believe` port `http`, secret `make-believe-axh-com-tls`, middleware `make-believe-redirect-http-https@kubernetescrd`, `ingressClassName: traefik`, `cert-manager.io/cluster-issuer: letsencrypt-production`. A comment at the top noting that `/ws` is a long-lived WebSocket and that Traefik passes upgrades with no configuration.
- [ ] Apply: middleware first, then ingress. Watch `kubectl -n make-believe get certificate` until `READY True`.
- [ ] Verify the WebSocket through the edge with a real connection, not a page load: `pnpm dlx wscat -c 'wss://believe.ax-h.com/ws?role=host&room=ZZZZ'` or the phase 1 integration client pointed at the public URL. Then the full manual check below.
- [ ] Server: no changes expected. `X-Forwarded-Proto` is set by Traefik but nothing in the server builds absolute URLs. Confirm and note it.
- [ ] Host page QR (phase 6) uses `window.location.origin`, so it now encodes `https://believe.ax-h.com/?room=…` with no change. Confirm, and remove the "open the TV by LAN IP" note from the README.
- [ ] Wake Lock on the player page confirmed working on a real Android phone now that the origin is secure.
- [ ] `k8s/README.md`: extend with the DNS step, the middleware-then-ingress order, and the certificate check, in the style of the gb README.
- [ ] Root README: "Reaching it" section: TV opens `https://believe.ax-h.com/host/`, phones scan the QR.

## Acceptance

```sh
kubectl apply --dry-run=client -f k8s/redirect-http-https.yml -f k8s/ingress.yml
kubectl -n make-believe get certificate make-believe-axh-com-tls -o jsonpath='{.status.conditions[0].status}'   # True
curl -fsS https://believe.ax-h.com/healthz
curl -sS -o /dev/null -w '%{http_code}\n' http://believe.ax-h.com/healthz    # 301 or 308 to https
```

Manual check: `https://believe.ax-h.com/host/` on a laptop, `https://believe.ax-h.com/` on a phone on the LAN and once on mobile data, join, move the square, no certificate warning on either.

## Handoff

- **State:** not started.
- **Next step:** the DNS step: add `believe.ax-h.com` to the ddns DOMAINS list.
- **Known issues:** none.
