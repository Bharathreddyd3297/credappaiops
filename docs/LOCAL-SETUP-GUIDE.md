# CREDPAY - Local Setup Guide

Run the complete CREDPAY application on your own laptop.

There are two ways to do it. Both end with the same running application:

| | Method A - Scripts | Method B - Manual |
| --- | --- | --- |
| How | One script installs the tools, one starts everything, one stops everything | You install each tool and start each part yourself |
| Time (first run) | ~30 minutes, mostly downloads | ~60 minutes |
| Best for | Getting it running quickly, demos | Learning what each part does |

You can switch between them at any time - they use the same code and the same database.

---

## Contents

1. [Check your laptop](#1-check-your-laptop)
2. [What you will run](#2-what-you-will-run)
3. [Get the code](#3-get-the-code)
4. [Method A - Scripts](#4-method-a---scripts)
5. [Method B - Manual](#5-method-b---manual)
6. [Test the application](#6-test-the-application)
7. [Stop, restart and reset](#7-stop-restart-and-reset)
8. [Run the automated tests](#8-run-the-automated-tests)
9. [Troubleshooting](#9-troubleshooting)
10. [Reference](#10-reference)

---

## 1. Check your laptop

| Requirement | Minimum | Recommended | How to check |
| --- | --- | --- | --- |
| Operating system | Windows 10 (22H2) or Windows 11, 64-bit | Windows 11 | `winver` |
| RAM | 8 GB | 16 GB or more | Task Manager → Performance → Memory |
| Free disk space | 15 GB | 25 GB | File Explorer → This PC |
| CPU virtualization | Enabled (Docker needs it) | | Task Manager → Performance → CPU → *Virtualization: Enabled* |
| Admin rights | Needed once, to install the tools | | You can "Run as administrator" |
| Internet | Needed to download tools and libraries | | |

> **Virtualization disabled?** Enable *Intel VT-x* / *AMD-V (SVM)* in the laptop's BIOS/UEFI
> settings. Docker Desktop will not start without it.

> **Mac or Linux?** The application works there too, but the scripts in this guide are for
> Windows. Use Method B and replace the PowerShell commands with their shell equivalents
> (`source .venv/bin/activate` instead of `.\.venv\Scripts\Activate.ps1`, `cp` instead of `Copy-Item`).

---

## 2. What you will run

```
Customer ──► Customer Portal (5173) ──┐
Admin    ──► Admin Portal    (5174) ──┼──► user-service    (8080) ──┐
                                      └──► payment-service (8000) ──┴──► PostgreSQL (5432)

Both portals sign in on Keycloak (8081), which issues the access token.
```

| Component | Technology | Runs in | URL |
| --- | --- | --- | --- |
| Customer Portal | React (Vite) | Your laptop (npm) | http://localhost:5173 |
| Admin Portal | React (Vite) | Your laptop (npm) | http://localhost:5174 |
| user-service | Java 21, Spring Boot | Your laptop (Maven) | http://localhost:8080 |
| payment-service | Python 3.12, FastAPI | Your laptop (uvicorn) | http://localhost:8000/docs |
| Keycloak (login server) | Keycloak 26 | Docker | http://localhost:8081 |
| PostgreSQL (database) | PostgreSQL 17 | Docker | localhost:5432 |

Demo accounts (created automatically):

| Account | Email / username | Password | Use it on |
| --- | --- | --- | --- |
| Customer | `customer@credpay.local` | `Customer@123` | Customer Portal |
| Administrator | `admin@credpay.local` | `Admin@123` | Admin Portal |
| Keycloak console | `admin` | `admin` | http://localhost:8081/admin |

> These passwords are for a local laptop only. Real environments never use them.

---

## 3. Get the code

Install Git first if you do not have it (`git --version` to check) - https://git-scm.com/download/win

You need read access to the course's Azure DevOps project - your instructor adds you. The
first `git clone` opens a sign-in window; sign in with that Microsoft account.

Clone into a **short folder path**. Windows limits paths to 260 characters, and a long
folder path makes the checkout fail with *Filename too long*.

```powershell
git config --global core.longpaths true
mkdir C:\code
cd C:\code
git clone https://dev.azure.com/bharathreddy3297/Flipkart-Capestone/_git/credwithaiops
cd credwithaiops
```

**Run every command in this guide from this folder** (`C:\code\credwithaiops`) unless the
step says `cd` into a sub-folder.

---

## 4. Method A - Scripts

### A1. Install the tools (once)

1. Open **PowerShell as Administrator** (Start → type *PowerShell* → right-click → *Run as administrator*).
2. Go to the repo folder and run the installer:

   ```powershell
   cd C:\code\credwithaiops
   Set-ExecutionPolicy -Scope Process Bypass -Force
   .\scripts\setup\install-prereqs.ps1
   ```

   It installs Java 21, Maven 3.9, Node.js LTS, Python 3.12, Docker Desktop (with WSL2) and
   the Azure CLI. Tools you already have are skipped.

3. **Restart the laptop.**
4. Start **Docker Desktop** from the Start menu, accept its terms, and wait until it says
   *Engine running*.

### A2. Check the tools (once)

Open a **new, normal** PowerShell window (not as administrator):

```powershell
cd C:\code\credwithaiops
.\scripts\setup\check-prereqs.ps1
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Every line must show **OK**. The second command allows PowerShell to run the project's
scripts - answer **Y**.

### A3. Start everything

```powershell
.\scripts\start-all.ps1
```

What happens:

1. PostgreSQL and Keycloak start in Docker. The script waits until Keycloak is ready
   (about 1 minute the first time).
2. **Four new windows open**, one per application, so you can watch each one's log:
   *user-service :8080*, *payment-service :8000*, *customer-portal :5173*, *admin-portal :5174*.
3. The first time, each window also downloads its libraries (Maven, pip, npm) - allow a few minutes.

It is ready when:

| Window | Shows |
| --- | --- |
| user-service | `Started UserServiceApplication` |
| payment-service | `Application startup complete` |
| customer-portal / admin-portal | `Local: http://localhost:5173/` (or `5174`) |

Now open http://localhost:5173 and continue with [6. Test the application](#6-test-the-application).

### A4. Stop everything

```powershell
.\scripts\stop-all.ps1             # stops the 4 apps and the Docker containers (data is kept)
.\scripts\stop-all.ps1 -KeepInfra  # stops only the 4 apps; PostgreSQL and Keycloak keep running
```

Next time, just run `.\scripts\start-all.ps1` again (Docker Desktop must be running).

---

## 5. Method B - Manual

### B1. Install the tools (once)

Install each tool with its default options unless noted.

| Tool | Version | Download | Notes |
| --- | --- | --- | --- |
| Git | latest | https://git-scm.com/download/win | |
| Java JDK | **21** (Temurin) | https://adoptium.net | Tick *Set JAVA_HOME variable* in the installer |
| Maven | **3.9.x** | https://maven.apache.org/download.cgi (*Binary zip archive*) | Extract to `C:\tools\apache-maven-3.9.x`, then add its `bin` folder to **Path** (see below) |
| Python | **3.12** | https://www.python.org/downloads/ | Tick **Add python.exe to PATH** on the first screen |
| Node.js | **LTS** (20 or newer) | https://nodejs.org | |
| Docker Desktop | latest | https://www.docker.com/products/docker-desktop | Uses WSL2; restart when asked |
| VS Code | latest (optional) | https://code.visualstudio.com | Editor |

**Add Maven to Path:** Start → *Edit the system environment variables* → *Environment
Variables* → under *System variables* select **Path** → *Edit* → *New* →
`C:\tools\apache-maven-3.9.x\bin` → OK on every window.

Restart the laptop, start Docker Desktop, then open a **new** PowerShell window and check:

```powershell
java -version        # openjdk version "21..."
mvn -v               # Apache Maven 3.9...
python --version     # Python 3.12...
node -v              # v20 or newer
npm -v
docker --version
docker compose version
```

Allow PowerShell to run local scripts (needed for the Python virtual environment):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### B2. Start PostgreSQL and Keycloak (Docker)

From the repo folder:

```powershell
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml ps
```

Wait until `credpay-postgres` shows **healthy**, then check Keycloak (about 1 minute the
first time - repeat until you see JSON):

```powershell
curl.exe http://localhost:8081/realms/credpay/.well-known/openid-configuration
```

What this gives you:

* **PostgreSQL** with two databases: `credpay` (the application's data) and `keycloak`.
* **Keycloak** with the `credpay` realm loaded from `infra/keycloak/realm/credpay-realm.json`:
  self-registration, password policy, account lock-out, the `USER` and `ADMIN` roles,
  the two portal clients and the demo accounts.

### B3. Start user-service (Terminal 1)

Open a terminal (in VS Code: *Terminal → New Terminal*; use the **split** button for more):

```powershell
cd user-service
mvn spring-boot:run
```

The first run downloads dependencies (3-5 minutes). Ready when the log shows
`Started UserServiceApplication`. On the very first start it also creates the database
tables - you will see:

```
Successfully applied 3 migrations to schema "public", now at version v3
```

Check: http://localhost:8080/actuator/health/readiness → `{"status":"UP"}`

### B4. Start payment-service (Terminal 2)

First time only - create a private Python environment and install the libraries:

```powershell
cd payment-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Every time:

```powershell
cd payment-service
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

Your prompt starts with `(.venv)` when the environment is active. Ready when the log shows
`Application startup complete`. Check: http://localhost:8000/docs (the API page opens).

### B5. Start the Customer Portal (Terminal 3)

First time only:

```powershell
cd customer-portal
Copy-Item .env.example .env
npm install
```

Every time:

```powershell
cd customer-portal
npm run dev
```

Ready when it shows `Local: http://localhost:5173/`.

### B6. Start the Admin Portal (Terminal 4)

First time only:

```powershell
cd admin-portal
Copy-Item .env.example .env
npm install
```

Every time:

```powershell
cd admin-portal
npm run dev
```

Ready when it shows `Local: http://localhost:5174/`.

### B7. Stop everything

1. Press **Ctrl + C** in each of the 4 terminals (answer **Y** if asked).
2. Stop the containers (your data is kept):

   ```powershell
   docker compose -f infra/docker-compose.yml down
   ```

Next time: start Docker Desktop, then repeat B2-B6 using only the *Every time* commands.

---

## 6. Test the application

### Customer Portal - http://localhost:5173

1. You land on the **Welcome** page. Click **Create an account** → Keycloak's registration page.
2. Try a weak password such as `password` - it is rejected by the password policy.
   Register with a strong one (8+ characters, upper and lower case, a digit and a symbol).
3. You are signed in and see the **Dashboard**.
4. **Add Card** with a test number, e.g. `4111 1111 1111 1111` (VISA) or
   `5555 5555 5555 4444` (MASTERCARD), and a future expiry date.
   Card numbers must pass the **Luhn checksum** - `4111 1111 1111 1112` is rejected.
5. **Pay Bill**: amount `2500`, UPI ID `test@okhdfcbank` → the **Success** screen shows a
   transaction ID such as `TXN20261022000001`.
6. **Payment History** lists the payment.
7. **Logout**, then **Sign In** again - Keycloak asks for your password (the session really ended).

### Admin Portal - http://localhost:5174

8. Sign in as `admin@credpay.local` / `Admin@123`.
9. **Overview** shows the totals and a 7-day chart; **Users** lists your new customer;
   **Transactions** lists the payment. Try the search box and the status filter.
10. Sign out and sign in with your **customer** account instead → **Access denied**.

### Check the security yourself

Calls without a login token are refused:

```powershell
curl.exe -i http://localhost:8000/api/payment/history    # 401 Unauthorized
curl.exe -i http://localhost:8080/api/cards              # 401 Unauthorized
curl.exe -i http://localhost:8080/api/admin/users        # 401 Unauthorized
```

There is no password column in the application's database - passwords live only in Keycloak:

```powershell
docker exec -it credpay-postgres psql -U postgres -d credpay -c "select id, full_name, email, keycloak_id from users;"
```

---

## 7. Stop, restart and reset

| I want to | Method A | Method B |
| --- | --- | --- |
| Stop everything, keep data | `.\scripts\stop-all.ps1` | Ctrl + C in each terminal, then `docker compose -f infra/docker-compose.yml down` |
| Stop only the apps | `.\scripts\stop-all.ps1 -KeepInfra` | Ctrl + C in each terminal |
| Start again | `.\scripts\start-all.ps1` | B2-B6, *Every time* commands |
| **Delete all data** and start fresh (users, cards, payments, Keycloak accounts) | `.\scripts\stop-all.ps1`, then `docker compose -f infra/docker-compose.yml down -v`, then start again | Same `down -v` command, then B2-B6 |

After a reset the demo accounts are created again and the database tables are recreated on
the next user-service start.

---

## 8. Run the automated tests

```powershell
cd user-service
mvn test

cd ..\payment-service
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
pytest
```

The tests check the security rules (no token → 401, wrong role → 403, a customer can only
use their own cards), the card validation and the payment idempotency.

---

## 9. Troubleshooting

| Problem | Cause and fix |
| --- | --- |
| `git clone` fails with *Filename too long* | Clone into a short path (`C:\code`) and run `git config --global core.longpaths true` |
| `... cannot be loaded because running scripts is disabled on this system` | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once and answer **Y** |
| `docker` is not recognized, or *Cannot connect to the Docker daemon* | Start Docker Desktop and wait for *Engine running*; open a new terminal |
| `docker compose` cannot find `infra\infra\docker-compose.yml` | You are inside the `infra` folder - go back to the repo root |
| Docker Desktop: *Virtualization support not detected* | Enable VT-x / AMD-V in the BIOS (section 1) |
| `java`, `mvn`, `python` or `node` is not recognized | Open a **new** terminal after installing; for Maven check the Path entry (B1) |
| `python` opens the Microsoft Store | Settings → Apps → Advanced app settings → *App execution aliases* → turn off the two *python* entries |
| `Port 8080 was already in use` (or 8000 / 5173 / 5174) | An old copy is still running: `.\scripts\stop-all.ps1 -KeepInfra` |
| Portal: *Cannot reach the sign-in service. Is Keycloak running?* | Keycloak is still starting - wait a minute; check with `docker logs credpay-keycloak` |
| Portal: *Cannot reach the server. Is the backend running?* | user-service or payment-service is not running - check its window/terminal |
| Every API call returns 401 | Your login is from before a Keycloak reset or has expired - sign out and sign in again |
| Admin Portal shows *Not Found* errors after updating the code | An old copy of a service is still running - stop everything and start again |
| user-service: `invalid value for parameter "TimeZone"` | You have an old copy of the code - `git pull` (the service now runs in UTC) |
| A page keeps sending you back to the Welcome page | Your session expired - sign in again |

---

## 10. Reference

### Settings

Every setting has a local default, so nothing needs configuring on a laptop. On Kubernetes
the same names are set as environment variables.

| Variable | Local default | Used by |
| --- | --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME` | `localhost`, `5432`, `credpay` | both services |
| `DB_USERNAME`, `DB_PASSWORD` | `postgres`, `postgres` | both services |
| `OIDC_ISSUER_URI` | `http://localhost:8081/realms/credpay` | both services |
| `OIDC_AUDIENCE` | `credpay-api` | both services |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:5174` | both services |
| `SQL_ECHO` | `false` (set `true` to log SQL statements) | both services |
| `REPORT_TIMEZONE` | `Asia/Kolkata` | payment-service (admin reports) |
| `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID` | see each portal's `.env.example` | both portals |

### Database migrations (Flyway)

user-service creates and updates the tables on startup:

| Migration | What it does |
| --- | --- |
| `V1__baseline.sql` | `users`, `cards`, `payments` tables |
| `V2__keycloak_identity.sql` | links users to Keycloak (`keycloak_id`), removes the old password column |
| `V3__payment_idempotency.sql` | `idempotency_key`, so one payment can never be charged twice |

### Optional: Sign in with Google (instructor demo)

Not needed for the course. Customers can also sign in with a Google account once a Google
OAuth client is configured:

1. Google Cloud Console → *APIs & Services* → *OAuth consent screen* (External; add test users)
   → *Credentials* → *OAuth client ID* → *Web application* with the redirect URI
   `http://localhost:8081/realms/credpay/broker/google/endpoint`.
2. `Copy-Item infra\.env.example infra\.env`, put the client ID and secret in `infra\.env`
   (git-ignored - never commit it), then run `.\scripts\setup\configure-identity-providers.ps1`.

The Keycloak sign-in page then shows *Or sign in with → Google*.

### Optional: run the container images instead

The same Docker images that the pipeline pushes to Azure Container Registry can run on
your laptop. Stop the laptop apps first - the images use the same ports:

```powershell
.\scripts\stop-all.ps1 -KeepInfra
docker compose -f infra/docker-compose.yml --profile apps up -d --build   # first build ~5 minutes
docker compose -f infra/docker-compose.yml --profile apps ps              # wait for (healthy)
```

Open http://localhost:5173 and http://localhost:5174 as usual. Stop with
`docker compose -f infra/docker-compose.yml --profile apps down` (or `.\scripts\stop-all.ps1`).

What is different inside the containers:

* The portals are plain files served by **nginx**; their API and Keycloak addresses are
  read from `CREDPAY_*` environment variables when the container starts (`/config.js`),
  so one image works in dev, qa and prod.
* The services reach the database as `postgres` and fetch Keycloak's signing keys from
  `http://keycloak:8080` (inside Docker, `localhost` means the container itself).
* Everything runs as a non-root user and has a health check.

### Make another account an administrator

http://localhost:8081/admin (`admin` / `admin`) → realm **credpay** → *Users* → the user →
*Role mapping* → *Assign role* → `ADMIN`. The user signs out and in again.

### More documentation

* [ARCHITECTURE.md](ARCHITECTURE.md) - how the system is designed
* [../admin-portal/README.md](../admin-portal/README.md) - the Admin Portal
