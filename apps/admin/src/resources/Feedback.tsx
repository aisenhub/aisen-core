import { useEffect, useRef, useState } from 'react';
import {
  Pagination, ReferenceManyField, Show,
  useGetList, useGetMany, useListContext, useRecordContext, useRefresh,
} from 'react-admin';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Skeleton,
  Stack, Tooltip, Typography,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { callRpc } from '../data/dataProvider';
import { supabase } from '../supabaseClient';
import {
  FeedbackQueueTabs,
} from './FeedbackV2';
import { categoryLabels, priorityLabels, statusLabels } from './feedbackLabels';
import { FeedbackV3Editor } from './FeedbackV3Editor';
import {useFeedbackTags} from './useFeedbackTags';
import { formatAdminInstant } from '../dateDisplay';

type FeedbackRecord={
  id:string;feedback_no:number;product_id:string;user_id:string;
  content:string;category:string;status:string|null;priority:string|null;
  queue_state:'inbox'|'workbench'|'archived'|'trashed';read_at?:string|null;
  triaged_at?:string|null;is_starred:boolean;tags:string[];
  assigned_to?:string|null;version:number;
  created_at:string;updated_at:string;
  attachment_count?:number;
  last_handled_by?:string|null;
};
type EventRecord={id:string;event_type:string;visibility:string;from_status?:string;
  to_status?:string;message?:string;created_at:string};
type ImageRecord={id:string;slot:number;mime_type:string;size_bytes:number};

