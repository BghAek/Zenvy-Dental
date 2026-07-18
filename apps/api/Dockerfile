# Build context is the repo root (see docker-compose.yml) — pnpm needs the workspace files.
FROM node:22-alpine AS build
# ponytail: npm -g instead of corepack — corepack's old signature keys break pnpm 8 downloads
RUN npm install -g pnpm@8.15.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @zenvy/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @zenvy/api... build
RUN pnpm --filter @zenvy/api deploy --prod /out

FROM node:22-alpine
WORKDIR /app
COPY --from=build /out .
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/main.js"]
