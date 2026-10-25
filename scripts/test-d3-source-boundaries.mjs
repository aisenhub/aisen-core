#!/usr/bin/env node
// D3 source-only guardrails: NOT a substitute for browser or authenticated E2E.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root=new URL('../apps/admin/src/',import.meta.url).pathname;
const files=[];
function inspect(dir) {
  for(const d of readdirSync(dir,{withFileTypes:true})){
    const path=join(dir,d.name);
    if(d.isDirectory())inspect(path);
    else if(/\.[tj]sx?$/.test(d.name))files.push({path,text:readFileSync(path,'utf8')});
  }
}
inspect(decodeURIComponent(root.replace(/^\/([A-Z]:\/)/,'$1')));
const all=files.map(x=>x.text).join('\n');
assert.equal(files.filter(x=>x.path.endsWith('theme.ts')).length,1,'single theme authority');
assert.ok(all.includes('auth.mfa.challengeAndVerify'),'official Supabase MFA challenge');
assert.ok(all.includes("scope: 'local'"),'local session sign-out');
assert.ok(all.includes('admin_check_access'),'live server-side admin guard');
assert.ok(all.includes('admin_lookup_users'),'bounded authorized Auth lookup');
assert.ok(all.includes('admin_create_codes'),'server-side code issuance');
assert.ok(!/sb_secret_[A-Za-z0-9_-]{12}/.test(all),'no private Supabase key in frontend');
assert.ok(!/service_role\s*[:=]\s*['"][^'"]+['"]/.test(all),'no service-role value in frontend');
assert.ok(!/\.from\([^)]*\)\.(?:insert|update|upsert|delete)\s*\(/.test(all),
  'no direct business DML through Data API');
// A known HTTP 429 must not be treated as UNKNOWN merely because
// PostgrestError lacks the transport's HTTP status property.
const rpcAdapter=files.find(x=>x.path.endsWith('dataProvider.ts'))?.text;
assert.ok(rpcAdapter?.includes('const { data, error, status } = await supabase.rpc(name, params)'),
  'RPC adapter must preserve HTTP transport status for 4xx/5xx classification');
assert.ok(rpcAdapter?.includes('code: error.code, status });'),
  'RPC failures must pass actual response status to error handling');
const issuance=files.find(x=>x.path.endsWith('IssueCodes.tsx'))?.text;
assert.ok(issuance,'code issuance module exists');
assert.ok(issuance.includes('setPlain(result.codes)') && issuance.includes('setPlain(null)'),
  'plaintext stays in current component state and is cleared explicitly');
assert.ok(!/(?:localStorage|sessionStorage)\.setItem\([^;]*result\.codes/.test(issuance),
  'plaintext cannot be written to web storage');
console.log('D3 source boundary smoke: PASS ('+files.length+' frontend modules); not a browser security audit');
