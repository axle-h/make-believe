---
phase: 7
title: Deploy to k3s
status: in-progress
updated: 2026-09-02
---

# Phase 7 — Deploy to k3s

## Goal

The container from phase 1 runs in Alex's k3s cluster as a single replica in its own namespace, reachable inside the cluster on a `ClusterIP` service. Ingress and TLS come in phase 8.

## Read first

`CLAUDE.md` sections: Deployment, One world ever, Future work. The sibling projects `~/projects/gb/k8s` and `~/projects/make-movies/k8s` are the house style; copy their shape, not their volumes or secrets.

## Cluster facts (verified 2026-09-01, do not re-discover)

- k3s v1.34, one node `nas` at `10.0.0.10`. Traefik 3.x is the ingress controller. cert-manager is installed. `local-path` is the storage class (not needed here).
- Convention: **one namespace per app, named after the app**. This app's namespace is `make-believe`.
- Images are `ghcr.io/axle-h/<name>:latest` with `imagePullPolicy: Always`. This app's image is `ghcr.io/axle-h/make-believe:latest`. The other projects push from GitHub Actions; CI is out of scope here, so the image is built and pushed by hand (below). The GHCR package is created private on first push and must be made public once in the GitHub package settings, or the pull fails with `denied`.
- Services expose port `80` named `http`, targeting the container port also named `http`. Ingresses reference the port by name.
- Deployments use `replicas: 1`, `strategy: Recreate`, an explicit `securityContext` with a non-root uid, `envFrom` for config, and a `startupProbe` + `livenessProbe`.

## Tasks

- [x] `k8s/README.md` in the style of the sibling projects: create the namespace, apply, check, and how the image gets there.
- [x] `k8s/make-believe/deployment.yml`: `replicas: 1`, `strategy: Recreate`, image `ghcr.io/axle-h/make-believe:latest`, `imagePullPolicy: Always`, `env PORT=3000`, container port `3000` named `http`, `startupProbe` and `livenessProbe` on `GET /healthz`, `securityContext` with `runAsNonRoot: true` and the uid the Dockerfile's `USER node` resolves to (1000), small requests (`cpu: 50m`, `memory: 64Mi`) and a memory limit (`256Mi`). A comment block at the top saying why replicas must stay at 1 (one in-memory world).
- [x] `k8s/make-believe/service.yml`: `ClusterIP`, port `80` named `http`, `targetPort: http`, selector `app: make-believe`.
- [x] Manifests live under `k8s/make-believe/` so `kubectl -n make-believe apply -f ./k8s/make-believe` applies the app in one go; phase 8 puts the ingress and middleware beside that directory, not in it, matching the siblings.
- [x] `kubectl apply --dry-run=client -f k8s/make-believe/` passes.
- [!] Image publish, documented in `k8s/README.md`: BLOCKED: `docker login ghcr.io` needs Alex's GitHub PAT — there are no ghcr.io credentials in `~/.docker/config.json` — and making the package public afterwards is a click in Alex's GitHub settings. The image itself is built and checked locally (`make-believe:local`, run read-only as uid 1000 with all capabilities dropped: `/healthz` 200, `/host/` 200, `/` 200).
  ```sh
  docker build -t ghcr.io/axle-h/make-believe:latest .
  docker login ghcr.io      # once; a GitHub PAT with write:packages
  docker push ghcr.io/axle-h/make-believe:latest
  ```
  then make the package public once. Rolling a new build is `kubectl -n make-believe rollout restart deploy/make-believe`.
- [!] Apply to the cluster: BLOCKED: waits on the image being on GHCR — applying first would only leave an `ImagePullBackOff` in the cluster. Alex also asked this session to stop at the deployment. Everything else is ready: `kubectl apply --dry-run=client -f k8s/make-believe/` passes. `kubectl create namespace make-believe`, `kubectl -n make-believe apply -f ./k8s/make-believe`, wait for the pod to be Running and Ready.
- [!] Verify in-cluster: BLOCKED: follows the apply above. `kubectl -n make-believe port-forward svc/make-believe 3000:80` and open `http://localhost:3000/host/`. Note that WebSockets work through a port-forward, so a phone-less check of host + two browser players is possible from the laptop.

The agent has `kubectl` access to the real cluster. Applying to it is part of this phase; do not mark it blocked unless `kubectl` actually fails. Pushing to GHCR needs Alex's login; if `docker push` is denied, mark that one task blocked and stop there.

## Acceptance

```sh
kubectl apply --dry-run=client -f k8s/make-believe/
kubectl -n make-believe get deploy make-believe -o jsonpath='{.status.readyReplicas}'   # 1
kubectl -n make-believe port-forward svc/make-believe 3000:80 & sleep 2; curl -fsS localhost:3000/healthz; kill %1
```

## Handoff

- **State:** manifests written and dry-run clean; nothing applied and nothing pushed. `k8s/make-believe/deployment.yml` (replicas 1, Recreate, `PORT=3000`, container port 3000 named `http`, startup and liveness probes on `/healthz`, non-root uid 1000, read-only root filesystem, all capabilities dropped, 50m/64Mi requests and a 256Mi memory limit) and `k8s/make-believe/service.yml` (ClusterIP 80 → `http`). `k8s/README.md` covers the apply, the image publish and the GHCR-private trap. The container was rebuilt with the phase 3 to 6 code and run with `--read-only --cap-drop ALL --user 1000:1000`, serving `/healthz`, `/host/` and `/`.
- **Next step:** Alex logs in to GHCR (`docker login ghcr.io` with a PAT that has `write:packages`), then `docker build -t ghcr.io/axle-h/make-believe:latest . && docker push`, then makes the package public once. After that `kubectl create namespace make-believe && kubectl -n make-believe apply -f ./k8s/make-believe` is the whole deploy.
- **Known issues:** none in the manifests themselves. `readOnlyRootFilesystem: true` is the one line that would fail the pod if anything ever starts writing to disk; it is verified against this build.
