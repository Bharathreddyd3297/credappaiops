# =====================================================================
# CREDPAY user-service - Spring Boot (Java 21)
# =====================================================================
# Multi-stage: Maven + JDK to build, a small JRE image to run as a
# non-root user. All settings come from environment variables
# (DB_*, OIDC_*, CORS_ALLOWED_ORIGINS - see application.properties).
#
#   docker build -t credpay/user-service .
# =====================================================================

# ---- Stage 1: build the jar -----------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Download dependencies first (cached unless pom.xml changes)
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

# Tests run in the pipeline's test step, not in the image build
COPY src ./src
RUN mvn -B -q package -DskipTests

# ---- Stage 2: runtime -----------------------------------------------
FROM eclipse-temurin:21-jre-alpine AS runtime

# Numeric uid/gid so Kubernetes can verify runAsNonRoot
RUN addgroup -S -g 10001 credpay && adduser -S -u 10001 -G credpay credpay
WORKDIR /app
COPY --from=build --chown=10001:10001 /build/target/*.jar app.jar

# Size the heap from the container's memory limit; exit (and get
# restarted) instead of limping on after an OutOfMemoryError
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"

USER 10001
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/actuator/health/liveness || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
