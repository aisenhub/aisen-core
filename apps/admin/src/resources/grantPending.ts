// The original idempotent grant request is stored only for this browser tab.
// No authentication tokens or Supabase credentials are stored in this record.
export const PENDING_GRANT_KEY='aisencore.grant.pending.v1';
export type GrantRequest={
  p_target_user_id:string;
  p_product_id:string;
  p_tier:'pro';
  p_mode:'duration'|'explicit_window';
  p_duration_days:number|null;
  p_starts_at:string|null;
  p_ends_at:string|null;
  p_is_lifetime:boolean;
  p_reason:string;
  p_request_id:string;
};
export type PendingGrant={actorId:string; request:GrantRequest};
export function readPendingGrant():PendingGrant|null{
  try{
    const raw=sessionStorage.getItem(PENDING_GRANT_KEY);
    if(!raw)return null;
    const record=JSON.parse(raw) as PendingGrant;
    const r=record.request;
    if(typeof record.actorId!=='string'||typeof r?.p_request_id!=='string'||
      typeof r.p_product_id!=='string'||typeof r.p_target_user_id!=='string'||
      typeof r.p_reason!=='string'||!['duration','explicit_window'].includes(r.p_mode))return null;
    return record;
  }catch{return null}
}
export function clearPendingGrant(){
  sessionStorage.removeItem(PENDING_GRANT_KEY);
}
export function writePendingGrant(pending:PendingGrant){
  sessionStorage.setItem(PENDING_GRANT_KEY,JSON.stringify(pending));
}
