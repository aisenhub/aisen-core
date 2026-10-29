import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {withSupabase} from 'npm:@supabase/server@1';
import {cors,fail,readFile} from '../_shared/feedback.ts';
import {buildFeedbackZip,type ExportFeedback,type ExportOptions} from '../_shared/feedback-export.ts';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optionNames=['user_comments','public_replies','internal_notes','history',
  'status','identity'] as const;
const defaults:ExportOptions={
  user_comments:true,public_replies:true,internal_notes:false,
  history:true,tags:false,status:true,identity:false,
};
async function limitedInput(req:Request):Promise<unknown>{
  const reader=req.body?.getReader();
  if(!reader)return null;
  const pieces:Uint8Array[]=[];let total=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>8192)throw new Error('REQUEST_TOO_LARGE');
      pieces.push(value);
    }
  }finally{reader.releaseLock()}
  const bytes=new Uint8Array(total);let offset=0;
  for(const part of pieces){bytes.set(part,offset);offset+=part.length}
  try{return JSON.parse(new TextDecoder().decode(bytes))}catch{return null}
}
const handle=withSupabase({auth:'user'},async(req,ctx)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return fail('METHOD_NOT_ALLOWED',405);
  const claims=ctx.userClaims;
  // Confirm current MFA from the signed-in Supabase session; the SQL audit
  // additionally rechecks current platform-admin eligibility.
  const bearer=req.headers.get('authorization')?.replace(/^Bearer /i,'')??'';
  const assurance=await ctx.supabase.auth.mfa.getAuthenticatorAssuranceLevel(bearer);
  if(!claims?.id||assurance.error||assurance.data.currentLevel!=='aal2')
    return fail('ADMIN_MFA_REQUIRED',403);
  // Do not mistake zero RLS-visible rows for an empty export after an admin
  // is revoked. Check the authoritative current Admin predicate *before*
  // reading any ticket, then check it again in the final audit RPC.
  const access=await ctx.supabase.rpc('admin_check_access');
  if(access.error||access.data?.allowed!==true)return fail('ADMIN_ACCESS_DENIED',403);
  if(Number(req.headers.get('content-length')??0)>8192)return fail('REQUEST_TOO_LARGE',413);
  let parsed:unknown;
  try{parsed=await limitedInput(req)}catch{return fail('REQUEST_TOO_LARGE',413)}
  if(!parsed||typeof parsed!=='object')return fail('INVALID_BODY',422);
  const input=parsed as {scope?:string;queue_state?:string;
    options?:Record<string,boolean>;ids?:string[];
    filters?:Record<string,string|boolean|string[]>};
  const scope=(input.scope??'') as 'selected'|'filtered';
  const queue=input.queue_state??'';
  if(!['selected','filtered'].includes(scope)||
     !['inbox','workbench','archived'].includes(queue)||
     !input.options||typeof input.options!=='object')return fail('INVALID_SCOPE',422);
  if(Object.keys(input.options).some(k=>!optionNames.includes(k as typeof optionNames[number])))
    return fail('INVALID_OPTIONS',422);
  const options={...defaults} as ExportOptions;
  for(const key of optionNames){
    const value=input.options[key];
    if(value!==undefined){
      if(typeof value!=='boolean')return fail('INVALID_OPTIONS',422);
      options[key]=value;
    }
  }
  const ids=input.ids??[];
  if(scope==='selected'&&(!Array.isArray(ids)||ids.length<1||ids.length>20||
      ids.some(x=>typeof x!=='string'||!uuid.test(x))||
      new Set(ids).size!==ids.length))return fail('INVALID_SELECTION',422);
  if(scope==='filtered'&&input.ids!==undefined)return fail('INVALID_SELECTION',422);
  // Always query RLS-backed invoker view with current JWT, never trust
  // client-supplied user/product information as proof of authorization.
  let query=ctx.supabase.from('admin_feedback_summaries').select(
    'id,feedback_no,product_id,user_id,contact_email,content,category,queue_state,created_at,version,priority,status,is_starred,tags')
    .eq('queue_state',queue).order('created_at',{ascending:false}).limit(21);
  if(scope==='selected')query=query.in('id',ids);
  else {
    const fields=['product_id','feedback_no','category','status','priority','is_starred'] as const;
    for(const field of fields){
      const v=input.filters?.[field];
      if(v!==undefined){
        if(typeof v!=='string'&&typeof v!=='boolean')return fail('INVALID_FILTER',422);
        if(field==='product_id'&&(!v||typeof v!=='string'||!uuid.test(v)))
          return fail('INVALID_FILTER',422);
        if(field==='feedback_no'&&(typeof v!=='string'||!/^[1-9]\d{0,17}$/.test(v)))
          return fail('INVALID_FILTER',422);
        query=query.eq(field,v);
      }
    }
    if(input.filters&&Object.keys(input.filters).some(k=>!fields.includes(k as typeof fields[number])))
      return fail('INVALID_FILTER',422);
  }
  const records=await query;
  if(records.error)return fail('FEEDBACK_READ_DENIED',403);
  const rows=records.data??[];
  if(!rows.length)return fail('NO_MATCHING_FEEDBACK',422);
  if(rows.length>20)return fail('EXPORT_COUNT_LIMIT',413);
  if(scope==='selected'&&rows.length!==ids.length)return fail('SELECTION_CHANGED',409);
  const feedbackIds=rows.map(row=>row.id);
  const [eventResult,imageResult]=await Promise.all([
    ctx.supabase.from('feedback_events').select(
      'feedback_id,event_type,visibility,message,from_status,to_status,created_at')
      .in('feedback_id',feedbackIds).order('created_at',{ascending:true}).limit(1001),
    ctx.supabase.from('feedback_attachments').select(
      'feedback_id,slot,mime_type,size_bytes,object_key')
      .in('feedback_id',feedbackIds).order('slot',{ascending:true}).limit(41),
  ]);
  if(eventResult.error||imageResult.error)return fail('EXPORT_DATA_UNAVAILABLE',503);
  if((eventResult.data??[]).length>1000||(imageResult.data??[]).length>40)
    return fail('EXPORT_TOO_LARGE',413);
  const images=imageResult.data??[];
  if(images.some(x=>x.size_bytes>3*1024*1024)||images.reduce(
     (a,x)=>a+x.size_bytes,0)>20*1024*1024)return fail('EXPORT_BYTES_LIMIT',413);
  const items:ExportFeedback[]=rows.map(row=>({
    ...row,events:(eventResult.data??[]).filter(e=>e.feedback_id===row.id),
    images:[],
  }));
  try{
    for(const item of items){
      for(const attachment of images.filter(img=>img.feedback_id===item.id)){
        const bytes=await readFile(attachment.object_key);
        if(bytes.length!==attachment.size_bytes)return fail('ATTACHMENT_INCOMPLETE',503);
        item.images.push({slot:attachment.slot,mime_type:attachment.mime_type,bytes});
      }
    }
    const zip=await buildFeedbackZip(items,options,scope);
    // Cross-service R2 + Postgres reads cannot share a transaction. Reject
    // if an Admin or the submitting user changed any exported feedback while
    // its images/events were being assembled. Versions are monotonically
    // incremented by all business mutations (except first-read marker).
    const latest=await ctx.supabase.from('admin_feedback_summaries')
      .select('id,version,queue_state').in('id',feedbackIds).limit(21);
    if(latest.error)return fail('EXPORT_ACCESS_CHANGED',403);
    if((latest.data??[]).length!==items.length||items.some(item=>{
      const current=latest.data?.find(x=>x.id===item.id);
      return !current||current.version!==item.version||current.queue_state!==item.queue_state;
    }))return fail('EXPORT_CHANGED_DURING_GENERATION',409);
    // Audit only export metadata (count/options), not feedback content, PII,
    // object keys or JWTs. AAL2 and active Admin are checked again in SQL.
    const audit=await ctx.supabase.rpc('admin_log_feedback_export',{
      p_count:items.length,p_scope:scope,
      p_include_internal:options.internal_notes,p_include_identity:options.identity,
    });
    if(audit.error)return fail('ADMIN_AUTH_REVOKED',403);
    return new Response(Uint8Array.from(zip),{status:200,headers:{
      ...cors,'Content-Type':'application/zip',
      'Content-Disposition':'attachment; filename="AisenCore_Feedback.zip"',
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'X-Feedback-Export-Revision':'v2-snapshot-check',
    }});
  }catch{
    // Fail closed, never return a partially populated ZIP or a private key.
    return fail('PRIVATE_ATTACHMENT_OR_ZIP_UNAVAILABLE',503);
  }
});
export default {fetch:(req:Request)=>req.method==='OPTIONS'?
  new Response(null,{status:204,headers:cors}):handle(req)};
