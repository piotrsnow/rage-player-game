# Stage 1: Build React frontend
FROM node:20-slim AS frontend
WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js tailwind.config.js postcss.config.js ./
COPY src/ src/
# Shared theme needed at build time
COPY --from=context shared/ui-theme/ /context/shared/ui-theme/
RUN npm run build

# Stage 2: Python XTTS server + CUDA runtime + static frontend
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3-pip \
    ffmpeg libsndfile1 && \
    rm -rf /var/lib/apt/lists/* && \
    ln -sf /usr/bin/python3.11 /usr/bin/python3

WORKDIR /app

COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server/ server/
COPY --from=frontend /build/dist/ dist/

EXPOSE 5050
CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "5050"]
