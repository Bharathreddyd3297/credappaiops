# CREDPAY Payment Service

FastAPI service (Python 3.14) that simulates payments against the existing
`credpay` PostgreSQL database. Runs on **port 8000**.

## Folder structure

```
payment-service/
├── requirements.txt
├── README.md
├── .gitignore
└── app/
    ├── __init__.py
    ├── main.py        # FastAPI app + router wiring
    ├── database.py    # engine, SessionLocal, Base, get_db dependency
    ├── models.py      # SQLAlchemy models (users, cards, payments)
    ├── schemas.py     # Pydantic request/response models
    ├── services.py    # business logic (service layer)
    └── routes.py      # API routes
```

## Prerequisites

- Python 3.14 (`python --version`)
- PostgreSQL running locally with the `credpay` database
- The `payments` table must have a `transaction_id` column. If your DB was
  created before that column existed, run the migration once:
  ```powershell
  psql -U postgres -d credpay -f ..\migrations\001_add_transaction_id.sql
  ```

## Install dependencies

```powershell
cd payment-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Configure database (optional)

Defaults: `postgres/postgres` @ `localhost:5432/credpay`. Override via env vars:

```powershell
$env:DB_USERNAME = "postgres"
$env:DB_PASSWORD = "yourpassword"
```

## Run locally

```powershell
uvicorn app.main:app --reload --port 8000
```

- Service: http://localhost:8000
- Interactive docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

## APIs

### Make a payment
```
POST /api/payment/pay
Content-Type: application/json

{ "userId": 3, "cardId": 4, "amount": 2500, "upiId": "bharath@ybl" }
```
Response:
```json
{ "transactionId": "TXN20260624001", "status": "SUCCESS", "amount": 2500 }
```
- User must exist → otherwise `404`.
- Card must exist → otherwise `404`.

### Payment history
```
GET /api/payment/history/{userId}
```
Response:
```json
[ { "transactionId": "TXN20260624001", "amount": 2500, "status": "SUCCESS", "createdAt": "2026-06-24T12:00:00+00:00" } ]
```

## Test with curl

```powershell
curl -X POST http://localhost:8000/api/payment/pay `
  -H "Content-Type: application/json" `
  -d '{"userId":3,"cardId":4,"amount":2500,"upiId":"bharath@ybl"}'

curl http://localhost:8000/api/payment/history/3
```

## Docker

Production-ready image built on `python:3.14-slim`. Dependencies are installed
from `requirements.txt` (cached layer), the app runs as a **non-root** user, and
Uvicorn starts automatically on port 8000 (no `--reload`). Database settings are
read from environment variables, so the same image runs on Docker Desktop,
Docker Hub, ACR and AKS without modification.

> Run all commands from the `payment-service/` directory (where the `Dockerfile` is).

### 1. Build the image

```bash
docker build -t credpay-payment:v1 .
```

### 2. Verify the image exists

```bash
docker images
```

### 3. Run the container

```bash
docker run -d --name credpay-payment -p 8000:8000 credpay-payment:v1
```

> Inside a container `localhost` is the container itself. To reach a PostgreSQL
> running on your host, override the DB host:
> ```bash
> docker run -d --name credpay-payment -p 8000:8000 \
>   -e DB_HOST=host.docker.internal -e DB_USERNAME=postgres -e DB_PASSWORD=postgres \
>   -e DB_PORT=5432 -e DB_NAME=credpay \
>   credpay-payment:v1
> ```

### 4. Verify the container is running

```bash
docker ps
```

### 5. View logs

```bash
docker logs credpay-payment
```

### 6. Access Swagger UI

```
http://localhost:8000/docs
```

### 7. Stop the container

```bash
docker stop credpay-payment
```

### 8. Remove the container

```bash
docker rm credpay-payment
```

### 9. Remove the image

```bash
docker rmi credpay-payment:v1
```

### Configuration

| Env var | Default | Purpose |
|---|---|---|
| `DB_USERNAME` | `postgres` | PostgreSQL user |
| `DB_PASSWORD` | `postgres` | PostgreSQL password |
| `DB_HOST` | `localhost` | DB host (`host.docker.internal` for host DB) |
| `DB_PORT` | `5432` | DB port |
| `DB_NAME` | `credpay` | Database name |
