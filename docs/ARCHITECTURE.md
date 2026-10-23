# CREDPAY - Architecture (High Level)

CREDPAY is a credit-card bill-payment platform built as a set of small services. Customers
manage their cards and pay bills in one web app; administrators watch customers and
payments in a second web app. Sign-in is handled by a dedicated identity server (Keycloak),
and every service checks who is calling on every request.

This document is the high-level view: what the parts are, how people reach them, why it
counts as enterprise grade, and how we are building it. A detailed design follows later.

> Payments are **simulated** - no real payment gateway or card network is involved.

---

## 1. Who uses CREDPAY and how they connect

| User | Uses | Signs in with | Can do |
| --- | --- | --- | --- |
| **Customer** | Customer Portal | Keycloak account (email + password); Google optional | Register, add cards, pay bills, see own payment history |
| **Administrator** | Admin Portal | Keycloak account with the `ADMIN` role (Microsoft Entra ID planned) | See all customers, all transactions, totals and trends |
| **Operations / DevOps** | Keycloak console, logs, (later) Grafana / Dynatrace | Keycloak admin, cloud accounts | Manage users and roles, run and monitor the platform |

### Sign-in flow (both portals)

The portals never see a password. They use the standard **OAuth 2.0 authorization code
flow with PKCE** (OpenID Connect):

```
 Browser                Portal (React)           Keycloak                  Service (API)
    │  open portal            │                       │                          │
    │────────────────────────►│                       │                          │
    │      redirect to sign in│                       │                          │
    │◄────────────────────────│                       │                          │
    │  email + password (Keycloak's own page)         │                          │
    │────────────────────────────────────────────────►│ checks password,         │
    │                         │                       │ policy, lock-out         │
    │  redirect back with a one-time code             │                          │
    │◄────────────────────────────────────────────────│                          │
    │                         │  code + PKCE verifier │                          │
    │                         │──────────────────────►│                          │
    │                         │  access token (JWT, 5 min) + refresh token       │
    │                         │◄──────────────────────│                          │
    │                         │  API call  +  Authorization: Bearer <token>      │
    │                         │─────────────────────────────────────────────────►│
    │                         │                       │   verify signature,      │
    │                         │                       │   issuer, audience,      │
    │                         │                       │   expiry, role           │
    │                         │  data for THIS user only                          │
    │                         │◄─────────────────────────────────────────────────│
```

The access token carries the user's identity (`sub`, `email`) and roles (`USER` or
`ADMIN`). The services take the user **from the token, never from the request**, so a
customer cannot read or pay with another customer's data by changing an ID.

---

## 2. The system at a glance

### Today - Phase 1, running on a laptop

```
                      ┌──────────────────────────── Keycloak (8081) ─────────────────────────────┐
                      │ realm "credpay": accounts, password policy, lock-out, roles USER/ADMIN   │
                      │ clients: customer-portal, admin-portal        (optional: Google, Entra)  │
                      └───────▲──────────────────────────────▲───────────────────────────────────┘
                     sign in  │                              │ sign in
                              │                              │
 Customer ──► Customer Portal (React, 5173)       Admin Portal (React, 5174) ◄── Administrator
                   │ Bearer token                         │ Bearer token
          ┌────────┴─────────────────┐       ┌────────────┴────────────┐
          ▼                          ▼       ▼                         ▼
 user-service (Java/Spring, 8080)        payment-service (Python/FastAPI, 8000)
  /api/users/me   /api/cards              /api/payment/pay   /api/payment/history
  /api/admin/users (ADMIN)                /api/admin/payments (ADMIN)
  Flyway migrations (owns the schema)
          │                                          │
          └──────────────► PostgreSQL (5432) ◄───────┘
                           database "credpay": users, cards, payments
                           database "keycloak": Keycloak's own data
```

PostgreSQL and Keycloak run in Docker; the four applications run directly on the laptop so
students can see them build and start.

### Target - on Azure Kubernetes Service (next phases)

