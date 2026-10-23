#!/usr/bin/env bash
# =====================================================================
# Deploy Prometheus + Node Exporter + kube-state-metrics - one script
# =====================================================================
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> 1/3 Prometheus server"
kubectl apply -f "$DIR/01-prometheus-server/prometheus.yaml"

echo "==> 2/3 Node Exporter"
kubectl apply -f "$DIR/02-node-exporter/node-exporter.yaml"

echo "==> 3/3 kube-state-metrics"
kubectl apply -f "$DIR/03-kube-state-metrics/kube-state-metrics.yaml"

echo "==> Waiting for rollouts"
kubectl rollout status deployment/prometheus -n monitoring --timeout=180s
kubectl rollout status daemonset/node-exporter -n monitoring --timeout=180s
kubectl rollout status deployment/kube-state-metrics -n monitoring --timeout=120s

echo
echo "All three deployed. Run ./verify.sh to confirm everything is up and scraped."
