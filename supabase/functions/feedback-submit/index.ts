import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {withSupabase} from 'npm:@supabase/server@1';
import {cors,putFile} from '../_shared/feedback.ts';
import {submitFeedback} from './service.ts';

const handle=withSupabase({auth:'user'},async(req,ctx)=>{
  const actor=ctx.userClaims?.id;
  return submitFeedback(req,{
    actor,
    getIdentity:async()=>{
      const result=await ctx.supabaseAdmin.auth.admin.getUserById(actor??'');
      return {user:result.data?.user,error:result.error};
    },
    myFeedback:async(productKey,requestId)=>{
      const {data,error}=await ctx.supabase.rpc('my_feedback',{
        p_product_key:productKey,p_request_id:requestId,
      });
      return {data,error};
    },
    preflight:async(productKey,requestId)=>{
      const {data,error}=await ctx.supabase.rpc('feedback_submit_preflight',{
        p_product_key:productKey,p_request_id:requestId,
      });
      return {data,error};
    },
    commit:async(args)=>{
      const {data,error}=await ctx.supabaseAdmin.rpc('feedback_submit_from_edge',args);
      return {data,error};
    },
    putFile,
  });
});
export default {fetch:(req:Request)=>req.method==='OPTIONS'?
  new Response(null,{status:204,headers:cors}):handle(req)};
