# 7. `frontend/` — Deployment, Service, HPA

**One-line purpose:** runs the React SPA (built by Vite, served by Nginx)
as 2+ replicas on port 80. This is the only one of the three workloads
that's a **pure static file server** — no database connection, no
ConfigMap/Secret env vars, and (deliberately) the loosest security
hardening of the three, for a specific, well-understood reason explained
below.

Applied together: `kubectl apply -f k8s/frontend/`

---

## 7a. `deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: credpay
  labels:
    app.kubernetes.io/name: frontend
    app.kubernetes.io/part-of: credpay
spec:
  replicas: 2
  revisionHistoryLimit: 5
  selector:
    matchLabels:
      app.kubernetes.io/name: frontend
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app.kubernetes.io/name: frontend
        app.kubernetes.io/part-of: credpay
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: false
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: frontend
          image: credproj.azurecr.io/credpay/frontend:latest
          imagePullPolicy: Always
          ports:
            - name: http
              containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 10
            periodSeconds: 20
          resources:
            requests:
              cpu: "50m"
              memory: "64Mi"
            limits:
              cpu: "200m"
              memory: "128Mi"
          securityContext:
            allowPrivilegeEscalation: false
```

### What's different from the two backends, and why

**No `envFrom` / `env` at all.** The frontend is a compiled static bundle —
it has no server-side logic that reads `DB_HOST` or any secret at runtime.
Every configuration value it needs (API base URLs) is baked into the
JavaScript at **Docker build time** by Vite, not read from the environment
at container start. See `STAGE1-CHANGES.md` §1 for the full story of why
that distinction mattered.

**`automountServiceAccountToken: false`**
By default, every pod gets a Kubernetes ServiceAccount token
auto-mounted into it (used for a pod to authenticate *to the Kubernetes
API itself*). This pod never calls the Kubernetes API, so this is
disabled — one less credential sitting in the container's filesystem for
no functional benefit.

**No `volumes`/`volumeMounts` for `/tmp`, unlike the backends.** There's no
`readOnlyRootFilesystem: true` on this container (see below), so there's
no read-only filesystem to work around with a writable `emptyDir` — Nginx
can write wherever it needs to directly.

**`readinessProbe` / `livenessProbe` use `httpGet: path: /` (not
`/health`)**
There's no dedicated health endpoint for a static file server — asking for
`/` and getting back `index.html` (HTTP 200) *is* the health check. Note
there's no `startupProbe` here either, unlike the two backends — Nginx
starts in milliseconds, there's no slow JVM/Hibernate-style boot sequence
to protect against a premature liveness check.

**Much smaller `resources`** (50m/64Mi requests) — serving static files
through Nginx is by far the lightest workload of the three.

### The security story: why this pod runs as root, and a real incident

**`securityContext.runAsNonRoot: false`** — the frontend is the **one
deliberate exception** to this project's "run everything as non-root"
rule. `nginx:stable-alpine`'s master process needs to run as root because
it (a) binds port 80, a privileged port below 1024, and (b) `chown()`s its
own cache directories (`/var/cache/nginx/*`) at startup to hand them off to
the unprivileged `nginx` worker user before forking the actual
request-handling workers.

This is also exactly why the namespace (step 1) is set to Pod Security
level `baseline` rather than the stricter `restricted` — `restricted`
would reject any pod that isn't fully non-root, which would block this
Deployment outright.

**Why there's no `capabilities: drop: ["ALL"]` here, unlike every other
container in this project — a real production incident:**

An earlier version of this file *did* add the same hardening the backends
use:
```yaml
securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
    add: ["NET_BIND_SERVICE"]
```
The idea seemed reasonable: keep the container running as root (UID 0,
required for port 80) but strip away every Linux capability except the one
needed to bind a privileged port. It looked correct on paper and passed
review — but when actually deployed to the live AKS cluster, every
frontend pod **crash-looped**:
```
nginx: [emerg] chown("/var/cache/nginx/client_temp", 101) failed (1: Operation not permitted)
```
The mistake: Linux capability restrictions apply **even to UID 0**.
Dropping `ALL` capabilities strips `CAP_CHOWN` along with everything else
— and `CAP_CHOWN` is exactly what nginx's root master process needs to
`chown()` its cache directories at startup. Adding back only
`NET_BIND_SERVICE` (for the port bind) wasn't enough; `CAP_CHOWN` was also
required and had been silently removed. The fix was to drop the
`capabilities` block entirely for this one container, keeping only
`allowPrivilegeEscalation: false` (which is unrelated to `chown()` and
costs nothing).

**The lesson, generalized:** "runs as root" and "has every root
capability" are two independent, separately-controllable things in Linux —
dropping capabilities is only safe once you've confirmed *which specific*
capabilities the process actually needs, ideally by testing against the
real image rather than reasoning about it from first principles. Full
incident writeup with logs: `STAGE1-CHANGES.md` §8.3.

---

## 7b. `service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: credpay
  labels:
    app.kubernetes.io/name: frontend
    app.kubernetes.io/part-of: credpay
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: frontend
  ports:
    - name: http
      port: 80
      targetPort: http
```

Same `ClusterIP` + label-selector + named-port pattern as the two backend
Services (see [05-user-service.md §5b](05-user-service.md#5b-serviceyaml)
for the full field-by-field breakdown) — on port 80, selecting pods
labeled `frontend`. Despite being "the thing users actually see," this
Service is **just as internal** as the backend ones — it has no external
IP of its own. The Ingress (step 8) is what actually exposes anything to
the internet; this Service is only reachable from inside the cluster,
including from the Ingress controller itself.

---

## 7c. `hpa.yaml`

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: frontend
  namespace: credpay
  labels:
    app.kubernetes.io/name: frontend
    app.kubernetes.io/part-of: credpay
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: frontend
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
```

Same single-metric (CPU) pattern as `payment-service`'s HPA — see
[06-payment-service.md §6c](06-payment-service.md#6c-hpayaml) for the full
explanation of each field. The only difference is the target threshold:
70% here vs. 75% for the backends — serving static files is cheap enough
that even a modest CPU bump is a meaningful relative signal to react to
slightly earlier.

## Apply & verify

```powershell
kubectl apply -f k8s/frontend/
kubectl get pods -n credpay -l app.kubernetes.io/name=frontend
kubectl get svc frontend -n credpay
kubectl get hpa frontend -n credpay
```
