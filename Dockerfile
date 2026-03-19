FROM oven/bun:1.2.21

WORKDIR /app

# Install deps first (cached layer)
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
COPY apps/coordinator/package.json ./apps/coordinator/
COPY apps/buyer-agent/package.json ./apps/buyer-agent/
COPY apps/solver-agent/package.json ./apps/solver-agent/
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/attestor/package.json ./packages/attestor/
COPY packages/buyer-sdk/package.json ./packages/buyer-sdk/
COPY packages/solver-sdk/package.json ./packages/solver-sdk/
COPY packages/ui/package.json ./packages/ui/
COPY tooling/tsconfig/package.json ./tooling/tsconfig/
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build web app and place in coordinator's public dir
ARG VITE_TESTNET_URL=https://px-test.fly.dev
ARG VITE_MAINNET_URL=https://px-mainnet.fly.dev
RUN cd apps/web && \
    VITE_TESTNET_URL=$VITE_TESTNET_URL \
    VITE_MAINNET_URL=$VITE_MAINNET_URL \
    bun run build
RUN cp -r apps/web/dist apps/coordinator/public

EXPOSE 4000

CMD ["bun", "run", "apps/coordinator/src/index.ts"]
