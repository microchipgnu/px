#!/usr/bin/env bash
set -euo pipefail

# Resolve fly CLI
if command -v fly &>/dev/null; then
  FLY=fly
elif command -v flyctl &>/dev/null; then
  FLY=flyctl
elif [[ -x "$HOME/.fly/bin/flyctl" ]]; then
  FLY="$HOME/.fly/bin/flyctl"
else
  echo "Error: fly CLI not found. Install from https://fly.io/docs/flyctl/install/"
  exit 1
fi

usage() {
  echo "Usage: ./deploy.sh <test|main|both> [--init]"
  echo ""
  echo "  test   Deploy testnet coordinator (px-test.fly.dev)"
  echo "  main   Deploy mainnet coordinator (px-main.fly.dev)"
  echo "  both   Deploy both environments"
  echo ""
  echo "  --init  First-time setup: create apps, volumes, and prompt for secrets"
  exit 1
}

[[ $# -lt 1 ]] && usage

TARGET="$1"
INIT=false
[[ "${2:-}" == "--init" ]] && INIT=true

init_app() {
  local app="$1" volume="$2" config="$3"

  echo "==> Creating app: $app"
  $FLY apps create "$app" 2>/dev/null || echo "    (app already exists)"

  echo "==> Creating volume: $volume"
  $FLY volumes create "$volume" --region cdg --size 1 -c "$config" -y 2>/dev/null || echo "    (volume already exists)"

  echo "==> Setting secrets for $app"
  read -rsp "    MPP_SECRET_KEY for $app: " key
  echo
  $FLY secrets set MPP_SECRET_KEY="$key" -c "$config"
}

deploy_app() {
  local label="$1" config="$2"
  echo "==> Deploying $label ($config)"
  $FLY deploy -c "$config"
  echo "==> $label deployed"
}

if [[ "$TARGET" == "test" || "$TARGET" == "both" ]]; then
  $INIT && init_app "px-test" "px_test_data" "fly.testnet.toml"
  deploy_app "testnet" "fly.testnet.toml"
fi

if [[ "$TARGET" == "main" || "$TARGET" == "both" ]]; then
  $INIT && init_app "px-mainnet" "px_mainnet_data" "fly.mainnet.toml"
  deploy_app "mainnet" "fly.mainnet.toml"
fi

echo "==> Done"
