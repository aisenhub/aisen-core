import {useEffect,useRef,useState} from 'react';
import {useNotify,useRefresh,useStore} from 'react-admin';
import {useNavigate} from 'react-router-dom';
import {supabase} from '../supabaseClient';
import {Alert,Box,Button,Card,Dialog,DialogActions,
  DialogContent,DialogTitle,Stack,TextField,Typography} from '@mui/material';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import {callRpc} from '../data/dataProvider';
import {priorityLabels} from './feedbackLabels';
import type {FeedbackV2Record} from './FeedbackV2';

type Queue=FeedbackV2Record['queue_state'];
const labels:Record<Queue,string>={
  inbox:'加入处理工作台',workbench:'归档反馈',
  archived:'重新进入工作台',
};
const actionFor:Record<Queue,string>={
  inbox:'triage',workbench:'archive',archived:'reopen',
};
export function FeedbackV3Editor({record,backTo}:{record:FeedbackV2Record;backTo:string}){
  const notify=useNotify(),refresh=useRefresh(),navigate=useNavigate();
  const [product]=useStore<string>('aisencore.current.product','');
  const [priority,setPriority]=useState(record.priority??'normal');
  const [star,setStar]=useState(record.is_starred);
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [confirm,setConfirm]=useState(false);
  const previous=useRef({priority:record.priority??'normal',star:record.is_starred});
  useEffect(()=>{
    const last=previous.current;
    const next={priority:record.priority??'normal',star:record.is_starred};
    setPriority(value=>value===last.priority?next.priority:value);
    setStar(value=>value===last.star?next.star:value);
    previous.current=next;
  },[record.priority,record.is_starred,record.version]);
  const canEdit=record.queue_state==='inbox'||record.queue_state==='workbench';
  const changed=priority!==(record.priority??'normal')||star!==record.is_starred||note.trim().length>0;
  useEffect(()=>{
    if(!changed)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[changed]);
  const permanentlyDelete=async()=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      const result=await supabase.functions.invoke<{deleted:boolean}>('feedback-delete',{
        body:{feedback_id:record.id,expected_version:record.version,
          product_id:product||null},
      });
      if(result.error||result.data?.deleted!==true)
        throw result.error??new Error('删除结果未确认');
      notify('反馈及私有图片已永久删除',{type:'success'});
      navigate(backTo);
    }catch{
      setError('永久删除尚未完成，请在反馈中心的待清理任务中核对并继续；不会当作成功。');
    }finally{setBusy(false);setConfirm(false)}
  };
  const run=async(action:string)=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      await callRpc('admin_feedback_v3',{
        p_feedback_id:record.id,p_expected_version:record.version,p_action:action,
        p_priority:action==='save'||action==='triage'?priority:null,
        p_tags:null,
        p_is_starred:action==='save'||action==='triage'?star:null,
        p_internal_note:(action==='save'||action==='triage')?(note.trim()||null):null,
      });
      setNote('');
      notify(action==='save'?'已保存处理记录':'反馈已更新',{type:'success'});
      refresh();
    }catch(e){
      const code=(e as {status?:number}).status;
      setError(code===409?'反馈已被其他操作更新，请刷新后核对并重试。':
        e instanceof Error?e.message:'操作失败，请重试');
    }finally{setBusy(false);setConfirm(false)}
  };
  const action=actionFor[record.queue_state];
  return <Card variant="outlined" sx={{p:{xs:2,md:3},width:'100%',minWidth:0}}>
    <Stack direction="row" sx={{justifyContent:'space-between',alignItems:'center',gap:2,mb:2}}>
      <Typography component="h2" variant="h6">{canEdit?'处理反馈':'反馈管理'}</Typography>
      {record.queue_state==='inbox'&&
        <Typography variant="caption" color="text.secondary">可先标记，再加入工作台</Typography>}
    </Stack>
    {canEdit&&<>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'190px auto'},
        gap:1.5,alignItems:'start'}}>
        <TextField select size="small" label="优先级" value={priority}
          onChange={e=>setPriority(e.target.value)} slotProps={{select:{native:true}}}>
          {Object.entries(priorityLabels).map(([value,label])=>
            <option key={value} value={value}>{label}</option>)}
        </TextField>
        <Button variant={star?'contained':'outlined'} color={star?'warning':'inherit'}
          startIcon={star?<StarRoundedIcon/>:<StarBorderRoundedIcon/>}
          disabled={busy} onClick={()=>setStar(value=>!value)}
          aria-pressed={star} sx={{height:40}}>{star?'已星标':'星标'}</Button>
      </Box>
      <TextField fullWidth multiline minRows={2} maxRows={6} label="内部备注"
        placeholder="记录排查结果、处理情况或需要跟进的事项，仅管理员可见"
        value={note} onChange={e=>setNote(e.target.value)}
        slotProps={{htmlInput:{maxLength:5000}}} sx={{mt:2}}/>
    </>}
    {error&&<Alert severity="error" sx={{mt:1.5}}>{error}</Alert>}
    <Stack direction="row" sx={{justifyContent:'flex-end',gap:1,mt:2,flexWrap:'wrap'}}>
      <Button color="error" disabled={busy} onClick={()=>setConfirm(true)}>永久删除</Button>
      {canEdit&&<Button variant="outlined" disabled={!changed||busy}
        onClick={()=>void run('save')}>保存标记与备注</Button>}
      <Button variant="contained" disabled={busy||(record.queue_state==='workbench'&&changed)}
        onClick={()=>void run(action)}>
        {labels[record.queue_state]}
      </Button>
    </Stack>
    {record.queue_state==='workbench'&&changed&&
      <Typography variant="caption" color="text.secondary" sx={{display:'block',textAlign:'right',mt:1}}>
        请先保存当前标记与备注，再归档反馈。
      </Typography>}
    <Dialog open={confirm} onClose={()=>!busy&&setConfirm(false)} maxWidth="xs" fullWidth>
      <DialogTitle>永久删除反馈？</DialogTitle>
      <DialogContent>
        反馈原文、处理历史、图片及缩略图将被彻底删除，操作不可撤销。
        {changed&&' 当前未保存的编辑也将丢失。'}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={()=>setConfirm(false)}>取消</Button>
        <Button color="error" variant="contained" disabled={busy}
          onClick={()=>void permanentlyDelete()}>确认永久删除</Button>
      </DialogActions>
    </Dialog>
  </Card>;
}
