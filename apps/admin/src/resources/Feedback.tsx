import { useEffect, useRef, useState } from 'react';
import {
  Pagination, ReferenceField, ReferenceManyField, Show, TextField as RaTextField,
  useGetList, useGetMany, useListContext, useNotify, useRecordContext, useRefresh,
} from 'react-admin';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, MenuItem,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { callRpc } from '../data/dataProvider';
import { supabase } from '../supabaseClient';
import {
  FeedbackAttention, FeedbackQueueTabs, FeedbackScreening, FeedbackStatus,
} from './FeedbackV2';
import { allowedStatusTransitions, categoryLabels, priorityLabels, statusLabels } from './feedbackLabels';

type FeedbackRecord={
  id:string;feedback_no:number;product_id:string;user_id:string;
  content:string;category:string;status:string|null;priority:string|null;
  queue_state:'inbox'|'workbench'|'archived'|'trashed';read_at?:string|null;
  triaged_at?:string|null;is_starred:boolean;tags:string[];
  assigned_to?:string|null;version:number;
  created_at:string;updated_at:string;
  attachment_count?:number;
};
type EventRecord={id:string;event_type:string;visibility:string;from_status?:string;
  to_status?:string;message?:string;created_at:string};
type ImageRecord={id:string;slot:number;mime_type:string;size_bytes:number};

function FeedbackPicture({record}:{record:ImageRecord}){
  const [url,setUrl]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const load=async()=>{
    setLoading(true);setError('');setUrl('');
    try{
      const result=await supabase.functions.invoke<{url:string}>('feedback-image-access',{
        body:{attachment_id:record.id},
      });
      if(result.error||!result.data?.url)throw new Error('图片授权失败');
      setUrl(result.data.url);
    }catch{setError('图片暂时无法查看，请重试。')}
    finally{setLoading(false)}
  };
  return <Box sx={{p:1.5,minWidth:0,flex:'1 1 220px',maxWidth:420,
    border:1,borderColor:'divider',borderRadius:2}}>
    <Typography variant="caption" color="text.secondary">截图 {record.slot} · {(record.size_bytes/1024).toFixed(0)} KiB</Typography>
    {url?<Box component="img" src={url} alt={'用户反馈截图 '+record.slot}
      loading="lazy" decoding="async" referrerPolicy="no-referrer"
      sx={{mt:1,width:'100%',maxHeight:340,objectFit:'contain'}}
      onError={()=>{setUrl('');setError('图片加载失败，请重新获取授权。')}}/>:null}
    {error?<Alert severity="warning" sx={{my:1}}>{error}</Alert>:null}
    <Button size="small" sx={{mt:1}} disabled={loading} onClick={()=>void load()}>
      {loading?'正在验证访问权限…':url?'重新获取图片':'查看截图'}
    </Button>
  </Box>;
}

