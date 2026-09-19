# Single-service deploy: Vite UI baked in, served by FastAPI (one public URL).
# Neo4j is optional — set NEO4J_* env vars for a hosted instance (Aura), or
# leave them unset and the app runs file-mode off the baked graph serials.

# ── Stage 1: build the React UI ────────────────────────────────────────────
FROM node:20-slim AS ui
WORKDIR /build/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ui/ ./
RUN npm run build

# ── Stage 2: Python API + baked UI ─────────────────────────────────────────
FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Pre-download the Whisper model at build time so the first voice request is
# not a cold ~500MB fetch. Override with --build-arg WHISPER_MODEL_SIZE=tiny
# (or base) for small instances; runtime WHISPER_MODEL_SIZE env must match.
ARG WHISPER_MODEL_SIZE=small
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL_SIZE}', device='cpu', compute_type='int8')"
COPY . .
COPY --from=ui /build/ui/dist ./ui/dist
EXPOSE 8000
# Render injects $PORT; default 8000 keeps `docker run -p 8000:8000` working.
CMD ["sh", "-c", "uvicorn backend.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