```
 Internet ──► Ingress (HTTPS, one address, rate limits, security headers)
                 ├── /            → Customer Portal  (container)
                 ├── /admin       → Admin Portal     (container)
                 ├── /auth        → Keycloak         (container)
                 ├── /api/users…  → user-service     (pods, autoscaled)
                 └── /api/payment → payment-service  (pods, autoscaled)
                                         │
                       Azure Database for PostgreSQL · Azure Key Vault (secrets)
                                         │
     Prometheus + Grafana · Dynatrace (traces, logs, Davis AI) · ai-service (AIOps, Azure OpenAI)
```

The same code and the same container images run in both places; only configuration
(environment variables) changes.

---

## 3. Technology stack

| Layer | Technology | Why |
| --- | --- | --- |
| Customer & Admin portals | React 18, Vite, Material UI | Fast single-page apps with a consistent design system |
| Sign-in in the portals | `oidc-client-ts`, `react-oidc-context` | Standard OpenID Connect client - works with Keycloak, Google, Entra |
| Identity & access | **Keycloak 26** | Open-source enterprise identity server: SSO, roles, policies, social and corporate login |
| user-service | **Java 21, Spring Boot 3.5**, Spring Security (OAuth2 resource server), Spring Data JPA | Industry-standard Java stack; token validation built in |
| payment-service | **Python 3.12, FastAPI**, SQLAlchemy, PyJWT | Lightweight, typed API with automatic validation and OpenAPI docs |
| Database | **PostgreSQL 17** | Reliable relational database; Azure has a managed version |
| Schema changes | **Flyway** | Versioned, repeatable database migrations |
| Metrics | Spring Actuator / Micrometer, Prometheus FastAPI instrumentator | `/actuator/prometheus` and `/metrics` ready for Prometheus |
| Local infrastructure | Docker, Docker Compose | Identical PostgreSQL + Keycloak on every laptop with one command |
| Automation | PowerShell scripts | One-command setup, start and stop for Windows laptops |
| Tests | JUnit 5 + Spring Security Test, pytest | Security rules and business rules checked automatically |
| *Next phases* | Azure DevOps Pipelines, Terraform, AKS, Azure Key Vault, ACR, Prometheus, Grafana, Dynatrace, Azure OpenAI | Delivery, cloud runtime, observability, AIOps |

---

## 4. Components and responsibilities

| Component | Responsibility | Talks to |
| --- | --- | --- |
| **Customer Portal** | Customer UI: sign in/register (via Keycloak), dashboard, add card, pay bill, history | Keycloak, user-service, payment-service |
| **Admin Portal** | Admin UI: overview KPIs and 7-day trend, users, transactions; monitoring placeholder | Keycloak, user-service, payment-service |
| **Keycloak** | Accounts, passwords, login pages, password policy, lock-out, roles, tokens | PostgreSQL (`keycloak` DB) |
| **user-service** | Customer profile (created on first login), cards (masked, Luhn-checked), admin user list and summary; **owns the database schema** (Flyway) | PostgreSQL |
| **payment-service** | Payments for the signed-in customer (card ownership check, idempotency), payment history, admin transaction list and summary | PostgreSQL |
| **PostgreSQL** | `credpay` data: `users`, `cards`, `payments` | - |

### Main APIs

| Service | Endpoint | Who |
| --- | --- | --- |
| user-service | `GET /api/users/me` | Customer (creates the profile on first login) |
| user-service | `GET`, `POST /api/cards` | Customer - own cards only |
| user-service | `GET /api/admin/users`, `GET /api/admin/users/summary` | Admin |
| payment-service | `POST /api/payment/pay` (header `Idempotency-Key`) | Customer - own cards only |
| payment-service | `GET /api/payment/history` | Customer - own payments only |
| payment-service | `GET /api/admin/payments`, `GET /api/admin/payments/summary` | Admin |
| both | `/health`, readiness and metrics endpoints | Platform (no token) |

---

## 5. Data

| Table | Holds | Notes |
| --- | --- | --- |
| `users` | id, full name, email, `keycloak_id`, created | **No passwords** - Keycloak owns credentials |
| `cards` | owner, holder name, **masked** number (`**** **** **** 1111`), network, expiry | The full card number is never stored |
| `payments` | owner, card, amount, UPI ID, transaction ID, status, `idempotency_key`, created | One payment per idempotency key per customer |

