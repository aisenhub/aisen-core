#!/usr/bin/env node
// Deterministic isolation test of the real authProvider source: no network/Auth/DB writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(join(root,'apps/admin/package.json'));
const ts=require('typescript');
const source=readFileSync(join(root,'apps/admin/src/auth/authProvider.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
let current=null,aal='aal2',calls=[],eventCb=null;
const supabase={
 auth:{
  getSession:async()=>({data:{session:current}}),
  mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:aal}})},
  onAuthStateChange:cb=>{eventCb=cb;return {data:{subscription:{unsubscribe(){}}}}},
  signOut:async()=>({error:null}),
 },
 rpc:async name=>{assert.equal(name,'admin_check_access');const d=defer();calls.push(d);return d.promise},
};
const exports={};
vm.runInNewContext(compiled,{exports,require:id=>{
 if(id==='../supabaseClient')return {supabase};
 throw Error('unsupported test dependency '+id)
},Date,Error,Promise,console});
const {requireAdmin,invalidateAdminAccess}=exports;
const tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve()};
const login=token=>({access_token:token,user:{id:'qa-admin'}});
async function expectReject(p,label){await assert.rejects(p,/管理员身份状态已变化|管理员会话已变化|没有平台管理权限/,label)}
const checks=[];
async function scenario(label,change){
 invalidateAdminAccess(); current=login('A-'+label);
 const before=calls.length;
 const first=requireAdmin(), second=requireAdmin();await tick();
 assert.equal(calls.length,before+1,label+' single-flight RPC');
 await change(calls.at(-1));
 const outcomes=await Promise.allSettled([first,second]);
 checks.push({label,rpcCount:1,outcomes:outcomes.map(x=>x.status)});
}
await scenario('singleflight',async d=>d.resolve({data:{allowed:true},error:null}));
assert.deepEqual(checks[0].outcomes,['fulfilled','fulfilled']);
await scenario('signed-out-inflight',async d=>{current=null;eventCb('SIGNED_OUT');d.resolve({data:{allowed:true},error:null})});
assert.deepEqual(checks[1].outcomes,['rejected','rejected']);
await scenario('token-refreshed-inflight',async d=>{current=login('B');eventCb('TOKEN_REFRESHED');d.resolve({data:{allowed:true},error:null})});
assert.deepEqual(checks[2].outcomes,['rejected','rejected']);
await scenario('forced-refresh-inflight',async d=>{
 current=login('B-forced');
 const forced=requireAdmin(true); await tick();
 assert.equal(calls.length,5,'fresh forced RPC separate from invalidated in-flight');
 d.resolve({data:{allowed:true},error:null});
 calls.at(-1).resolve({data:{allowed:false},error:null});
 await expectReject(forced,'forced deny');
});
assert.deepEqual(checks[3].outcomes,['rejected','rejected']);
await scenario('permission-denied',async d=>d.resolve({data:{allowed:false},error:null}));
assert.deepEqual(checks[4].outcomes,['rejected','rejected']);
console.log('AUTH_INFLIGHT_RACE PASS '+checks.map(x=>x.label+':'+x.outcomes.join('/')).join(' | '));
