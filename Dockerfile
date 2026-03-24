# ---- Stage 1: Build frontend ----
FROM node:20-alpine AS frontend-build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY index.html vite.config.js tailwind.config.js postcss.config.js ./
COPY src/ src/
COPY public/ public/

RUN npm run build

# ---- Stage 2: Install backend deps & generate Prisma client ----
FROM node:20-alpine AS backend-deps

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma/ prisma/

RUN npm ci
RUN npx prisma generate

# ---- Stage 3: Production image ----
FROM node:20-alpine AS production

RUN apk add --no-cache tini

WORKDIR /app/backend

# Copy backend source (node_modules excluded via .dockerignore)
COPY backend/ .

# Overwrite with properly installed node_modules + generated Prisma client
COPY --from=backend-deps /app/backend/node_modules ./node_modules

# Place built frontend where the server expects it
COPY --from=frontend-build /app/dist ./public/dist

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
