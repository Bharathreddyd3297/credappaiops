# 4. `postgres/schema-init-job.yaml`

**One-line purpose:** a **one-shot** Kubernetes Job that connects to Azure
PostgreSQL and runs `schema.sql`, creating the `users`, `cards`, and
`payments` tables before either backend starts.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-schema-init
  namespace: credpay
  labels:
    app.kubernetes.io/part-of: credpay
spec:
  backoffLimit: 3
  ttlSecondsAfterFinished: 600
  template:
    metadata:
      labels:
        app.kubernetes.io/name: db-schema-init
        app.kubernetes.io/part-of: credpay
    spec:
      restartPolicy: Never
      securityContext:
        runAsNonRoot: true
        runAsUser: 70
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: psql
          image: postgres:16-alpine
          imagePullPolicy: IfNotPresent
          command:
            - /bin/sh
            - -c
            - |
              set -e
              echo "Applying schema to $DB_HOST/$DB_NAME ..."
              psql "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USERNAME sslmode=require" \
                   -v ON_ERROR_STOP=1 -f /schema/schema.sql
              echo "Schema applied."
          env:
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef:
                  name: credpay-db
                  key: DB_PASSWORD
          envFrom:
            - configMapRef:
                name: credpay-config
          volumeMounts:
            - name: schema
              mountPath: /schema
              readOnly: true
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
      volumes:
        - name: schema
          configMap:
            name: db-schema
```

## Why this exists at all

`user-service` runs Hibernate with `spring.jpa.hibernate.ddl-auto=validate`
— on startup, Hibernate checks the `users`/`cards` tables exist and match
the JPA entity definitions, but it **refuses to create or alter them**. If
the tables don't exist, the pod fails to start. Azure PostgreSQL Flexible
Server doesn't run any bootstrap SQL for you, so *something* has to apply
`schema.sql` before the backends ever start. This Job is that something.

## Block by block

**`kind: Job` (not `Deployment`)**
A Job runs its pod(s) to completion **once** and stops — it's for
run-to-finish tasks, not long-running servers. Contrast with a Deployment,
which keeps its replica count running forever and restarts crashed pods
indefinitely.

**`spec.backoffLimit: 3`**
If the container exits non-zero (e.g. a transient network blip to
Postgres), Kubernetes retries up to 3 times before marking the Job
`Failed`. Each retry creates a new pod.

**`spec.ttlSecondsAfterFinished: 600`**
Once the Job completes (success or failure), Kubernetes automatically
deletes it (and its pod) 600 seconds later. Without this, completed Jobs
pile up in `kubectl get pods` forever — this keeps the namespace tidy.

**`spec.template.spec.restartPolicy: Never`**
Jobs cannot use `restartPolicy: Always` (that's a Deployment concept). It's
either `Never` (failed pod → Job creates a brand-new pod, up to
`backoffLimit`) or `OnFailure` (same pod restarts in place). `Never` is
used here for clean, inspectable per-attempt logs.

**`securityContext.runAsUser: 70`**
UID 70 is the `postgres` user baked into the official `postgres:16-alpine`
image. Running as this specific non-root UID (rather than root) is
possible here — unlike the frontend's nginx image — because this container
never needs to bind a privileged port or chown files.

**`command` — the actual work**
A shell one-liner using `set -e` (exit immediately on any failure, so a
SQL error correctly fails the Job instead of silently continuing) and
`psql` with `-v ON_ERROR_STOP=1` (make `psql` itself stop and return
non-zero on the first SQL error, rather than plowing through the rest of
the script). The connection string interpolates `$DB_HOST`, `$DB_PORT`,
`$DB_NAME`, `$DB_USERNAME` — all coming from `envFrom: configMapRef` below.

**`env.PGPASSWORD` (from the Secret)**
`psql` has no `--password` flag (deliberately, since command-line args are
visible to anyone who can list processes) — instead it reads the
`PGPASSWORD` environment variable automatically if set. That's why this is
wired as `env:` (not `envFrom:`), pulling one specific key
(`DB_PASSWORD`) out of the `credpay-db` Secret.

**`envFrom.configMapRef: credpay-config`**
Pulls in `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME` (and the two
Spring-only keys, which this container simply ignores) as environment
variables in one shot — same ConfigMap the backends use, so the schema Job
is guaranteed to target the exact same database.

**`volumeMounts` / `volumes` — how `schema.sql` gets into the container**
This container's *image* (`postgres:16-alpine`) doesn't contain this
repo's `schema.sql` — it's the stock upstream Postgres client image. The
file is injected via a ConfigMap volume instead: `kubectl create configmap
db-schema --from-file=schema.sql=schema.sql` copies the repo's
`schema.sql` into a ConfigMap named `db-schema`, and the `volumes` block
mounts that ConfigMap's contents as a file at `/schema/schema.sql` (`readOnly:
true` — the container only ever reads it). This is why creating that
ConfigMap is a **prerequisite step**, not part of this file itself.

**`securityContext.readOnlyRootFilesystem: true` + `capabilities: drop: ["ALL"]`**
Maximum least-privilege: the container can't write anywhere except the
explicitly mounted volume, and has zero Linux capabilities beyond what an
unprivileged process gets by default. `psql` doesn't need to write to disk
or use any elevated capability, so this costs nothing functionally.

## Is it safe to re-run?

Yes, non-destructively. `schema.sql` uses `CREATE TABLE IF NOT EXISTS` for
all three tables, and its sample-data `INSERT`s are each guarded by
`WHERE NOT EXISTS (SELECT 1 FROM <table>)` — so they only ever fire once,
against an empty table. Real users/cards/payments created through the
live app are never touched. This is exactly why `azure-pipelines.yml` runs
this Job on **every** deploy, not just the first one: it needs to be safe
to run routinely against a database you care about. (An earlier version of
this file opened with `DROP TABLE ... CASCADE`, which was genuinely
destructive on every re-run — see `STAGE2-CHANGES.md` for why and how it
was fixed.)

## Apply & verify

```powershell
# Prerequisite: load schema.sql into a ConfigMap
kubectl create configmap db-schema `
  --namespace credpay `
  --from-file=schema.sql=schema.sql

kubectl apply -f k8s/postgres/schema-init-job.yaml
kubectl wait --for=condition=complete job/db-schema-init -n credpay --timeout=120s
kubectl logs job/db-schema-init -n credpay
```
