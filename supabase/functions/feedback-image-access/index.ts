import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {withSupabase} from 'npm:@supabase/server@1';
import {cors,signedGet} from '../_shared/feedback.ts';
import {issueFeedbackImageUrl} from './service.ts';

const handle=withSupabase({auth:'user'},(req,ctx)=>
  issueFeedbackImageUrl(req,{
    getAccess:async(attachmentId)=>{
      const {data,error}=await ctx.supabase.rpc('feedback_image_access',{
        p_attachment_id:attachmentId,
      });
      return {data,error};
    },
    sign:signedGet,
  }));
export default {fetch:(req:Request)=>req.method==='OPTIONS'?
  new Response(null,{status:204,headers:cors}):handle(req)};
