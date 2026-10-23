This is another **production-ready Dockerfile**, but unlike the Spring Boot service, this one builds a **React application** and serves the generated static files using **Nginx**. In production, React applications are not typically served by a Node.js server—they're compiled into HTML, CSS, and JavaScript files and served by a lightweight web server like Nginx.

---

# High-Level Flow

```text
                 Docker Build
                      │
                      ▼
        ┌─────────────────────────┐
        │ Stage 1                 │
        │ Node.js                 │
        │                         │
        │ package.json            │
        │ npm install             │
        │ npm run build           │
        │                         │
        │ Generates dist/         │
        └───────────┬─────────────┘
                    │
                    ▼
        ┌─────────────────────────┐
        │ Stage 2                 │
        │ Nginx                   │
        │                         │
        │ Copy dist/              │
        │ Serve Static Files      │
        └───────────┬─────────────┘
                    │
                    ▼
              Final Docker Image
```

The final image contains **only Nginx and the compiled React files**—there is **no Node.js runtime** in the production image.

---

# Stage 1 – Build

```dockerfile
FROM node:22-alpine AS build
```

This image already contains:

* Node.js 22
* npm
* Alpine Linux

This stage is used only to **compile** the React application.

---

## Working Directory

```dockerfile
WORKDIR /app
```

Everything runs inside:

```text
/app
```

Equivalent to:

```bash
mkdir /app
cd /app
```

---

## Copy package.json First

```dockerfile
COPY package*.json ./
```

This copies:

```text
package.json
package-lock.json
```

(if the lock file exists)

---

## Install Dependencies

```dockerfile
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
```

This is a nice enterprise touch.

If a lock file exists:

```bash
npm ci
```

Otherwise:

```bash
npm install
```

### Why use `npm ci`?

`npm ci`:

* Faster
* Reproducible
* Uses exact dependency versions from `package-lock.json`
* Preferred in CI/CD pipelines

`npm install`:

* May update dependency versions
* Used mainly during development

---

## Docker Layer Caching

Notice the order:

```dockerfile
COPY package*.json ./

RUN npm ci

COPY . .
```

Docker creates layers like this:

```text
Layer 1
Node Image

Layer 2
package.json

Layer 3
npm install

Layer 4
Source Code
```

If you only modify a React component:

```text
src/Home.jsx
```

Docker reuses the cached dependency layer and only rebuilds the application.

Without this optimization, every build would reinstall hundreds of npm packages.

---

## Copy Application

```dockerfile
COPY . .
```

Now everything is copied.

```text
/app

package.json
src/
public/
vite.config.js
...
```

---

## Build the React Application

```dockerfile
RUN npm run build
```

This executes:

```bash
npm run build
```

For Vite, it creates:

```text
dist/

index.html
assets/
```

The `dist/` directory contains:

* HTML
* CSS
* JavaScript
* Images
* Fonts

This is all that's needed to run the frontend.

---

# Stage 2 – Runtime

```dockerfile
FROM nginx:stable-alpine AS runtime
```

Instead of running Node.js, we use Nginx.

Why?

Because after the React app is built:

* No compilation is needed
* No Node.js is required
* Only static files need to be served

Nginx is:

* Very fast
* Lightweight
* Production-proven
* Low memory usage

---

## Copy Nginx Configuration

```dockerfile
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

This replaces the default Nginx configuration.

A typical SPA configuration looks like:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

This is essential for React Router.

Without it:

```text
http://localhost/dashboard
```

would return:

```
404 Not Found
```

With the configuration:

```
dashboard
      │
      ▼
index.html
      │
      ▼
React Router
```

The application handles routing correctly.

---

## Copy the Build Output

```dockerfile
COPY --from=build /app/dist /usr/share/nginx/html
```

This copies only:

```text
dist/
```

into the Nginx web root.

```text
/usr/share/nginx/html

index.html
assets/
```

Notice what's **not** copied:

* Source code
* `node_modules`
* `package.json`
* Build tools

Only the production-ready static files are included.

---

# Final Image

The final container looks like:

```text
Nginx
│
├── index.html
├── assets/
├── CSS
└── JavaScript
```

There is **no Node.js** in the runtime image.

This makes the image:

* Smaller
* More secure
* Faster to start

---

## Expose Port 80

```dockerfile
EXPOSE 80
```

This documents that Nginx listens on port 80.

When running locally:

```bash
docker run -p 8080:80 frontend-image
```

Port mapping:

```text
Browser

localhost:8080
       │
       ▼
Container Port 80
```

---

## No ENTRYPOINT?

At the end, there's only a comment:

```dockerfile
# Use the base image's default Nginx entrypoint
```

The official Nginx image already defines:

```dockerfile
ENTRYPOINT ["nginx","-g","daemon off;"]
```

So there's no need to redefine it.

When the container starts:

```text
Container

      │
      ▼

nginx

      │
      ▼

Serves React Application
```

---

# Why Nginx Instead of Node?

Many beginners think a React application needs Node.js to run.

Actually:

```text
Developer

npm run build

        │

        ▼

HTML
CSS
JavaScript

        │

        ▼

Any Web Server
```

React builds static assets. Any web server—Nginx, Apache, or even cloud storage services like Azure Static Web Apps or Amazon S3 with a CDN—can serve them.

---

# Why Multi-Stage Builds?

Without a multi-stage build, the final image would include:

```text
Node
npm
node_modules
Source Code
Vite
dist
```

With a multi-stage build, it contains only:

```text
Nginx
dist/
```

This results in:

* Smaller image size
* Faster deployments
* Lower memory usage
* Reduced attack surface

---

# Overall Assessment

This Dockerfile also follows enterprise best practices:

| Practice                         | Included | Benefit                                |
| -------------------------------- | -------- | -------------------------------------- |
| Multi-stage build                | ✅        | Smaller runtime image                  |
| Layer caching                    | ✅        | Faster rebuilds                        |
| `npm ci` in CI/CD                | ✅        | Deterministic dependency installation  |
| Nginx for static content         | ✅        | Efficient production serving           |
| Custom SPA-aware Nginx config    | ✅        | Supports React Router deep links       |
| Runtime image excludes Node.js   | ✅        | Smaller, more secure image             |
| `EXPOSE 80`                      | ✅        | Documents listening port               |
| Reuses official Nginx entrypoint | ✅        | Simpler and aligns with the base image |

For your CredPay capstone, this is an excellent example to show students the distinction between the **build environment** (Node.js compiles the app) and the **runtime environment** (Nginx serves the compiled static files). That separation is a core principle behind efficient, production-grade containerization.
