# The production web tier: nginx with the three built frontends baked in, so a
# deploy is `docker compose build` and the VPS needs nothing but Docker and git
# (docs/14-deploy.md). Build context is the repo root — pnpm needs the workspace.
FROM node:22-alpine AS build
# ponytail: npm -g instead of corepack, same reason as apps/api/Dockerfile.
RUN npm install -g pnpm@8.15.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/landing/package.json apps/landing/
COPY apps/web/package.json apps/web/
COPY apps/owner/package.json apps/owner/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile \
      --filter @zenvy/landing... --filter @zenvy/web... --filter @zenvy/owner...
COPY packages/shared packages/shared
COPY packages/ui packages/ui
COPY apps/landing apps/landing
COPY apps/web apps/web
COPY apps/owner apps/owner
# No VITE_API_URL: every SPA calls /api on its own origin, which nginx proxies.
RUN pnpm --filter @zenvy/landing... --filter @zenvy/web... --filter @zenvy/owner... build

FROM nginx:1.27-alpine
COPY --from=build /repo/apps/landing/out /srv/landing
COPY --from=build /repo/apps/web/dist /srv/app
COPY --from=build /repo/apps/owner/dist /srv/ops