function FeedbackEditor({record}:{record:FeedbackRecord}){
  const [status,setStatus]=useState(record.status??'new');
  const [priority,setPriority]=useState(record.priority??'normal');
  const [assignedTo,setAssignedTo]=useState(String(record.assigned_to??''));
  const previousRecord=useRef({status:record.status??'new',priority:record.priority??'normal',
    assignedTo:String(record.assigned_to??'')});
  // External attention/assignment changes must not erase an unsaved reply.
  // Only rebase inputs the operator has not edited since the last record.
  useEffect(()=>{
    const old=previousRecord.current;
    const next={status:record.status??'new',priority:record.priority??'normal',
      assignedTo:String(record.assigned_to??'')};
    setStatus(value=>value===old.status?next.status:value);
    setPriority(value=>value===old.priority?next.priority:value);
    setAssignedTo(value=>value===old.assignedTo?next.assignedTo:value);
    previousRecord.current=next;
  },[record.status,record.priority,record.assigned_to,record.version]);
  const assignees=useGetList('admins',{
    pagination:{page:1,perPage:100},sort:{field:'created_at',order:'DESC'},
    filter:{active:true},
  });
  const assigneeIds=(assignees.data??[]).map(admin=>String(admin.user_id));
  const assigneeProfiles=useGetMany('users',{ids:assigneeIds},{enabled:assigneeIds.length>0});
  const assigneeEmails=new Map((assigneeProfiles.data??[]).map(profile=>
    [String(profile.id),String(profile.email??'')]));
  const [note,setNote]=useState('');
  const [publicReply,setPublicReply]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const refresh=useRefresh();
  const notify=useNotify();
  const save=async()=>{
    setBusy(true);setError('');
    try{
      await callRpc('admin_update_feedback',{
        p_feedback_id:record.id,p_expected_version:record.version,
        p_status:status,p_priority:priority,
        p_internal_note:note.trim()||null,p_public_reply:publicReply.trim()||null,
      });
      notify('反馈处理已保存',{type:'success'});
      setNote('');setPublicReply('');
      refresh();
    }catch(e){
      const statusCode=(e as {status?:number}).status;
      setError(statusCode===409?'反馈已被更新，请刷新页面后核对最新内容。':
        (e instanceof Error?e.message:'保存失败，请重试。'));
    }finally{setBusy(false)}
  };
  // Assignment is its own versioned transaction. It must not partially apply
  // together with a status/reply update when one part fails.
  const assign=async()=>{
    setBusy(true);setError('');
    try{
      await callRpc('admin_assign_feedback',{
        p_feedback_id:record.id,p_expected_version:record.version,
        p_assigned_to:assignedTo||null,
      });
      notify('处理负责人已更新',{type:'success'});
      refresh();
    }catch(e){
      setError((e as {status?:number}).status===409?
        '记录版本已变化，请先刷新再重新指派。':
        e instanceof Error?e.message:'指派失败');
    }finally{setBusy(false)}
  };
  const changed=status!==record.status||priority!==record.priority||!!note.trim()||!!publicReply.trim();
  const allowedNext=allowedStatusTransitions[record.status??'new']??[];
  const invalidTransition=status!==record.status&&!allowedNext.includes(status);
  const needsQuestion=status==='waiting_user'&&status!==record.status&&!publicReply.trim();
  return <Card variant="outlined" sx={{p:{xs:2,md:3}}}>
    <Typography component="h2" variant="h6" sx={{mb:2}}>处理反馈</Typography>
    <Stack direction={{xs:'column',sm:'row'}} spacing={2}>
      <TextField select size="small" label="处理状态" value={status}
        onChange={e=>setStatus(e.target.value)} sx={{flex:1}}>
        {Object.entries(statusLabels).filter(([key])=>key===record.status||
          allowedNext.includes(key)||key===status).map(([key,label])=>
          <MenuItem key={key} value={key}>{label}</MenuItem>)}
      </TextField>
      <TextField select size="small" label="优先级" value={priority}
        onChange={e=>setPriority(e.target.value)} sx={{flex:1}}>
        {Object.entries(priorityLabels).map(([key,label])=><MenuItem key={key} value={key}>{label}</MenuItem>)}
      </TextField>
    </Stack>
    <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1}}>
      仅列出当前状态允许的下一步；状态流转仍由服务端最终校验。
    </Typography>
    <Stack spacing={2} sx={{mt:2}}>
      <Stack direction={{xs:'column',sm:'row'}} spacing={1.5} sx={{alignItems:{sm:'center'}}}>
        <TextField select size="small" label="处理负责人" value={assignedTo}
          onChange={e=>setAssignedTo(e.target.value)} disabled={assignees.isPending||assignees.isError}
          sx={{flex:1,minWidth:0}}>
          <MenuItem value="">暂不分配</MenuItem>
          {(assignees.data??[]).map(admin=><MenuItem key={admin.id} value={String(admin.user_id)}>
            <Stack sx={{minWidth:0,py:.25}}>
              <Typography variant="body2" sx={{fontWeight:600,overflowWrap:'anywhere'}}>
                {assigneeEmails.get(String(admin.user_id))||'管理员'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {String(admin.user_id).slice(0,8)}…
              </Typography>
            </Stack>
          </MenuItem>)}
        </TextField>
        <Button variant="outlined" disabled={busy||changed||assignees.isPending||assignees.isError||
          assignedTo===String(record.assigned_to??'')} onClick={()=>void assign()}>
          更新负责人
        </Button>
      </Stack>
      {changed&&assignedTo!==String(record.assigned_to??'')&&
        <Typography variant="caption" color="text.secondary">请先保存处理内容，再更新负责人，以免丢失未保存的编辑。</Typography>}
      {assignees.isError?<Alert severity="warning">管理员名单无法读取，暂不能分配负责人。</Alert>:null}
      <TextField label="内部备注（仅管理员可见）" multiline minRows={2} value={note}
        onChange={e=>setNote(e.target.value)} slotProps={{htmlInput:{maxLength:5000}}}/>
      <TextField label="回复用户（提交者可见）" multiline minRows={2} value={publicReply}
        onChange={e=>setPublicReply(e.target.value)} slotProps={{htmlInput:{maxLength:5000}}}
        error={needsQuestion}
        helperText={needsQuestion?'进入「待用户补充」前，请先填写要向用户询问的问题。':
          '待用户补充需公开问题；标记已解决需已有或新增公开处理结论。'}/>
      {invalidTransition?<Alert severity="warning">
        反馈状态已变化，当前草稿状态不再是合法下一步。请重新选择处理状态。
      </Alert>:null}
      {error?<Alert severity="error" action={<Button onClick={()=>refresh()}>刷新记录</Button>}>{error}</Alert>:null}
      <Box><Button variant="contained" disabled={!changed||busy||invalidTransition||needsQuestion} onClick={()=>void save()}>
        {busy?'正在保存…':'保存处理结果'}
      </Button></Box>
    </Stack>
  </Card>;
}

