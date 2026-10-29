#!/usr/bin/env node
// Guard the Admin radius system against accidental MUI numeric multiplication.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../apps/admin/src');
const theme=readFileSync(path.join(root,'theme.ts'),'utf8');
const values={small:'8px',control:'12px',card:'16px',container:'20px',
  pill:'999px',circle:'50%'};
for(const [name,value] of Object.entries(values)){
  assert.ok(theme.includes(name+": '"+value+"'"),
    'Admin theme must define '+name+' as '+value);
}
assert.match(theme,/shape:\s*\{\s*borderRadius:\s*Number\.parseInt\(adminRadii\.control,10\)/);
const counts=Object.fromEntries(Object.keys(values).map(key=>[key,0]));
let checked=0;
function walk(dir){
  for(const entry of readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){walk(file);continue;}
    if(!/\.(?:tsx?|css)$/.test(entry.name))continue;
    const src=readFileSync(file,'utf8');
    checked++;
    if(entry.name.endsWith('.css')){
      for(const match of src.matchAll(/border-radius\s*:\s*([^;\n]+)/g))
        assert.match(match[1],/^var\(--aisen-radius-/,
          'Legacy CSS must derive border radii from theme tokens: '+file);
      continue;
    }
    for(const match of src.matchAll(/\bborderRadius\s*:\s*(?:\{\s*xs\s*:\s*0|[^,\n}]+)/g)){
      const declaration=match[0];
      if(file.endsWith('theme.ts')&&declaration.includes('Number.parseInt'))continue;
      assert.ok(/borderRadius\s*:\s*(?:adminRadii\.\w+|0\b|\{\s*xs\s*:\s*0\b|\x60\$\{adminRadii\.)/.test(declaration),
        'Use semantic radius tokens (or documented square/fullscreen 0) in '+file+': '+declaration);
    }
    if(!file.endsWith('theme.ts')){
      for(const key of Object.keys(values)){
        const uses=(src.match(new RegExp('adminRadii\\.'+key+'\\b','g'))??[]).length;
        counts[key]+=uses;
        if(uses)assert.match(src,/import\s*\{[^}]*adminRadii[^}]*\}\s*from\s*['"][^'"]*theme['"]/,
          'Page must import semantic radius tokens from theme: '+file);
      }
    }
  }
}
walk(root);
assert.ok(counts.control>0&&counts.card>0&&counts.container>0&&
  counts.pill>0&&counts.circle>0);
console.log('ADMIN_RADIUS_CONTRACT PASS',JSON.stringify({checkedFiles:checked,tokenUses:counts}));
