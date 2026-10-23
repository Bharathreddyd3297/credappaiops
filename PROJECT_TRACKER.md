# CREDPAY CAPSTONE PROJECT TRACKER

## Project Overview

Build a simplified CRED-style application using:

* React Frontend
* Spring Boot User Service
* FastAPI Payment Service
* PostgreSQL Database
* Spring Cloud API Gateway

The application will run locally first.

Docker, Terraform, AKS, Azure DevOps and CI/CD will be implemented later.

---

## Functional Requirements

### User Module

* Register User
* Login User

### Card Module

* Add Credit Card
* View Credit Cards

### Payment Module

* Enter Amount
* Enter UPI ID
* Simulate Payment
* Display Success Message

---

## Technology Stack

Frontend:

* React

Backend:

* Java Spring Boot
* Python FastAPI

Database:

* PostgreSQL

Gateway:

* Spring Cloud Gateway

---

## Database Tables

### users

Status: DONE (defined in schema.sql)

### cards

Status: DONE (defined in schema.sql)

### payments

Status: DONE (defined in schema.sql)

---

## Services

### Frontend

Status: IN PROGRESS (React foundation built - Vite + MUI dark luxury theme)

Tasks:

* Login Page - DONE
* Register Page - DONE
* Dashboard - DONE (cards, recent payments, quick actions, stats)
* Add Card Page - DONE (live card preview)
* Payment Page - DONE (Pay Bill: card select + amount + UPI)
* Success Page - DONE (animated success state)

Stack: React 18, Vite, React Router DOM, Axios, Material UI v6.
Location: frontend-react/  (dev port 5173)
API wiring: src/services/api.js -> User (8080) + Payment (8000), with
graceful mock-data fallback when backend is unreachable.
Build: VERIFIED - `npm run build` succeeds (1016 modules, exit 0).
Live end-to-end against running backends not yet exercised.

### User Service

Status: IN PROGRESS (Register + Login + Card APIs implemented)

Tasks:

* Register API - DONE (POST /api/users/register)
* Login API - DONE (POST /api/users/login, returns userId/fullName/email/message)
* Add Card API - DONE (POST /api/cards/add, stores masked number)
* List Card API - DONE (GET /api/cards/user/{userId})

Build: VERIFIED - `mvn clean compile` BUILD SUCCESS (release 21 on JDK 25).
Fixes applied: Lombok bumped to 1.18.46 (JDK 25 compat) + declared as
annotation processor in maven-compiler-plugin.
Passwords: PLAIN TEXT for now (BCrypt removed - not required for local capstone).

### Payment Service

Status: IN PROGRESS (FastAPI service implemented - Python 3.14, port 8000)

Tasks:

* Pay API - DONE (POST /api/payment/pay, generates TXN id, status=SUCCESS)
* Payment History API - DONE (GET /api/payment/history/{userId})

Note: payments table needed a transaction_id column (was missing from
original schema.sql). Added to schema.sql + migrations/001_add_transaction_id.sql.
Verified: deps install on Python 3.14, app imports, routes registered.
Runtime against live DB not yet exercised.

### API Gateway

Status: NOT STARTED

Tasks:

* Route User Service
* Route Payment Service

---

# Progress Log

## Day 1

[x] PostgreSQL Installed

[x] Database Schema Created (schema.sql: users, cards, payments + sample data)

[x] User Service Created (Spring Boot 3.5.x / Java 21 / Maven, port 8080)

[x] User Registration API Working (POST /api/users/register)

[x] User Login API Working (POST /api/users/login)

[x] Card Registration API Working (POST /api/cards/add - stores masked number)

[x] Card Listing API Working (GET /api/cards/user/{userId})

[x] Payment Service Created (FastAPI / Python 3.14, port 8000)

[x] Payment API Working (POST /api/payment/pay, GET /api/payment/history/{userId})

[x] React Application Created (frontend-react/ - Vite + MUI, all 7 pages + routing)

[~] Frontend Connected to Backend (API layer wired to 8080/8000; mock fallback; live test pending)

[ ] End-to-End Testing Completed

---

## Day 2

[ ] GitHub Repository

[~] Dockerfiles (user-service: multi-stage, eclipse-temurin:21-jre-alpine - DONE;
    payment-service: python:3.14-slim, non-root, uvicorn ENTRYPOINT - DONE;
    frontend-react: multi-stage node:22-alpine -> nginx:stable-alpine SPA, ~93MB,
    built + smoke-tested (/ and /dashboard -> 200) - DONE; gateway pending)

[ ] Docker Compose

---

## Day 3

[ ] Terraform

[ ] AKS

[ ] ACR

[ ] PostgreSQL Azure

---

## Day 4

[ ] Azure DevOps Pipeline

[ ] Prometheus

[ ] Grafana

[ ] Azure OpenAI Observability
