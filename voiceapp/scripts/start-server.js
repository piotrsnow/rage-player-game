import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

const proc = spawn(
  'python',
  ['-m', 'uvicorn', 'voiceapp.server.app:app', '--host', '0.0.0.0', '--port', '5050', '--reload'],
  { cwd: repoRoot, stdio: 'inherit' },
);

proc.on('error', (err) => {
  console.error(`[py] Failed to start: ${err.message}`);
  process.exit(1);
});

proc.on('exit', (code) => process.exit(code ?? 0));

process.on('SIGINT', () => proc.kill('SIGINT'));
process.on('SIGTERM', () => proc.kill('SIGTERM'));
