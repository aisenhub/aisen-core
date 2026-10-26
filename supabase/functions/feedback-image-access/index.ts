import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {withSupabase} from 'npm:@supabase/server@1';
import {cors,fail,json,signedGet} from '../_shared/feedback.ts';

const handle=withSupabase({auth:'user'},async(req,ctx)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return fail('METHOD_NOT_ALLOWED',405);
  const payload=await req.json().catch(()=>null);
  const id=payload?.attachment_id;
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))
    return fail('INVALID_ATTACHMENT_ID',422);
  const access=await ctx.supabase.rpc('feedback_image_access',{p_attachment_id:id});
  if(access.error||!access.data?.object_key)return fail('IMAGE_FORBIDDEN',403);
  try{
    const url=await signedGet(access.data.object_key);
    return json({url,expires_in:60,mime_type:access.data.mime_type});
  }catch{return fail('OBJECT_STORAGE_UNAVAILABLE',503)}
});
export default {fetch:(req:Request)=>req.method==='OPTIONS'?
  new Response(null,{status:204,headers:cors}):handle(req)};
