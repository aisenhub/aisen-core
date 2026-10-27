import { useEffect, useMemo, useRef, useState } from 'react';
import { Datagrid, DateField, FunctionField, List, ReferenceField, TextField as RaTextField, useNotify, useRefresh, useStore, useUnselectAll, useListContext, Confirm } from 'react-admin';
import { Alert, Autocomplete, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Link as RouterLink } from 'react-router-dom';
import { callRpc } from '../data/dataProvider';
import { FeedbackExport } from './FeedbackExport';
import { categoryLabels, priorityLabels, statusLabels } from './feedbackLabels';
import {useFeedbackTags} from './useFeedbackTags';
import { PendingDatagrid } from './PendingDatagrid';

export type FeedbackV2Record={
  id:string;feedback_no:number;product_id:string;user_id:string;content:string;
  category:string;queue_state:'inbox'|'workbench'|'archived'|'trashed';
  read_at?:string|null;priority:string|null;status:string|null;is_starred:boolean;
  tags:string[];version:number;created_at:string;updated_at:string;
  attachment_count?:number;assigned_to?:string|null;
  last_handled_by?:string|null;
};
export function FeedbackStatus({status}:{status:string|null}){
  const color=status==='resolved'||status==='closed'?'success':
    status==='waiting_user'?'warning':status==='in_progress'?'info':'default';
  return <Chip size="small" color={color} variant="outlined"
    label={statusLabels[status??'']??'待筛选'}
    sx={{fontWeight:700,bgcolor:'background.paper',
      // The palette's default outlined-info foreground misses AA at 12px.
      color:color==='info'?'info.dark':color==='warning'?'warning.dark':undefined}}/>;
}

