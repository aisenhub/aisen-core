#!/usr/bin/env node
// Narrow reproducible baseline only. This does not claim Lighthouse/WCAG AA.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=join(root,'apps/admin/dist/assets');
const assets=readdirSync(dir).filter(n=>n.endsWith('.js'));
const mustHave=['App-','Dashboard-','LoginPage-','WorkspaceLists-','WorkspaceDetails-',
  'ProductCreate-','GrantCreate-','IssueCodes-','AccountActions-','UserShow-'];
for(const prefix of mustHave){
  assert.ok(assets.some(n=>n.startsWith(prefix)),prefix+' must be a separate route chunk');
}
const app=assets.find(n=>n.startsWith('App-'));
assert.ok(app);
const appCode=readFileSync(join(dir,app));
const raw=statSync(join(dir,app)).size;
const gz=gzipSync(appCode).length;
assert.ok(raw<160_000,'App entry no longer lazy-splits resources ('+raw+' bytes)');
console.log('ROUTE_SPLIT PASS '+mustHave.length+' independent route-chunk classes; App '+raw+' raw / '+gz+' gzip bytes');
const c=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255)
  .map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
const L=h=>{const v=c(h);return v[0]*.2126+v[1]*.7152+v[2]*.0722};
const ratio=(a,b)=>(Math.max(L(a),L(b))+0.05)/(Math.min(L(a),L(b))+0.05);
const pairs=[
  ['apps/admin/src/App.tsx','#53637d','#ffffff','sidebar grouping/meta'],
  ['apps/admin/src/theme.ts','#52617a','#f9faff','table headers'],
  ['apps/admin/src/resources/WorkspaceLists.tsx','#52627b','#f4f5f9','list footer'],
  ['apps/admin/src/resources/WorkspaceLists.tsx','#53627a','#ffffff','safe record ID'],
];
for(const [file,fg,bg,label] of pairs){
  assert.ok(readFileSync(join(root,file),'utf8').includes(fg),
    label+' must use the reviewed foreground color');
  const value=ratio(fg,bg);
  assert.ok(value>=4.5,label+' text contrast below 4.5:1 ('+value.toFixed(2)+')');
  console.log('TARGETED_CONTRAST PASS '+label+' '+value.toFixed(2)+':1');
}
const listSource=readFileSync(join(root,'apps/admin/src/resources/WorkspaceLists.tsx'),'utf8');
assert.ok(listSource.includes('TableSortLabel')&&listSource.includes('sortDirection='),
  'sortable columns must expose MUI semantics');
assert.ok(listSource.includes('pagination.scope===scopeKey?pagination.page:1'),
  'page must reset across distinct product scopes');
console.log('STATIC_TABLE_SEMANTICS PASS (source-only; real browser and read-screen tests still required)');
