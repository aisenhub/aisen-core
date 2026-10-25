#!/usr/bin/env node
// AisenCore local-only idempotent Admin experience fixtures. Never for production.
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const win=process.platform==='win32';
const cli=spawnSync(win?'cmd.exe':'pnpm',
  win?['/d','/s','/c','pnpm dlx supabase status --output json']:
    ['dlx','supabase','status','--output','json'],
  {cwd:root,encoding:'utf8',timeout:45000,maxBuffer:1024*1024});
if(cli.status!==0)throw Error('Start the AisenCore local Supabase stack first');
const cfg=JSON.parse(cli.stdout);
if(cfg.API_URL!=='http://127.0.0.1:55321' ||
   !/^postgresql:\/\/[^@\s]+@127\.0\.0\.1:55322\//.test(cfg.DB_URL??'') ||
   !cfg.SERVICE_ROLE_KEY || !cfg.PUBLISHABLE_KEY?.startsWith('sb_publishable_'))
  throw Error('Refusing to seed anything except the local AisenCore 55321/55322 database');
const port=spawnSync('docker',['port','supabase_db_Aisencore','5432/tcp'],{encoding:'utf8',timeout:15000});
if(port.status!==0||!/:55322\b/.test(port.stdout))throw Error('Local database container mismatch');
function runSql(sql,write=false) {
  const args=['exec',...(write?['-i']:[]),'supabase_db_Aisencore','psql','-X','-qAt',
    '-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1',...(write?['-f','-']:['-c',sql])];
  const r=spawnSync('docker',args,{encoding:'utf8',input:write?sql:undefined,timeout:120000,maxBuffer:2_000_000});
  if(r.status!==0)throw Error('Local SQL '+(write?'transaction':'query')+' failed: '+r.stderr.slice(-1500));
  return r.stdout.trim();
}
function id(s) {
  const h=createHash('sha256').update('aisencore-demo-fixture-v1:'+s).digest('hex');
  return [h.slice(0,8),h.slice(8,12),'4'+h.slice(13,16),'a'+h.slice(17,20),h.slice(20,32)].join('-');
}
const q=v=>v==null?'NULL':"'"+String(v).replaceAll("'","''")+"'";
const rows=[];
function add(table,cols,data) {
  if(!data.length)return;
  for(let i=0;i<data.length;i+=80)
    rows.push('INSERT INTO public.'+table+' ('+cols.join(',')+') VALUES\n'+
      data.slice(i,i+80).map(entry=>'('+entry.map(q).join(',')+')').join(',\n')+
      '\nON CONFLICT DO NOTHING;');
}
const admin=runSql("SELECT u.id FROM auth.users u JOIN public.platform_admins p ON p.user_id=u.id WHERE u.email='admin@aisencore.test' AND p.active");
if(!/^[a-f0-9-]{36}$/i.test(admin))throw Error('Run pnpm run setup:dev-admin first');
const emails=Array.from({length:24},(_,i)=>'aisen-demo-'+String(i+1).padStart(2,'0')+'@aisencore.test');
const foreign=runSql("SELECT count(*) FROM auth.users WHERE email LIKE 'aisen-demo-%@aisencore.test' AND coalesce(raw_user_meta_data->>'demo_fixture','false') <> 'true'");
if(foreign!=='0')throw Error('Refusing to reuse synthetic email belonging to a non-fixture local user');
const known=new Map(runSql("SELECT email||'|'||id FROM auth.users WHERE email LIKE 'aisen-demo-%@aisencore.test'")
  .split(/\r?\n/).filter(Boolean).map(s=>s.split('|')));
