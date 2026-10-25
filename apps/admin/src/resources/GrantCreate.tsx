import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { useNotify, useRefresh } from 'react-admin';
import { callRpc } from '../data/dataProvider';
import { ProductPicker } from './ProductPicker';
import { useSearchParams } from 'react-router-dom';
import { OperationLayout } from './OperationLayout';
import { supabase } from '../supabaseClient';
import { clearPendingGrant, readPendingGrant, writePendingGrant } from './grantPending';
import type { GrantRequest } from './grantPending';
import type { OperationSafety } from './OperationDialogs';

export function GrantCreate({embedded=false,defaultUserId,onSafetyChange,onCompleted}:{
  embedded?:boolean;defaultUserId?:string;onSafetyChange?:(v:OperationSafety)=>void;
  onCompleted?:()=>void;
}={}) {
  const notify = useNotify();
  const refresh = useRefresh();
  const [params] = useSearchParams();
  const [userId, setUserId] = useState(() => defaultUserId ?? params.get('user_id') ?? '');
  const [productId, setProductId] = useState('');
  const [mode, setMode] = useState<'duration'|'explicit_window'>('duration');
  const [duration, setDuration] = useState(30);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [lifetime, setLifetime] = useState(false);
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(readPendingGrant);
  const unknown = !!pending;
  // Recheck on each reload; never persist permission to retry a write.
  const [inspection, setInspection] = useState<'unknown'|'absent'|'conflict'>('unknown');
  const [result, setResult] = useState<string | null>(null);
  useEffect(()=>{onSafetyChange?.(submitting?'busy':pending?'pending':'idle');},
    [onSafetyChange,submitting,pending]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || unknown) return;
    setSubmitting(true); setResult(null);
    let issued = false;
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('无法验证当前管理员会话');
      const request: GrantRequest = {
        p_target_user_id: userId.trim(), p_product_id: productId.trim(),
        p_tier: 'pro', p_mode: mode,
        p_duration_days: mode === 'duration' ? duration : null,
        p_starts_at: mode === 'duration' ? null : new Date(start).toISOString(),
        p_ends_at: mode === 'duration' || lifetime ? null : new Date(end).toISOString(),
        p_is_lifetime: mode === 'explicit_window' && lifetime,
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
      if (!issued || (status != null && status >= 400 && status < 500)) {
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
          (new Date(record.starts_at ?? '').getTime() === new Date(expected.p_starts_at ?? '').getTime() &&
           (record.ends_at === null ? expected.p_ends_at === null :
             new Date(record.ends_at ?? '').getTime() === new Date(expected.p_ends_at ?? '').getTime())));
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
        <TextField label="目标用户 UUID" helperText="建议从账号详情进入，避免输错用户编号" value={userId} required disabled={unknown||submitting} onChange={e=>setUserId(e.target.value)} />
        <ProductPicker value={productId} onChange={setProductId} disabled={submitting||unknown} />
        <TextField label="授予模式" select value={mode} disabled={unknown||submitting} onChange={e=>{
          setMode(e.target.value as 'duration'|'explicit_window'); setResult(null);
        }}>
          <MenuItem value="duration">固定天数，从现有有效授权到期时间顺延</MenuItem>
          <MenuItem value="explicit_window">指定有效起点和终点</MenuItem>
        </TextField>
        {mode === 'duration' ? <Box>
          <Stack direction="row" spacing={1} sx={{mb:1.5,flexWrap:'wrap',gap:.5}}>
            {[30,90,365].map(days=><Button key={days} size="small"
              variant={duration===days?'contained':'outlined'}
              onClick={()=>setDuration(days)} disabled={submitting||unknown}>{days} 天</Button>)}
          </Stack>
          <TextField label="授权天数" type="number" value={duration} required disabled={unknown||submitting}
            slotProps={{ htmlInput: { min: 1, max: 36500 } }}
            onChange={e=>setDuration(Number(e.target.value))} />
          </Box> :
          <>
            <TextField label="开始时间" type="datetime-local" value={start} required disabled={unknown||submitting}
              slotProps={{ inputLabel: { shrink: true } }} onChange={e=>setStart(e.target.value)} />
            <FormControlLabel control={<Switch checked={lifetime} disabled={unknown||submitting} onChange={(_,v)=>setLifetime(v)} />}
              label="永久 Pro（可手动撤销）" />
            {!lifetime && <TextField label="结束时间" type="datetime-local" required value={end} disabled={unknown||submitting}
              slotProps={{ inputLabel: { shrink: true } }} onChange={e=>setEnd(e.target.value)} />}
          </>}
        <TextField label="授予理由" value={reason} required multiline minRows={2} disabled={unknown||submitting}
          onChange={e=>setReason(e.target.value)} />
        <Button type="submit" variant="contained" disabled={submitting || unknown || !productId || !userId.trim() || !reason.trim() ||
          (mode === 'duration' && (!Number.isInteger(duration) || duration <= 0)) ||
          (mode === 'explicit_window' && (!start || (!lifetime && (!end || new Date(end) <= new Date(start)))))}>
          {submitting ? '正在提交…' : '确认授予 Pro'}
        </Button>
      </Stack>
    </CardContent></Card>
  </OperationLayout>;
}
