# =====================================================================
# CredAI Service - production Dockerfile
# Python 3.14 / FastAPI / Uvicorn
# =====================================================================
# Follows the same conventions as payment-service/Dockerfile in this
# repo (slim base, cached dependency layer, non-root user).

FROM python:3.14-slim

# Sensible Python runtime flags:
#  - no .pyc files written (smaller, cleaner container)
#  - unbuffered stdout/stderr so logs appear immediately in `kubectl logs`
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Copy ONLY requirements first so the dependency-install layer is cached
# and is NOT rebuilt when application source changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Now copy the application source (the `app/` package)
COPY app ./app

# All configuration (Azure OpenAI, Prometheus URL, Azure credentials) is
# supplied at runtime via the ConfigMap/Secret in k8s/ai-service/ - no
# secret or endpoint is ever baked into this image.

# Create and switch to a non-root user (never run the app as root)
RUN useradd --create-home --uid 1002 credai
USER credai

# Documents the port Uvicorn listens on (does not publish it)
EXPOSE 8010

# Container-level healthcheck - hits the service's own health endpoint.
# Uses Python's stdlib (urllib) rather than curl/wget to avoid adding an
# extra system package just for this, keeping the image small.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8010/api/ai/health', timeout=4).status == 200 else 1)"

# Start Uvicorn directly as PID 1 (exec form). No --reload in production.
ENTRYPOINT ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
