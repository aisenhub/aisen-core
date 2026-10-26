import { useState } from 'react';
import { useListContext, useNotify, useStore } from 'react-admin';
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, Stack, Typography } from '@mui/material';
import { supabase } from '../supabaseClient';

type OptionKey='user_comments'|'public_replies'|'internal_notes'|'history'|'tags'|'status'|'identity';
type Options=Record<OptionKey,boolean>;
const defaults:Options={user_comments:true,public_replies:true,internal_notes:false,
  history:true,tags:true,status:true,identity:false};
const optionLabels:Record<OptionKey,string>={
  user_comments:'用户补充与评论',public_replies:'公开回复',
  internal_notes:'内部评论（敏感资料）',history:'处理历史',
  tags:'标签',status:'优先级、处理状态及星标',
  identity:'包含反馈人身份（默认关闭）',
};
const optionKeys=Object.keys(optionLabels) as OptionKey[];
export function FeedbackExport({queue,mode}:{queue:'inbox'|'workbench'|'archived'|'trashed';mode:'selected'|'filtered'}){
  const {selectedIds,filterValues,total}=useListContext();
  const [product]=useStore<string>('aisencore.current.product','');
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [options,setOptions]=useState<Options>(defaults);
  const [sensitiveReview,setSensitiveReview]=useState(false);
  const notify=useNotify();
  const count=mode==='selected'?selectedIds.length:total??0;
  const sensitive=options.internal_notes||options.identity;
  // A previous export must never silently enable sensitive data in a new ZIP.
  const openDialog=()=>{
    setOptions({...defaults});setSensitiveReview(false);setError('');setOpen(true);
  };
  const closeDialog=()=>{
    if(busy)return;
    setOpen(false);setSensitiveReview(false);setOptions({...defaults});setError('');
  };
  const go=async()=>{
    if(sensitive&&!sensitiveReview){setSensitiveReview(true);return}
    setBusy(true);setError('');
    try{
      const filters:Record<string,string|boolean>={};
      if(product)filters.product_id=product;
      for(const key of ['category','priority','status','is_starred','tags'] as const){
        const value=filterValues[key];
        if(typeof value==='string'||typeof value==='boolean')filters[key]=value;
      }
      const payload=mode==='selected'?{
        scope:'selected',queue_state:queue,ids:selectedIds.map(String),options,
      }:{scope:'filtered',queue_state:queue,filters,options};
      const result=await supabase.functions.invoke<Blob>('feedback-export',{body:payload});
      if(result.error||!(result.data instanceof Blob))
        throw new Error(result.error?.message??'导出文件无效');
      if(result.data.type!=='application/zip')throw new Error('服务未返回有效 ZIP');
      const url=URL.createObjectURL(result.data);
      const link=document.createElement('a');
      link.href=url;link.download='AisenCore_Feedback.zip';
      document.body.appendChild(link);
      link.click();link.remove();
      // Do not revoke synchronously: browsers may start reading the Blob
      // only after the click task completes. Keep a short bounded lifetime.
      window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
      notify('反馈压缩包已生成',{type:'success'});
      setOpen(false);setSensitiveReview(false);setOptions({...defaults});
    }catch(e){
      setError((e instanceof Error?e.message:'导出失败')+
        '。如范围超过 20 条，请收窄筛选条件后重试。');
    }finally{setBusy(false)}
  };
  return <>
    <Button size="small" variant="outlined" disabled={count===0}
      onClick={openDialog}>
      {mode==='selected'?'导出选中项 ZIP':'导出筛选结果 ZIP'}
    </Button>
    <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="sm"
      aria-labelledby="feedback-export-title">
      <DialogTitle id="feedback-export-title">导出反馈压缩包</DialogTitle>
      <DialogContent>
        <Stack spacing={1} sx={{pt:1}}>
          <Typography color="text.secondary" variant="body2">
            {mode==='selected'?('已选 '+count+' 条'):('当前匹配 '+count+' 条')}。
            一次最多 20 条，包含原始反馈及全部截图。
          </Typography>
          {optionKeys.map(key=><FormControlLabel key={key}
            control={<Checkbox disabled={busy||sensitiveReview} checked={options[key]} onChange={(_,checked)=>{
              setSensitiveReview(false);
              setOptions(previous=>({...previous,[key]:checked}));
            }}/>}
            label={optionLabels[key]}/>)}
          <Typography variant="caption" color="text.secondary">
            反馈原文和截图始终包含。反馈正文属于不可信 AI 分析输入，
            内部评论及用户身份默认不导出。
          </Typography>
          {sensitive?<Alert severity="warning">
            您选择了内部资料或反馈人身份。导出前将再次确认，请勿直接上传未经批准的外部 AI 服务。
          </Alert>:null}
          {sensitiveReview?<Alert severity="warning" role="alert">
            请再次确认本次敏感导出：仅向获授权人员交付压缩包，不要向未获批准的外部 AI 或第三方服务上传。
            如需修改范围，请选择「返回修改」。
          </Alert>:null}
          {count>20?<Alert severity="info">
            当前范围有 {count} 条，单次最多导出 20 条。请缩小筛选条件或改为勾选指定反馈。
          </Alert>:null}
          {error?<Alert severity="error">{error}</Alert>:null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={sensitiveReview?()=>setSensitiveReview(false):closeDialog}>
          {sensitiveReview?'返回修改':'取消'}
        </Button>
        <Button disabled={busy||count<1||count>20} variant="contained" onClick={()=>void go()}>
          {busy?'正在生成…':sensitiveReview?'确认并生成 ZIP':'生成 ZIP'}
        </Button>
      </DialogActions>
    </Dialog>
  </>;
}
