# 2. `configmap/configmap.yaml`

**One-line purpose:** holds every piece of **non-secret** configuration
that both backends need — database host/port/name, the full JDBC URL, and
a JVM tuning flag — as plain key/value pairs any pod can mount as
environment variables.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: credpay-config
  namespace: credpay
  labels:
    app.kubernetes.io/part-of: credpay
data:
  DB_HOST: "psql-credpay.postgres.database.azure.com"
  DB_PORT: "5432"
  DB_NAME: "credpay"
  DB_USERNAME: "credpayadmin"

  SPRING_DATASOURCE_URL: "jdbc:postgresql://psql-credpay.postgres.database.azure.com:5432/credpay?sslmode=require"
  SPRING_DATASOURCE_USERNAME: "credpayadmin"
  JAVA_TOOL_OPTIONS: "-XX:MaxRAMPercentage=75.0"
```

## Block by block

**`kind: ConfigMap`**
A Kubernetes object that's nothing more than a namespaced key/value store.
It has no behavior on its own — it only does something once a Pod
references it (see `envFrom` in the Deployment files).

**`metadata.name: credpay-config`**
The name every Deployment references via `envFrom: - configMapRef: name:
credpay-config`. Rename this and you must update it in three places:
`user-service/deployment.yaml`, `payment-service/deployment.yaml`, and
`postgres/schema-init-job.yaml`.

**`data.DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USERNAME`**
Shared coordinates both backends use to reach the same Azure PostgreSQL
Flexible Server. `payment-service` (FastAPI) reads these directly as
individual env vars (`os.getenv("DB_HOST")`, etc.) and assembles its own
connection string in `app/database.py`.

**`data.SPRING_DATASOURCE_URL`**
`user-service` (Spring Boot) doesn't build a connection string itself —
Spring wants the *whole* JDBC URL as one property. This is that URL,
pre-built: `jdbc:postgresql://<host>:<port>/<db>?sslmode=require`. Spring
Boot's *relaxed binding* feature automatically maps the environment
variable name `SPRING_DATASOURCE_URL` to the property
`spring.datasource.url` — this env var **overrides** whatever's hardcoded
as a local-dev default in `application.properties`, because OS environment
variables outrank the properties file in Spring's config precedence order.

**`sslmode=require` (inside the JDBC URL)**
Forces TLS to Azure PostgreSQL. Azure's Postgres Flexible Server accepts
non-SSL connections by default being disabled/enabled depending on
server config, but this project explicitly demands TLS regardless, matching
the `require_ssl` configuration Terraform sets on the server
(`terraform/modules/postgres/main.tf`).

**`data.SPRING_DATASOURCE_USERNAME`**
Same relaxed-binding trick, maps to `spring.datasource.username`. Note
there's **no `SPRING_DATASOURCE_PASSWORD` here** — the password is the one
value that must never sit in a ConfigMap (ConfigMaps are stored in plain
text, unlike Secrets which are base64-encoded and access-controlled
slightly more tightly). That comes from the Secret instead — see
[03-secret.md](03-secret.md).

**`data.JAVA_TOOL_OPTIONS: "-XX:MaxRAMPercentage=75.0"`**
A JVM startup flag. `JAVA_TOOL_OPTIONS` is a special environment variable
the `java` launcher reads automatically and prepends to its own argument
list — no code change needed to apply it. `MaxRAMPercentage=75.0` tells the
JVM to size its heap as 75% of whatever memory the **container** actually
has available (not the node's total memory), which matters because this
Deployment sets a hard container memory `limit` of `768Mi` — without this
flag, older JVM heuristics could size the heap based on the node's full
memory and get OOM-killed.

## Why this comes before the Deployments

Both backend Deployments reference `credpay-config` via `envFrom`. If it
doesn't exist when the pod is scheduled, Kubernetes reports the pod status
as `CreateContainerConfigError` and it never starts — not a crash, just
stuck waiting.

## Apply & verify

```powershell
kubectl apply -f k8s/configmap/configmap.yaml
kubectl get configmap credpay-config -n credpay -o yaml
```
