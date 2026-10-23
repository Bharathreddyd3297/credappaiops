# CREDPAY Frontend

Premium fintech web client for CREDPAY — built with **React + Vite + Material UI**,
dark luxury theme, glassmorphism, and a mobile-first responsive layout.

## Tech stack

- React 18 + Vite
- React Router DOM (routing)
- Axios (API calls)
- Material UI (MUI) v6 + Emotion (design system / styling)

## Folder structure

```
customer-portal/
├── index.html
├── package.json
├── vite.config.js
├── .env.example
└── src/
    ├── assets/
    ├── components/
    │   ├── Navbar.jsx
    │   ├── Sidebar.jsx
    │   ├── CardTile.jsx
    │   ├── ProtectedRoute.jsx
    │   ├── LoadingSpinner.jsx
    │   └── Footer.jsx
    ├── pages/
    │   ├── LoginPage.jsx
    │   ├── RegisterPage.jsx
    │   ├── DashboardPage.jsx
    │   ├── AddCardPage.jsx
    │   ├── PayBillPage.jsx
    │   ├── PaymentHistoryPage.jsx
    │   ├── SuccessPage.jsx
    │   └── _AuthBranding.jsx   (shared brand panel for login/register)
    ├── services/
    │   └── api.js
    ├── routes/
    │   └── AppRoutes.jsx
    ├── theme/
    │   └── theme.js
    ├── App.jsx
    ├── main.jsx
    └── index.css
```

## Install dependencies

```powershell
cd customer-portal
npm install
```

## Run locally

```powershell
npm run dev
```

App: **http://localhost:5173** (opens automatically).

## Backend configuration

The app talks to two backends. By default (no `.env` file), API calls use
**relative URLs** (e.g. `/api/users/login`), which is what Docker/AKS builds
need: behind the Kubernetes Ingress, the frontend and both backends share the
same origin, so relative paths route correctly with no CORS.

For **local development** with `npm run dev`, the Vite dev server (`:5173`)
must call the backends directly on their own ports. Copy `.env.example` to
`.env` to enable this:

| Service | Local dev URL (via `.env`) |
|---|---|
| User Service (Spring Boot) | `http://localhost:8080` |
| Payment Service (FastAPI) | `http://localhost:8000` |

## Routes

| Path | Page | Access |
|---|---|---|
| `/login` | Login | Public |
| `/register` | Register | Public |
| `/dashboard` | Dashboard | Protected |
| `/add-card` | Add Card | Protected |
| `/pay-bill` | Pay Bill | Protected |
| `/payment-history` | Payment History | Protected |
| `/success` | Payment Success | Protected |

Protected routes redirect to `/login` when no session is present. On successful
login the app stores `userId`, `fullName`, and `email` in `localStorage`.

> **Note:** Pages gracefully fall back to elegant mock data when the backend is
> unreachable, so the UI is always demo-ready. Real data is used whenever the
> APIs respond.

## Production build

```powershell
npm run build      # outputs to dist/
npm run preview    # preview the production build
```

## Docker

The app is shipped as a **multi-stage** image: Node builds the static bundle,
then **Nginx** serves the `dist/` output. The final image contains no Node.js,
no `node_modules`, and no source — just Nginx + compiled static files. It is
portable across Docker Desktop, Docker Hub, ACR and AKS without modification.

> Run all commands from the `customer-portal/` directory (where the `Dockerfile` is).

### 1. Build the image

```bash
docker build -t credpay-frontend:v1 .
```

### 2. Verify the image exists

```bash
docker images
```

### 3. Run the container

```bash
docker run -d --name credpay-frontend -p 3000:80 credpay-frontend:v1
```

### 4. Verify the container is running

```bash
docker ps
```

### 5. View logs

```bash
docker logs credpay-frontend
```

### 6. Access the application

```
http://localhost:3000
```

### 7. Stop the container

```bash
docker stop credpay-frontend
```

### 8. Remove the container

```bash
docker rm credpay-frontend
```

### 9. Remove the image

```bash
docker rmi credpay-frontend:v1
```

### Notes

- Nginx is configured (`nginx.conf`) for SPAs: unknown routes fall back to
  `index.html` (so `/dashboard` and browser refresh work), gzip is enabled,
  hashed assets under `/assets` are cached for a year, and directory listing
  is disabled.
- The container serves a **static build**. API base URLs are baked in at build
  time from Vite env vars (`VITE_USER_API_URL`, `VITE_PAYMENT_API_URL`). Leave
  them unset for Docker/AKS builds (the default - relative URLs behind the
  Ingress); only set them to rebuild an image that calls fixed, absolute
  backend URLs.
