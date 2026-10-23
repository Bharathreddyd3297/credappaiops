#!/usr/bin/env bash
# =====================================================================
# Deploy Grafana, pre-wired to the existing Prometheus - one script
# =====================================================================
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> 1/2 Prometheus datasource (auto-provisioned)"
kubectl apply -f "$DIR/02-datasource/grafana-datasource.yaml"

echo "==> 2/2 Grafana"
kubectl apply -f "$DIR/01-installation/grafana.yaml"

echo "==> Waiting for rollout"
kubectl rollout status deployment/grafana -n monitoring --timeout=180s

echo
echo "Grafana deployed. Run ./verify.sh, then:"
echo "  kubectl port-forward -n monitoring svc/grafana 3000:3000"
echo "  open http://localhost:3000  (login: admin / admin - change it immediately)"
