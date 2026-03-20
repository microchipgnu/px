FROM oven/bun:1.2.21

# Install jq, curl, bc for the bash solver
RUN apt-get update && apt-get install -y jq curl bc && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (monorepo)
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

# Copy source and build
COPY . .
RUN cd packages/protocol && bun run build
RUN cd packages/solver-sdk && bun run build
RUN cd apps/solver-agent && bun run build

# Copy solver script
COPY examples/bash-solver/solve.sh ./solve.sh
RUN chmod +x solve.sh

ENV COORDINATOR="https://px-mainnet.fly.dev"
ENV TASKS="computation,search,price_feed"
ENV PRICE="0.01"
ENV SOLVER_ADDRESS=""

CMD ["sh", "-c", "bun apps/solver-agent/dist/index.js --coordinator $COORDINATOR ${SOLVER_ADDRESS:+--address $SOLVER_ADDRESS} run --tasks $TASKS --price $PRICE --exec './solve.sh'"]
