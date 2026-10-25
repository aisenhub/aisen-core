#!/usr/bin/env node
// Static scan of the built D3 frontend. Not a substitute for network logging
// or runtime devtools inspections of one-time plaintext.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const assets = new URL('../apps/admin/dist/assets/', import.meta.url);
const output = readdirSync(assets, { withFileTypes: true })
  .filter(file => file.isFile() && file.name.endsWith('.js'))
  .map(file => readFileSync(join(assets.pathname.replace(/^\/([A-Z]:\/)/,'$1'),file.name),'utf8'))
  .join('\n');
assert.ok(output.length > 0, 'bundled JavaScript exists');
const forbidden = [
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{12,}/],
  ['legacy service-role JWT', /eyJ[A-Za-z0-9_-]{70,}\.eyJ[A-Za-z0-9_-]{70,}\.[A-Za-z0-9_-]{30,}/],
  ['RPC execution database role', /aisencore_rpc_executor/],
  ['redemption code hash column name', /code_hash/],
  ['private Supabase DB URL', /postgres(?:ql)?:\/\/[^"\s]+@/],
];
for (const [label, pattern] of forbidden) {
  assert.ok(!pattern.test(output), 'bundle contains forbidden content: ' + label);
}
console.log('D3 built JS static secret scan PASS; runtime/network audit not performed');
