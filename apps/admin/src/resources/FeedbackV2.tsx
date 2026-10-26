import { useEffect, useRef, useState } from 'react';
import { Datagrid, DateField, FunctionField, List, ReferenceField, SelectInput, TextInput, TextField as RaTextField, useNotify, useRefresh, useStore, useUnselectAll, Confirm } from 'react-admin';
import { Alert, Box, Button, Card, Chip, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { callRpc } from '../data/dataProvider';
import { FeedbackExport } from './FeedbackExport';
import { categoryLabels, priorityLabels, statusLabels } from './feedbackLabels';

export type FeedbackV2Record={
  id:string;feedback_no:number;product_id:string;user_id:string;content:string;
  category:string;queue_state:'inbox'|'workbench'|'archived'|'trashed';
  read_at?:string|null;priority:string|null;status:string|null;is_starred:boolean;
  tags:string[];version:number;created_at:string;updated_at:string;
  attachment_count?:number;assigned_to?:string|null;
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

export function FeedbackQueueTabs({active}:{active:'inbox'|'workbench'}){
  return <Tabs value={active} aria-label="反馈业务视图"
    sx={{minHeight:44,mb:2,borderBottom:1,borderColor:'divider',
      '& .MuiTab-root':{minHeight:44,px:{xs:1.5,sm:2.5},mr:1,fontWeight:700}}}>
    <Tab component={RouterLink} to="/feedback" value="inbox" label="收件箱"
      icon={<InboxOutlinedIcon fontSize="small"/>} iconPosition="start"/>
    <Tab component={RouterLink} to="/feedback/workbench" value="workbench" label="处理工作台"
      icon={<TaskAltOutlinedIcon fontSize="small"/>} iconPosition="start"/>
  </Tabs>;
}
function FeedbackSummary({item,queue}:{item:FeedbackV2Record;queue:'inbox'|'workbench'}) {
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
      {queue==='workbench'&&item.tags.length>0&&
        <Typography variant="caption" noWrap sx={{maxWidth:160}}>#{item.tags.join(' #')}</Typography>}
    </Stack>
  </Box>;
}
function Queue({queue}:{queue:'inbox'|'workbench'}){
  const [product]=useStore<string>('aisencore.current.product','');
  const [inboxState,setInboxState]=useState<'inbox'|'archived'|'trashed'>('inbox');
  const active=queue==='workbench';
  const viewQueue=active?'workbench':inboxState;
  const unselectAll=useUnselectAll('feedback');
  // React-admin keeps bulk selections per resource rather than per queue.
  // Never carry selections into a different product or workflow stage.
  useEffect(()=>{unselectAll()},[viewQueue,product,unselectAll]);
  return <Box sx={{px:{xs:2,md:3,lg:4},pt:{xs:2,md:3},pb:6,minWidth:0,maxWidth:1580,mx:'auto'}}>
    <Typography component="h1" variant="h4" sx={{mb:2}}>
      {active?'处理工作台':'反馈收件箱'}
    </Typography>
    <FeedbackQueueTabs active={queue}/>
    {!active?<Stack direction="row" spacing={1} sx={{mb:2,flexWrap:'wrap'}}>
      {([['inbox','待筛选'],['archived','已归档'],['trashed','回收站']] as const).map(([key,label])=><Button
        key={key} size="small" variant={inboxState===key?'contained':'text'}
        aria-pressed={inboxState===key} sx={{minHeight:34,borderRadius:5}}
        onClick={()=>setInboxState(key)}>{label}</Button>)}
    </Stack>:null}
    <List resource="feedback" perPage={20} sort={{field:active?'updated_at':'created_at',order:'DESC'}}
      filter={{...(product?{product_id:product}:{}),queue_state:viewQueue}}
      filters={active?[
        <SelectInput key="status" source="status" label="处理状态" choices={Object.entries(statusLabels).map(([id,name])=>({id,name}))} alwaysOn />,
        <SelectInput key="priority" source="priority" label="优先级" choices={Object.entries(priorityLabels).map(([id,name])=>({id,name}))} alwaysOn />,
        <SelectInput key="is_starred" source="is_starred" label="星标" choices={[{id:'true',name:'已星标'},{id:'false',name:'未星标'}]} alwaysOn />,
        <TextInput key="tags" source="tags" label="包含标签" alwaysOn />,
      ]:[
        <SelectInput key="category" source="category" label="类型" choices={Object.entries(categoryLabels).map(([id,name])=>({id,name}))} alwaysOn />,
      ]}
      title={false} actions={false} exporter={false} sx={{
        '& .RaList-main':{minWidth:0},
        '& .RaList-filterForm':{gap:1,alignItems:'center',flexWrap:'wrap',mb:1,
          '& .MuiFormControl-root':{mb:0}},
        '& .RaList-content':{overflow:'hidden',boxShadow:'none'},
      }}
      empty={<Card variant="outlined" sx={{p:{xs:3,md:5},textAlign:'center'}}>
        <Typography component="h2" variant="h6">{active?'暂无进入处理工作台的反馈':viewQueue==='archived'?'没有已归档反馈':viewQueue==='trashed'?'回收站为空':'收件箱暂无待筛选反馈'}</Typography>
      </Card>}>
      <Stack direction="row" sx={{mb:1.5,justifyContent:'flex-end'}}>
        <FeedbackExport queue={viewQueue} mode="filtered"/>
      </Stack>
      <Datagrid rowClick="show" bulkActionButtons={<FeedbackExport queue={viewQueue} mode="selected"/>}
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
        {active?<FunctionField<FeedbackV2Record> source="status" label="处理状态"
          render={item=><FeedbackStatus status={item.status}/>}/>:null}
        {active?<FunctionField<FeedbackV2Record> source="priority" label="优先级"
          render={item=><Chip size="small" label={priorityLabels[item.priority??'']??'—'}
            color={item.priority==='urgent'?'error':item.priority==='high'?'warning':'default'}
            variant="outlined" sx={{color:item.priority==='urgent'?'error.dark':
              item.priority==='high'?'warning.dark':undefined}}/>}/>:null}
        <ReferenceField source="product_id" reference="products" label="所属产品" link={false} emptyText="—">
          <RaTextField source="name"/>
        </ReferenceField>
        <DateField source={active?'updated_at':'created_at'} label={active?'最近更新':'收到时间'} showTime/>
      </Datagrid>
    </List>
  </Box>;
}
export function FeedbackInbox(){return <Queue queue="inbox"/>}
export function FeedbackWorkbench(){return <Queue queue="workbench"/>}

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
  return <Card variant="outlined" sx={{p:{xs:2,md:3}}}>
    <Typography component="h2" variant="h6" sx={{mb:2}}>收件箱筛选</Typography>
    {inbox?<Stack spacing={2}>
      <TextField select size="small" label="分配优先级" value={priority}
        onChange={e=>setPriority(e.target.value)}>
        {Object.entries(priorityLabels).map(([id,label])=><MenuItem key={id} value={id}>{label}</MenuItem>)}
      </TextField>
      <Button fullWidth variant="contained" disabled={busy} onClick={()=>void act('triage')}>
        {busy?'正在处理…':'分配并进入工作台'}
      </Button>
      <Stack direction="row" spacing={1} sx={{flexWrap:'wrap',gap:1}}>
        <Button variant="outlined" disabled={busy} onClick={()=>void act('archive')}>归档</Button>
        {!record.read_at?<Button disabled={busy} onClick={()=>void act('read')}>标记已读</Button>:null}
        <Button color="error" sx={{color:'error.dark'}} disabled={busy}
          onClick={()=>setConfirmAction('trash')}>移入回收站</Button>
      </Stack>
    </Stack>:<Stack spacing={1.5}>
      <Typography color="text.secondary">当前阶段：{record.queue_state==='archived'?'已归档':'回收站'}</Typography>
      <Button variant="contained" disabled={busy} onClick={()=>void act('restore')}>恢复到原阶段</Button>
      {record.queue_state==='archived'?<Button color="error" sx={{color:'error.dark'}} disabled={busy}
        onClick={()=>setConfirmAction('trash')}>移入回收站</Button>:null}
    </Stack>}
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
export function FeedbackAttention({record}:{record:FeedbackV2Record}){
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
      notify('星标及标签已保存',{type:'success'});refresh();
    }catch(e){setError(actionError(e))}
    finally{setBusy(false)}
  };
  return <Card variant="outlined" sx={{p:{xs:2,md:3}}}>
    <Stack direction="row" sx={{mb:2,justifyContent:'space-between',alignItems:'center'}}>
      <Typography component="h2" variant="h6">星标与标签</Typography>
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
      <Button variant="outlined" disabled={busy||invalid||!changed} onClick={()=>void save()}>
        {busy?'正在保存…':'保存星标和标签'}</Button>
      {error?<Alert severity="error">{error}</Alert>:null}
    </Stack>
  </Card>;
}
