# 8. `ingress/ingress.yaml`

**One-line purpose:** the single public entry point for the whole
application — routes incoming HTTP requests to the right internal Service
based on URL path, so the outside world only ever needs one IP address.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: credpay
  namespace: credpay
  labels:
    app.kubernetes.io/part-of: credpay
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "false"
    nginx.ingress.kubernetes.io/use-regex: "true"
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /api/payment
            pathType: Prefix
            backend:
              service:
                name: payment-service
                port:
                  number: 8000
          - path: /api/users
            pathType: Prefix
            backend:
              service:
                name: user-service
                port:
                  number: 8080
          - path: /api/cards
            pathType: Prefix
            backend:
              service:
                name: user-service
                port:
                  number: 8080
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
```

## Why this is applied last

Every rule below references a Service by name (`payment-service`,
`user-service`, `frontend`). Those Services (and, more importantly, their
backing pods) need to exist first — an Ingress pointing at a nonexistent
Service isn't an error, it just routes to nothing (`503`/connection
refused) until the Service shows up.

## Block by block

**`kind: Ingress` — what this actually is**
An Ingress is a **set of routing rules**, not a running process by itself.
Something else — the **Ingress controller** (`ingress-nginx`, installed
separately into the cluster, not part of this repo's manifests) — reads
every Ingress object in the cluster and configures itself accordingly. The
controller is what actually has a public IP and terminates incoming
connections; this YAML is just declarative instructions for it.

**`metadata.annotations` — controller-specific configuration**
Annotations (as opposed to labels) are how you configure controller-specific
behavior that the core Kubernetes Ingress spec doesn't have a first-class
field for. Both annotations here are specific to the `ingress-nginx`
controller (a different controller, e.g. Azure's AGIC, would use different
annotation names for similar concepts):
- **`nginx.ingress.kubernetes.io/ssl-redirect: "false"`** — by default,
  `ingress-nginx` auto-redirects all plain HTTP to HTTPS. This project has
  **no TLS configured** (`spec.tls` is absent — that's a Stage 2/3 item),
  so forcing that redirect would break every request with nothing on the
  other end to redirect to. This annotation explicitly turns that default
  off.
- **`nginx.ingress.kubernetes.io/use-regex: "true"`** — enables regex
  matching in `path` fields. This particular Ingress doesn't actually use
  any regex syntax in its paths (they're all plain string prefixes), so
  this annotation is currently a no-op — harmless to leave, but also safe
  to remove if you want the config to only claim what it uses.

**`spec.ingressClassName: nginx`**
A cluster can have multiple Ingress controllers installed side-by-side
(e.g. `ingress-nginx` and Azure's own AGIC). This field is how an Ingress
object says which controller should handle it — `nginx` here selects
`ingress-nginx` specifically. If this field pointed at a controller that
isn't installed, the Ingress object would sit there permanently with no
`ADDRESS` in `kubectl get ingress` — nothing outwardly "fails," it just
never gets picked up by anything.

**No `spec.rules[].host`**
Most Ingress examples you'll find online specify a `host:` (e.g.
`credpay.example.com`) so the controller can route based on the Fully
Qualified Domain Name in the request, not just the path. This project has
no domain name — Phase 1 is reached directly at the ingress controller's
raw public LoadBalancer IP — so every rule here omits `host` entirely,
meaning "match this path regardless of what hostname the request came in
on."

**`spec.rules[].http.paths` — order matters, most specific first**
Listed in this exact order: `/api/payment`, `/api/users`, `/api/cards`,
then `/` last. With `pathType: Prefix`, a request to `/api/users/login`
matches *both* the `/api/users` rule and the catch-all `/` rule — nginx
resolves this by routing to whichever matching rule has the **longest
(most specific) path**, so `/api/users` correctly wins over `/` regardless
of the order they're listed in this file. The comment at the top of the
actual YAML file calls this out for readability, even though `ingress-nginx`
doesn't strictly require this ordering to behave correctly.

**Each `path` block — `pathType: Prefix`**
Matches the given path and everything under it (`/api/payment` matches
`/api/payment`, `/api/payment/pay`, `/api/payment/history/42`, ...). The
alternative, `pathType: Exact`, would only match that literal path with
nothing after it — wrong for a REST API with sub-resources.

**`backend.service.name` + `backend.service.port.number`**
Exactly what it says: forward matching requests to this Service, on this
port — **not** a pod directly. The Ingress controller talks to the
Service's ClusterIP, and the Service (as covered in steps 5b/6b/7b) does
its own label-based routing to whichever pods are currently ready.

**No path rewriting**
Notice there's no `nginx.ingress.kubernetes.io/rewrite-target` annotation
here — requests are forwarded to the backend **with their original path
intact**. A request to `/api/payment/pay` arrives at payment-service as
literally `/api/payment/pay`. This only works because both backends'
own route prefixes are defined to match exactly: FastAPI's router is
declared as `APIRouter(prefix="/api/payment")`
(`payment-service/app/routes.py`), and Spring's controllers are
`@RequestMapping("/api/users")` / `@RequestMapping("/api/cards")`. If
either side's prefix ever changed without changing the other, requests
would 404 despite the Ingress "working correctly."

## Why no CORS configuration appears anywhere in this setup

Because there's no `host` and both backends and the frontend are reached
through this **one** Ingress, every request the browser makes — whether
for the page itself or an XHR/fetch call to `/api/...` — has the exact
same origin (same scheme + host + port: the Ingress's IP over plain HTTP).
Same-origin requests never trigger the browser's CORS restrictions in the
first place, so `payment-service` and `user-service` only need their CORS
middleware for local development (calling them directly from the Vite dev
server on a different port), never for anything routed through this
Ingress.

## Apply & verify

```powershell
kubectl apply -f k8s/ingress/ingress.yaml
kubectl get ingress credpay -n credpay

# The public IP the whole app is reachable on
kubectl get svc -n ingress-nginx ingress-nginx-controller `
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

Then browse to `http://<that IP>/` — this is the last file in the sequence,
so once this is applied and shows an `ADDRESS`, the entire application is
live end to end.
