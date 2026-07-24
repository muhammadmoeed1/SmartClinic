FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# onnxruntime-node (used for local embedding inference, @xenova/transformers)
# ships prebuilt binaries linked against glibc. Alpine's musl libc — even
# with a compat shim (libc6-compat) — still crashes at actual inference time
# with an opaque Ort::Exception, not just a load-time linker error. A
# Debian-based image (real glibc) avoids this whole class of problem, which
# is the standard fix for this native addon in Docker.
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
# Apply any pending migrations, then start the API. Safe on every boot —
# run-migrations is idempotent (already-applied migrations are skipped).
CMD ["sh", "-c", "node dist/database/run-migrations.js && node dist/main.js"]
