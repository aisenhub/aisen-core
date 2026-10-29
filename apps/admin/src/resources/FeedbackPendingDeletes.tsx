import {useEffect,useState} from 'react';
import {useRefresh,useStore} from 'react-admin';
import {Alert,Button,Dialog,DialogActions,DialogContent,DialogTitle,Stack,Typography} from '@mui/material';
import {callRpc} from '../data/dataProvider';
import {supabase} from '../supabaseClient';

type Pending={id:string;feedback_no:number;product_id:string;pending:boolean;version:number};

// A deletion that lost its R2/DB response is not a recycle bin. These are
// pending cleanup jobs and pre-existing trash records that require explicit
// administrator action, not recoverable/active feedback.
export function FeedbackPendingDeletes({reloadKey=0}:{reloadKey?:number}){
  const [product]=useStore<string>('aisencore.current.product','');
  const [rows,setRows]=useState<Pending[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');
  const [target,setTarget]=useState<Pending|null>(null);
  const [revision,setRevision]=useState(0);
  const [expanded,setExpanded]=useState(false);
  const refresh=useRefresh();
  useEffect(()=>{
    let active=true;
    void callRpc<Pending[]>('admin_feedback_pending_deletes',{p_product_id:product||null})
      .then(result=>{if(active){setRows(Array.isArray(result)?result:[]);setError('')}})
      .catch(()=>{if(active){setRows([]);setError('待清理记录查询失败，请重试')}})
    return ()=>{active=false};
  },[product,revision,reloadKey]);
  const retry=async(row:Pending)=>{
    setBusy(row.id);setError('');
    try{
      const result=await supabase.functions.invoke<{deleted:boolean}>('feedback-delete',{
        body:{feedback_id:row.id,expected_version:row.pending?null:row.version,
          product_id:product||null},
      });
      if(result.error||result.data?.deleted!==true)throw new Error('未确认完全删除');
      setRevision(x=>x+1);refresh();
    }catch{
      setError('删除未完成，请检查图片存储与服务状态后重试。不会报告为已删除。');
      setRevision(x=>x+1);
    }finally{setBusy('');setTarget(null)}
  };
  if(!rows.length)return error?
    <Alert variant="outlined" severity="warning" sx={{mb:1.5,py:0}}
      action={<Button color="inherit" size="small"
        onClick={()=>setRevision(value=>value+1)}>重试</Button>}>
      待清理状态暂时无法读取
    </Alert>:null;
  return <Alert severity="warning" variant="outlined" sx={{
    mb:1.5,py:0,'& .MuiAlert-message':{width:'100%',minWidth:0}
  }}>
    <Stack direction="row" useFlexGap sx={{alignItems:'center',flexWrap:'wrap',gap:1}}>
      <Typography variant="body2" sx={{flex:1,minWidth:150}}>
        有 {rows.length} 条反馈需要完成清理
      </Typography>
      <Button size="small" color="inherit" onClick={()=>setExpanded(value=>!value)}>
        {expanded?'收起':'查看'}
      </Button>
      <Button size="small" color="inherit" onClick={()=>setRevision(value=>value+1)}>刷新</Button>
    </Stack>
    {expanded&&<Stack spacing={1} sx={{mt:1.5,mb:1}}>
      {rows.map(row=><Stack key={row.id} direction="row" useFlexGap
        sx={{gap:1,alignItems:'center',flexWrap:'wrap'}}>
        <Typography variant="body2" sx={{flex:1,minWidth:140}}>
          反馈 #{row.feedback_no} · {row.pending?'清理未完成':'历史待删除'}
        </Typography>
        <Button size="small" color="error" disabled={!!busy}
          onClick={()=>setTarget(row)}>{busy===row.id?'正在清理…':'永久删除'}</Button>
      </Stack>)}
      {error&&<Typography variant="body2" color="error">{error}</Typography>}
    </Stack>}
    <Dialog open={!!target} onClose={()=>!busy&&setTarget(null)} fullWidth maxWidth="xs">
      <DialogTitle>永久删除反馈 #{target?.feedback_no}？</DialogTitle>
      <DialogContent><Typography variant="body2">
        将彻底清理反馈记录、内部历史、私有原图及缩略图，无法恢复。
        如网络或存储异常，将保留待清理任务供核实后继续。
      </Typography></DialogContent>
      <DialogActions>
        <Button disabled={!!busy} onClick={()=>setTarget(null)}>取消</Button>
        <Button color="error" variant="contained" disabled={!!busy||!target}
          onClick={()=>{if(target)void retry(target)}}>确认永久删除</Button>
      </DialogActions>
    </Dialog>
  </Alert>;
}
