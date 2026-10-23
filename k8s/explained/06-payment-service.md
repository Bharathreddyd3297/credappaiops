# 6. `payment-service/` — Deployment, Service, HPA

**One-line purpose:** runs the FastAPI Payment Service (pay bill, payment
history) as 2+ replicas, exposed inside the cluster on port 8000.

Applied together: `kubectl apply -f k8s/payment-service/`

This file is structurally almost identical to
[05-user-service.md](05-user-service.md) — same Deployment/Service/HPA
pattern, same label/selector mechanism, same requests-vs-limits and
readiness-vs-liveness concepts. Rather than repeat all of that, this file
focuses on **what's different** for this service and why.

---

## 6a. `deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
  namespace: credpay
  labels:
    app.kubernetes.io/name: payment-service
    app.kubernetes.io/part-of: credpay
spec:
  replicas: 2
  revisionHistoryLimit: 5
  selector:
    matchLabels:
      app.kubernetes.io/name: payment-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app.kubernetes.io/name: payment-service
        app.kubernetes.io/part-of: credpay
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        seccompProfile:
          type: RuntimeDefault
      volumes:
        - name: tmp
          emptyDir: {}
      containers:
        - name: payment-service
          image: credproj.azurecr.io/credpay/payment-service:latest
          imagePullPolicy: Always
          ports:
            - name: http
              containerPort: 8000
          volumeMounts:
            - name: tmp
              mountPath: /tmp
          envFrom:
            - configMapRef:
                name: credpay-config
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: credpay-db
                  key: DB_PASSWORD
          startupProbe:
            httpGet:
              path: /health
              port: http
            failureThreshold: 20
            periodSeconds: 3
          readinessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 15
            periodSeconds: 20
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "300m"
              memory: "256Mi"
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
```

### What's different from user-service, and why

**`runAsUser: 1001` (vs. `1000` for user-service)**
Just a different, arbitrary non-root UID — the two services don't share a
filesystem or pod, so there's no requirement for these to match. Using
distinct UIDs per service is a small extra layer of isolation (if anything
ever did go wrong with file ownership, the two services' identities are
still distinct).

**`env.DB_PASSWORD` (vs. `SPRING_DATASOURCE_PASSWORD` for user-service)**
Same underlying password, same Secret (`credpay-db`) — but this container
reads it under the key name FastAPI's own code expects
(`app/database.py` does `os.getenv("DB_PASSWORD")`). This is exactly why
the Secret (step 3) stores the same password under two different key
names — each backend's own code dictates which key it needs.

**`startupProbe` / `readinessProbe` / `livenessProbe` use `httpGet: path:
/health` (vs. `tcpSocket` for user-service)**
This is a real, meaningful difference: FastAPI's `app/main.py` defines an
actual health endpoint —
```python
@app.get("/health", tags=["health"])
def health():
    return {"status": "UP"}
```
— so Kubernetes can ask a real question ("does the app respond correctly
over HTTP") instead of the weaker "is a TCP port merely open" check
user-service is stuck with (it has no equivalent endpoint — no
`spring-boot-starter-actuator` dependency). A pod can have an open TCP port
while still being completely unable to serve real requests (e.g. the
event loop is deadlocked); an HTTP health check that expects a real
response catches more failure modes than a TCP check does.

**Smaller `resources` (100m/128Mi requests vs. 250m/512Mi for
user-service)**
FastAPI + Uvicorn has a dramatically smaller baseline memory/CPU footprint
than a JVM running Spring Boot + Hibernate + Tomcat. These numbers reflect
that real difference, not an arbitrary choice — sized to what each
framework actually needs at idle plus headroom.

**Everything else** — `strategy.rollingUpdate`, the `emptyDir` `/tmp`
volume for the read-only root filesystem, `imagePullPolicy: Always`,
`envFrom.configMapRef`, and the container `securityContext` block — follow
the exact same reasoning as [05-user-service.md](05-user-service.md).

---

## 6b. `service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: payment-service
  namespace: credpay
  labels:
    app.kubernetes.io/name: payment-service
    app.kubernetes.io/part-of: credpay
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: payment-service
  ports:
    - name: http
      port: 8000
      targetPort: http
```

Identical pattern to `user-service/service.yaml` (see
[05-user-service.md §5b](05-user-service.md#5b-serviceyaml)), just on port
8000 instead of 8080, and selecting pods labeled `payment-service` instead.
The Ingress (step 8) routes `/api/payment` to this Service by name.

---

## 6c. `hpa.yaml`

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: payment-service
  namespace: credpay
  labels:
    app.kubernetes.io/name: payment-service
    app.kubernetes.io/part-of: credpay
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: payment-service
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 75
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
```

### What's different from user-service's HPA

Only **one** metric here — CPU at 75% — no memory trigger. FastAPI's
memory usage under load is far more stable/predictable than the JVM's
(no garbage-collector-driven heap growth to worry about), so CPU alone is
a sufficient scaling signal for this service. Everything else
(`minReplicas`/`maxReplicas`/`stabilizationWindowSeconds`) matches
user-service exactly — see [05-user-service.md §5c](05-user-service.md#5c-hpayaml)
for the full explanation of each field.

## Apply & verify

```powershell
kubectl apply -f k8s/payment-service/
kubectl get pods -n credpay -l app.kubernetes.io/name=payment-service
kubectl get svc payment-service -n credpay
kubectl get hpa payment-service -n credpay

# Health endpoint the probes are hitting
kubectl exec -it deployment/payment-service -n credpay -- wget -qO- http://localhost:8000/health
```
