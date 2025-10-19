#!/bin/bash

# Deploy using Forge and update environment
cd "$(dirname "$0")/.."

echo "Deploying with Forge..."
forge script script/DeployElizaOTC.s.sol:DeployElizaOTC \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  --legacy

# Merge deployment env vars into .env.local
if [ -f .env.deployment ]; then
  echo ""
  echo "Updating .env.local..."
  
  ENV_LOCAL="../.env.local"
  
  # Create .env.local if it doesn't exist
  touch "$ENV_LOCAL"
  
  # Read each line from .env.deployment and update .env.local
  while IFS='=' read -r key value; do
    if [ -n "$key" ] && [ -n "$value" ]; then
      # Remove existing key if present
      sed -i.bak "/^${key}=/d" "$ENV_LOCAL" 2>/dev/null || true
      # Add new value
      echo "${key}=${value}" >> "$ENV_LOCAL"
    fi
  done < .env.deployment
  
  rm -f "${ENV_LOCAL}.bak"
  rm -f .env.deployment
  
  echo "Environment variables updated in .env.local"
fi

echo ""
echo "Deployment complete"

