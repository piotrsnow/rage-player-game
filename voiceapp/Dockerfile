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

# Stage 2: Python XTTS server + static frontend
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libsndfile1 && \
    rm -rf /var/lib/apt/lists/*

COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server/ server/
COPY --from=frontend /build/dist/ dist/

EXPOSE 5050
CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "5050"]
