#!/usr/bin/env node
// Regression: missing public Supabase env must show actionable setup UI, not blank.
// Uses a separate Vite port and an isolated Chrome profile; no Auth calls.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 3393;
const base = 'http://127.0.0.1:' + port;
const windows = process.platform === 'win32';
const chrome = windows ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome';
const profile = mkdtempSync(join(tmpdir(), 'aisencore-no-config-'));
const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' };
const server = spawn(windows ? 'cmd.exe' : 'pnpm',
  windows ? ['/d','/s','/c', 'pnpm --filter @aisencore/admin dev --host 127.0.0.1 --port ' + port]
    : ['--filter','@aisencore/admin','dev','--host','127.0.0.1','--port',String(port)],
  { cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:\/)/, '$1'), env, stdio: 'ignore' });

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base, { signal: AbortSignal.timeout(1000) });
      if (r.ok) { ready = true; break; }
    } catch { /* server not up */ }
    if (server.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'isolated Vite server must serve the page');
  const result = spawnSync(chrome,
    ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
      '--user-data-dir=' + profile,'--virtual-time-budget=6000','--dump-dom',base],
    { encoding:'utf8', timeout:60000, maxBuffer:3_000_000 });
  assert.equal(result.status,0,'Chrome exits successfully: ' + result.stderr.slice(-500));
  assert.ok(result.stdout.includes('开发环境尚未就绪'), 'missing-config warning must render');
  assert.ok(result.stdout.includes('apps/admin/.env.local'), 'setup instructions must render');
  assert.ok(result.stdout.includes('VITE_SUPABASE_PUBLISHABLE_KEY'), 'correct public key variable displayed');
  console.log('D3 missing-config Chrome smoke PASS: clear setup screen, not blank');
} finally {
  if (windows) spawnSync('taskkill', ['/PID',String(server.pid),'/T','/F'],
    {encoding:'utf8',timeout:10000});
  else server.kill('SIGTERM');
  rmSync(profile,{recursive:true,force:true});
}
