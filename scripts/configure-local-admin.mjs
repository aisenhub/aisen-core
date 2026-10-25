#!/usr/bin/env node
/**
 * Generate the git-ignored local Admin Vite configuration from a RUNNING
 * AisenCore Supabase development stack. Never writes service/secret credentials.
 *
 * Usage: pnpm run setup:local
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const envPath = join(root, 'apps', 'admin', '.env.local');
const ignorePath = join(root, 'apps', 'admin', '.gitignore');
if (!existsSync(ignorePath) || !readFileSync(ignorePath,'utf8').includes('*.local')) {
  throw new Error('Missing apps/admin/.gitignore protection for .env.local');
}
const windows = process.platform === 'win32';
const command = spawnSync(windows ? 'cmd.exe' : 'pnpm',
  windows ? ['/d','/s','/c','pnpm dlx supabase status --output json'] :
    ['dlx','supabase','status','--output','json'],
  {cwd: root,encoding:'utf8',timeout:45000,maxBuffer:1024*1024});
if (command.status !== 0) {
  throw new Error('Local Supabase is not running. Start AisenCore services first; see README.md.');
}
let status;
try {
  status = JSON.parse(command.stdout);
} catch {
  throw new Error('Could not parse local Supabase status JSON; no files changed.');
}
// Never transfer keys from a remote project, even if locally logged into a
// Supabase account. The expected API and DB ports are unique to AisenCore.
if (status.API_URL !== 'http://127.0.0.1:55321' ||
    !/^postgresql:\/\/[^@\s]+@127\.0\.0\.1:55322\//.test(status.DB_URL ?? '')) {
  throw new Error('Refusing to configure Admin against a non-AisenCore or nonlocal Supabase instance.');
}
const key = status.PUBLISHABLE_KEY;
if (typeof key !== 'string' || !key.startsWith('sb_publishable_')) {
  throw new Error('Local Supabase did not provide a Publishable Key. No files changed.');
}
if (existsSync(envPath)) {
  const existing = readFileSync(envPath,'utf8');
  const expected = ['VITE_SUPABASE_URL='+status.API_URL,'VITE_SUPABASE_PUBLISHABLE_KEY='+key].join('\n')+'\n';
  if (existing === expected) {
    console.log('Local Admin configuration already exists and matches the active Supabase project.');
    process.exit(0);
  }
  console.error('apps/admin/.env.local already exists with different values; check it before replacing.');
  process.exit(1);
}
mkdirSync(dirname(envPath),{recursive:true});
const content = [
  'VITE_SUPABASE_URL='+status.API_URL,
  'VITE_SUPABASE_PUBLISHABLE_KEY='+key,
].join('\n')+'\n';
writeFileSync(envPath, content, {encoding:'utf8',flag:'wx',mode:0o600});
console.log('Created apps/admin/.env.local (Git ignored), using only the local Supabase URL and Publishable Key.');
console.log('Run pnpm run dev, then open http://localhost:3000/.');
