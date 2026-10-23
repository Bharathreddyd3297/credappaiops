# 5. `user-service/` — Deployment, Service, HPA

**One-line purpose:** runs the Spring Boot User Service (register/login,
add/list cards) as 2+ replicas, exposes it inside the cluster on port
8080, and lets it scale automatically under load.

Applied together with one command: `kubectl apply -f k8s/user-service/`

---

## 5a. `deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  namespace: credpay
  labels:
    app.kubernetes.io/name: user-service
    app.kubernetes.io/part-of: credpay
spec:
  replicas: 2
  revisionHistoryLimit: 5
  selector:
    matchLabels:
      app.kubernetes.io/name: user-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app.kubernetes.io/name: user-service
        app.kubernetes.io/part-of: credpay
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        seccompProfile:
          type: RuntimeDefault
      volumes:
        - name: tmp
          emptyDir: {}
      containers:
        - name: user-service
          image: credproj.azurecr.io/credpay/user-service:latest
          imagePullPolicy: Always
          ports:
            - name: http
              containerPort: 8080
          volumeMounts:
            - name: tmp
              mountPath: /tmp
          envFrom:
            - configMapRef:
                name: credpay-config
          env:
            - name: SPRING_DATASOURCE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: credpay-db
                  key: SPRING_DATASOURCE_PASSWORD
          startupProbe:
            tcpSocket:
              port: http
            failureThreshold: 20
            periodSeconds: 3
          readinessProbe:
            tcpSocket:
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            tcpSocket:
              port: http
            initialDelaySeconds: 30
            periodSeconds: 20
          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "500m"
              memory: "768Mi"
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
```

### Block by block

**`spec.replicas: 2`**
Two pods run at all times (before autoscaling kicks in) — the baseline for
any availability during a node drain, pod eviction, or rolling update.

**`spec.selector.matchLabels` vs. `template.metadata.labels`**
This is the mechanism that ties a Deployment to its pods: the Deployment
controller creates pods stamped with `template.metadata.labels`, then
continuously watches for pods matching `selector.matchLabels` and
reconciles the count. They must match exactly, or the Deployment can't
find/manage its own pods. The Service (5b) uses this *same* label as its
own selector to find which pods to route traffic to.

**`spec.strategy.rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }`**
Governs how a rollout (e.g. `kubectl rollout restart`) replaces old pods
with new ones. `maxUnavailable: 0` means Kubernetes will never take a ready
pod down before its replacement is ready — zero-downtime rollouts.
`maxSurge: 1` allows **one extra** pod beyond `replicas` temporarily, so
with 2 replicas you can briefly have 3 pods during a rollout (new one
starting while both old ones still serve traffic).

**`template.spec.securityContext` (pod-level)**
`runAsNonRoot: true` + `runAsUser: 1000` — refuses to even start the
container if its image tries to run as root (defense even against a
misconfigured image), and pins the UID explicitly rather than trusting
whatever the image's `Dockerfile` set. `seccompProfile: RuntimeDefault`
applies the container runtime's default syscall filter — blocks a long
list of rarely-needed, higher-risk Linux syscalls.

**`volumes: tmp` (`emptyDir`) + `volumeMounts` at `/tmp`**
Paired with `readOnlyRootFilesystem: true` further down: if the *whole*
filesystem is read-only, Tomcat/the JVM has nowhere to write temp files it
needs at runtime (e.g. some JIT/class-loading scratch space). An
`emptyDir` volume is a small, ephemeral, writable disk area that exists
only for this pod's lifetime, mounted specifically at `/tmp` so the rest of
the filesystem stays locked down.

**`imagePullPolicy: Always`**
Because the image tag is the mutable `:latest`, `Always` guarantees
`kubectl rollout restart` actually fetches whatever was most recently
pushed to ACR, rather than potentially reusing a stale image a node
already has cached under the same tag name. (This exact bug happened
during this project's first live deployment — see `STAGE1-CHANGES.md` §8.)

**`envFrom` + `env` — two different injection mechanisms, used together**
`envFrom.configMapRef` bulk-imports *every* key from `credpay-config` as an
environment variable (bulk, non-secret). `env` with `valueFrom.secretKeyRef`
imports exactly *one* named key from the Secret — you can't `envFrom` an
entire Secret here because Spring only needs one of its two password keys,
and being explicit about which Secret key feeds which variable name is
clearer to read.

**`startupProbe` vs. `readinessProbe` vs. `livenessProbe` (all `tcpSocket`)**
All three simply check "is something listening on port 8080" — there's no
real `/health` endpoint here (this app has no
`spring-boot-starter-actuator` dependency), so a TCP check is the most
truthful available signal. Their *jobs* differ even though the check is
identical:
- **`startupProbe`** (`failureThreshold: 20`, `periodSeconds: 3` → up to
  60s) — Spring Boot can take a while to boot (Hibernate, connection
  pool, Tomcat). While the startup probe hasn't succeeded yet, the
  liveness probe is **not even running** — this exists specifically so a
  slow-starting pod isn't killed by liveness before it's had a fair chance
  to come up.
- **`readinessProbe`** — once startup succeeds, this runs continuously.
  Failing it removes the pod from the Service's routing (5b) — traffic
  stops reaching it — without restarting the container. Used for
  "temporarily can't serve traffic" situations.
- **`livenessProbe`** — also runs continuously after startup succeeds.
  Failing it (repeatedly) causes Kubernetes to **kill and restart the
  container** — for "this process is stuck/deadlocked, a restart is the
  fix" situations.

**`resources.requests` vs. `resources.limits`**
`requests` (250m CPU / 512Mi memory) is what the scheduler reserves when
deciding which node has room for this pod — it's a promise, not a cap.
`limits` (500m CPU / 768Mi memory) is the hard ceiling: exceed the memory
limit and the container is OOM-killed; exceed the CPU limit and it's
throttled (slowed down, not killed). Spring Boot needs a noticeably higher
baseline than the other two services because the JVM + Hibernate + Tomcat
stack simply uses more memory at idle than FastAPI or static Nginx.

**Container-level `securityContext`**
`allowPrivilegeEscalation: false` — blocks any process inside from gaining
more privileges than it started with (e.g. via a setuid binary).
`readOnlyRootFilesystem: true` — the container's own filesystem (other
than the `/tmp` volume) can't be written to at all, meaningfully limiting
what an attacker who got code execution inside the container could do
(can't drop a persistent backdoor file, for instance). `capabilities:
drop: ["ALL"]` — removes every optional Linux capability; safe here
because this container runs as non-root UID 1000 and needs zero elevated
capabilities (unlike the frontend — see [07-frontend.md](07-frontend.md)
for the one case in this project where dropping ALL capabilities actually
breaks something).

---

## 5b. `service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: user-service
  namespace: credpay
  labels:
    app.kubernetes.io/name: user-service
    app.kubernetes.io/part-of: credpay
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: user-service
  ports:
    - name: http
      port: 8080
      targetPort: http
