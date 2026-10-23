#!/usr/bin/env bash
# =====================================================================
# Verify Grafana is running and auto-wired to Prometheus
# =====================================================================
set -uo pipefail
NS=monitoring

echo "===== Pod ====="
kubectl get pods -n "$NS" -l app.kubernetes.io/name=grafana -o wide

echo
echo "===== Deployment / PVC / Service ====="
kubectl get deployment grafana -n "$NS"
kubectl get pvc grafana-data -n "$NS"
kubectl get svc grafana -n "$NS"

echo
echo "===== Logs ====="
kubectl logs deployment/grafana -n "$NS" --tail=20

echo
echo "===== Confirm the Prometheus datasource auto-provisioned correctly ====="
kubectl exec -n "$NS" deployment/grafana -- wget -qO- http://admin:admin@localhost:3000/api/datasources \
  | grep -o '"name":"[^"]*"\|"url":"[^"]*"' \
  || echo "Could not query the datasources API - is the Grafana pod Running?"

echo
echo "Next: kubectl port-forward -n $NS svc/grafana 3000:3000"
echo "Then open http://localhost:3000 - login: admin / admin (change immediately)"
