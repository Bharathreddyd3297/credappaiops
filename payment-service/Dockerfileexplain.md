This is actually an **enterprise-grade, production-ready Dockerfile**. It follows Docker best practices such as **multi-stage builds**, **running as a non-root user**, **layer caching**, and using a **minimal runtime image**. Let's go through it line by line.

---

# High-Level Flow

```text
                Docker Build
                     │
                     ▼
        ┌─────────────────────────┐
        │ Stage 1                 │
        │ Maven Build             │
        │                         │
        │ pom.xml                 │
        │ src                     │
        │ mvn package             │
        │                         │
        │ Generates app.jar       │
        └───────────┬─────────────┘
                    │
                    ▼
        ┌─────────────────────────┐
        │ Stage 2                 │
        │ Runtime Image           │
        │                         │
        │ Java Runtime            │
        │ app.jar                 │
        │ Non-root user           │
        └───────────┬─────────────┘
                    │
                    ▼
              Final Docker Image
```

The final image contains **only** the JAR and the Java Runtime Environment (JRE), making it smaller and more secure.

---

# Comment Block

```dockerfile
# CREDPAY User Service - production multi-stage Dockerfile
# Spring Boot 3.5.x / Java 21
```

This is documentation for anyone reading the file. It indicates the application and Java version.

---

# Stage 1 - Build

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
```

This starts the first stage.

It uses an image that already contains:

* Java 21
* Maven 3.9
* Linux

`AS build` gives this stage a name so it can be referenced later.

---

## Working Directory

```dockerfile
WORKDIR /build
```

Every command that follows runs inside `/build`.

Equivalent to:

```bash
mkdir /build
cd /build
```

---

## Copy `pom.xml`

```dockerfile
COPY pom.xml .
```

Only the Maven project file is copied initially.

```
Container

/build
└── pom.xml
```

---

## Download Dependencies

```dockerfile
RUN mvn -B dependency:go-offline
```

This downloads all Maven dependencies before copying the source code.

### Why?

Docker builds images in layers. Since `pom.xml` changes infrequently, dependency downloads are cached.

```
Layer 1
FROM Maven

Layer 2
COPY pom.xml

Layer 3
Download Dependencies
```

If only your Java source changes, Docker reuses the cached dependency layer instead of downloading everything again.

Without this optimization, every build would redownload all dependencies.

---

## Copy Source Code

```dockerfile
COPY src ./src
```

Now the application source is copied.

```
/build
│
├── pom.xml
└── src
```

---

## Build the Application

```dockerfile
RUN mvn -B clean package -DskipTests
```

This runs the Maven build.

* `clean` removes previous build artifacts.
* `package` compiles the application and creates the executable JAR.
* `-DskipTests` skips running tests during the Docker image build.

The result is:

```
/build/target
└── user-service-1.0.jar
```

---

# Stage 2 - Runtime

```dockerfile
FROM eclipse-temurin:21-jre-alpine AS runtime
```

This starts a new stage using a lightweight image that contains only the Java Runtime Environment.

Notice what's **not** included:

* Maven
* Source code
* Maven cache
* Build tools

This significantly reduces the final image size.

---

## Create a Non-Root User

```dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
```

Instead of running as `root`, the container creates:

```
Group
 └── appgroup

User
 └── appuser
```

Running containers as a non-root user is an important security best practice because it limits the impact if the application is compromised.

---

## Set Working Directory

```dockerfile
WORKDIR /app
```

The application will run from `/app`.

---

## Copy the JAR from the Build Stage

```dockerfile
COPY --from=build /build/target/*.jar app.jar
```

This is the key benefit of a multi-stage build.

It copies only the compiled JAR from the first stage into the runtime image.

```
Build Stage
──────────────
Maven
Java
Source
Dependencies
Target
    │
    └── app.jar
          │
          ▼
Runtime Stage
──────────────
Java Runtime
app.jar
```

None of the build tools or source code are included in the final image.

---

## Switch to the Non-Root User

```dockerfile
USER appuser
```

Everything after this point runs as `appuser` instead of `root`.

---

## Expose Port 8080

```dockerfile
EXPOSE 8080
```

This documents that the application listens on port 8080.

It doesn't actually publish the port. To make it accessible, you still need to map it when running the container, for example:

```bash
docker run -p 8080:8080 ...
```

or expose it through a Kubernetes Service.

---

## Start the Application

```dockerfile
ENTRYPOINT ["java", "-jar", "app.jar"]
```

This tells Docker what command to run when the container starts.

Using the JSON array (exec form) has important advantages:

* `java` becomes PID 1.
* It receives termination signals directly.
* It shuts down gracefully.
* It's the recommended form for production containers.

---

# Why Multi-Stage Builds?

Without a multi-stage build, the final image would contain:

```
Java
Maven
Source Code
Target
.git
Dependencies
Cache
```

With a multi-stage build, the final image contains only:

```
Java Runtime
app.jar
```

This leads to:

* Smaller images
* Faster deployments
* Reduced attack surface
* Less network bandwidth

---

# Docker Layer Caching

One of the smartest optimizations is copying `pom.xml` before the source code.

```dockerfile
COPY pom.xml .
RUN mvn dependency:go-offline

COPY src ./src
```

This means:

* If you only modify Java files, Maven dependencies remain cached.
* If you add or update a dependency in `pom.xml`, Docker rebuilds the dependency layer.

This can reduce rebuild times from several minutes to a matter of seconds for typical code changes.

---

# Overall Assessment

This Dockerfile follows many enterprise best practices:

| Practice                    | Included | Benefit                    |
| --------------------------- | -------- | -------------------------- |
| Multi-stage build           | ✅        | Smaller runtime image      |
| Dependency caching          | ✅        | Faster rebuilds            |
| Non-root user               | ✅        | Improved security          |
| Minimal JRE runtime         | ✅        | Reduced image size         |
| Exec-form `ENTRYPOINT`      | ✅        | Proper signal handling     |
| `EXPOSE`                    | ✅        | Documents application port |
| Maven excluded from runtime | ✅        | Smaller, cleaner image     |

For the CredPay capstone, this is an excellent example to teach because it reflects patterns commonly used in production Spring Boot deployments rather than a simple "hello world" Dockerfile.
