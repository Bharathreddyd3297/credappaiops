# Step-by-Step: Removing the Observability + AIOps Platform (kubectl only)

The teardown counterpart to `STEP-BY-STEP-DEPLOYMENT-GUIDE.md`. Use this
when you want to practice the full remove → redeploy cycle, or genuinely
start the monitoring/AIOps layer over from a clean slate.

**What this removes:** everything in the `monitoring` namespace
(Prometheus, Node Exporter, kube-state-metrics, Grafana) and everything
`credai-service` added to the `credpay` namespace (Deployment, Service,
HPA, Ingress, Secret, ConfigMap, RBAC).

**What this never touches:** `frontend-blue`/`frontend-green`,
`user-service`, `payment-service`, PostgreSQL, the main `k8s/ingress/`
object, or anything in the git repository. Only live cluster resources
are deleted — nothing here runs `git rm` or edits a file.

Run these from any bash-compatible shell (Git Bash, WSL, macOS/Linux
Terminal) — `kubectl`/`az` commands only, no PowerShell.

---

## Table of contents

1. [Before you start](#1-before-you-start)
2. [Remove ai-service](#2-remove-ai-service)
3. [Remove Grafana](#3-remove-grafana)
4. [Remove kube-state-metrics](#4-remove-kube-state-metrics)
5. [Remove Node Exporter](#5-remove-node-exporter)
6. [Remove Prometheus (and the monitoring namespace)](#6-remove-prometheus-and-the-monitoring-namespace)
7. [Fast path: delete everything in one command](#7-fast-path-delete-everything-in-one-command)
8. [Verify the teardown](#8-verify-the-teardown)
9. [What happens to persistent data](#9-what-happens-to-persistent-data)
10. [Rebuilding from scratch](#10-rebuilding-from-scratch)

---

## 1. Before you start

Confirm what's actually running, so you have a clear "before" picture to
compare against once you rebuild:

```bash
kubectl get all -n monitoring
kubectl get all -n credpay -l app.kubernetes.io/name=credai-service
kubectl get pvc -n monitoring
```

The removal below goes in the **reverse order** of
`STEP-BY-STEP-DEPLOYMENT-GUIDE.md` — the guide builds
Prometheus → Node Exporter → kube-state-metrics → Grafana → ai-service;
this guide removes ai-service first (the consumer at the top of the
stack) down to Prometheus last (the foundation everything else reads
from).

## 2. Remove ai-service

```bash
kubectl delete -f k8s/ai-service/ingress.yaml --ignore-not-found
kubectl delete -f k8s/ai-service/hpa.yaml --ignore-not-found
kubectl delete -f k8s/ai-service/service.yaml --ignore-not-found
kubectl delete -f k8s/ai-service/deployment.yaml --ignore-not-found
kubectl delete secret credai-secrets -n credpay --ignore-not-found
kubectl delete -f k8s/ai-service/configmap.yaml --ignore-not-found
kubectl delete -f k8s/ai-service/rbac.yaml --ignore-not-found
```

Check:

```bash
kubectl get all -n credpay -l app.kubernetes.io/name=credai-service
```

Expect empty output — no Pods, Service, Deployment, or HPA left.
`kubectl get ingress -n credpay` should now show only the original
`credpay` Ingress, not `credai-service`.

## 3. Remove Grafana

```bash
kubectl delete -f observability/grafana/01-installation/grafana.yaml --ignore-not-found
kubectl delete -f observability/grafana/02-datasource/grafana-datasource.yaml --ignore-not-found
```

## 4. Remove kube-state-metrics

```bash
kubectl delete -f observability/prometheus/03-kube-state-metrics/kube-state-metrics.yaml --ignore-not-found
```

## 5. Remove Node Exporter

```bash
kubectl delete -f observability/prometheus/02-node-exporter/node-exporter.yaml --ignore-not-found
```

## 6. Remove Prometheus (and the monitoring namespace)

`prometheus.yaml` created the `monitoring` namespace itself when you
deployed it — deleting the file's resources deletes the namespace too,
since `kind: Namespace` is one of the objects it defines:

```bash
kubectl delete -f observability/prometheus/01-prometheus-server/prometheus.yaml --ignore-not-found
```

Namespace deletion is asynchronous — it may take a minute to fully
disappear as Kubernetes garbage-collects everything inside it.

## 7. Fast path: delete everything in one command

Once you understand what each piece above actually does, this single
command achieves the same end state as steps 2–6 combined — deleting the
namespace removes every object that lives inside it in one shot:

```bash
kubectl delete -f k8s/ai-service/ingress.yaml -f k8s/ai-service/hpa.yaml `
  -f k8s/ai-service/service.yaml -f k8s/ai-service/deployment.yaml `
  -f k8s/ai-service/configmap.yaml -f k8s/ai-service/rbac.yaml `
  --ignore-not-found
kubectl delete secret credai-secrets -n credpay --ignore-not-found
kubectl delete namespace monitoring --ignore-not-found
```

(ai-service's own resources live in the `credpay` namespace alongside the
core app, so they can't be removed by deleting a namespace — that
namespace has to stay. Only the truly monitoring-only pieces get the
one-line namespace shortcut.)

## 8. Verify the teardown

```bash
kubectl get ns
# "monitoring" should be gone (or "Terminating" briefly)

kubectl get all -n credpay
# only frontend-blue/frontend-green, payment-service, user-service remain

kubectl get all -n monitoring
# Error from server (NotFound) - expected once the namespace is gone
```

Confirm the core app is completely unaffected:

```bash
kubectl get pods -n credpay -l app.kubernetes.io/name=frontend
kubectl get pods -n credpay -l app.kubernetes.io/name=payment-service
kubectl get pods -n credpay -l app.kubernetes.io/name=user-service
```

All should still show `Running`, with restart counts unchanged from
before you started.

## 9. What happens to persistent data

Prometheus and Grafana each had a `PersistentVolumeClaim`
(`prometheus-data`, `grafana-data`) backed by the `managed-csi` storage
class, whose reclaim policy is `Delete` — confirm with:

```bash
kubectl get sc managed-csi -o jsonpath='{.reclaimPolicy}'
```

`Delete` means deleting the PVC (which happens automatically when its
namespace is deleted) also deletes the underlying Azure Disk — there's
nothing left over to clean up manually in the Azure Portal, and no
orphaned disk cost. This also means **all historical metrics and Grafana
settings are genuinely gone** after this guide — a fresh Prometheus starts
with an empty TSDB and a fresh Grafana starts at `admin`/`admin` again.
This is expected and matches "starting from scratch."

If you ever see a storage class with `RECLAIMPOLICY: Retain` instead, the
underlying disk would survive the PVC's deletion and need manual removal
via `az disk delete` — not the case for this project's default
`managed-csi` class, but worth checking with the command above before
relying on it in a different cluster.

## 10. Rebuilding from scratch

Once §8 confirms everything monitoring/AIOps-related is gone, follow
`STEP-BY-STEP-DEPLOYMENT-GUIDE.md` from its §2 onward. The only step that
needs anything from you personally is its §10 (the Azure OpenAI Secret) —
everything else is a straight `kubectl apply` in order.
