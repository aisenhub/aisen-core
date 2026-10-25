#!/usr/bin/env node
/**
 * Local development fixture only, never a production seed.
 *
 * Fixed credentials: admin@aisencore.test / Admin123456!
 * The password is installed through GoTrue Auth (encrypted in auth.users),
 * not stored as a plaintext SQL column. TOTP MFA is still mandatory.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const email='admin@aisencore.test';
const password='Admin123456!';
const windows=process.platform==='win32';

const cli=spawnSync(windows?'cmd.exe':'pnpm',
  windows?['/d','/s','/c','pnpm dlx supabase status --output json']:
    ['dlx','supabase','status','--output','json'],
  {cwd:root,encoding:'utf8',timeout:45000,maxBuffer:1024*1024});
if(cli.status!==0)throw Error('先在项目根目录启动本地 Supabase。');
const config=JSON.parse(cli.stdout);
if(config.API_URL!=='http://127.0.0.1:55321' ||
  !/^postgresql:\/\/[^@\s]+@127\.0\.0\.1:55322\//.test(config.DB_URL??'') ||
  !config.SERVICE_ROLE_KEY || !config.PUBLISHABLE_KEY)
  throw Error('仅允许在 AisenCore 本地 Supabase 55321/55322 上创建测试管理员。');
const port=spawnSync('docker',['port','supabase_db_Aisencore','5432/tcp'],
  {encoding:'utf8',timeout:12000});
if(port.status!==0 || !/:55322\b/.test(port.stdout))
  throw Error('未找到符合预期的本地 AisenCore 数据库容器。');

function sql(text) {
  const result=spawnSync('docker',[
    'exec','supabase_db_Aisencore','psql','-X','-qAt',
    '-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',text,
  ],{encoding:'utf8',timeout:20000});
  if(result.status!==0)throw Error('本地数据库查询失败：'+result.stderr.slice(-200));
  return result.stdout.trim();
}
async function request(path,body,token) {
  const res=await fetch(config.API_URL+path,{
    method:'POST',headers:{
      apikey:token?config.PUBLISHABLE_KEY:config.SERVICE_ROLE_KEY,
      authorization:'Bearer '+(token??config.SERVICE_ROLE_KEY),
      'content-type':'application/json',
    },
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
  });
  const data=await res.json().catch(()=>({}));
  return {status:res.status,data};
}
async function modifyAuth(path,body,method) {
  const res=await fetch(config.API_URL+path,{
    method,headers:{
      apikey:config.SERVICE_ROLE_KEY,
      authorization:'Bearer '+config.SERVICE_ROLE_KEY,
      'content-type':'application/json',
    },
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),
  });
  return res.status;
}
function uuid(value) {
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))
    throw Error('Invalid local user UUID');
  return value;
}
const existing=sql("SELECT id FROM auth.users WHERE email='"+email+"'");
let id;
let created=false;
if(existing) {
  id=uuid(existing);
  if(sql("SELECT count(*) FROM public.platform_admins WHERE user_id='"+id+"' AND active")!=='1')
    throw Error('这个邮箱已存在，但不是有效的本地管理员；不会擅自提权。');
  const status=await modifyAuth('/auth/v1/admin/users/'+id,{password},'PUT');
  if(status!==200)throw Error('本地 Admin 密码设置失败：HTTP '+status);
} else {
  // Only bootstrap the first Admin; never add a known-password Admin to an
  // already administered database.
  if(sql('SELECT count(*) FROM public.platform_admins WHERE active')!=='0')
    throw Error('数据库已有其他有效管理员；拒绝创建固定密码测试管理员。');
  const response=await request('/auth/v1/admin/users',{
    email,password,email_confirm:true,
  });
  if(![200,201].includes(response.status))throw Error('创建本地测试用户失败：HTTP '+response.status);
  id=uuid(response.data.id);
  created=true;
  try {
    sql("INSERT INTO public.platform_admins(user_id,active) VALUES ('"+id+"',true)");
  } catch(error) {
    await modifyAuth('/auth/v1/admin/users/'+id,null,'DELETE');
    throw error;
  }
}

const login=await fetch(config.API_URL+'/auth/v1/token?grant_type=password',{
  method:'POST',headers:{apikey:config.PUBLISHABLE_KEY,'content-type':'application/json'},
  body:JSON.stringify({email,password}),signal:AbortSignal.timeout(15000),
});
if(login.status!==200)throw Error('固定密码不能完成本地 GoTrue 登录：HTTP '+login.status);
const session=await login.json();
const access=await request('/rest/v1/rpc/admin_check_access',{},session.access_token);
if(access.status!==200 || access.data?.allowed!==false)
  throw Error('验证失败：尚未绑定 TOTP 的 AAL1 不能具有管理员权限。');

console.log(created?'已创建本地开发管理员。':'已将现有本地开发管理员设置为固定密码。');
console.log('测试邮箱：'+email);
console.log('测试密码：'+password);
console.log('已验证密码登录成功，且未完成 TOTP 时管理员权限被拒绝。');
console.log('登录 http://localhost:3000/，首次扫描 TOTP 二维码即可。');
