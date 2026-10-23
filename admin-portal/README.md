# CREDPAY Admin Portal

React + MUI app for CREDPAY administrators: http://localhost:5174

| Page | Shows | API |
| --- | --- | --- |
| Overview | customers, cards, payments today, success rate, totals, last 7 days chart, latest transactions | `GET /api/admin/users/summary`, `GET /api/admin/payments/summary`, `GET /api/admin/payments` |
| Users | all customers, search by name or email, card count | `GET /api/admin/users` (user-service) |
| Transactions | all payments, search by transaction id / email / UPI id, filter by status | `GET /api/admin/payments` (payment-service) |
| Monitoring | placeholder - Prometheus, Grafana, Dynatrace and AIOps arrive in the Kubernetes phase | - |

## Access

Admins sign in on Keycloak (client `admin-portal`). Only accounts with the **ADMIN** realm
role get in; anyone else sees *Access denied*. The services check the role again on every
`/api/admin/**` call, so the portal's check is for convenience, not security.

Local demo admin: `admin@credpay.local` / `Admin@123`

To make another account an admin: Keycloak admin console (http://localhost:8081/admin,
`admin` / `admin`) → realm **credpay** → Users → the user → Role mapping → Assign role → `ADMIN`.

## Run

```powershell
Copy-Item .env.example .env   # first time only
npm install                   # first time only
npm run dev
```

user-service (8080), payment-service (8000) and Keycloak (8081) must be running -
or start everything with `.\scripts\start-all.ps1` from the repo root.