function FeedbackPicture({record}:{record:ImageRecord}){
  const [url,setUrl]=useState('');
  const [loading,setLoading]=useState(false);
  const [open,setOpen]=useState(false);
  const [error,setError]=useState('');
  const load=async()=>{
    setLoading(true);setError('');
    try{
      const result=await supabase.functions.invoke<{url:string}>('feedback-image-access',{
        body:{attachment_id:record.id},
      });
      if(result.error||!result.data?.url)throw new Error('图片授权失败');
      setUrl(result.data.url);setOpen(true);
    }catch{setError('图片暂时无法查看，请重试。')}
    finally{setLoading(false)}
  };
  return <Box sx={{minWidth:0,flex:'1 1 150px',maxWidth:290}}>
    <Button fullWidth variant="outlined" onClick={()=>void load()} disabled={loading}
      sx={{display:'flex',flexDirection:'column',gap:.5,p:1,height:165,
        borderRadius:2,alignItems:'center',justifyContent:'center'}}>
      <Skeleton variant="rounded" animation={loading?'wave':false}
        sx={{height:95,width:'100%',maxWidth:175,bgcolor:'action.hover'}}/>
      <Typography variant="caption" sx={{textTransform:'none'}}>
        {loading?'加载原图授权…':'图片 '+record.slot+' · 点击查看高清'}
      </Typography>
    </Button>
    {error&&<Alert severity="warning" sx={{mt:1}}>{error}</Alert>}
    <Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="lg"
      aria-label={'反馈图片 '+record.slot+' 高清预览'}>
      <DialogTitle>图片 {record.slot} · 高清预览</DialogTitle>
      <DialogContent dividers sx={{bgcolor:'grey.900',textAlign:'center'}}>
        {url&&<Box component="img" src={url} alt={'反馈图片 '+record.slot+' 原图'}
          referrerPolicy="no-referrer" decoding="async"
          sx={{maxWidth:'100%',maxHeight:'78vh',objectFit:'contain'}}
          onError={()=>{setUrl('');setError('图片加载失败，请重新获取授权。');setOpen(false)}}/>}
      </DialogContent>
      <DialogActions><Button onClick={()=>setOpen(false)}>关闭</Button></DialogActions>
    </Dialog>
  </Box>;
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
          {formatAdminInstant(event.created_at)}
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

function FeedbackHistoryDialog({open,onClose}:{open:boolean;onClose:()=>void}){
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md"
    aria-labelledby="feedback-history-title">
    <DialogTitle id="feedback-history-title">处理历史</DialogTitle>
    <DialogContent dividers tabIndex={0} aria-label="可滚动的反馈处理历史" sx={{py:3}}>
      {open&&<ReferenceManyField reference="feedback-events" target="feedback_id" perPage={20}
        sort={{field:'created_at',order:'DESC'}}
        pagination={<Pagination rowsPerPageOptions={[20]}/>} empty={<FeedbackEventsTimeline/>}>
        <FeedbackEventsTimeline/>
      </ReferenceManyField>}
    </DialogContent>
    <DialogActions><Button onClick={onClose}>关闭</Button></DialogActions>
  </Dialog>;
}

function FeedbackBody(){
  const record=useRecordContext<FeedbackRecord>();
  const refresh=useRefresh();
  const readAttempted=useRef<string|null>(null);
  const [historyOpen,setHistoryOpen]=useState(false);
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
  const handler=useGetMany('users',{ids:record?.last_handled_by?[record.last_handled_by]:[]},
    {enabled:!!record?.last_handled_by});
  const {tags:tagOptions}=useFeedbackTags(record?.product_id);
  if(!record)return <CircularProgress aria-label="正在加载反馈"/>;
  return <Box sx={{width:'100%',maxWidth:1720,mx:'auto',minWidth:0,pb:5}}>
    <Stack direction="row" sx={{justifyContent:'space-between',alignItems:'center',
      gap:1,flexWrap:'wrap',mb:1}}>
      <Button component={RouterLink} startIcon={<ArrowBackRoundedIcon/>}
        to={record.queue_state==='workbench'?'/feedback/workbench':record.queue_state==='archived'?
          '/feedback/archived':record.queue_state==='trashed'?'/feedback/trash':'/feedback'}
        size="small" sx={{px:0}}>
        返回列表
      </Button>
      <Stack direction="row" sx={{gap:1,flexWrap:'wrap'}}>
        <Button variant="outlined" size="small" startIcon={<HistoryOutlinedIcon/>}
          onClick={()=>setHistoryOpen(true)}>处理历史</Button>
      </Stack>
    </Stack>
    <FeedbackQueueTabs active={record.queue_state}/>
    <Stack spacing={1.2} sx={{mb:2.5,minWidth:0}}>
      <Stack direction="row" spacing={1.5} sx={{alignItems:'center',flexWrap:'wrap',gap:1.5}}>
        <Typography component="h1" sx={{fontSize:{xs:22,md:26},fontWeight:740,lineHeight:1.3}}>
          反馈 #{record.feedback_no}
        </Typography>
        {record.priority&&<Chip size="small" variant="outlined"
          color={record.priority==='urgent'?'error':record.priority==='high'?'warning':'default'}
          sx={{color:record.priority==='urgent'?'error.dark':
            record.priority==='high'?'warning.dark':undefined}}
          label={'优先级 · '+(priorityLabels[record.priority]??record.priority)}/>}
      </Stack>
      <Stack direction="row" spacing={1.5}
        sx={{color:'text.secondary',fontSize:13,alignItems:'center',flexWrap:'wrap',gap:1.5}}>
        <Typography variant="body2">{categoryLabels[record.category]??record.category}</Typography>
        <Tooltip title={'提交用户 ID：'+record.user_id}>
          <Typography component={RouterLink} to={'/users/'+record.user_id+'/show'} variant="body2"
            sx={{color:'primary.main',overflowWrap:'anywhere',textDecoration:'none',
              '&:hover':{textDecoration:'underline'}}}>
            用户 {String(submitter.data?.[0]?.email??'')||record.user_id.slice(0,8)+'…'}
          </Typography>
        </Tooltip>
        <Typography variant="body2" color="text.secondary">
          创建于 {formatAdminInstant(record.created_at)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          最近处理人 {record.last_handled_by?
            String(handler.data?.[0]?.email??record.last_handled_by.slice(0,8)+'…'):
            '尚未处理'}
        </Typography>
      </Stack>
    </Stack>
    <Card variant="outlined" sx={{p:{xs:2,md:3},mb:2.5,width:'100%',minWidth:0}}>
      <Box sx={{display:'grid',gridTemplateColumns:(record.attachment_count??0)>0?
          {xs:'minmax(0,1fr)',md:'minmax(250px,2fr) minmax(0,3fr)'}:'minmax(0,1fr)',
        gap:{xs:2,md:3},minHeight:130}}>
        {(record.attachment_count??0)>0&&<Box sx={{minWidth:0}}>
          <Stack direction="row" spacing={1} sx={{mb:1.5,alignItems:'center'}}>
            <ImageOutlinedIcon sx={{color:'text.secondary',fontSize:18}} aria-hidden/>
            <Typography variant="subtitle2">图片</Typography>
            <Chip size="small" label={record.attachment_count??0}/>
          </Stack>
          {attachments.isPending?<Stack direction="row" spacing={1}>
            <Skeleton variant="rounded" width={165} height={165}/>
            {(record.attachment_count??0)>1&&<Skeleton variant="rounded" width={165} height={165}/>}
          </Stack>:attachments.isError?
            <Alert severity="error" role="alert">图片信息读取失败，未能确认附件是否完整。
              <Button size="small" onClick={()=>void attachments.refetch()}>重试读取图片</Button>
            </Alert>:
            <Stack direction="row" sx={{flexWrap:'wrap',gap:2}}>
              {attachments.data?.map(item=><FeedbackPicture key={item.id} record={item}/>)}
            </Stack>}
        </Box>}
        <Box sx={{minWidth:0}}>
          <Typography component="h2" variant="h6" sx={{mb:1.5}}>反馈内容</Typography>
          <Typography sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.8}}>
            {record.content}
          </Typography>
        </Box>
      </Box>
    </Card>
    <FeedbackV3Editor key={record.id} record={record} tagOptions={tagOptions}/>
    <FeedbackHistoryDialog open={historyOpen} onClose={()=>setHistoryOpen(false)}/>
  </Box>;
}
export function FeedbackShow(){
  return <Box sx={{px:{xs:2,md:3,lg:4.5},pt:{xs:2,lg:2.5},
    minWidth:0,width:'100%',boxSizing:'border-box'}}>
    <Show resource="feedback" actions={false} component="div"
      sx={{'& .RaShow-main':{mt:0},'& .RaShow-card':{border:0,boxShadow:'none',bgcolor:'transparent'}}}>
      <FeedbackBody/>
    </Show>
  </Box>;
}