The schema is versioned with Flyway (`user-service/src/main/resources/db/migration`) and
applied automatically when user-service starts.

---

## 6. What makes it enterprise grade

| Area | What we did | Before |
| --- | --- | --- |
| **Identity** | Dedicated identity server (Keycloak); portals never handle passwords; standard OIDC + PKCE | Home-made login, passwords stored in plain text |
| **Authorization** | Every API validates the token (signature, issuer, audience, expiry) and role; the user comes from the token | `userId` sent by the browser - anyone could act as any user |
| **Account security** | Password policy, lock-out after 5 failures, sessions that really end on logout, 5-minute tokens with silent refresh | None |
| **Separation of duties** | Separate Customer and Admin portals and APIs; `ADMIN` role enforced by the services, not just the UI | Single app, no admin role |
| **Data protection** | No passwords in the app database; masked card numbers; errors never expose internals | Plain-text passwords; stack details in errors |
| **Payment correctness** | Card ownership check, Luhn and expiry validation, amount and UPI validation, idempotent payments, race-free transaction IDs | Double-clicks could pay twice; weak validation |
| **Database** | Versioned migrations (Flyway) applied on startup | SQL file run by hand |
| **Configuration** | Every setting from environment variables with safe local defaults; no secrets in Git (`.env`, `*.tfvars`, `secret.yaml` ignored; history cleaned) | Hard-coded values; a live API key and subscription ID in Git |
| **Operability** | Liveness/readiness health checks, Prometheus metrics, quiet logs (no SQL dumps) | Basic health only, SQL logged |
| **Quality** | Automated security and business-rule tests | No tests |
| **Developer experience** | One-command setup/start/stop; identical environment on every laptop | Manual installs, frequent setup problems |

What still makes it *more* enterprise grade comes in the next phases: HTTPS and an ingress
in front of everything, secrets in Key Vault, a DevSecOps pipeline with security gates,
autoscaling, central monitoring and AIOps.

---

## 7. Our approach

**Principles**

1. **Security first** - identity, authorization and secret handling were fixed before
   adding features.
2. **Same code everywhere** - the laptop, the pipeline and AKS run the same code; only
   environment variables differ.
3. **Everything as code** - Keycloak realm, database schema, infrastructure (Terraform),
   Kubernetes manifests and pipelines all live in the repo.
4. **Standards over custom code** - OpenID Connect, JWT, RFC 9457 error responses,
   Flyway, Docker - skills that transfer to any company.
5. **Small, testable steps** - each step is one commit that runs and is tested, so students
   can check out any step.

**Phases**

| Phase | Scope | Status |
| --- | --- | --- |
| **1. Local, enterprise-ready application** | Keycloak sign-in, secured APIs, Flyway, Customer + Admin portals, tests, setup scripts | **Done** |
| **2. Kubernetes and DevSecOps** | Container images, Azure DevOps pipeline with security gates (SAST, dependency and image scanning, IaC scanning), Terraform for AKS, Ingress with HTTPS, Keycloak on AKS, Key Vault | Next |
| **3. Observability and AIOps** | Prometheus and Grafana, Dynatrace (traces, logs, Davis AI problems), ai-service with Azure OpenAI, live Monitoring/AIOps pages in the Admin Portal | Planned |

---

## 8. Where to find things

| Path | Contents |
| --- | --- |
| `customer-portal/` | Customer web app (React) |
| `admin-portal/` | Admin web app (React) |
| `user-service/` | Java service, Flyway migrations (`src/main/resources/db/migration`) |
| `payment-service/` | Python service and tests |
| `ai-service/` | AIOps service (used from Phase 3) |
| `infra/` | Docker Compose, Keycloak realm and login theme |
| `scripts/` | Setup, start and stop scripts |
| `k8s/`, `terraform/`, `azure-pipelines*.yml` | Kubernetes manifests, infrastructure and pipelines (updated in Phase 2) |
| `docs/LOCAL-SETUP-GUIDE.md` | How to run everything locally |
