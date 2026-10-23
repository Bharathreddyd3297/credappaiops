# CREDPAY User Service

Spring Boot 3.5.x / Java 21 service exposing user **register** and **login** APIs,
backed by the existing PostgreSQL `credpay` database (`users` table).

## Prerequisites

- Java 21 (`java -version`)
- Maven 3.9+ (`mvn -version`)
- PostgreSQL running locally with the `credpay` database and `users` table
  (created by `../schema.sql`)

## Configure database credentials

Defaults assume `postgres/postgres` on `localhost:5432`. Override via env vars:

```powershell
$env:DB_USERNAME = "postgres"
$env:DB_PASSWORD = "yourpassword"
```

## Run

```powershell
mvn spring-boot:run
```

The service starts on **http://localhost:8080**.

## APIs

### Register
```
POST /api/users/register
Content-Type: application/json

{ "fullName": "Bharath Reddy", "email": "bharath@test.com", "password": "Password123" }
```
Response: `{ "message": "User registered successfully" }`
Duplicate email → `409 { "message": "Email already exists" }`

### Login
```
POST /api/users/login
Content-Type: application/json

{ "email": "bharath@test.com", "password": "Password123" }
```
Response: `{ "message": "Login successful" }`
Wrong email/password → `401 { "message": "Invalid email or password" }`

## Test with curl

```powershell
curl -X POST http://localhost:8080/api/users/register `
  -H "Content-Type: application/json" `
  -d '{"fullName":"Bharath Reddy","email":"bharath@test.com","password":"Password123"}'

curl -X POST http://localhost:8080/api/users/login `
  -H "Content-Type: application/json" `
  -d '{"email":"bharath@test.com","password":"Password123"}'
```

## Docker

This service ships with a production-quality **multi-stage** Dockerfile that
builds the app with Maven, then runs only the resulting JAR on a minimal,
non-root JRE image. The image is portable across local Docker, Docker Hub,
Azure Container Registry (ACR) and Azure Kubernetes Service (AKS) without
modification.

> Run all commands from the `user-service/` directory (where the `Dockerfile` is).

### 1. Build the image

```bash
docker build -t credpay-user:v1 .
```

### 2. Verify the image exists

```bash
docker images
```

### 3. Run the container

```bash
docker run -d --name credpay-user -p 8080:8080 credpay-user:v1
```

PowerShell / single line:

```powershell
docker run -d --name credpay-user -p 8080:8080 credpay-user:v1
```

> The container connects to PostgreSQL via the datasource settings in
> `application.properties`. Because `localhost` inside a container is the
> container itself, point it at your host DB when running locally, e.g.:
> ```bash
> docker run -d --name credpay-user -p 8080:8080 \
>   -e DB_USERNAME=postgres -e DB_PASSWORD=postgres \
>   -e SPRING_DATASOURCE_URL=jdbc:postgresql://host.docker.internal:5432/credpay \
>   credpay-user:v1
> ```

### 4. Verify the container is running

```bash
docker ps
```

### 5. View logs

```bash
docker logs credpay-user
```

### 6. Stop the container

```bash
docker stop credpay-user
```

### 7. Remove the container

```bash
docker rm credpay-user
```

### 8. Remove the image

```bash
docker rmi credpay-user:v1
```

### Image design

| Aspect | Choice |
|---|---|
| Build stage | `maven:3.9-eclipse-temurin-21` (Maven + JDK 21) |
| Runtime stage | `eclipse-temurin:21-jre-alpine` (JRE only, no Maven, no JDK) |
| User | non-root `appuser` |
| Port | 8080 (`EXPOSE`) |
| Start | `ENTRYPOINT ["java","-jar","app.jar"]` |

`pom.xml` is copied and dependencies resolved **before** the source, so Docker
caches the dependency layer and only re-downloads when `pom.xml` changes.

## Notes

- `spring.jpa.hibernate.ddl-auto=validate` — the app validates against the existing
  schema and never alters it.
- Passwords are currently stored as **plain text** (BCrypt was removed for the
  local capstone). The sample rows in `schema.sql` use placeholder values, so login
  works only for users created through `/api/users/register`.