function FeedbackEventsTimeline(){
  const {data, isPending, error}=useListContext<EventRecord>();
  if(isPending)return <CircularProgress size={24}/>;
  if(error)return <Alert severity="error">处理历史读取失败，请重试。</Alert>;
  if(!data?.length)return <Typography variant="body2" color="text.secondary">暂无处理记录</Typography>;
  return <Box component="ol" sx={{m:0,p:0,listStyle:'none'}}>
    {data.map((event,index)=><Box component="li" key={event.id}
      sx={{pl:3.5,ml:1,position:'relative',
        borderLeft:index===data.length-1?'2px solid transparent':'2px solid',
        borderColor:'divider',pb:index===data.length-1?0:2.5,
        '&::before':{content:'""',position:'absolute',left:-6,top:5,width:10,height:10,
          borderRadius:'50%',bgcolor:event.visibility==='public'?'primary.main':'text.disabled',
          boxShadow:'0 0 0 4px white'}}}>
      <Stack direction="row" sx={{justifyContent:'space-between',gap:1,flexWrap:'wrap',alignItems:'center'}}>
        <Typography sx={{fontWeight:700}}>{event.event_type==='internal_note'?'内部备注':
          event.event_type==='public_reply'?'回复用户':
          event.event_type==='user_reply'?'用户补充':
          event.event_type==='status_changed'?'状态变更':
          event.event_type==='priority_changed'?'优先级调整':
          event.event_type==='triaged'?'已分诊':
          event.event_type==='archived'?'已归档':
          event.event_type==='restored'?'已恢复':
          event.event_type==='soft_deleted'?'已移入回收站':
          event.event_type==='star_changed'?'星标变更':
          event.event_type==='tags_changed'?'标签变更':'反馈提交'}</Typography>
        <Typography variant="caption" color="text.secondary">
          {new Date(event.created_at).toLocaleString('zh-CN')}
        </Typography>
      </Stack>
      {event.message?<Typography sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',mt:.75}}>
        {event.message}
      </Typography>:null}
      {event.from_status!==event.to_status&&event.to_status?
        <Typography variant="body2" color="text.secondary" sx={{mt:.5}}>
          {statusLabels[event.from_status??'']??event.from_status??'—'} → {statusLabels[event.to_status]??event.to_status}
        </Typography>:null}
      <Typography variant="caption" color="text.secondary">
        {event.visibility==='public'?'用户可见':'仅管理员可见'}
      </Typography>
    </Box>)}
  </Box>;
}