for(let i=0;i<emails.length;i++){
  const email=emails[i];
  if(known.has(email))continue;
  const resp=await fetch(cfg.API_URL+'/auth/v1/admin/users',{
    method:'POST',headers:{apikey:cfg.SERVICE_ROLE_KEY,
      authorization:'Bearer '+cfg.SERVICE_ROLE_KEY,'content-type':'application/json'},
    body:JSON.stringify({email,password:'LocalOnly!'+randomBytes(18).toString('base64url'),
      email_confirm:true,user_metadata:{full_name:['林沐','程泽','何青','顾远','叶舟','宋宁'][i%6]+(i+1),demo_fixture:true}}),
    signal:AbortSignal.timeout(18000)});
  const data=await resp.json().catch(()=>({}));
  if(!resp.ok||!/^[a-f0-9-]{36}$/i.test(data.id??''))throw Error('GoTrue local fixture create failed HTTP '+resp.status);
  known.set(email,data.id);
}
const products=[
  ['demo_atlas','Atlas · 智识引擎','知识检索和分析平台','active'],
  ['demo_orbit','Orbit · 团队协作','多团队协作平台','active'],
  ['demo_harbor','Harbor · 归档系统','已暂停的演示产品','suspended'],
  ['demo_nova','Nova · 新产品','尚未发布的演示产品','draft'],
].map(([key,name,desc,status])=>({key,name,desc,status,id:id('product:'+key)}));
for(const product of products){
  const conflict=runSql("SELECT count(*) FROM public.products WHERE product_key="+q(product.key)+" AND id <> "+q(product.id));
  if(conflict!=='0')throw Error('Refusing to replace a user-created product with reserved demo key '+product.key);
}

add('products',['id','product_key','name','description','status'],
  products.map(x=>[x.id,x.key,x.name,x.desc,x.status]));
const members=[],events=[],grants=[],batches=[],codes=[],redemptions=[],audit=[];
for(let i=0;i<emails.length;i++){
  const uid=known.get(emails[i]);
  for(let j=0;j<2;j++){
    const prod=products[(i+j)%3],mid=id('member:'+emails[i]+prod.key);
    const status=(i+j)%9===0?'suspended':(i+j)%5===0?'left':'active';
    const pre=status==='suspended'?(i%2===0?'left':'active'):null;
    members.push([mid,uid,prod.id,status,pre,'2026-09-'+String(i+1).padStart(2,'0')+'T10:00:00Z']);
    events.push([id('join:'+mid),mid,'join',null,'active','system',null,null]);
    if(status!=='active')
      events.push([id('state:'+mid),mid,status==='left'?'leave':'suspend',
        status==='left'?'active':pre,status,'admin',admin,'demo_fixture']);
  }
  if(i<20){
    const product=products[i%3],revoke=i%7===0,expired=i%7===1,permanent=i%7===2;
    grants.push([id('grant:'+i),uid,product.id,'pro','admin','demo_fixture_grant_'+i,
      permanent?'explicit_window':'duration',permanent?null:30,
      expired?'2026-07-01T00:00:00Z':'2026-10-01T00:00:00Z',
      permanent?null:expired?'2026-08-01T00:00:00Z':'2026-11-30T00:00:00Z',
      admin,'仅本地合成数据',revoke?'2026-10-18T00:00:00Z':null,
      revoke?admin:null,revoke?'本地演示撤销':null]);
  }
}
add('product_memberships',['id','user_id','product_id','status','pre_suspend_status','joined_at'],members);
add('membership_events',['id','membership_id','action','from_status','to_status','actor_type','actor_user_id','reason_code'],events);
for(let b=0;b<3;b++){
  const prod=products[b],bid=id('batch:'+b);
  batches.push([bid,prod.id,'pro',admin,'demo_fixture_batch_'+b,6,30,false,1,null,'本地合成批次；无法获取明文']);
  for(let j=0;j<6;j++){
    const cid=id('code:'+b+':'+j),hash=createHash('sha256').update('nonredeemable_demo_hash:'+b+':'+j).digest('hex');
    const redeemed=j<2,revoked=j===4;
    codes.push([cid,bid,j+1,hash,'DEMO'+b+String(j).padStart(2,'0'),prod.id,'pro',30,false,1,
      redeemed?1:0,'2026-12-31T00:00:00Z',admin,revoked?'2026-10-22T00:00:00Z':null,
      revoked?admin:null,revoked?'演示撤销':null]);
    if(redeemed){
      const uid=known.get(emails[(b*3+j)%emails.length]),gid=id('redeemed-grant:'+b+':'+j);
      grants.push([gid,uid,prod.id,'pro','redeem_code','demo_fixture_redeem_'+b+'_'+j,
        'duration',30,'2026-10-11T00:00:00Z','2026-11-10T00:00:00Z',
        admin,'本地演示核销',null,null,null]);
      redemptions.push([id('redemption:'+b+':'+j),cid,uid,prod.id,gid]);
    }
  }
}
add('entitlement_grants',['id','user_id','product_id','tier','source_type','source_ref',
  'grant_mode','requested_duration_days','starts_at','ends_at','created_by','grant_reason',
  'revoked_at','revoked_by','revoke_reason'],grants);
