import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography,
} from '@mui/material';
import { useGetOne, useNotify, useRefresh, useStore } from 'react-admin';
import { supabase } from '../supabaseClient';
import { callRpc } from '../data/dataProvider';
import { ProductPicker } from './ProductPicker';
import { OperationLayout } from './OperationLayout';
import type { OperationSafety } from './OperationDialogs';

const KEY='aisencore.issuance.pending.v1';
type Pending = { requestId: string; productId: string; quantity: number;
  duration: number; maxRedemptions: number; expiresAt: string | null;
  note: string | null; startedAt: number; batchId?: string; };
function readPending(): Pending | null {
  try {
    const raw=sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data=JSON.parse(raw) as Pending;
    if (typeof data.requestId !== 'string' || typeof data.productId !== 'string' ||
      typeof data.startedAt !== 'number' || typeof data.maxRedemptions !== 'number') return null;
    return data;
  } catch { return null; }
}
export function IssueCodes({embedded=false,onSafetyChange,onCompleted,onRequestClose}:{
  embedded?:boolean;onSafetyChange?:(v:OperationSafety)=>void;onCompleted?:()=>void;
  onRequestClose?:()=>void;
}={}) {
  const notify=useNotify();
  const refresh=useRefresh();
  const [scope]=useStore<string>('aisencore.current.product','');
  const scopedProduct=useGetOne('products',{id:scope},{enabled:!!scope});
  const scopeConfirmed=!scope||(!scopedProduct.isPending&&!scopedProduct.isError&&
    String(scopedProduct.data?.id)===scope);
  const [productId,setProductId]=useState('');
  const targetProductId=scope||productId;
  const [quantity,setQuantity]=useState(1);
  const [duration,setDuration]=useState(30);
  const [uses,setUses]=useState(1);
  const [expiry,setExpiry]=useState('');
  const [note,setNote]=useState('');
  const [plain,setPlain]=useState<string[]|null>(null); // Component-local only; never React-admin Query cache.
  const [saved,setSaved]=useState(false);
  const [pending,setPending]=useState<Pending|null>(readPending);
  const [resolved,setResolved]=useState<'unknown'|'present'|'absent'|'revoked'>('unknown');
  const [busy,setBusy]=useState(false);
  const [reason,setReason]=useState('');
  const [confirmRevoke,setConfirmRevoke]=useState(false);
  useEffect(()=>{
    onSafetyChange?.(busy?'busy':plain&&!saved?'plaintext':pending?'pending':'idle');
  },[onSafetyChange,busy,plain,saved,pending]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy||pending||!targetProductId||!scopeConfirmed||
      !Number.isInteger(quantity)||quantity<1||quantity>1000||
      !Number.isInteger(duration)||duration<1||duration>36500||
      !Number.isInteger(uses)||uses<1||uses>100000) return;
    const meta: Pending={
      requestId:crypto.randomUUID(),productId:targetProductId.trim(),quantity,duration,
      maxRedemptions:uses,expiresAt:expiry?new Date(expiry).toISOString():null,
      note:note||null,startedAt:Date.now(),
    };
    // Only non-secret request metadata lives in sessionStorage.
    sessionStorage.setItem(KEY,JSON.stringify(meta));
    setPending(meta);
    setResolved('unknown');
    setBusy(true);
    try {
      const result=await callRpc<{ batch_id: string; codes: string[]; plaintext_available: boolean;
        idempotent_replay: boolean }>('admin_create_codes',{
        p_product_id:meta.productId,p_tier:'pro',p_quantity:meta.quantity,
        p_grant_duration_days:meta.duration,p_is_lifetime:false,
        p_max_redemptions_per_code:meta.maxRedemptions,
        p_code_expires_at:meta.expiresAt,
        p_request_id:meta.requestId,p_note:meta.note,
      });
      if (result.plaintext_available && !result.idempotent_replay) {
        setPlain(result.codes); setSaved(false);
        sessionStorage.removeItem(KEY);setPending(null);
        notify('创建成功：明文仅此一次可见', { type:'success' }); refresh();
      } else {
        setPending({...meta,batchId:result.batch_id});
        setResolved('present'); // Replay never contains plaintext.
      }
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status != null && status >= 400 && status < 500) {
        sessionStorage.removeItem(KEY);setPending(null);
        notify(error instanceof Error?error.message:'发码被拒绝', {type:'error'});
      } else notify('请求结果未知。先核对原请求编号，禁止再次提交。', {type:'warning'});
    } finally {setBusy(false);}
  }
  async function retryOriginal() {
    // Only after the admin separately checked that the original request_id
    // is absent; retrying with that SAME id prevents duplicate batches.
    if (busy || !pending || resolved !== 'absent') return;
    setBusy(true);
    try {
      const result=await callRpc<{ batch_id: string; codes: string[];
        plaintext_available: boolean; idempotent_replay: boolean }>('admin_create_codes',{
        p_product_id:pending.productId,p_tier:'pro',p_quantity:pending.quantity,
        p_grant_duration_days:pending.duration,p_is_lifetime:false,
        p_max_redemptions_per_code:pending.maxRedemptions,
        p_code_expires_at:pending.expiresAt,p_request_id:pending.requestId,p_note:pending.note,
      });
      if (result.plaintext_available && !result.idempotent_replay) {
        setPlain(result.codes);setSaved(false);sessionStorage.removeItem(KEY);
        setPending(null);setResolved('unknown');refresh();
      } else {
        setPending({...pending,batchId:result.batch_id});setResolved('present');
      }
    } catch (error) {
      notify(error instanceof Error?error.message:'仍无法确认，请再次核对原请求',{type:'warning'});
      setResolved('unknown');
    } finally {setBusy(false);}
  }
  async function inspectPending() {
    if (!pending)return;
    setBusy(true);
    try {
      const {data:{user}}=await supabase.auth.getUser();
      if (!user) throw new Error('请重新登录');
      const {data,error}=await supabase.from('redemption_code_batches')
        .select('id,request_id,created_by').eq('created_by',user.id)
        .eq('request_id',pending.requestId).maybeSingle();
      if(error)throw error;
      setPending({...pending,batchId:data?.id});
      setResolved(data?'present':'absent');
    } catch(err){notify(err instanceof Error?err.message:'无法核实结果',{type:'error'});}
    finally{setBusy(false);}
  }
  async function revokeBatch() {
    if (!pending?.batchId || !reason.trim())return;
    setBusy(true);
    try {
      await callRpc('admin_revoke_batch',{p_batch_id:pending.batchId,p_reason:reason.trim()});
      setResolved('revoked'); setConfirmRevoke(false);refresh();
      notify('已撤销批次。原码不再可用；已成功核销的权益不会被撤回。',{type:'success'});
    }catch(e){notify(e instanceof Error?e.message:'撤销失败',{type:'error'});}
    finally{setBusy(false);}
  }
  function forgetPending() {
    // Only after an explicit independent decision. No automatic reissuance.
    sessionStorage.removeItem(KEY);setPending(null);setResolved('unknown');setReason('');
  }
  async function copyAll() {
    if (!plain) return;
    try {
      await navigator.clipboard.writeText(plain.join('\n'));
      notify('已复制全部兑换码。请保存在受控的安全位置。',{type:'success'});
    } catch {
      notify('无法访问剪贴板。请选择下载文件保存。',{type:'warning'});
    }
  }
  function downloadPlain(format:'txt'|'csv') {
    if (!plain) return;
    const escapeCsv=(value:string)=>'"'+value.replaceAll('"','""')+'"';
    const text=format==='csv'
      ? '序号,兑换码\r\n'+plain.map((value,index)=>[String(index+1),escapeCsv(value)].join(',')).join('\r\n')+'\r\n'
      : plain.join('\n')+'\n';
    const type=format==='csv'?'text/csv;charset=utf-8':'text/plain;charset=utf-8';
    const url=URL.createObjectURL(new Blob([format==='csv'?'\uFEFF':'',text],{type}));
    const link=document.createElement('a');
    link.href=url;link.download='aisencore-issued-codes.'+format;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function closePlain() {
    setPlain(null);setSaved(false);setProductId('');setNote('');setExpiry('');
    if(embedded)onCompleted?.();
  }
  return <OperationLayout title="发行兑换码" embedded={embedded}>
    {(!embedded||!plain)&&<Card variant="outlined" sx={{maxWidth:720}}><CardContent>
      <Stack component="form" onSubmit={submit} spacing={2.5}>
        {pending&&<Alert severity="warning" sx={{'& .MuiAlert-message':{width:'100%',minWidth:0}}}>
          <Typography sx={{fontWeight:700}}>有待核实的发码请求</Typography>
          <Typography variant="caption" component="div" sx={{overflowWrap:'anywhere',mb:.5}}>
            请求编号：{pending.requestId}
          </Typography>
          <Typography variant="body2">{resolved==='unknown'?'发行结果未知，请先核对原请求，勿重复发行。':
            resolved==='present'?'批次已存在，但明文不可恢复。先撤销后另行创建新批次。':
            resolved==='absent'?'未查询到相同请求编号；仅在确认后可使用原编号按流程重试。':
            '旧批次已撤销。现在可单独开始新的发行请求。'}</Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{mt:1,flexWrap:'wrap'}}>
            <Button disabled={busy} onClick={()=>void inspectPending()} size="small" variant="outlined">核对批次状态</Button>
            {resolved==='absent'&&
              <Button disabled={busy} onClick={()=>void retryOriginal()} size="small">以相同编号重试</Button>}
            {resolved==='present'&&
              <Button color="error" disabled={busy} onClick={()=>setConfirmRevoke(true)} size="small">撤销已有批次</Button>}
            {resolved==='revoked'&&<Button onClick={forgetPending} size="small">另行开始新请求</Button>}
          </Stack>
        </Alert>}
        {scope?<Box sx={{px:2,py:1.5,border:'1px solid',borderColor:'divider',borderRadius:2,
          bgcolor:'action.hover',minWidth:0}}>
          <Typography variant="caption" color="text.secondary" component="div">当前发行平台</Typography>
          <Typography variant="body1" sx={{fontWeight:700,overflowWrap:'anywhere'}}>
            {scopedProduct.isPending?'正在加载对应平台…':
              !scopeConfirmed?'无法确认当前平台':
              String(scopedProduct.data?.name)}
          </Typography>
          {scopeConfirmed&&<Typography variant="caption" color="text.secondary">
            {String(scopedProduct.data?.product_key)}
          </Typography>}
          {!scopedProduct.isPending&&!scopeConfirmed&&<Alert severity="error" sx={{mt:1}}>
            当前平台读取失败，无法安全发行。请检查网络或管理员权限。
          </Alert>}
        </Box>:
          <ProductPicker value={productId} onChange={setProductId} disabled={busy||!!pending}/>}
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},
          gap:2,minWidth:0}}>
          <TextField label="生成数量" required type="number" value={quantity} disabled={busy||!!pending}
            slotProps={{htmlInput:{min:1,max:1000}}} onChange={e=>setQuantity(Number(e.target.value))}/>
          <TextField label="每码授予 Pro 天数" required type="number" value={duration} disabled={busy||!!pending}
            slotProps={{htmlInput:{min:1,max:36500}}} onChange={e=>setDuration(Number(e.target.value))}/>
          <TextField label="每码最大核销次数" required type="number" value={uses} disabled={busy||!!pending}
            slotProps={{htmlInput:{min:1,max:100000}}} onChange={e=>setUses(Number(e.target.value))}/>
          <TextField label="兑换码到期日（可选）" type="datetime-local" value={expiry} disabled={busy||!!pending}
            slotProps={{inputLabel:{shrink:true}}} onChange={e=>setExpiry(e.target.value)}/>
          <TextField label="备注（可选）" value={note} disabled={busy||!!pending}
            onChange={e=>setNote(e.target.value)} sx={{gridColumn:{sm:'1 / -1'}}}/>
        </Box>
        <Box sx={{display:'flex',justifyContent:embedded?'space-between':'flex-end',
          alignItems:'center',gap:1.5,flexWrap:'wrap'}}>
          {embedded&&<Button color="inherit" onClick={onRequestClose} disabled={busy}>
            {pending?'稍后处理':'取消'}
          </Button>}
          <Button variant="contained" type="submit" sx={{minWidth:164,width:'auto'}}
            disabled={busy||!!pending||!targetProductId||!scopeConfirmed||
              !Number.isInteger(quantity)||quantity<1||quantity>1000||
              !Number.isInteger(duration)||duration<1||duration>36500||
              !Number.isInteger(uses)||uses<1||uses>100000}>
            {busy?'提交中…':'确认创建兑换码'}
          </Button>
        </Box>
      </Stack>
    </CardContent></Card>}
    {embedded?(plain&&<Box role="region" aria-label="首次明文兑换码">
      <Typography variant="h6" sx={{mb:2}}>兑换码已成功创建</Typography>
      <Stack spacing={2}>
        <Alert severity="warning">兑换码明文只显示一次，关闭或刷新后无法恢复。请先保存。</Alert>
        <Box component="pre" sx={{whiteSpace:'pre-wrap',wordBreak:'break-all',fontFamily:'monospace',
          bgcolor:'background.default',p:2,borderRadius:1,maxHeight:340,overflow:'auto'}}>
          {plain?.join('\n')}
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{flexWrap:'wrap'}}>
          <Button variant="outlined" onClick={()=>void copyAll()}>复制全部</Button>
          <Button onClick={()=>downloadPlain('txt')}>下载 TXT</Button>
          <Button onClick={()=>downloadPlain('csv')}>下载 CSV</Button>
        </Stack>
        <FormControlLabel control={<Checkbox checked={saved} onChange={(_,v)=>setSaved(v)}/>}
          label="我已安全保存本次明文兑换码"/>
        <Box sx={{display:'flex',justifyContent:'flex-end'}}>
          <Button variant="contained" disabled={!saved} onClick={closePlain}>清除明文并关闭</Button>
        </Box>
      </Stack>
    </Box>):<Dialog open={!!plain} onClose={()=>{}} aria-labelledby="codes-title">
      <DialogTitle id="codes-title">兑换码已成功创建</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Alert severity="warning">兑换码明文只显示一次，关闭或刷新后无法恢复。请先保存。</Alert>
          <Box component="pre" sx={{whiteSpace:'pre-wrap',wordBreak:'break-all',fontFamily:'monospace',
            bgcolor:'background.default',p:2,borderRadius:1,maxHeight:340,overflow:'auto'}}>
            {plain?.join('\n')}
          </Box>
          <Stack direction="row" spacing={1} useFlexGap sx={{flexWrap:'wrap'}}>
            <Button variant="outlined" onClick={()=>void copyAll()}>复制全部</Button>
            <Button onClick={()=>downloadPlain('txt')}>下载 TXT</Button>
            <Button onClick={()=>downloadPlain('csv')}>下载 CSV</Button>
          </Stack>
          <FormControlLabel control={<Checkbox checked={saved} onChange={(_,v)=>setSaved(v)}/>}
            label="我已安全保存本次明文兑换码"/>
        </Stack>
      </DialogContent>
      <DialogActions><Button variant="contained" disabled={!saved} onClick={closePlain}>清除明文并关闭</Button></DialogActions>
    </Dialog>}
    {embedded?(confirmRevoke&&<Box role="region" aria-label="撤销发行批次" sx={{mt:2,p:2,border:'1px solid',borderColor:'error.light',borderRadius:2}}>
      <Typography variant="h6" sx={{mb:2}}>撤销已创建的整批兑换码</Typography>
      <Stack spacing={2}>
        <Alert severity="error">不可恢复原明文。撤销只影响未来核销，不撤销已经兑现的 Pro 权益。</Alert>
        <TextField label="撤销理由" required value={reason} onChange={e=>setReason(e.target.value)}/>
        <Stack direction="row" spacing={1}>
          <Button onClick={()=>setConfirmRevoke(false)} disabled={busy}>取消</Button>
          <Button color="error" variant="contained" onClick={()=>void revokeBatch()} disabled={busy||!reason.trim()}>明确撤销批次</Button>
        </Stack>
      </Stack>
    </Box>):<Dialog open={confirmRevoke} onClose={()=>{if(!busy)setConfirmRevoke(false);}}>
      <DialogTitle>撤销已创建的整批兑换码</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{pt:1}}>
          <Alert severity="error">不可恢复原明文。撤销只影响未来核销，不撤销已经兑现的 Pro 权益。</Alert>
          <TextField label="撤销理由" required value={reason} onChange={e=>setReason(e.target.value)}/>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={()=>setConfirmRevoke(false)} disabled={busy}>取消</Button>
        <Button color="error" variant="contained" onClick={()=>void revokeBatch()} disabled={busy||!reason.trim()}>明确撤销批次</Button>
      </DialogActions>
    </Dialog>}
  </OperationLayout>;
}
