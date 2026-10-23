#!/usr/bin/env bash
# =====================================================================
# Verify Prometheus + Node Exporter + kube-state-metrics - one script
# =====================================================================
set -uo pipefail
NS=monitoring

echo "===== Pods ====="
kubectl get pods -n "$NS" -o wide

echo
echo "===== Node Exporter - expect one Pod per cluster node ====="
echo "Cluster node count: $(kubectl get nodes --no-headers | wc -l)"
kubectl get pods -n "$NS" -l app.kubernetes.io/name=node-exporter -o wide

echo
echo "===== Deployments / PVC ====="
kubectl get deployment prometheus kube-state-metrics -n "$NS"
kubectl get pvc prometheus-data -n "$NS"

echo
echo "===== Logs - confirm each component started cleanly ====="
echo "--- prometheus ---"
kubectl logs deployment/prometheus -n "$NS" --tail=15
echo "--- node-exporter (one pod shown) ---"
kubectl logs daemonset/node-exporter -n "$NS" --tail=15
echo "--- kube-state-metrics ---"
kubectl logs deployment/kube-state-metrics -n "$NS" --tail=15

echo
echo "===== Scrape target health (queried from inside the Prometheus pod) ====="
kubectl exec -n "$NS" deployment/prometheus -- wget -qO- http://localhost:9090/api/v1/targets \
  | grep -o '"scrapeUrl":"[^"]*"\|"health":"[a-z]*"' \
  || echo "Could not query the targets API - is the Prometheus pod Running?"

echo
echo "If every 'health' value above reads \"up\", all three components are being"
echo "scraped successfully. For the full UI:"
echo "  kubectl port-forward -n $NS svc/prometheus 9090:9090"
echo "  open http://localhost:9090/targets"
