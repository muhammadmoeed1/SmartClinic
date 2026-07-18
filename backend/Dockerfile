FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
# Apply any pending migrations, then start the API. Safe on every boot —
# run-migrations is idempotent (already-applied migrations are skipped).
CMD ["sh", "-c", "node dist/database/run-migrations.js && node dist/main.js"]
