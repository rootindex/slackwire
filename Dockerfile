FROM node:20-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /build

RUN npm install -g pnpm@9

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/cli/package.json packages/cli/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/mcp/package.json packages/mcp/package.json

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/core/tsconfig.json packages/core/tsconfig.json
COPY packages/core/src packages/core/src
COPY packages/cli/tsconfig.json packages/cli/tsconfig.json
COPY packages/cli/src packages/cli/src
COPY packages/cli/bundle.mjs packages/cli/bundle.mjs

RUN pnpm --filter @slack-cards/core build
RUN pnpm --filter @slack-cards/cli build


FROM gcr.io/distroless/nodejs20-debian12

WORKDIR /app

COPY --from=builder /build/packages/cli/dist/bundle.cjs ./bundle.cjs

ENTRYPOINT ["/nodejs/bin/node", "/app/bundle.cjs"]
