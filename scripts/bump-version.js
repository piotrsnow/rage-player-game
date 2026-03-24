import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const VERSION_FILE = 'src/version.js';

try {
  const content = readFileSync(VERSION_FILE, 'utf-8');
  const match = content.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) process.exit(0);

  const [, major, minor, patch] = match;
  const newVersion = `${major}.${minor}.${Number(patch) + 1}`;
  const updated = content.replace(match[0], newVersion);

  writeFileSync(VERSION_FILE, updated, 'utf-8');
  execSync(`git add ${VERSION_FILE}`);
} catch {
  process.exit(0);
}
