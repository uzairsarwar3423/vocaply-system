# ─────────────────────────────────────────────────────────────────────────────
# Vocaply AI Pipeline — Production Multi-Stage Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Builder — installs deps into a venv (isolated from system Python)
# Stage 2: Runtime — copies only the venv + src, minimal attack surface
# ─────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

# Security: run as non-root even in builder stage
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid 1001 --no-create-home appuser

WORKDIR /build

# Install build dependencies (compiler for any native extensions)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Create isolated virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies (layer-cached until requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt


# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Security: non-root user in runtime
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid 1001 --no-create-home --shell /sbin/nologin appuser

WORKDIR /app

# Copy only the venv from builder (no build tools in runtime image)
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application source
COPY src/ ./src/

# Verify import-time settings validation works before any container starts
# This is the "import smoke test" that CI also runs as a preflight check
# NOTE: This will fail if required env vars are not provided at build time.
# In production, env vars are injected at runtime (not baked into image).
# This RUN step is commented out intentionally — run as a health check instead.
# RUN python -c "from src.config.settings import settings; print('Settings OK')"

# Security: run as non-root
USER appuser

# Document the exposed port (not a PUBLISH directive — orchestrator handles that)
EXPOSE 8001

# Production: single uvicorn worker per container (scale by replica count)
# Use Gunicorn + uvicorn workers for multi-process: gunicorn -w 4 -k uvicorn.workers.UvicornWorker
CMD ["uvicorn", "src.api.main:create_app", "--factory", \
     "--host", "0.0.0.0", \
     "--port", "8001", \
     "--no-access-log"]
