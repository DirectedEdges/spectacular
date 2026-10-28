/**
 * Bridge Command
 *
 * Manages the local CLI bridge — a background process that relays
 * `specs render` requests to a connected Spectacular Figma plugin over
 * WebSocket. See bridge/server.ts for the actual server implementation.
 */

import { Command } from 'commander';
import { spawn } from 'child_process';
import { openSync, closeSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  ensureSpecsHome,
  getRunningPid,
  isAlive,
  writePid,
  clearPidFile,
  BRIDGE_PID_FILE,
  BRIDGE_LOG_FILE,
} from '../bridge/pidfile.js';
import { getBridgeStatus } from '../bridge/client.js';
import { ERROR_CODES } from '../utilities/errorCodes.js';

function resolveBridgeServerScript(): string {
  // dist/specs.js and dist/bridge-server.js are sibling build outputs.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, 'bridge-server.js');
}

export const Bridge = new Command('bridge')
  .description('Manage the local CLI bridge used by `specs render` to reach a running Figma plugin');

Bridge.command('start')
  .description('Start the bridge server in the background')
  .option('--workspace <path>', 'Pin a workspace directory instead of deriving it per-request')
  .action(async (options: { workspace?: string }) => {
    const runningPid = getRunningPid();
    if (runningPid !== null) {
      console.log(`Bridge already running (pid ${runningPid}).`);
      console.log('Run `specs bridge status` to check plugin connection.');
      process.exit(ERROR_CODES.SUCCESS);
    }

    ensureSpecsHome();
    const serverScript = resolveBridgeServerScript();
    const args = options.workspace ? ['--workspace', options.workspace] : [];

    const logFd = openSync(BRIDGE_LOG_FILE, 'a');
    const child = spawn('node', [serverScript, ...args], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
    closeSync(logFd);

    if (!child.pid) {
      console.error('Error: failed to start the bridge server.');
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }

    child.unref();
    writePid(child.pid);

    console.log(`Bridge started (pid ${child.pid}).`);
    console.log('  WebSocket : ws://localhost:9001  (plugin)');
    console.log('  HTTP      : http://localhost:9002/render  (control)');
    console.log(`  Logs      : ${BRIDGE_LOG_FILE}`);
    console.log('Enable the CLI Bridge in the Figma plugin to connect.');
  });

Bridge.command('stop')
  .description('Stop the background bridge server')
  .action(async () => {
    const pid = getRunningPid();
    if (pid === null) {
      console.log('Bridge is not running.');
      process.exit(ERROR_CODES.SUCCESS);
    }

    process.kill(pid, 'SIGTERM');

    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && isAlive(pid)) {
      await new Promise((r) => setTimeout(r, 100));
    }

    if (isAlive(pid)) {
      process.kill(pid, 'SIGKILL');
    }

    clearPidFile();
    console.log('Bridge stopped.');
  });

Bridge.command('status')
  .description('Check whether the bridge server (and a connected plugin) are running')
  .action(async () => {
    const pid = getRunningPid();
    if (pid === null) {
      console.log('Bridge is not running.');
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }

    try {
      const { connections } = await getBridgeStatus();
      if (connections.length === 0) {
        console.log(`Bridge running (pid ${pid}). No plugin connected.`);
      } else {
        console.log(`Bridge running (pid ${pid}). ${connections.length} plugin${connections.length === 1 ? '' : 's'} connected:`);
        for (const c of connections) {
          console.log(`  ${c.fileKey}${c.fileName ? ` (${c.fileName})` : ''} — ${c.connected ? 'connected' : 'disconnected'}`);
        }
      }
      process.exit(ERROR_CODES.SUCCESS);
    } catch {
      console.log(`Bridge running (pid ${pid}), but the control port isn't responding.`);
      process.exit(ERROR_CODES.GENERAL_ERROR);
    }
  });