function FeedbackBody(){
  const record=useRecordContext<FeedbackRecord>();
  const refresh=useRefresh();
  const readAttempted=useRef<string|null>(null);
  useEffect(()=>{
    if(!record||record.queue_state!=='inbox'||record.read_at||readAttempted.current===record.id)return;
    readAttempted.current=record.id;
    void callRpc('admin_screen_feedback',{
      p_feedback_id:record.id,p_expected_version:record.version,p_action:'read',p_priority:null,
    }).then(()=>refresh()).catch(()=>{readAttempted.current=null});
  },[record,refresh]);
  const attachments=useGetList<ImageRecord>('feedback-attachments',{
    pagination:{page:1,perPage:2},sort:{field:'slot',order:'ASC'},
    filter:{feedback_id:record?.id},
  },{enabled:!!record?.id});
  const submitter=useGetMany('users',{ids:record?[record.user_id]:[]},{enabled:!!record?.user_id});
  if(!record)return <CircularProgress aria-label="正在加载反馈"/>;
  return <Box sx={{maxWidth:1460,mx:'auto',minWidth:0,pb:5}}>
    <Button component={RouterLink} startIcon={<ArrowBackRoundedIcon/>}
      to={record.queue_state==='workbench'?'/feedback/workbench':'/feedback'}
      size="small" sx={{mb:1,px:0}}>
      返回{record.queue_state==='workbench'?'处理工作台':'收件箱'}
    </Button>
    <FeedbackQueueTabs active={record.queue_state==='workbench'?'workbench':'inbox'}/>
    <Stack spacing={1.3} sx={{mb:3,minWidth:0}}>
      <Stack direction="row" spacing={1.5} sx={{alignItems:'center',flexWrap:'wrap',gap:1.5}}>
        <Typography component="h1" variant="h4">反馈 #{record.feedback_no}</Typography>
        {record.queue_state==='workbench'?<FeedbackStatus status={record.status}/>:
          <Chip variant="outlined" label={record.queue_state==='archived'?'已归档':
            record.queue_state==='trashed'?'回收站':'待筛选'}/>}
        {record.priority&&<Chip size="small" variant="outlined"
          color={record.priority==='urgent'?'error':record.priority==='high'?'warning':'default'}
          sx={{color:record.priority==='urgent'?'error.dark':
            record.priority==='high'?'warning.dark':undefined}}
          label={'优先级 · '+(priorityLabels[record.priority]??record.priority)}/>}
      </Stack>
      <Stack direction="row" spacing={1.5}
        sx={{color:'text.secondary',fontSize:13,alignItems:'center',flexWrap:'wrap',gap:1.5}}>
        <Typography variant="body2">{categoryLabels[record.category]??record.category}</Typography>
        <Box sx={{display:'inline-flex',alignItems:'center',gap:.5}}>
          <Typography variant="body2" color="text.secondary">产品</Typography>
          <ReferenceField source="product_id" reference="products" link="show" emptyText="—">
            <RaTextField source="name"/>
          </ReferenceField>
        </Box>
        <Tooltip title={'提交用户 ID：'+record.user_id}>
          <Typography component={RouterLink} to={'/users/'+record.user_id+'/show'} variant="body2"
            sx={{color:'primary.main',overflowWrap:'anywhere',textDecoration:'none',
              '&:hover':{textDecoration:'underline'}}}>
            用户 {String(submitter.data?.[0]?.email??'')||record.user_id.slice(0,8)+'…'}
          </Typography>
        </Tooltip>
        <Typography variant="body2" color="text.secondary">
          创建于 {new Date(record.created_at).toLocaleString('zh-CN')}
        </Typography>
      </Stack>
    </Stack>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',lg:'minmax(0,1.65fr) minmax(340px,1fr)'},
      gap:{xs:2,lg:2.5},alignItems:'start'}}>
      <Stack spacing={2} sx={{minWidth:0}}>
        <Card variant="outlined" sx={{p:{xs:2,md:3}}}>
          <Typography component="h2" variant="h6" sx={{mb:2}}>反馈内容</Typography>
          <Typography sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.85}}>
            {record.content}
          </Typography>
        </Card>
        <Card variant="outlined" sx={{p:{xs:2,md:3}}}>
          <Stack direction="row" spacing={1} sx={{mb:2,alignItems:'center'}}>
            <ImageOutlinedIcon sx={{color:'text.secondary',fontSize:19}} aria-hidden/>
            <Typography component="h2" variant="h6">附件</Typography>
            <Chip size="small" label={record.attachment_count??0}/>
          </Stack>
          {attachments.isPending?<CircularProgress size={24}/>:attachments.isError?
            <Alert severity="error">图片信息读取失败，请重试。</Alert>:
            !attachments.data?.length?<Typography variant="body2" color="text.secondary">没有附加图片</Typography>:
            <Stack direction="row" sx={{flexWrap:'wrap',gap:2}}>
              {attachments.data.map(item=><FeedbackPicture key={item.id} record={item}/>)}
            </Stack>}
        </Card>
      </Stack>
      <Stack spacing={2} sx={{minWidth:0}}>
        {record.queue_state==='workbench'?<>
          <FeedbackEditor key={record.id} record={record}/>
          <FeedbackAttention key={record.id} record={record}/>
        </>:<FeedbackScreening key={record.id+':screen:'+record.version} record={record}/>}
      </Stack>
    </Box>
    <Card variant="outlined" sx={{p:{xs:2,md:3},mt:{xs:2,md:2.5}}}>
      <Typography component="h2" variant="h6" sx={{mb:2}}>处理历史</Typography>
      <ReferenceManyField reference="feedback-events" target="feedback_id" perPage={20}
        sort={{field:'created_at',order:'DESC'}}
        pagination={<Pagination rowsPerPageOptions={[20]}/>} empty={<FeedbackEventsTimeline/>}>
        <FeedbackEventsTimeline/>
      </ReferenceManyField>
    </Card>
  </Box>;
}
export function FeedbackShow(){
  return <Box sx={{px:{xs:2,md:3,lg:4},pt:{xs:2,md:3},minWidth:0}}>
    <Show resource="feedback" actions={false} component="div"
      sx={{'& .RaShow-main':{mt:0},'& .RaShow-card':{border:0,boxShadow:'none',bgcolor:'transparent'}}}>
      <FeedbackBody/>
    </Show>
  </Box>;
}
