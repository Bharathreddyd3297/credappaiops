# 1. `namespace/namespace.yaml`

**One-line purpose:** creates the `credpay` namespace — the isolated
"folder" every other CredPay resource lives inside — and sets the
namespace-wide Pod Security level.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: credpay
  labels:
    app.kubernetes.io/part-of: credpay
    pod-security.kubernetes.io/enforce: baseline
    pod-security.kubernetes.io/warn: restricted
```

## Block by block

**`apiVersion: v1`, `kind: Namespace`**
Namespaces are a core (`v1`) Kubernetes object — no custom API group
needed, unlike Deployments (`apps/v1`) or Ingress (`networking.k8s.io/v1`).

**`metadata.name: credpay`**
This exact string is what every other manifest in the folder references
via `namespace: credpay`. It's also the DNS domain segment: any Service in
here is reachable in-cluster as `<service-name>.credpay.svc.cluster.local`.

**`labels.app.kubernetes.io/part-of: credpay`**
Just a tag for humans/tooling (e.g. `kubectl get ns -l app.kubernetes.io/part-of=credpay`)
— not functionally required.

**`labels.pod-security.kubernetes.io/enforce: baseline`**
This is the important one. Kubernetes' built-in **Pod Security Admission**
controller reads this label and rejects (`enforce`) any pod in this
namespace that violates the named policy level. There are three levels,
from loosest to strictest: `privileged` → `baseline` → `restricted`.
`baseline` blocks genuinely dangerous things (host networking, privileged
containers, most added Linux capabilities) but still **allows a container
to run as root** — which this project needs, because the frontend's
`nginx:stable-alpine` image runs its master process as root by design (see
[07-frontend.md](07-frontend.md)).

**`labels.pod-security.kubernetes.io/warn: restricted`**
A *softer* companion label: it doesn't block anything, but `kubectl apply`
prints a warning for any pod that wouldn't pass the stricter `restricted`
level. That's intentional here — it's a visible reminder ("you could
tighten this further") without actually breaking the frontend deployment
today. You've seen this warning yourself: applying the frontend Deployment
prints `Warning: would violate PodSecurity "restricted:latest": ...` — that
warning is this label doing its job, not an error.

## Why this has to be applied first

Every other manifest declares `namespace: credpay` in its own `metadata`.
If the namespace doesn't exist yet, `kubectl apply` for anything else fails
outright with `namespaces "credpay" not found`.

## Apply & verify

```powershell
kubectl apply -f k8s/namespace/namespace.yaml
kubectl get namespace credpay --show-labels
```