export type FeedbackQueue='inbox'|'workbench'|'archived'|'trashed';
const queueNames:Record<FeedbackQueue,string>={
  inbox:'收件箱',workbench:'处理工作台',archived:'已归档',trashed:'回收站',
};
export function FeedbackQueueTabs({active}:{active:FeedbackQueue}){
  return <Tabs value={active} aria-label="反馈业务视图"
    sx={{minHeight:44,mb:2,borderBottom:1,borderColor:'divider',
      '& .MuiTab-root':{minHeight:44,px:{xs:1.5,sm:2.5},mr:1,fontWeight:700}}}>
    <Tab component={RouterLink} to="/feedback" value="inbox" label="收件箱"
      icon={<InboxOutlinedIcon fontSize="small"/>} iconPosition="start"/>
    <Tab component={RouterLink} to="/feedback/workbench" value="workbench" label="处理工作台"
      icon={<TaskAltOutlinedIcon fontSize="small"/>} iconPosition="start"/>
    <Tab component={RouterLink} to="/feedback/archived" value="archived" label="已归档"
      icon={<ArchiveOutlinedIcon fontSize="small"/>} iconPosition="start"/>
    <Tab component={RouterLink} to="/feedback/trash" value="trashed" label="回收站"
      icon={<DeleteOutlineIcon fontSize="small"/>} iconPosition="start"/>
  </Tabs>;
}
function FeedbackSummary({item,queue}:{item:FeedbackV2Record;queue:FeedbackQueue}) {
  return <Box sx={{minWidth:0,py:.25}}>
    <Stack direction="row" spacing={.8} sx={{mb:.5,alignItems:'center'}}>
      <Typography variant="caption" sx={{fontWeight:800,color:'primary.main',fontVariantNumeric:'tabular-nums'}}>#{item.feedback_no}</Typography>
      {queue==='inbox'&&!item.read_at&&<Box component="span" aria-label="未读反馈"
        sx={{width:7,height:7,borderRadius:'50%',bgcolor:'primary.main'}}/>}
      {item.is_starred&&<StarRoundedIcon aria-label="已星标" sx={{fontSize:15,color:'warning.main'}}/>}
    </Stack>
    <Typography sx={{fontWeight:660,fontSize:14,lineHeight:1.55,overflowWrap:'anywhere',
      display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
      {item.content}
    </Typography>
    <Stack direction="row" spacing={1.25} sx={{mt:.7,color:'text.secondary',alignItems:'center'}}>
      <Typography variant="caption">{categoryLabels[item.category]??item.category}</Typography>
      {(item.attachment_count??0)>0&&<Stack direction="row" spacing={.25} sx={{alignItems:'center'}}>
        <AttachFileRoundedIcon sx={{fontSize:13}} aria-hidden/>
        <Typography variant="caption">{item.attachment_count}</Typography>
      </Stack>}
      {item.tags.length>0&&
        <Typography variant="caption" noWrap sx={{maxWidth:160}}>#{item.tags.join(' #')}</Typography>}
    </Stack>
  </Box>;
}
function QueueEmpty({queue}:{queue:FeedbackQueue}){
  const {total,isPending}=useListContext();
  if(isPending||total!==0)return null;
  return <Card variant="outlined" sx={{width:'100%',px:{xs:3,md:4},py:{xs:4,md:5},textAlign:'left',mt:1}}>
    <Typography component="h2" variant="h6">
      {queue==='workbench'?'暂无进入处理工作台的反馈':
        queue==='archived'?'没有匹配的已归档反馈':
        queue==='trashed'?'没有匹配的回收站反馈':'当前没有匹配的收件箱反馈'}
    </Typography>
    <Typography color="text.secondary" variant="body2" sx={{mt:.75}}>
      可以重置筛选条件，或切换队列与产品范围。
    </Typography>
  </Card>;
}
function Queue({queue}:{queue:FeedbackQueue}){
  const [product]=useStore<string>('aisencore.current.product','');
  const active=queue==='workbench';
  const viewQueue=queue;
  const unselectAll=useUnselectAll('feedback');
  const [tagSelection,setTagSelection]=useState<{scope:string;value:string[]}>({scope:product,value:[]});
  const labels=useMemo(()=>tagSelection.scope===product?tagSelection.value:[],[product,tagSelection]);
  const [priority,setPriority]=useState('');
  const [starFilter,setStarFilter]=useState('');
  const {tags:tagOptions,error:tagError}=useFeedbackTags(product);
  // Scope-keyed selection is empty immediately when the product changes,
  // with no extra render/effect or stale tag filter applied to the new scope.
  // React-admin keeps bulk selections per resource rather than per queue.
  // Never carry selections into a different product or workflow stage.
  useEffect(()=>{unselectAll()},[viewQueue,product,priority,starFilter,labels,unselectAll]);
  return <Box sx={{px:{xs:2,md:3,lg:4.5},pt:{xs:2,lg:2.5},pb:6,
    width:'100%',maxWidth:1720,mx:'auto',minWidth:0,boxSizing:'border-box'}}>
    <Typography component="h1" sx={{fontSize:{xs:22,md:26},fontWeight:740,mb:1.5}}>
      {queueNames[queue]}
    </Typography>
    <FeedbackQueueTabs active={queue}/>
    <List resource="feedback" perPage={20} sort={{field:active?'updated_at':'created_at',order:'DESC'}}
      filter={{...(product?{product_id:product}:{}),queue_state:viewQueue,
        ...(priority?{priority}:{}),...(starFilter?{is_starred:starFilter}:{}),
        ...(labels.length?{tags:labels}:{})}}
      title={false} actions={false} exporter={false} sx={{
        width:'100%',minWidth:0,
        '& .RaList-main':{minWidth:0,width:'100%'},
        '& .RaList-content':{overflow:'hidden',boxShadow:'none'},
      }}
      empty={false}>
      <Stack direction="row" sx={{width:'100%',mb:1.5,alignItems:'center',
        gap:1.25,flexWrap:'wrap'}}>
        <TextField select size="small" label="优先级" value={priority}
          onChange={e=>setPriority(e.target.value)}
          sx={{width:{xs:'100%',sm:155},flex:{sm:'0 0 155px'}}}>
          <MenuItem value="">全部优先级</MenuItem>
          {Object.entries(priorityLabels).map(([value,name])=>
            <MenuItem key={value} value={value}>{name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="星标" value={starFilter}
          onChange={e=>setStarFilter(e.target.value)}
          sx={{width:{xs:'100%',sm:135},flex:{sm:'0 0 135px'}}}>
          <MenuItem value="">全部</MenuItem>
          <MenuItem value="true">已星标</MenuItem>
          <MenuItem value="false">未星标</MenuItem>
        </TextField>
        <Autocomplete multiple size="small" options={tagOptions} value={labels}
          onChange={(_,value)=>setTagSelection({scope:product,value})}
          renderInput={params=><TextField {...params} label="标签筛选" placeholder="选择已有标签"/>}
          sx={{width:{xs:'100%',sm:280},minWidth:{sm:220},
            flex:{sm:'1 1 280px'},maxWidth:{sm:480}}}/>
        <Button size="small" onClick={()=>{setTagSelection({scope:product,value:[]});setPriority('');setStarFilter('')}}>
          重置
        </Button>
        <Box sx={{ml:{sm:'auto'}}}>
          <FeedbackExport queue={viewQueue} mode="filtered" selectedTags={labels}
            priorityFilter={priority} starFilter={starFilter}/>
        </Box>
      </Stack>
      {tagError&&<Alert severity="warning" sx={{mb:1}}>标签选项未加载成功，其他筛选仍可使用。</Alert>}
      <PendingDatagrid selection columns={[
        {label:'反馈'}, {label:'优先级',hideBelow:'mobile'},
        {label:'所属产品',hideBelow:'wide'}, {label:active?'最近更新':'收到时间',hideBelow:'mobile'},
      ]}>
      <Datagrid rowClick="show" bulkActionButtons={<FeedbackExport queue={viewQueue} mode="selected" selectedTags={labels}/>}
        sx={{
          '& .MuiTableCell-root':{wordBreak:'normal',whiteSpace:'normal',verticalAlign:'middle'},
          '& .MuiTableCell-head':{whiteSpace:'nowrap'},
          '& .column-feedback_no':{width:'52%',minWidth:{xs:185,sm:260}},
          '& .column-status':{minWidth:110},
          '& .column-priority':{minWidth:85},
          '& .column-product_id':{minWidth:110,maxWidth:200,
            '& .MuiTypography-root':{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},
          '& .column-created_at, & .column-updated_at':{minWidth:140,whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'},
          '@media (max-width:1100px)':{'& .column-product_id':{display:'none'}},
          '@media (max-width:700px)':{
            '& .column-priority, & .column-created_at, & .column-updated_at':{display:'none'},
            '& .MuiTableCell-root':{px:1.25,py:1.25},
          },
        }}>
        <FunctionField<FeedbackV2Record> source="feedback_no" label="反馈"
          render={item=><FeedbackSummary item={item} queue={queue}/>}/>
        <FunctionField<FeedbackV2Record> source="priority" label="优先级"
          render={item=><Chip size="small" label={priorityLabels[item.priority??'']??'—'}
            color={item.priority==='urgent'?'error':item.priority==='high'?'warning':'default'}
            variant="outlined" sx={{color:item.priority==='urgent'?'error.dark':
              item.priority==='high'?'warning.dark':undefined}}/>}/>
        <ReferenceField source="product_id" reference="products" label="所属产品" link={false} emptyText="—">
          <RaTextField source="name"/>
        </ReferenceField>
        <DateField source={active?'updated_at':'created_at'} label={active?'最近更新':'收到时间'} showTime/>
      </Datagrid>
      </PendingDatagrid>
      <QueueEmpty queue={queue}/>
    </List>
  </Box>;
}
export function FeedbackInbox(){return <Queue queue="inbox"/>}
export function FeedbackWorkbench(){return <Queue queue="workbench"/>}
export function FeedbackArchived(){return <Queue queue="archived"/>}
export function FeedbackTrash(){return <Queue queue="trashed"/>}

function actionError(e:unknown){
  return (e as {status?:number}).status===409?'记录已更新，请刷新后操作。':
    e instanceof Error?e.message:'操作失败，请重试。';
}
export function FeedbackScreening({record}:{record:FeedbackV2Record}){
  const notify=useNotify(),refresh=useRefresh();
  const [priority,setPriority]=useState('normal');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [confirmAction,setConfirmAction]=useState<'trash'|null>(null);
  const act=async(action:'read'|'triage'|'archive'|'trash'|'restore')=>{
    setBusy(true);setError('');
    try{
      await callRpc('admin_screen_feedback',{
        p_feedback_id:record.id,p_expected_version:record.version,
        p_action:action,p_priority:action==='triage'?priority:null,
      });
      notify('反馈已更新',{type:'success'});refresh();
    }catch(e){setError(actionError(e))}
    finally{setBusy(false)}
  };
  const inbox=record.queue_state==='inbox';
  return <Card variant="outlined" sx={{p:{xs:2,md:3},width:'100%'}}>
    <Typography component="h2" variant="h6" sx={{mb:2}}>收件箱筛选</Typography>
    {inbox?<Box sx={{display:'flex',gap:1.5,alignItems:'center',flexWrap:'wrap'}}>
      <TextField select size="small" label="分配优先级" value={priority}
        onChange={e=>setPriority(e.target.value)} sx={{width:{xs:'100%',sm:210}}}>
        {Object.entries(priorityLabels).map(([id,label])=><MenuItem key={id} value={id}>{label}</MenuItem>)}
      </TextField>
      <Button variant="contained" disabled={busy} onClick={()=>void act('triage')}>
        {busy?'正在处理…':'分配并进入工作台'}
      </Button>
      <Button variant="outlined" disabled={busy} onClick={()=>void act('archive')}>归档</Button>
      {!record.read_at?<Button disabled={busy} onClick={()=>void act('read')}>标记已读</Button>:null}
      <Button color="error" sx={{color:'error.dark'}} disabled={busy}
        onClick={()=>setConfirmAction('trash')}>移入回收站</Button>
    </Box>:<Box sx={{display:'flex',gap:1.5,alignItems:'center',flexWrap:'wrap'}}>
      <Typography color="text.secondary" variant="body2">当前阶段：{record.queue_state==='archived'?'已归档':'回收站'}</Typography>
      <Button variant="contained" disabled={busy} onClick={()=>void act('restore')}>恢复到原阶段</Button>
      {record.queue_state==='archived'?<Button color="error" sx={{color:'error.dark'}} disabled={busy}
        onClick={()=>setConfirmAction('trash')}>移入回收站</Button>:null}
    </Box>}
    <Confirm isOpen={confirmAction==='trash'} title="移入回收站"
      content="反馈将从当前列表移除，但仍可在回收站恢复。"
      confirm="确认移入" cancel="取消" confirmColor="warning"
      loading={busy} onClose={()=>setConfirmAction(null)}
      onConfirm={()=>{setConfirmAction(null);void act('trash')}}/>
    {error?<Alert severity="error" sx={{mt:2}}>{error}</Alert>:null}
  </Card>;
}
const sameTags=(a:readonly string[],b:readonly string[])=>
  a.length===b.length&&a.every((value,index)=>value===b[index]);
export function FeedbackAttention({record,onClose}:{record:FeedbackV2Record;onClose:()=>void}){
  const notify=useNotify(),refresh=useRefresh();
  const [star,setStar]=useState(record.is_starred);
  const [tags,setTags]=useState<string[]>([...record.tags]);
  const [tagInput,setTagInput]=useState('');
  const previousRecord=useRef({star:record.is_starred,tags:[...record.tags]});
  useEffect(()=>{
    const old=previousRecord.current;
    const next={star:record.is_starred,tags:[...record.tags]};
    setStar(value=>value===old.star?next.star:value);
    setTags(value=>sameTags(value,old.tags)?next.tags:value);
    previousRecord.current=next;
  },[record.is_starred,record.tags,record.version]);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const candidate=tagInput.trim();
  const duplicate=tags.includes(candidate);
  const inputInvalid=!!candidate&&(Array.from(candidate).length>32||duplicate||tags.length>=8);
  const nextTags=candidate&&!inputInvalid?[...tags,candidate]:tags;
  const invalid=tags.length>8||tags.some(x=>Array.from(x).length>32)||
    new Set(tags).size!==tags.length||inputInvalid;
  const changed=star!==record.is_starred||!sameTags(nextTags,record.tags);
  const addTag=()=>{
    if(!candidate||inputInvalid||busy)return;
    setTags(previous=>[...previous,candidate]);setTagInput('');setError('');
  };
  const save=async()=>{
    if(invalid||!changed||busy)return;
    setBusy(true);setError('');
    try{
      await callRpc('admin_attention_feedback',{
        p_feedback_id:record.id,p_expected_version:record.version,
        p_is_starred:star,p_tags:nextTags,
      });
      setTagInput('');
      notify('星标及标签已保存',{type:'success'});refresh();onClose();
    }catch(e){setError(actionError(e))}
    finally{setBusy(false)}
  };
  return <Box>
    <Stack direction="row" sx={{mb:2,justifyContent:'space-between',alignItems:'center'}}>
      <Typography variant="subtitle1">关注此反馈</Typography>
      <Button size="small" variant={star?'contained':'outlined'} disabled={busy} onClick={()=>setStar(!star)}
        aria-pressed={star} startIcon={<StarRoundedIcon/>}>{star?'已星标':'加星标'}</Button>
    </Stack>
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{flexWrap:'wrap',gap:.75,minHeight:tags.length?28:0}}>
        {tags.map(tag=><Chip key={tag} label={tag} variant="outlined"
          disabled={busy} onDelete={()=>setTags(previous=>previous.filter(item=>item!==tag))}
          sx={{maxWidth:'100%','& .MuiChip-label':{overflowWrap:'anywhere',whiteSpace:'normal'}}}/>)}
      </Stack>
      <Stack direction="row" spacing={1} sx={{alignItems:'flex-start'}}>
        <TextField label={'添加内部标签 · '+tags.length+'/8'} value={tagInput} disabled={busy}
          onChange={e=>setTagInput(e.target.value)} error={inputInvalid}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();addTag()}}}
          helperText={duplicate?'标签已存在':tags.length>=8&&candidate?'最多 8 个标签':
            Array.from(candidate).length>32?'每个标签最多 32 字符':
            '输入后按 Enter 添加 · 仅管理员可见'}/>
        <Button variant="outlined" disabled={busy||!candidate||inputInvalid}
          onClick={addTag} sx={{mt:.2,flexShrink:0}}>添加</Button>
      </Stack>
      {error?<Alert severity="error">{error}</Alert>:null}
    </Stack>
    <DialogActions sx={{px:0,pb:0,pt:2}}>
      <Button disabled={busy} onClick={onClose}>取消</Button>
      <Button variant="contained" disabled={busy||invalid||!changed} onClick={()=>void save()}>
        {busy?'正在保存…':'保存星标和标签'}
      </Button>
    </DialogActions>
  </Box>;
}

export function FeedbackAttentionDialog({open,record,onClose}:{
  open:boolean;record:FeedbackV2Record;onClose:()=>void
}){
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
    aria-labelledby="feedback-attention-title">
    <DialogTitle id="feedback-attention-title">星标与标签</DialogTitle>
    <DialogContent dividers sx={{pt:2}}>
      {open&&<FeedbackAttention record={record} onClose={onClose}/>}
    </DialogContent>
  </Dialog>;
}
