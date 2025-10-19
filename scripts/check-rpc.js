#!/usr/bin/env node

import { spawn } from 'child_process';
import http from 'http';

function checkRPC() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 8545,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const data = JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_chainId',
      params: [],
      id: 1
    });

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    req.on('error', () => {
      resolve(false);
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🔍 Checking if Anvil RPC is running on localhost:8545...');
  const isRunning = await checkRPC();

  if (isRunning) {
    console.log('✅ Anvil RPC is running');
    console.log('📝 You can interact with the OTC Desk contract.');
    process.exit(0);
    return;
  }

  console.log('❌ Anvil RPC is not running. Starting in background...');
  try {
    const child = spawn('npm', ['run', 'rpc:start'], { stdio: 'ignore', shell: true, detached: true });
    child.unref();
    // Give it a moment to boot
    await new Promise((r) => setTimeout(r, 4000));
  } catch (e) {
    console.log('⚠️  Failed to auto-start Anvil. Please run: ./scripts/start-anvil.sh');
  }

  // Re-check but do not fail the whole dev script
  const ok = await checkRPC();
  if (ok) {
    console.log('✅ Anvil RPC started.');
  } else {
    console.log('⚠️  Anvil still not responding; continuing dev server startup.');
  }
  process.exit(0);
}

main();