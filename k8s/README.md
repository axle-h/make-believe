# Kubernetes deployment

k3s, one namespace per app, one pod. Traefik is the ingress controller and cert-manager issues the
certificates — but neither is used yet: this directory gets the app running *inside* the cluster on
a `ClusterIP`. The hostname, the ingress and TLS are phase 8.

⚠️ **One replica, always.** The world — the host socket, its players, tonight's room code — is held
in the pod's memory and nothing is persisted. Two pods would be two worlds behind one address, and
the TV and the phones would land in whichever one the Service happened to pick. `replicas: 1` and
`strategy: Recreate` in `make-believe/deployment.yml` are both about that, and neither is a tuning
knob. Scaling this app up is not a trade-off; it is a bug.

## Deploy

```shell
# ⚠️ The namespace must be `make-believe`: phase 8's ingress will name its redirect middleware as
# `make-believe-redirect-http-https@kubernetescrd`, and traefik resolves that by namespace.
kubectl create namespace make-believe

# Deployment and service in one go.
kubectl -n make-believe apply -f ./make-believe

# Check it is up: the pod Running and Ready, the service holding an endpoint.
kubectl -n make-believe get all
kubectl -n make-believe rollout status deploy/make-believe
```

Until there is an ingress, reach it by port-forward:

```shell
kubectl -n make-believe port-forward svc/make-believe 3000:80
# TV:     http://localhost:3000/host/
# phones: nothing yet — a phone cannot reach a port-forward, and the QR code on the TV would
#         hand it `http://localhost:3000`. Phones want phase 8, or `pnpm start` on the LAN.
```

## The image

`ghcr.io/axle-h/make-believe:latest`, built from the repo root `Dockerfile`: a `node:22-alpine`
build stage that runs `pnpm build`, and a runtime stage holding one bundled server file and the
built pages — no `node_modules` at all. CI is out of scope for this project, so it is built and
pushed by hand:

```shell
docker build -t ghcr.io/axle-h/make-believe:latest .
docker login ghcr.io          # once; username is the GitHub user, password is a PAT with write:packages
docker push ghcr.io/axle-h/make-believe:latest

kubectl -n make-believe rollout restart deploy/make-believe    # pull the new build
```

⚠️ **GHCR creates the package private, whatever the repository's visibility.** The first push
succeeds and the cluster then fails to pull it with `denied`. Fix it once, at
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
writing and that is the thing to look at, not the flag.

## Watching it

```shell
kubectl -n make-believe logs -f deploy/make-believe
kubectl -n make-believe rollout restart deploy/make-believe   # ⚠️ ends the game in progress
kubectl -n make-believe describe pod -l app=make-believe
```

⚠️ **Any restart is the end of that evening's world.** The room code changes, every blob is gone and
everyone rejoins from the TV's new QR code. That is a design decision (no persistence, ever), not
something to work around — but it does mean rolling out a new build mid-game is rude.