add('redemption_code_batches',['id','product_id','tier','created_by','request_id','quantity',
  'grant_duration_days','is_lifetime','max_redemptions_per_code','code_expires_at','note'],batches);
add('redemption_codes',['id','batch_id','batch_ordinal','code_hash','code_prefix','product_id',
  'tier','grant_duration_days','is_lifetime','max_redemptions','redeemed_count','expires_at',
  'created_by','revoked_at','revoked_by','revoke_reason'],codes);
add('redemptions',['id','code_id','user_id','product_id','grant_id'],redemptions);
for(let i=0;i<10;i++){
  audit.push([id('audit:'+i),admin,'demo_fixture_preview','product',products[i%4].id,
    JSON.stringify({synthetic:true,sequence:i,before:'demo'}),
    JSON.stringify({synthetic:true,sequence:i,after:'demo'}),
    '合成展示数据，不代表实际管理员操作']);
}
add('admin_audit_log',['id','actor_user_id','action','target_type','target_id','before','after','reason'],audit);
add('platform_account_restrictions',['user_id','kind','reason_code','created_by'],[
  [known.get(emails[22]),'blocked','demo_fixture_account_block',admin],
  [known.get(emails[23]),'blocked','demo_fixture_account_block',admin],
]);
runSql('BEGIN;\nSET LOCAL statement_timeout = \'90s\';\n'+rows.join('\n')+'\nCOMMIT;',true);
const report=runSql("SELECT 'products|'||count(*) FROM public.products WHERE product_key LIKE 'demo_%' UNION ALL SELECT 'memberships|'||count(*) FROM public.product_memberships m JOIN public.products p ON m.product_id=p.id WHERE p.product_key LIKE 'demo_%' UNION ALL SELECT 'grants|'||count(*) FROM public.entitlement_grants WHERE source_ref LIKE 'demo_%' UNION ALL SELECT 'batches|'||count(*) FROM public.redemption_code_batches WHERE request_id LIKE 'demo_fixture_%' UNION ALL SELECT 'codes|'||count(*) FROM public.redemption_codes c JOIN public.redemption_code_batches b ON c.batch_id=b.id WHERE b.request_id LIKE 'demo_fixture_%' UNION ALL SELECT 'redemptions|'||count(*) FROM public.redemptions r JOIN public.entitlement_grants g ON g.id=r.grant_id WHERE g.source_ref LIKE 'demo_%' UNION ALL SELECT 'events|'||count(*) FROM public.membership_events e JOIN public.product_memberships m ON e.membership_id=m.id JOIN public.products p ON m.product_id=p.id WHERE p.product_key LIKE 'demo_%'");
console.log('Local-only AisenCore demo seeded. Synthetic Auth users: '+emails.length);
console.log(report.replaceAll('|',': '));
console.log('Idempotent and additive: no reset; no real SaaS connection.');
