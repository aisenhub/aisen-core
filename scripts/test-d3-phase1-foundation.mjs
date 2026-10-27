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
  ['apps/admin/src/theme.ts','#526475','#F6F8FA','table headers'],
  ['apps/admin/src/theme.ts','#586A78','#FFFFFF','secondary text'],
  ['apps/admin/src/theme.ts','#1D2936','#FFFFFF','primary text'],
  ['apps/admin/src/theme.ts','#3b2e92','#ece9f8','active navigation'],
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
assert.ok(listSource.includes('(!query.isPending&&rows.length===0)')&&
  listSource.includes('<TableBody>{query.isPending?'),
  'known fixed table headers must remain visible while the body is loading');
console.log('STATIC_LOADING_STRUCTURE PASS (source-only; requires AAL2 browser validation)');
const pendingSource=readFileSync(join(root,'apps/admin/src/resources/PendingDatagrid.tsx'),'utf8');
for(const path of ['apps/admin/src/resources/lists.tsx','apps/admin/src/resources/FeedbackV2.tsx']){
  assert.ok(readFileSync(join(root,path),'utf8').includes('<PendingDatagrid'),
    path+' must show its known headings before the async data rows arrive');
}
assert.ok(pendingSource.includes('if (!isPending)')&&pendingSource.includes('<TableHead>')&&
  pendingSource.includes('role="status"'),
  'the pending Datagrid shell must show real headings immediately with an accessible row status');
assert.ok(listSource.includes('desktop&&<TableContainer')&&listSource.includes('!desktop&&<Box>'),
  'the desktop table and mobile card subtrees must be mounted exclusively');
console.log('STATIC_PERCEIVED_PERF PASS pending RA headings and single-viewport list rendering');
console.log('STATIC_TABLE_SEMANTICS PASS (source-only; real browser and read-screen tests still required)');
