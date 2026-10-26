import {useEffect,useRef,useState} from 'react';
import {useNotify,useRefresh} from 'react-admin';
import {Alert,Autocomplete,Box,Button,Card,Dialog,DialogActions,
  DialogContent,DialogTitle,Stack,TextField,Typography} from '@mui/material';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import {callRpc} from '../data/dataProvider';
import {priorityLabels} from './feedbackLabels';
import type {FeedbackV2Record} from './FeedbackV2';

type Queue=FeedbackV2Record['queue_state'];
const labels:Record<Queue,string>={
  inbox:'加入处理工作台',workbench:'归档反馈',
  archived:'重新进入工作台',trashed:'恢复到删除前位置',
};
const actionFor:Record<Queue,string>={
  inbox:'triage',workbench:'archive',archived:'reopen',trashed:'restore',
};
const same=(a:readonly string[],b:readonly string[])=>
  a.length===b.length&&a.every((value,index)=>value===b[index]);
export function FeedbackV3Editor({record,tagOptions=[]}:{
  record:FeedbackV2Record;tagOptions?:string[];
}){
  const notify=useNotify(),refresh=useRefresh();
  const [priority,setPriority]=useState(record.priority??'normal');
  const [tags,setTags]=useState<string[]>(record.tags??[]);
  const [star,setStar]=useState(record.is_starred);
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [confirm,setConfirm]=useState(false);
  const previous=useRef({priority:record.priority??'normal',tags:record.tags,star:record.is_starred});
  useEffect(()=>{
    const last=previous.current;
    const next={priority:record.priority??'normal',tags:record.tags,star:record.is_starred};
    setPriority(value=>value===last.priority?next.priority:value);
    setTags(value=>same(value,last.tags)?next.tags:value);
    setStar(value=>value===last.star?next.star:value);
    previous.current=next;
  },[record.priority,record.tags,record.is_starred,record.version]);
  const canEdit=record.queue_state==='inbox'||record.queue_state==='workbench';
  const invalid=tags.length>8||tags.some(t=>!t.trim()||Array.from(t).length>32)
    ||new Set(tags).size!==tags.length;
  const changed=priority!==(record.priority??'normal')||!same(tags,record.tags)||
    star!==record.is_starred||note.trim().length>0;
  const run=async(action:string)=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      await callRpc('admin_feedback_v3',{
        p_feedback_id:record.id,p_expected_version:record.version,p_action:action,
        p_priority:action==='save'||action==='triage'?priority:null,
        p_tags:action==='save'||action==='triage'?tags:null,
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
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'190px minmax(0,1fr) auto'},
        gap:1.5,alignItems:'start'}}>
        <TextField select size="small" label="优先级" value={priority}
          onChange={e=>setPriority(e.target.value)} slotProps={{select:{native:true}}}>
          {Object.entries(priorityLabels).map(([value,label])=>
            <option key={value} value={value}>{label}</option>)}
        </TextField>
        <Autocomplete multiple freeSolo size="small" options={tagOptions}
          value={tags} disabled={busy} filterSelectedOptions
          onChange={(_,value)=>setTags(value.map(v=>String(v).trim()).filter(Boolean))}
          renderInput={params=><TextField {...params} label="标签"
            placeholder={tags.length?'':'选择已有标签或输入新标签'}/>}/>
        <Button variant={star?'contained':'outlined'} color={star?'warning':'inherit'}
          startIcon={star?<StarRoundedIcon/>:<StarBorderRoundedIcon/>}
          disabled={busy} onClick={()=>setStar(value=>!value)}
          aria-pressed={star} sx={{height:40}}>{star?'已星标':'星标'}</Button>
      </Box>
      <TextField fullWidth multiline minRows={2} maxRows={6} label="内部备注"
        placeholder="记录排查结果、处理情况或需要跟进的事项，仅管理员可见"
        value={note} onChange={e=>setNote(e.target.value)}
        slotProps={{htmlInput:{maxLength:5000}}} sx={{mt:2}}/>
      {invalid&&<Alert severity="warning" sx={{mt:1}}>
        标签最多 8 个，每个 1–32 字符，且不能重复。
      </Alert>}
    </>}
    {error&&<Alert severity="error" sx={{mt:1.5}}>{error}</Alert>}
    <Stack direction="row" sx={{justifyContent:'flex-end',gap:1,mt:2,flexWrap:'wrap'}}>
      {record.queue_state==='inbox'||record.queue_state==='workbench'?
        <Button color="error" disabled={busy} onClick={()=>setConfirm(true)}>移入回收站</Button>:null}
      {canEdit&&<Button variant="outlined" disabled={!changed||busy||invalid}
        onClick={()=>void run('save')}>保存标记与备注</Button>}
      <Button variant="contained" disabled={busy||invalid||(record.queue_state==='workbench'&&changed)}
        onClick={()=>void run(action)}>
        {labels[record.queue_state]}
      </Button>
    </Stack>
    {record.queue_state==='workbench'&&changed&&
      <Typography variant="caption" color="text.secondary" sx={{display:'block',textAlign:'right',mt:1}}>
        请先保存当前标记与备注，再归档反馈。
      </Typography>}
    <Dialog open={confirm} onClose={()=>!busy&&setConfirm(false)} maxWidth="xs" fullWidth>
      <DialogTitle>移入回收站？</DialogTitle>
      <DialogContent>
        反馈将移动到回收站，日后可恢复至删除前的位置。
        {changed&&' 当前未保存的标记与备注不会随删除操作保存。'}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={()=>setConfirm(false)}>取消</Button>
        <Button color="error" variant="contained" disabled={busy}
          onClick={()=>void run('trash')}>确认移入</Button>
      </DialogActions>
    </Dialog>
  </Card>;
}
