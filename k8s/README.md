# Kubernetes deployment

k3s, one namespace per app, one pod, reached at <https://believe.ax-h.com> through traefik with a
cert-manager certificate.

⚠️ **One replica, always.** The world — the host socket, its players, the current session code — is held
in the pod's memory and nothing is persisted. Two pods would be two worlds behind one address, and
the TV and the phones would land in whichever one the Service happened to pick. `replicas: 1` and
`strategy: Recreate` in `make-believe/deployment.yml` are both about that, and neither is a tuning
knob. Scaling this app up is not a trade-off; it is a bug.

## Deploy

The image has to exist first: it is published by the `container` workflow on every push to `main`,
so there is nothing to build by hand (see *The image*, below).

```shell
# ⚠️ The namespace must be `make-believe`: the ingress names its redirect middleware as
# `make-believe-redirect-http-https@kubernetescrd`, and traefik resolves that by namespace. Rename
# the namespace and the redirect silently stops existing.
kubectl create namespace make-believe

# Deployment and service in one go.
kubectl -n make-believe apply -f ./make-believe

# ⚠️ The middleware before the ingress: an ingress naming a middleware that is not there yet is
# accepted by the API server and then serves a 500 from traefik until it appears.
kubectl -n make-believe apply -f ./redirect-http-https.yml
kubectl -n make-believe apply -f ./ingress.yml

# Check it is up: the pod Running and Ready, the service holding an endpoint, the certificate issued.
kubectl -n make-believe rollout status deploy/make-believe
kubectl -n make-believe get all
kubectl -n make-believe get certificate     # READY True, within a minute or two
```

### DNS

`believe.ax-h.com` is a public A record pointing at the house's IP, maintained hourly by the `ddns`
CronJob in the `ddns` namespace from the comma-separated `DOMAINS` list in its ConfigMap. Adding a
hostname means adding it to that list and then running the job rather than waiting an hour:

```shell
kubectl -n ddns create job --from=cronjob/ddns ddns-now-$(date +%s)
dig +short believe.ax-h.com @1.1.1.1     # the house's public IP
```

⚠️ **The certificate cannot be issued before that resolves publicly.** cert-manager solves HTTP-01,
so Let's Encrypt has to reach `http://believe.ax-h.com/.well-known/acme-challenge/…` from the
internet. A `Certificate` stuck at `READY False` with an order that never completes is almost always
DNS, not cert-manager.

### Checking it from outside

```shell
curl -fsS https://believe.ax-h.com/healthz                                  # ok
curl -sS -o /dev/null -w '%{http_code}\n' http://believe.ax-h.com/healthz   # 308 to https
```

The WebSocket is the part worth proving separately, because a page load will not: it opens `/ws`
only after the JavaScript runs, and a broken upgrade looks like a TV that never gets a player.

```shell
pnpm dlx wscat -c 'wss://believe.ax-h.com/ws?role=host'
```

⚠️ That connection **takes the world** from whatever TV is running it. It should answer with a
`session` message; hang up as soon as it does.

TV: <https://believe.ax-h.com/host/>. Phones open <https://believe.ax-h.com/> — which is all the QR
code on the TV holds, built from the page's own origin, so it carries the public name here.

## The image

`ghcr.io/axle-h/make-believe:latest`, built from the repo root `Dockerfile`: a `node:22-alpine`
build stage that runs `pnpm build`, and a runtime stage holding one bundled server file and the
built pages — no `node_modules` at all.

`.github/workflows/container.yml` publishes it on every push to `main`, **after** a smoke test that
starts the image the way the Deployment does and proves it serves both pages and relays a join — so
`:latest` is always an image that was seen to work. Every build is also tagged with its commit,
which is the tag to pin or roll back to:

```shell
kubectl -n make-believe set image deploy/make-believe make-believe=ghcr.io/axle-h/make-believe:<sha>
```

`imagePullPolicy: Always` on `:latest` means a rollout restart picks up the newest build. Nothing
watches the registry — there is no auto-deploy, by choice:

```shell
kubectl -n make-believe rollout restart deploy/make-believe
```

The package came out **public** on its first push, inheriting the repository's visibility, and the
cluster pulls it anonymously — verified with `docker pull` from a machine with no ghcr.io
credentials. ⚠️ If a package here is ever private (GHCR has historically defaulted that way), the
symptom is a pod stuck on `ImagePullBackOff` with `denied`, and the fix is one visibility change at
<https://github.com/users/axle-h/packages/container/make-believe/settings> → *Danger Zone* →
*Change visibility* → **Public**. A private package works too, but then the namespace needs an
`imagePullSecret`, which nothing here sets up.

## What the pod is allowed to do

Almost nothing, and it has been checked rather than assumed:

```shell
docker run --rm --read-only --cap-drop ALL --user 1000:1000 -p 3000:3000 ghcr.io/axle-h/make-believe:latest
```

Non-root (uid 1000, the image's `node` user), no capabilities, no privilege escalation and a
read-only root filesystem. The process writes nothing to disk — there is no persistence in this app
by design — so if `readOnlyRootFilesystem: true` ever starts failing the pod, something has begun
writing and that is the thing to look at, not the flag. CI runs the image under exactly these
constraints before it pushes it, so this should never first be discovered in the cluster.

## Watching it

```shell
kubectl -n make-believe logs -f deploy/make-believe
kubectl -n make-believe rollout restart deploy/make-believe   # ⚠️ ends the game in progress
kubectl -n make-believe describe pod -l app=make-believe
```

⚠️ **Any restart is the end of that evening's world.** The session code changes and every blob is
gone. The phones sort themselves out — each is told the new session, comes back as a new player under
the name it already had, and puts its drawing back up — but positions, colours and anything else the
world was holding are lost. That is a design decision (no persistence, ever), not something to work
around; it does mean rolling out a new build mid-game is rude.
