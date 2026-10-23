# =====================================================================
# CREDPAY payment-service - FastAPI (Python 3.12)
# =====================================================================
# Multi-stage: dependencies are installed into a virtual environment in
# the build stage and copied into a clean runtime image that runs as a
# non-root user. All settings come from environment variables
# (DB_*, OIDC_*, CORS_ALLOWED_ORIGINS, REPORT_TIMEZONE).
#
#   docker build -t credpay/payment-service .
# =====================================================================

# ---- Stage 1: install dependencies ------------------------------------
FROM python:3.12-slim AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install -r requirements.txt

# ---- Stage 2: runtime -----------------------------------------------
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

# Numeric uid/gid so Kubernetes can verify runAsNonRoot
RUN groupadd --gid 10001 credpay && useradd --uid 10001 --gid 10001 --no-create-home credpay
WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY app ./app

USER 10001
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)" || exit 1

ENTRYPOINT ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
