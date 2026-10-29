import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useGetOne, useNotify, useRefresh, useStore } from 'react-admin';
import { callRpc } from '../data/dataProvider';
import { ProductPicker } from './ProductPicker';
import { useSearchParams } from 'react-router-dom';
import { OperationLayout } from './OperationLayout';
import { supabase } from '../supabaseClient';
import { clearPendingGrant, readPendingGrant, writePendingGrant } from './grantPending';
import type { GrantRequest } from './grantPending';
import type { OperationSafety } from './OperationDialogs';
import { UserIdentityPicker } from './UserIdentityPicker';

type ProSummary = {
  pro_active: boolean; is_lifetime: boolean; effective_ends_at: string | null;
  evaluated_at: string; remaining_credit_seconds: number;
  membership_status: string | null; account_blocked: boolean;
  target_user_id: string; product_id: string;
};

export function GrantCreate({embedded=false,defaultUserId,defaultProductId,onSafetyChange,onCompleted}:{
  embedded?:boolean;defaultUserId?:string;defaultProductId?:string;onSafetyChange?:(v:OperationSafety)=>void;
  onCompleted?:()=>void;
}={}) {
  const notify = useNotify();
  const refresh = useRefresh();
  const [params] = useSearchParams();
  const [userId, setUserId] = useState(() => defaultUserId ?? params.get('user_id') ?? '');
  const [productId, setProductId] = useState('');
  const [scope]=useStore<string>('aisencore.current.product','');
  // A product-specific user card is an authoritative context, not a hint.
  // Reject conflicting top-bar scope rather than silently granting a different SaaS.
  const requestedProductId=defaultProductId??params.get('product_id')??'';
  const cardProductId=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestedProductId)
    ?requestedProductId:'';
  const invalidCardProduct=!!requestedProductId&&!cardProductId;
  const conflictingScope=!!scope&&!!cardProductId&&scope!==cardProductId;
  const targetProductId=invalidCardProduct||conflictingScope?'':cardProductId||scope||productId;
  const product=useGetOne('products',{id:targetProductId},{enabled:!!targetProductId});
  const productVerified=!!targetProductId&&!product.isPending&&!product.isFetching&&!product.isError&&
    String(product.data?.id)===targetProductId&&product.data?.status==='active';
  const identity=useGetOne('users',{id:userId},{
    enabled:/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(userId),
    refetchOnMount:'always',refetchOnWindowFocus:true,
  });
  const identityVerified=identity.data?.id===userId&&typeof identity.data?.email==='string'&&
    !!identity.data.email&&!identity.isPending&&!identity.isFetching&&!identity.isError;
  const [mode, setMode] = useState<'duration'|'permanent'>('duration');
  const [duration, setDuration] = useState(30);
  const [reason, setReason] = useState('');
  const [summary, setSummary] = useState<ProSummary | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<'idle'|'loading'|'error'>('idle');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(readPendingGrant);
  const unknown = !!pending;
  // Recheck on each reload; never persist permission to retry a write.
  const [inspection, setInspection] = useState<'unknown'|'absent'|'conflict'>('unknown');
  const [result, setResult] = useState<string | null>(null);
  useEffect(()=>{onSafetyChange?.(submitting?'busy':pending?'pending':'idle');},
    [onSafetyChange,submitting,pending]);
  useEffect(()=>{
    let active=true;
    // Only the trusted Admin RPC, never the client clock or raw Grant history,
    // determines the current entitlement and whether this account can be granted.
    if(!identityVerified||!productVerified){
      return;
    }
    Promise.resolve().then(()=>{if(active){setSummary(null);setSummaryStatus('loading');}});
    void callRpc<ProSummary>('admin_get_pro_entitlement',{
      p_target_user_id:userId,p_product_id:targetProductId,
    }).then(data=>{
      if(active){setSummary(data);setSummaryStatus('idle');}
    }).catch(()=>{if(active){setSummary(null);setSummaryStatus('error');}});
    return ()=>{active=false};
  // A confirmed write changes the authoritative balance; re-read rather
  // than leaving an obsolete pre-grant expiry on the next operation.
  },[identityVerified,productVerified,userId,targetProductId,result]);
  const summaryVerified=!!summary&&summaryStatus==='idle'&&
    summary.target_user_id===userId&&summary.product_id===targetProductId;
  const eligible=summaryVerified&&summary.membership_status==='active'&&
    !summary.account_blocked&&!summary.is_lifetime;
  const previewEnd=eligible&&mode==='duration'&&Number.isInteger(duration)&&duration>0&&duration<=36500
    ?new Date(Date.parse(summary.effective_ends_at??summary.evaluated_at)+duration*86400000).toLocaleString()
    :null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || unknown || !identityVerified || !productVerified || !eligible ||
      !reason.trim() || reason.trim().length>200 ||
      (mode==='duration'&&(!Number.isInteger(duration)||duration<1||duration>36500))) return;
    setSubmitting(true); setResult(null);
    let issued = false;
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('无法验证当前管理员会话');
      const request: GrantRequest = {
        p_target_user_id: userId.trim(), p_product_id: targetProductId,
        p_tier: 'pro', p_mode: mode === 'duration' ? 'duration' : 'explicit_window',
        p_duration_days: mode === 'duration' ? duration : null,
        p_starts_at: null,
        p_ends_at: null,
        p_is_lifetime: mode === 'permanent',
        p_reason: reason.trim(), p_request_id: requestId,
      };
      const operation = { actorId: user.id, request };
      // The exact request must survive a lost HTTP response and a page reload.
      // Persist metadata before sending; it contains no credentials or code plaintext.
      writePendingGrant(operation);
      setPending(operation);
      issued = true;
      const data = await callRpc<{ grant_id?: string; idempotent_replay?: boolean }>(
        'admin_grant_entitlement', request);
      clearPendingGrant(); setPending(null);
      setResult(data.grant_id ?? '已确认授权');
      notify(data.idempotent_replay ? '请求已存在，未重复授权' : 'Pro 授权成功', { type: 'success' });
      setRequestId(crypto.randomUUID());
      refresh();
      if(embedded)onCompleted?.();
    } catch (error) {
      const status = (error as { status?: number })?.status;
      // A 429 response can originate from an intermediary even after an
      // upstream write; do not discard the original idempotency request.
      if (!issued || (status != null && status >= 400 && status < 500 && status !== 429)) {
        clearPendingGrant(); setPending(null);
        notify(error instanceof Error ? error.message : '授权被明确拒绝', { type: 'error' });
      } else notify('授权结果未知：保留原始请求编号，请按原请求安全核实。', { type: 'warning' });
    } finally { setSubmitting(false); }
  }
  async function inspectOriginal() {
    if (!pending || submitting) return;
    setSubmitting(true); setInspection('unknown');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || user?.id !== pending.actorId) throw new Error('必须由原提交管理员完成核查');
      const record = await callRpc<{
        found: boolean; grant_id?: string; target_user_id?: string; product_id?: string;
        tier?: string; mode?: string; duration_days?: number | null;
        starts_at?: string; ends_at?: string | null; reason?: string;
        revoked_at?: string | null;
      }>('admin_find_grant_request', { p_request_id: pending.request.p_request_id });
      if (!record.found) {
        setInspection('absent');
        notify('服务端未找到原请求，可使用原编号与参数重试。', { type: 'info' });
        return;
      }
      const expected = pending.request;
      const matching = record.target_user_id === expected.p_target_user_id &&
        record.product_id === expected.p_product_id && record.tier === expected.p_tier &&
        record.mode === expected.p_mode && record.duration_days === expected.p_duration_days &&
        record.reason === expected.p_reason &&
        (expected.p_mode === 'duration' ||
          (expected.p_is_lifetime && expected.p_starts_at === null &&
            expected.p_ends_at === null && record.ends_at === null));
      if (!matching) {
        setInspection('conflict');
        notify('该编号已关联不同参数，禁止重试，请人工核查。', { type: 'error' });
        return;
      }
      clearPendingGrant(); setPending(null);
      setResult(`${record.grant_id ?? '原请求'}${record.revoked_at ? '（已撤销）' : ''}`);
      setRequestId(crypto.randomUUID());
      notify('只读核查确认原请求已提交，没有再次写入。', { type: 'success' });
      refresh();
      if(embedded)onCompleted?.();
    } catch (error) {
      notify(error instanceof Error ? error.message : '核查失败，保留原请求', { type: 'error' });
    } finally { setSubmitting(false); }
  }
  async function retryOriginal() {
    if (!pending || submitting || inspection !== 'absent') return;
    setSubmitting(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || user?.id !== pending.actorId) {
        throw new Error('必须由原提交管理员使用当前有效会话核实，不允许跨管理员重试');
      }
      // Database source_ref is unique per original actor/request_id.
      // Committed: return the existing Grant. Not committed: create once.
      // Never replace the request ID or modify its parameters.
      const data = await callRpc<{ grant_id?: string; idempotent_replay?: boolean }>(
        'admin_grant_entitlement', pending.request);
      clearPendingGrant(); setPending(null);
      setResult(data.grant_id ?? '已确认授权');
      setRequestId(crypto.randomUUID());
      notify(data.idempotent_replay ? '原请求已成功写入，不会重复授权' : '使用原编号完成唯一授权', { type: 'success' });
      refresh();
      if(embedded)onCompleted?.();
    } catch (error) {
      setInspection('unknown');
      notify(error instanceof Error ? error.message : '原请求重试失败，请保留编号', { type: 'error' });
      // Even after 409, the original operation is not automatically forgotten.
      // The user must investigate the conflict instead of issuing a new ID.
    } finally { setSubmitting(false); }
  }
  return <OperationLayout title="授予 Pro 权益" embedded={embedded}>
    <Card variant="outlined"><CardContent>
      <Stack spacing={2} component="form" onSubmit={submit}>
        {pending && <Alert severity="warning" role="alert">
          <Typography sx={{fontWeight:750}}>有待核实的授权请求：{pending.request.p_request_id}</Typography>
          <Typography variant="body2" sx={{my:1}}>
            原目标 {pending.request.p_target_user_id} · 原产品 {pending.request.p_product_id}。
            未取得成功响应，不能视为已授权。先以原管理员身份只读核查；
            只有服务端确认不存在原请求时，才可用原编号与原参数重试。断网或冲突时不可盲目重发。
          </Typography>
          {inspection === 'absent' && <Alert severity="info" sx={{mb:1}}>没有找到原请求。请确认状态后再使用原编号重试。</Alert>}
          {inspection === 'conflict' && <Alert severity="error" sx={{mb:1}}>编号已关联不同参数，禁止重试，请人工核查。</Alert>}
          <Stack direction="row" spacing={1} useFlexGap sx={{flexWrap:"wrap"}}>
            <Button size="small" disabled={submitting} variant="outlined" onClick={()=>void inspectOriginal()}>
              只读核查原请求
            </Button>
            {inspection === 'absent' && <Button size="small" disabled={submitting} variant="contained" onClick={()=>void retryOriginal()}>
              以原请求编号重试
            </Button>}
          </Stack>
        </Alert>}
        {result && <Alert severity="success">授权已确认 · 编号：{result}</Alert>}
        <UserIdentityPicker value={userId} onChange={next=>{setUserId(next);setResult(null);}} disabled={unknown||submitting}/>
        {(scope||cardProductId)?<Alert severity={productVerified?'info':'warning'} role="status">
          当前产品已锁定：{productVerified?String(product.data?.name):'正在核实或产品不可用'}。
          {cardProductId?'产品来源：用户中心该产品权益卡片。':'产品来源：顶部选定产品。'}
          授权只会提交到此已核实产品。
        </Alert>:<ProductPicker value={productId} onChange={next=>{setProductId(next);setResult(null);}} disabled={submitting||unknown} />}
        {(invalidCardProduct||conflictingScope)&&<Alert severity="error" role="alert">
          {invalidCardProduct?'用户中心传入的产品编号无效。':
            '用户中心卡片的产品与顶部产品范围冲突。请切回对应产品或重新进入授权操作。'}
          已阻止提交，绝不会自动改授其他产品。
        </Alert>}
        {targetProductId&&!productVerified&&!product.isPending&&<Alert severity="error">
          产品未能核实为正常状态，禁止提交授权。
        </Alert>}
        {identityVerified&&productVerified&&summaryStatus==='loading'&&
          <Typography role="status" variant="body2">正在核实当前 Pro 权益与成员资格…</Typography>}
        {identityVerified&&productVerified&&summaryStatus==='error'&&
          <Alert severity="error">无法读取服务端权益摘要，已禁止授权。请检查网络或权限。</Alert>}
        {summaryVerified&&summary.membership_status!=='active'&&
          <Alert severity="warning">目标用户未处于该产品的正常成员状态，请先完成加入或独立恢复成员资格。</Alert>}
        {summaryVerified&&summary.account_blocked&&
          <Alert severity="error">目标平台账号受限，禁止继续授予 Pro。</Alert>}
        {summaryVerified&&summary.is_lifetime&&
          <Alert severity="info">该账号已拥有永久 Pro，不能重复授予；需独立处理原永久授权。</Alert>}
        <TextField label="授予模式" select value={mode} disabled={unknown||submitting} onChange={e=>{
          setMode(e.target.value as 'duration'|'permanent'); setResult(null);
        }}>
          <MenuItem value="duration">固定天数</MenuItem>
          <MenuItem value="permanent">永久 Pro（可撤销）</MenuItem>
        </TextField>
        {mode === 'duration' ? <Box>
          <Stack direction="row" spacing={1} sx={{mb:1.5,flexWrap:'wrap',gap:.5}}>
            {[7,30,90,365].map(days=><Button key={days} size="small"
              variant={duration===days?'contained':'outlined'}
              onClick={()=>setDuration(days)} disabled={submitting||unknown}>{days} 天</Button>)}
          </Stack>
          <TextField label="授权天数" type="number" value={duration} required disabled={unknown||submitting}
            slotProps={{ htmlInput: { min: 1, max: 36500 } }}
            onChange={e=>setDuration(Number(e.target.value))} />
          </Box> : <Typography variant="body2">永久权益无到期日期，但可由有权限的管理员撤销。</Typography>}
        <TextField label="授予理由" value={reason} required multiline minRows={2} disabled={unknown||submitting}
          onChange={e=>setReason(e.target.value)} />
        {summaryVerified&&<Alert severity="info" role="status">
          当前权益：{summary.is_lifetime?'永久 Pro':summary.pro_active?
            'Pro · '+new Date(String(summary.effective_ends_at)).toLocaleString():'Free'}。
          {eligible&&(mode==='duration'?<> 本次增加 {duration} 天，预计综合到期：{previewEnd??'无可用预览'}。</>:
            ' 本次授予永久 Pro。')}
          预计日期基于服务器已核实快照；实际生效与综合到期时间以提交事务为准。
        </Alert>}
        {identityVerified&&productVerified&&<Alert severity="info" role="status">
          核对授权目标：{String(identity.data?.email)}（用户编号 {userId}）；
          产品 {String(product.data?.name)}；{mode==='duration'?duration+' 天':'永久'}；
          理由：{reason.trim()||'尚未填写'}。实际生效/续期以服务端结果为准。
        </Alert>}
        <Button type="submit" variant="contained" disabled={submitting || unknown || !productVerified || !identityVerified || !eligible || !reason.trim() || reason.trim().length>200 ||
          (mode === 'duration' && (!Number.isInteger(duration) || duration <= 0 || duration > 36500))}>
          {submitting ? '正在提交…' : '确认授予 Pro'}
        </Button>
      </Stack>
    </CardContent></Card>
  </OperationLayout>;
}
