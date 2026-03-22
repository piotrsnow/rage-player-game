#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(__dirname, '..');
const ok = (msg) => console.log(`  ✓ ${msg}`);
const info = (msg) => console.log(`  → ${msg}`);
const skip = (msg) => console.log(`  · ${msg} (already exists)`);

function run(cmd, cwd = BACKEND_ROOT) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

console.log('\n🔧 Rage Player — auto-setup\n');

// ── 1. .env ──────────────────────────────────────────────
console.log('[1/5] Environment (.env)');
const envPath = resolve(BACKEND_ROOT, '.env');
const envExamplePath = resolve(BACKEND_ROOT, '.env.example');

if (!existsSync(envPath)) {
  if (!existsSync(envExamplePath)) {
    console.error('  ✗ .env.example not found — cannot generate .env');
    process.exit(1);
  }

  let envContent = readFileSync(envExamplePath, 'utf-8');

  const jwtSecret = randomBytes(32).toString('hex');
  const encryptionSecret = randomBytes(16).toString('hex');

  envContent = envContent.replace(
    /JWT_SECRET="__GENERATED__"/,
    `JWT_SECRET="${jwtSecret}"`,
  );
  envContent = envContent.replace(
    /API_KEY_ENCRYPTION_SECRET="__GENERATED__"/,
    `API_KEY_ENCRYPTION_SECRET="${encryptionSecret}"`,
  );

  writeFileSync(envPath, envContent, 'utf-8');
  ok('.env created with generated secrets');
} else {
  let needsUpdate = false;
  let envContent = readFileSync(envPath, 'utf-8');

  if (
    envContent.includes('JWT_SECRET="change-me-to-a-random-secret"') ||
    envContent.includes('JWT_SECRET="__GENERATED__"')
  ) {
    const secret = randomBytes(32).toString('hex');
    envContent = envContent.replace(
      /JWT_SECRET="[^"]*"/,
      `JWT_SECRET="${secret}"`,
    );
    needsUpdate = true;
    ok('JWT_SECRET regenerated (was placeholder)');
  }

  if (
    envContent.includes(
      'API_KEY_ENCRYPTION_SECRET="change-me-to-32-char-hex-secret"',
    ) ||
    envContent.includes('API_KEY_ENCRYPTION_SECRET="__GENERATED__"')
  ) {
    const secret = randomBytes(16).toString('hex');
    envContent = envContent.replace(
      /API_KEY_ENCRYPTION_SECRET="[^"]*"/,
      `API_KEY_ENCRYPTION_SECRET="${secret}"`,
    );
    needsUpdate = true;
    ok('API_KEY_ENCRYPTION_SECRET regenerated (was placeholder)');
  }

  if (needsUpdate) {
    writeFileSync(envPath, envContent, 'utf-8');
  } else {
    skip('.env');
  }
}

// ── 2. node_modules ──────────────────────────────────────
console.log('[2/5] Dependencies (node_modules)');
if (!existsSync(resolve(BACKEND_ROOT, 'node_modules'))) {
  info('Installing backend dependencies...');
  run('npm install');
  ok('npm install done');
} else {
  skip('node_modules');
}

// ── 3. Prisma client ────────────────────────────────────
console.log('[3/5] Prisma client');
const prismaClientDir = resolve(
  BACKEND_ROOT,
  'node_modules',
  '.prisma',
  'client',
);
if (!existsSync(prismaClientDir)) {
  info('Generating Prisma client...');
  run('npx prisma generate');
  ok('Prisma client generated');
} else {
  skip('Prisma client');
}

// ── 4. Database ──────────────────────────────────────────
console.log('[4/5] Database');
info('Pushing schema to MongoDB...');
run('npx prisma db push');
ok('Schema pushed');

// ── 5. Media directory ───────────────────────────────────
console.log('[5/5] Media storage directory');
const mediaPath = resolve(BACKEND_ROOT, 'media');
if (!existsSync(mediaPath)) {
  mkdirSync(mediaPath, { recursive: true });
  ok('media/ directory created');
} else {
  skip('media/');
}

console.log('\n✅ Setup complete! Run `npm run dev` to start.\n');
