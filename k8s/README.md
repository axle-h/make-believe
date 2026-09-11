# Kubernetes deployment

k3s, one namespace, one pod, at <https://believe.ax-h.com> through traefik with a cert-manager
certificate. The world lives in the pod's memory, so `replicas: 1` and `strategy: Recreate` are not
tuning knobs: two pods would be two worlds behind one address.

## Deploy

The image is published by the `container` workflow on every push to `main`.

```shell
# The namespace must be make-believe: the ingress names its middleware by namespace.
kubectl create namespace make-believe
kubectl -n make-believe apply -f ./make-believe
# Middleware before ingress, or traefik serves 500 until it appears.
kubectl -n make-believe apply -f ./redirect-http-https.yml
kubectl -n make-believe apply -f ./ingress.yml
kubectl -n make-believe rollout status deploy/make-believe
kubectl -n make-believe get certificate     # READY True within a minute or two
```

`believe.ax-h.com` is a public A record kept by the `ddns` CronJob from the `DOMAINS` list in its
ConfigMap; run `kubectl -n ddns create job --from=cronjob/ddns ddns-now-$(date +%s)` after adding a
name. cert-manager solves HTTP-01, so a certificate stuck at `READY False` is almost always DNS.

## Checking it

```shell
curl -fsS https://believe.ax-h.com/healthz                                  # ok
curl -sS -o /dev/null -w '%{http_code}\n' http://believe.ax-h.com/healthz   # 308 to https
pnpm dlx wscat -c 'wss://believe.ax-h.com/ws?role=host'                     # answers `session`
```

The `wscat` connection takes the world from whatever TV is running it; hang up once it answers.

## The image

`ghcr.io/axle-h/make-believe:latest`, from the root `Dockerfile`: one bundled server file and the
built pages, no `node_modules`. CI smoke-tests it read-only, non-root and with no capabilities, the
way the Deployment runs it, before pushing; every build is also tagged with its commit.

```shell
kubectl -n make-believe rollout restart deploy/make-believe   # pull :latest; ends the game in progress
kubectl -n make-believe set image deploy/make-believe make-believe=ghcr.io/axle-h/make-believe:<sha>
kubectl -n make-believe logs -f deploy/make-believe
```

Nothing auto-deploys. The package is public; if it were ever private the pod sits in
`ImagePullBackOff` and the namespace needs an `imagePullSecret`. Any restart mints a new session:
phones rejoin under their names with their pictures, and everything else the world held is gone.
