import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {withSupabase} from 'npm:@supabase/server@1';
import {cors,deleteFile,fail,json,feedbackRpcReadFailure} from '../_shared/feedback.ts';

// Permanent deletion is only acknowledged once DB children and private R2
// originals + thumbnails have all been removed. Failed storage deletion leaves
// the DB deletion intent in place for an administrator to resume.
import {authorizeFeedbackAdmin} from '../_shared/feedback-admin.ts';
import {validFeedbackObjectKey} from '../_shared/feedback-key.ts';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const handle=withSupabase({auth:'user'},async(req,ctx)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return fail('METHOD_NOT_ALLOWED',405);
  const bearer=req.headers.get('authorization')?.replace(/^Bearer /i,'')??'';
  const authorization=await authorizeFeedbackAdmin(ctx.userClaims?.id,
    ()=>ctx.supabase.auth.mfa.getAuthenticatorAssuranceLevel(bearer),
    ()=>ctx.supabase.rpc('admin_check_access'));
  if(authorization)return authorization;
  if(Number(req.headers.get('content-length')??0)>8192)return fail('REQUEST_TOO_LARGE',413);
  const reader=req.body?.getReader();
  if(!reader)return fail('INVALID_BODY',422);
  const parts:Uint8Array[]=[];let length=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>8192)return fail('REQUEST_TOO_LARGE',413);
      parts.push(value);
    }
  }catch{return fail('INVALID_BODY',422)}
  finally{reader.releaseLock()}
  let input:Record<string,unknown>;
  try{
    const raw=new Uint8Array(length);let offset=0;
    for(const part of parts){raw.set(part,offset);offset+=part.length}
    input=JSON.parse(new TextDecoder().decode(raw));
  }catch{return fail('INVALID_BODY',422)}
  if(!input||typeof input!=='object'||Array.isArray(input)||
     typeof input.feedback_id!=='string'||!uuid.test(input.feedback_id)||
     (input.expected_version!==null&&
      (!Number.isInteger(input.expected_version)||Number(input.expected_version)<1))||
     (input.product_id!==null&&input.product_id!==undefined&&
      (typeof input.product_id!=='string'||!uuid.test(input.product_id)))||
     Object.keys(input).some(k=>!['feedback_id','expected_version','product_id'].includes(k)))
    return fail('INVALID_ARGUMENT',422);
  const id=String(input.feedback_id);
  const version=input.expected_version===null?null:Number(input.expected_version);
  const productId=typeof input.product_id==='string'?input.product_id:null;
  const prepared=await ctx.supabaseAdmin.rpc('admin_prepare_feedback_delete',{
    p_actor_id:ctx.userClaims!.id,p_actor_aal:'aal2',
    p_feedback_id:id,p_expected_version:version,p_product_id:productId,
  });
  if(prepared.error){
    if(prepared.error.code==='PT401'||prepared.error.code==='PT403')
      return feedbackRpcReadFailure(prepared.error,'ADMIN_ACCESS_DENIED','PREPARE_DELETE_FAILED');
    if(prepared.error.code==='PT422')return fail('INVALID_ARGUMENT',422);
    return fail(prepared.error.code==='PT409'?'FEEDBACK_CHANGED':'PREPARE_DELETE_FAILED',
      prepared.error.code==='PT409'?409:503);
  }
  const value=prepared.data as {id?:string;token?:string;keys?:string[];product_id?:string;user_id?:string;request_id?:string}|null;
  if(value?.id!==id||typeof value.token!=='string'||!uuid.test(value.token)||
     !Array.isArray(value.keys)||value.keys.length>2||
     ![value.product_id,value.user_id,value.request_id].every(part=>typeof part==='string'&&uuid.test(part))||
     value.keys.some(k=>typeof k!=='string'||!validFeedbackObjectKey(
       k,value.product_id!,value.user_id!,value.request_id!)))
    return fail('PREPARE_DELETE_INVALID',503);
  try{
    for(const key of value.keys){
      await deleteFile(key+'.thumb.jpg');
      await deleteFile(key);
    }
  }catch{
    return fail('STORAGE_DELETE_INCOMPLETE_RETRY_REQUIRED',503);
  }
  const done=await ctx.supabaseAdmin.rpc('admin_finish_feedback_delete',{
    p_actor_id:ctx.userClaims!.id,p_actor_aal:'aal2',
    p_feedback_id:id,p_token:value.token,p_product_id:productId,
  });
  if(done.error||done.data?.deleted!==true){
    if(done.error?.code==='PT401'||done.error?.code==='PT403')
      return feedbackRpcReadFailure(done.error,'ADMIN_ACCESS_DENIED','DELETE_OUTCOME_UNCONFIRMED_RECHECK');
    return fail('DELETE_OUTCOME_UNCONFIRMED_RECHECK',done.error?.code==='PT409'?409:503);
  }
  return json({deleted:true,id});
});
export default {fetch:(req:Request)=>req.method==='OPTIONS'?
  new Response(null,{status:204,headers:cors}):handle(req)};
