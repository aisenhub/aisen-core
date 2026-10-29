// EXPERIMENTAL ONLY: reference oracle for proposed Pro-credit policy DEC-E01..E08.
// It does NOT authorize/implement SQL migrations or change live entitlements.
// Candidate assumptions: UTC 24h days, FIFO finite consumption; revocation drops
// only unspent credit; finite balances freeze under permanent status; no grants
// accepted while permanent. Explicit-window legacy Grants are NOT modeled.
export const DAY_MS=24*60*60*1000;
export function utcMs(iso){
  if(typeof iso!=='string'||!/Z$/.test(iso))throw Error('UTC_TIMESTAMP_REQUIRED');
  const value=Date.parse(iso);
  if(!Number.isFinite(value))throw Error('INVALID_TIMESTAMP');
  return value;
}
export function projectCredits(events,{userId,productId,at}){
  if(!userId||!productId)throw Error('SCOPE_REQUIRED');
  const now=utcMs(at);
  const grants=new Map();
  const sources=new Map();
  let permanent=null;
  let cursor=null;
  const applicable=events.map((event,index)=>({...event,_index:index,_at:utcMs(event.at)}))
    .filter(event=>event.userId===userId&&event.productId===productId&&event._at<=now)
    .sort((a,b)=>a._at-b._at||a._index-b._index);
  function advance(target){
    if(cursor!==null&&target<cursor)throw Error('EVENT_ORDER_INVALID');
    let elapsed=cursor===null?0:target-cursor;
    if(!permanent&&elapsed>0){
      for(const grant of grants.values()){
        if(elapsed===0)break;
        if(grant.revoked||grant.remainingMs<=0)continue;
        const used=Math.min(elapsed,grant.remainingMs);
        grant.remainingMs-=used;
        grant.consumedMs+=used;
        elapsed-=used;
      }
    }
    cursor=target;
  }
  for(const event of applicable){
    advance(event._at);
    if(event.kind==='grant'||event.kind==='permanent'){
      if(typeof event.id!=='string'||!event.id)throw Error('GRANT_ID_REQUIRED');
      if(event.kind==='grant'&&(!Number.isInteger(event.days)||event.days<1||event.days>36500))
        throw Error('DURATION_INVALID');
      const signature=JSON.stringify([event.kind,event.id,event.kind==='grant'?event.days:null]);
      if(event.sourceKey){
        const existing=sources.get(event.sourceKey);
        if(existing){
          if(existing!==signature)throw Error('SOURCE_CONFLICT');
          continue; // same original request; no second credit event
        }
      }
      if(grants.has(event.id)||permanent===event.id)throw Error('GRANT_ID_CONFLICT');
      if(permanent)throw Error('PERMANENT_ALREADY_ACTIVE');
      if(event.kind==='permanent'){
        permanent=event.id;
      }else{
        grants.set(event.id,{id:event.id,remainingMs:event.days*DAY_MS,
          consumedMs:0,revokedMs:0,revoked:false});
      }
      if(event.sourceKey)sources.set(event.sourceKey,signature);
    }else if(event.kind==='revoke'){
      const grant=grants.get(event.id);
      if(!grant)throw Error('GRANT_NOT_FOUND');
      if(!grant.revoked){
        grant.revokedMs=grant.remainingMs;
        grant.remainingMs=0;
        grant.revoked=true;
      }
    }else if(event.kind==='revokePermanent'){
      if(!permanent||permanent!==event.id)throw Error('ACTIVE_PERMANENT_NOT_FOUND');
      permanent=null;
    }else throw Error('EVENT_KIND_UNKNOWN');
  }
  advance(now);
  const total=[...grants.values()].reduce((sum,grant)=>sum+grant.remainingMs,0);
  const end=permanent?null:total>0?new Date(now+total).toISOString():null;
  return Object.freeze({
    kind:permanent?'permanent':total>0?'finite':'free',
    endsAt:end,
    remainingMs:total,
    permanentId:permanent,
    grants:[...grants.values()].map(grant=>({...grant})),
  });
}
