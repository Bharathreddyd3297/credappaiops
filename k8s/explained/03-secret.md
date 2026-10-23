# 3. `secrets/secret.example.yaml`

**One-line purpose:** documents the *shape* of the one Secret this project
needs (the database password, under two different key names) — but this
file is deliberately **never applied as-is**. The real Secret is created
imperatively, out-of-band.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: credpay-db
  namespace: credpay
  labels:
    app.kubernetes.io/part-of: credpay
type: Opaque
stringData:
  DB_PASSWORD: "REPLACE_ME"
  SPRING_DATASOURCE_PASSWORD: "REPLACE_ME"
```

## Block by block

**`kind: Secret`**
Structurally almost identical to a ConfigMap (also just a key/value
store), but Kubernetes stores its values base64-encoded at rest and treats
it as more sensitive — e.g. `kubectl get secret -o yaml` shows base64, not
plaintext, and RBAC commonly restricts read access to Secrets separately
from ConfigMaps. Base64 is **encoding, not encryption** — anyone who can
`kubectl get secret -o yaml` can trivially decode it. Real protection comes
from Kubernetes RBAC (who can read Secrets at all) and, in a more mature
setup, encryption-at-rest on the etcd cluster or an external secret store
(Azure Key Vault) — neither of which this Phase-1 project uses.

**`type: Opaque`**
The generic Secret type for "arbitrary key/value data" — as opposed to
Kubernetes' other built-in types like `kubernetes.io/tls` or
`kubernetes.io/dockerconfigjson`, which have a specific expected structure.

**`stringData` (vs. `data`)**
`stringData` lets you write plain text in the YAML and Kubernetes
base64-encodes it for you on creation; `data` requires you to pre-encode
the values yourself. Both end up identical once stored.

**`DB_PASSWORD` and `SPRING_DATASOURCE_PASSWORD` — same password, two keys**
FastAPI (`payment-service`) and Spring Boot (`user-service`) each expect
the password under a different environment variable name convention, so
the same underlying password value is exposed under two keys so each
Deployment can reference the one it needs by name.

**Why `"REPLACE_ME"` and not a real password**
This file is a **documentation artifact**, committed to git so anyone
reading the repo can see exactly what Secret the app expects — key names,
namespace, structure — without ever putting a real credential in version
control. Committing a real password here, even in a private repo, means
it lives forever in git history (see `PORTABILITY.md` for a live example
of exactly this mistake happening with a different file in this project).

## How the real Secret actually gets created

Never `kubectl apply -f k8s/secrets/secret.example.yaml` for real — doing so would
overwrite a working password with the literal string `REPLACE_ME` and
break every future pod restart. Instead:

```powershell
kubectl create secret generic credpay-db `
  --namespace credpay `
  --from-literal=DB_PASSWORD="<the real Postgres password>" `
  --from-literal=SPRING_DATASOURCE_PASSWORD="<the real Postgres password>"
```

If you have Terraform state access, the real value comes from:
```powershell
terraform -chdir=terraform output -raw postgres_admin_password
```
(Note this Terraform output is marked `sensitive = true`, which just means
Terraform masks it in console logs — `-raw` still prints the real value.)

## How the Secret is consumed downstream

Both backend Deployments pull one key each, by name, into a single
environment variable — not the whole Secret:

```yaml
env:
  - name: SPRING_DATASOURCE_PASSWORD   # user-service
    valueFrom:
      secretKeyRef:
        name: credpay-db
        key: SPRING_DATASOURCE_PASSWORD
```
```yaml
env:
  - name: DB_PASSWORD                  # payment-service
    valueFrom:
      secretKeyRef:
        name: credpay-db
        key: DB_PASSWORD
```
The schema-init Job (`postgres/schema-init-job.yaml`) also reads
`DB_PASSWORD` from this same Secret into `PGPASSWORD`, which `psql` reads
automatically.

**Important operational detail:** Secret values are only read into a
container's environment **at pod startup**. If you ever change the
password in the Secret, existing running pods keep using the old value
until you `kubectl rollout restart` them — updating the Secret alone does
not hot-reload anything.

## Why this comes before the Deployments (conceptually)

Same reason as the ConfigMap: both backend Deployments and the schema Job
reference `credpay-db` via `secretKeyRef`. Missing Secret → pod stuck in
`CreateContainerConfigError`.

## Apply & verify

```powershell
# (create the REAL secret first, see above — do not apply the file itself)
kubectl get secret credpay-db -n credpay
kubectl describe secret credpay-db -n credpay   # shows key NAMES, never values
```