```

### Block by block

**`spec.type: ClusterIP`**
The default, most restrictive Service type — gives this Service a stable
virtual IP and DNS name reachable **only from inside the cluster**. Nothing
outside AKS can hit `user-service` directly; the only way in from outside
is through the Ingress (step 8), which itself talks to this Service from
inside the cluster.

**`spec.selector.app.kubernetes.io/name: user-service`**
This is the live, continuously-reevaluated query that decides which pods
receive traffic: "any pod (in this namespace) carrying the label
`app.kubernetes.io/name: user-service`". It's the exact same label the
Deployment (5a) stamps onto its pods — that shared label is the entire
connection between "a Service exists" and "traffic actually reaches a
pod." No pods matching the label yet? The Service exists but has no
endpoints, and requests to it fail/queue.

**`spec.ports` — `port` vs. `targetPort`**
`port: 8080` is what other things *inside the cluster* connect to (i.e.
`http://user-service:8080`, or from the Ingress's perspective, port
`8080` on the `user-service` backend). `targetPort: http` says forward
that traffic to whichever port on the *pod* is named `http` — matching the
`ports: - name: http containerPort: 8080` entry in the Deployment.
Referencing the port **by name** rather than by number (`targetPort: 8080`
would also have worked) means if the container's actual listening port
ever changes, you only update it in one place (the Deployment), not two.

### Why `metadata.name` matters here specifically

`user-service` — this exact string — is both the in-cluster DNS name
(`http://user-service:8080/...`) and the name the Ingress (step 8)
references as its routing backend (`backend.service.name: user-service`).
Rename it and both the Ingress and any code assuming this hostname breaks.

---

## 5c. `hpa.yaml`

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: user-service
  namespace: credpay
  labels:
    app.kubernetes.io/name: user-service
    app.kubernetes.io/part-of: credpay
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: user-service
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 75
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
```

### Block by block

**`spec.scaleTargetRef`**
Points the HPA at exactly one object to control — here, the
`user-service` Deployment. The HPA itself doesn't create or manage pods;
it only edits `spec.replicas` on the Deployment it targets, and the
Deployment controller does the rest.

**`minReplicas: 2` / `maxReplicas: 6`**
Floor and ceiling. Never scales below 2 (matching the Deployment's
baseline) or above 6, regardless of load.

**`metrics` — two conditions, either can trigger scale-up**
This service checks **both** CPU (75%) and memory (80%) utilization,
compared against the `resources.requests` values set in the Deployment —
"utilization" here means "current usage ÷ requested amount", not raw
percentage of the node. If *either* metric crosses its threshold (average
across all current pods), the HPA scales up. This service is the only one
of the three with a memory trigger, because the JVM's memory footprint is
the more likely bottleneck for Spring Boot under load, versus CPU for the
other two.

**`behavior.scaleDown.stabilizationWindowSeconds: 300`**
Without this, an HPA can "flap" — scale up, traffic dips for a moment,
scale down immediately, traffic spikes again, scale up again. This forces
the HPA to look at the **highest** replica count recommended over the last
300 seconds before actually scaling down, smoothing out temporary dips.
There's no equivalent `scaleUp` stabilization — scaling up fast in
response to a real spike is desirable; only scale-*down* needs the
caution.

**Prerequisite: `metrics-server`**
The HPA can't compute CPU/memory utilization without something collecting
those metrics. AKS ships `metrics-server` as a built-in, always-on
component — no separate install step needed on AKS specifically, but the
HPA would sit idle (`<unknown>` targets in `kubectl get hpa`) on a cluster
that doesn't have it.

## Apply & verify

```powershell
kubectl apply -f k8s/user-service/
kubectl get pods -n credpay -l app.kubernetes.io/name=user-service
kubectl get svc user-service -n credpay
kubectl get hpa user-service -n credpay
```
