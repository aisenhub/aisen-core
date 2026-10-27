import {useEffect,useState} from 'react';
import {callRpc} from '../data/dataProvider';
import {supabase} from '../supabaseClient';

// Bounded, short-lived read-only cache. Auth/product tokens partition keys;
// no storage persistence and all entries expire after 12 seconds. This bridges
// sequential React StrictMode remounts that cannot share an in-flight request.
const TAG_TTL_MS=12_000;
const TAG_CACHE_LIMIT=20;
const inflightTags=new Map<string,Promise<string[]>>();
const settledTags=new Map<string,{value:string[];expires:number}>();
supabase.auth.onAuthStateChange(event=>{
  if(['SIGNED_OUT','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event)){
    settledTags.clear();
    inflightTags.clear();
  }
});
async function readTags(productId?:string){
  const {data:{session},error}=await supabase.auth.getSession();
  if(error||!session)throw new Error('请登录管理账号');
  const key=session.access_token+'|'+(productId||'');
  const cached=settledTags.get(key);
  if(cached&&cached.expires>Date.now())return [...cached.value];
  if(cached)settledTags.delete(key);
  const existing=inflightTags.get(key);
  if(existing)return existing;
  const request=callRpc<string[]>('admin_feedback_tags',{p_product_id:productId||null});
  inflightTags.set(key,request);
  try{
    const data=await request;
    // An old response must not populate a cache after logout or token refresh.
    const {data:{session:latest}}=await supabase.auth.getSession();
    if(!latest||latest.access_token!==session.access_token)throw new Error('管理员身份已变化');
    const tags=Array.isArray(data)?data:[];
    settledTags.set(key,{value:tags,expires:Date.now()+TAG_TTL_MS});
    while(settledTags.size>TAG_CACHE_LIMIT)settledTags.delete(settledTags.keys().next().value!);
    return [...tags];
  }finally{
    if(inflightTags.get(key)===request)inflightTags.delete(key);
  }
}

// Server-side distinct tags over the entire authorized product scope.
// Never derive dropdown options from the current paginated table.
export function useFeedbackTags(productId?:string){
  // Do not display a different product's tags while its new scoped RPC is pending.
  const key=productId||'';
  const [state,setState]=useState<{key:string;tags:string[];error:boolean}>({key,tags:[],error:false});
  useEffect(()=>{
    let alive=true;
    void readTags(productId)
      .then(value=>{if(alive)setState({key,tags:Array.isArray(value)?value:[],error:false})})
      .catch(()=>{if(alive)setState({key,tags:[],error:true})});
    return ()=>{alive=false};
  },[productId,key]);
  return state.key===key?{tags:state.tags,error:state.error}:{tags:[],error:false};
}
