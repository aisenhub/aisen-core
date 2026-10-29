import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Datagrid, FunctionField, ListBase, Pagination as RaPagination, ReferenceField, TextField as RaTextField, useGetList, useGetMany, useNotify, useRefresh, useStore, useUnselectAll, useListContext } from 'react-admin';
import { Alert, Box, Button, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Menu, MenuItem, Pagination, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { callRpc } from '../data/dataProvider';
import { supabase } from '../supabaseClient';
import { FeedbackPendingDeletes } from './FeedbackPendingDeletes';
import { FeedbackExport } from './FeedbackExport';
import { categoryLabels, priorityLabels } from './feedbackLabels';
import { formatAdminInstant } from '../dateDisplay';
import { adminRadii } from '../theme';

export type FeedbackV2Record={
  id:string;feedback_no:number;product_id:string;user_id:string;content:string;
  category:string;queue_state:'inbox'|'workbench'|'archived';
  read_at?:string|null;priority:string|null;status:string|null;is_starred:boolean;
  tags:string[];version:number;created_at:string;updated_at:string;
  attachment_count?:number;assigned_to?:string|null;
  last_handled_by?:string|null;
};

export type FeedbackQueue='inbox'|'workbench'|'archived';
type FeedbackView=FeedbackQueue|'all';
const validUuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const queueNames:Record<FeedbackQueue,string>={
  inbox:'收件箱',workbench:'处理工作台',archived:'已归档',
};
export function FeedbackQueueTabs({active}:{active:FeedbackQueue}){
  return <Tabs value={active} aria-label="反馈业务视图"
    sx={{minHeight:44,mb:2,borderBottom:1,borderColor:'divider',
      '& .MuiTab-root':{minHeight:44,px:{xs:1.5,sm:2.5},mr:1,fontWeight:600}}}>
    <Tab component={RouterLink} to="/feedback" value="inbox" label="收件箱"
      icon={<InboxOutlinedIcon fontSize="small"/>} iconPosition="start"/>
    <Tab component={RouterLink} to="/feedback/workbench" value="workbench" label="处理工作台"
      icon={<TaskAltOutlinedIcon fontSize="small"/>} iconPosition="start"/>
    <Tab component={RouterLink} to="/feedback/archived" value="archived" label="已归档"
      icon={<ArchiveOutlinedIcon fontSize="small"/>} iconPosition="start"/>
  </Tabs>;
}
function getFeedbackPreview(content:string){
  // Keep the full preview text: the browser ellipsizes at the actual column
  // width. Never impose a character-count limit on the list itself.
  return content.replace(/\s+/g,' ').trim()||'（无正文）';
}
function FeedbackSummary({item,queue}:{item:FeedbackV2Record;queue:FeedbackQueue}) {
  const [product]=useStore<string>('aisencore.current.product','');
  const preview=getFeedbackPreview(item.content);
  const unread=queue==='inbox'&&!item.read_at;
  return <Box sx={{minWidth:0,py:.15}}>
    <Stack direction="row" useFlexGap sx={{gap:.9,alignItems:'center',mb:.55,
      flexWrap:'wrap'}}>
      <Typography component="span" sx={{fontSize:12.5,fontWeight:500,
        fontVariantNumeric:'tabular-nums',color:'text.secondary'}}>#{item.feedback_no}</Typography>
      {unread&&<Box component="span" role="img" aria-label="未读" title="未读"
        sx={{width:7,height:7,borderRadius:adminRadii.circle,
          bgcolor:'primary.main',flexShrink:0}}/>}
      <Box component="span" sx={{border:'1px solid',borderColor:'divider',
        borderRadius:adminRadii.small,px:.75,py:.12,fontSize:11.5,
        color:'text.secondary',lineHeight:1.6}}>
        {categoryLabels[item.category]??item.category}
      </Box>
      {item.is_starred&&<StarRoundedIcon aria-label="已星标"
        sx={{fontSize:14,color:'warning.main'}}/>}
      {(item.attachment_count??0)>0&&<Stack direction="row" spacing={.2}
        sx={{alignItems:'center',color:'text.secondary'}}>
        <AttachFileRoundedIcon sx={{fontSize:12}} aria-hidden/>
        <Typography sx={{fontSize:11.5}}>{item.attachment_count}</Typography>
      </Stack>}
      {item.priority&&<Box component="span" sx={{ml:'auto',
        display:{xs:'inline',md:'none'},fontSize:11.5,color:'text.secondary'}}>
        {priorityLabels[item.priority]??item.priority}
      </Box>}
    </Stack>
    <Typography component="div" sx={{fontSize:15,
      fontWeight:500,lineHeight:1.45,color:'text.primary',minWidth:0,
      display:'block',width:'100%',maxWidth:'100%',
      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
      {preview}
    </Typography>
    {!product&&<Box sx={{mt:.45,'@media (min-width:1101px)':{display:'none'},
      fontSize:12,color:'text.secondary'}}>
      <Typography component="span" sx={{fontSize:12,color:'text.secondary'}}>所属产品： </Typography>
      <ReferenceField source="product_id" reference="products" link={false} emptyText="—">
        <RaTextField source="name" sx={{fontSize:12,color:'text.secondary'}}/>
      </ReferenceField>
    </Box>}
  </Box>;
}
function FeedbackPriority({item}:{item:FeedbackV2Record}){
  const value=item.priority??'';
  const color=value==='urgent'?'error.main':value==='high'?'warning.dark':'text.secondary';
  return <Typography component="span" sx={{fontSize:13,color,fontWeight:400}}>
    {priorityLabels[value]??'—'}
  </Typography>;
}
function FeedbackTime({value}:{value:string}){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return <Typography color="text.secondary">—</Typography>;
  const day=new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit'}).format(date);
  const time=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',
    hourCycle:'h23'}).format(date);
  return <Box title={formatAdminInstant(value)} sx={{fontVariantNumeric:'tabular-nums'}}>
    <Typography sx={{fontSize:13,color:'text.secondary',lineHeight:1.45}}>{day}</Typography>
    <Typography sx={{fontSize:12,color:'text.secondary',lineHeight:1.45}}>{time}</Typography>
  </Box>;
}
function FeedbackSelectionToolbar({queue,onDeleted}:{queue:FeedbackQueue;onDeleted:()=>void}){
  const {data,selectedIds,onSelect,isPending,isFetching}=useListContext<FeedbackV2Record>();
  const [product]=useStore<string>('aisencore.current.product','');
  const refresh=useRefresh(),notify=useNotify();
  const [confirm,setConfirm]=useState<{scope:string;rows:FeedbackV2Record[];kind:'move'|'delete'}|null>(null);
  const [busy,setBusy]=useState(false),[outcome,setOutcome]=useState('');
  const selected=new Set(selectedIds.map(String));
  const rows=(data??[]).filter(item=>selected.has(String(item.id)));
  const valid=selectedIds.length>0&&selectedIds.length<=20&&rows.length===selectedIds.length&&
    rows.every(item=>item.queue_state===queue&&(!product||item.product_id===product));
  const scope=JSON.stringify({queue,product,selected:[...selected].sort(),ids:rows.map(x=>x.id)});
  const action=queue==='inbox'?'triage':queue==='workbench'?'archive':queue==='archived'?'reopen':null;
  const label=queue==='inbox'?'移至处理工作台':queue==='workbench'?'归档':'重新处理';
  const execute=async()=>{
    if(!confirm||confirm.scope!==scope||!valid||busy||
      (confirm.kind==='move'&&!action))return;
    setBusy(true);setOutcome('');
    let complete=0,uncertain=false;
    const remaining=new Set(confirm.rows.map(item=>item.id)),failed:string[]=[];
    for(const item of confirm.rows){
      try{
        if(confirm.kind==='delete'){
          const result=await supabase.functions.invoke<{deleted:boolean}>('feedback-delete',{
            body:{feedback_id:item.id,expected_version:item.version,product_id:product||null},
          });
          if(result.error||result.data?.deleted!==true)throw result.error??new Error('未确认删除结果');
        }else{
          await callRpc('admin_feedback_v3',{
            p_feedback_id:item.id,p_expected_version:item.version,p_action:action,
            p_priority:action==='triage'?(item.priority??'normal'):null,
            p_tags:null,p_is_starred:null,p_internal_note:null,
          });
        }
        remaining.delete(item.id);complete++;
      }catch(e){
        failed.push('#'+item.feedback_no);
        const status=(e as {status?:number;context?:{status?:number}}).status??
          (e as {context?:{status?:number}}).context?.status;
        if(confirm.kind==='delete'||status===401||status===403||!status||status>=500){
          uncertain=!status||status>=500;break;
        }
      }
    }
    onSelect([...remaining]);
    refresh();setBusy(false);setConfirm(null);
    if(confirm.kind==='delete')onDeleted();
    const summary='已完成 '+complete+' 条'+(remaining.size?'，仍有 '+remaining.size+' 条待核对':'')+
      (uncertain?'。服务端结果可能未确认，请核对后再操作':'')+
      (failed.length?'（'+failed.join('、')+'）':'');
    setOutcome(summary);notify(summary,{type:remaining.size?'warning':'success'});
  };
  if(!selectedIds.length&&!outcome)return null;
  return <Box sx={{mb:1.5}}>
    <Stack direction="row" sx={{alignItems:'center',gap:1.5,flexWrap:'wrap'}}>
      {selectedIds.length>0&&<>
        <Typography variant="body2" sx={{fontWeight:500}}>已选 {selectedIds.length} 条</Typography>
        {action&&<Button size="small" variant="outlined" disabled={busy||isPending||isFetching||!valid}
          onClick={()=>{setOutcome('');setConfirm({scope,rows:[...rows],kind:'move'})}}>批量{label}</Button>}
        <Button size="small" color="error" disabled={busy||isPending||isFetching||!valid}
          onClick={()=>{setOutcome('');setConfirm({scope,rows:[...rows],kind:'delete'})}}>批量永久删除</Button>
        <FeedbackExport queue={queue} mode="selected"/>
        {!valid&&<Typography variant="caption" color="warning.dark">
          仅可批量处理当前页、当前队列及所选产品内的最多 20 条反馈
        </Typography>}
      </>}
    </Stack>
    {outcome&&<Alert role="status" severity="info" sx={{mt:1}}>{outcome}</Alert>}
    <Dialog open={!!confirm} onClose={()=>!busy&&setConfirm(null)} fullWidth maxWidth="xs">
      <DialogTitle>{confirm?.kind==='delete'?'永久删除反馈？':'批量'+label}</DialogTitle>
      <DialogContent>
        <Typography>{confirm?.kind==='delete'?
          '确认彻底删除选中的 '+(confirm?.rows.length??0)+' 条反馈及其图片？此操作不可撤销。':
          '确认将选中的 '+(confirm?.rows.length??0)+' 条反馈'+label+'？'}</Typography>
        <Typography variant="caption" color="text.secondary">
          {confirm?.rows.map(item=>'#'+item.feedback_no).join('、')}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={()=>setConfirm(null)}>取消</Button>
        <Button variant="contained" color={confirm?.kind==='delete'?'error':'primary'}
          disabled={busy||confirm?.scope!==scope||!valid}
          onClick={()=>void execute()}>{busy?'正在处理…':'确认'}</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
function FeedbackPageSelection(){
  const {data,selectedIds,onSelect,isPending,isFetching}=useListContext<FeedbackV2Record>();
  const ids=(data??[]).map(item=>String(item.id));
  if(isPending||!ids.length)return null;
  const selected=new Set(selectedIds.map(String));
  const all=ids.every(id=>selected.has(id));
  const some=ids.some(id=>selected.has(id));
  return <Box sx={{mb:1,display:'flex',alignItems:'center',minHeight:30}}>
    <FormControlLabel sx={{m:0,'& .MuiFormControlLabel-label':{
      fontSize:12.5,color:'text.secondary'}}}
      label={'全选本页 · '+ids.length+' 条'}
      control={<Checkbox size="small" checked={all} indeterminate={!all&&some}
        disabled={isFetching} slotProps={{input:{'aria-label':'全选当前页反馈'}}}
        onChange={(_,checked)=>{
          const next=checked?[...selected,...ids]:[...selected].filter(id=>!ids.includes(id));
          onSelect([...new Set(next)]);
        }}/>}
    />
  </Box>;
}
function FeedbackRowSelection({item}:{item:FeedbackV2Record}){
  const {selectedIds,onSelect}=useListContext();
  const id=String(item.id);
  const checked=selectedIds.some(value=>String(value)===id);
  return <Checkbox size="small" checked={checked}
    slotProps={{input:{'aria-label':'选择反馈 #'+item.feedback_no}}}
    onClick={event=>event.stopPropagation()}
    onChange={(_,next)=>onSelect(next?[...selectedIds,id]:
      selectedIds.filter(value=>String(value)!==id))}/>;
}
type RowIntent={kind:'move'|'delete';scope:string};
function FeedbackRowActions({item,queue,onDeleted}:{item:FeedbackV2Record;
  queue:FeedbackQueue;onDeleted:()=>void}){
  const [product]=useStore<string>('aisencore.current.product','');
  const {isFetching}=useListContext();
  const location=useLocation(),navigate=useNavigate();
  const refresh=useRefresh(),notify=useNotify();
  const [anchor,setAnchor]=useState<HTMLElement|null>(null);
  const [intent,setIntent]=useState<RowIntent|null>(null);
  const [busy,setBusy]=useState(false);
  const action=queue==='inbox'?'triage':queue==='workbench'?'archive':'reopen';
  const actionLabel=queue==='inbox'?'移至处理工作台':
    queue==='workbench'?'归档':'重新处理';
  const scope=JSON.stringify([product,item.id,item.product_id,item.version,item.queue_state,queue]);
  const valid=item.queue_state===queue&&(!product||item.product_id===product);
  const detail='/feedback/'+encodeURIComponent(item.id)+'/show?returnTo='+
    encodeURIComponent(location.pathname+location.search);
  const choose=(kind:RowIntent['kind'])=>{
    setAnchor(null);setIntent({kind,scope});
  };
  const execute=async()=>{
    if(!intent||intent.scope!==scope||!valid||isFetching||busy)return;
    setBusy(true);
    try{
      if(intent.kind==='delete'){
        const result=await supabase.functions.invoke<{deleted:boolean}>('feedback-delete',{
          body:{feedback_id:item.id,expected_version:item.version,product_id:product||null},
        });
        if(result.error||result.data?.deleted!==true)
          throw result.error??new Error('删除结果尚未确认');
        notify('反馈 #'+item.feedback_no+' 已永久删除',{type:'success'});
        onDeleted();
      }else{
        await callRpc('admin_feedback_v3',{
          p_feedback_id:item.id,p_expected_version:item.version,p_action:action,
          p_priority:action==='triage'?(item.priority??'normal'):null,
          p_tags:null,p_is_starred:null,p_internal_note:null,
        });
        notify('反馈 #'+item.feedback_no+' 已'+actionLabel,{type:'success'});
      }
      refresh();
    }catch(error){
      notify(intent.kind==='delete'?
        '删除尚未确认完成，请刷新并核对待清理状态，不要重复操作。':
        error instanceof Error?error.message:'操作失败，请刷新核对反馈版本。',
        {type:'warning'});
      refresh();
      if(intent.kind==='delete')onDeleted();
    }finally{setBusy(false);setIntent(null)}
  };
  return <Box onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
    <IconButton size="small" aria-label={'反馈 #'+item.feedback_no+' 更多操作'}
      aria-haspopup="menu" aria-expanded={!!anchor}
      disabled={busy} onClick={event=>setAnchor(event.currentTarget)}>
      <MoreHorizRoundedIcon fontSize="small"/>
    </IconButton>
    <Menu anchorEl={anchor} open={!!anchor} onClose={()=>setAnchor(null)}
      slotProps={{paper:{sx:{minWidth:176}}}}>
      <MenuItem dense onClick={()=>{setAnchor(null);navigate(detail)}}>查看详情</MenuItem>
      <MenuItem dense disabled={!valid||isFetching} onClick={()=>choose('move')}>
        {actionLabel}
      </MenuItem>
      <MenuItem dense disabled={!valid||isFetching} sx={{color:'error.main'}}
        onClick={()=>choose('delete')}>永久删除</MenuItem>
    </Menu>
    <Dialog open={!!intent} fullWidth maxWidth="xs"
      onClose={()=>!busy&&setIntent(null)} onClick={event=>event.stopPropagation()}>
      <DialogTitle>{intent?.kind==='delete'?'永久删除反馈？':'确认'+actionLabel+'？'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{mb:1}}>反馈 #{item.feedback_no}</Typography>
        <Typography variant="body2" color="text.secondary">
          {intent?.kind==='delete'?
            '将彻底删除反馈正文、历史及私有图片和缩略图，无法恢复。':
            '确认将该反馈'+actionLabel+'？'}
        </Typography>
        {(intent?.scope!==scope||!valid)&&<Alert severity="warning" sx={{mt:1}}>
          反馈状态或所选产品已变化，请关闭后刷新再核对。
        </Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={()=>setIntent(null)}>取消</Button>
        <Button variant="contained" color={intent?.kind==='delete'?'error':'primary'}
          disabled={busy||isFetching||!valid||intent?.scope!==scope}
          onClick={()=>void execute()}>{busy?'正在处理…':'确认'}</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
function FeedbackDatagrid({children}:{children:ReactNode}){
  const location=useLocation();
  const {selectedIds}=useListContext();
  const source=location.pathname+location.search;
  // React-admin's implicit master checkbox renders an unlabeled input and
  // prohibited ARIA on the wrapping element in this table configuration.
  // Use explicitly labeled controlled selection via ListContext instead.
  return <Datagrid rowClick={(_,__,record)=>record?.id?
    '/feedback/'+record.id+'/show?returnTo='+encodeURIComponent(source):'show'}
    bulkActionButtons={false}
    rowSx={record=>selectedIds.some(id=>String(id)===String(record.id))?
      {backgroundColor:'action.selected'}:{}}
    sx={{
      tableLayout:'fixed',width:'100%',maxWidth:'100%',
      '& .RaDatagrid-table':{tableLayout:'fixed',width:'100%',maxWidth:'100%'},
      '& .MuiTableCell-root':{verticalAlign:'middle',px:{xs:1,sm:1.75},py:1.05},
      '& .MuiTableCell-head':{whiteSpace:'nowrap',fontSize:12.5,
        color:'text.secondary',fontWeight:500,py:1.2},
      '& .MuiTableRow-root.MuiTableRow-hover:hover':{backgroundColor:'action.hover'},
      '& .column-id':{width:54,textAlign:'center'},
      '& .column-feedback_no':{width:'auto',minWidth:0,maxWidth:'100%',overflow:'hidden'},
      '& .column-priority':{width:86},
      '& .column-product_id':{width:130,maxWidth:160,overflow:'hidden',
        '& .MuiTypography-root':{fontSize:13,overflow:'hidden',
          textOverflow:'ellipsis',whiteSpace:'nowrap'}},
      '& .column-created_at, & .column-updated_at':{width:112},
      '& .column-version':{width:64,textAlign:'center'},
      '@media (max-width:1100px)':{'& .column-product_id':{display:'none'}},
      '@media (max-width:700px)':{
        '& .column-priority, & .column-created_at, & .column-updated_at':{display:'none'},
        '& .MuiTableCell-root':{px:1,py:1},
        '& .column-id':{width:42},
        '& .column-version':{width:48},
      },
    }}>{children}</Datagrid>;
}
function FeedbackResults({children,queue,hasFilters}:{children:ReactNode;queue:FeedbackQueue;hasFilters:boolean}){
  const {data,isPending,error,refetch}=useListContext<FeedbackV2Record>();
  if(isPending)return <Stack role="status" direction="row"
    sx={{alignItems:'center',justifyContent:'center',gap:1.5,py:4}}>
    <CircularProgress size={20} aria-hidden/>
    <Typography variant="body2" color="text.secondary">正在读取反馈…</Typography>
  </Stack>;
  if(error)return <Alert severity="error" variant="outlined"
    action={<Button size="small" color="inherit" onClick={()=>void refetch()}>重试</Button>}>
    反馈读取失败，不能将结果视为空列表。
  </Alert>;
  if(!data?.length)return <Box role="status" sx={{py:{xs:4,sm:5},px:2,textAlign:'center'}}>
    <Typography sx={{fontWeight:650}}>
      {hasFilters?'没有符合条件的反馈':queue==='inbox'?'收件箱暂无反馈':
        queue==='workbench'?'处理工作台暂无反馈':'暂无已归档反馈'}
    </Typography>
    {hasFilters&&<Typography color="text.secondary" variant="body2" sx={{mt:.5}}>
      可以调整筛选条件后重新查看。
    </Typography>}
  </Box>;
  return <Box sx={{border:1,borderColor:'divider',borderRadius:adminRadii.card,
    overflow:'hidden',minWidth:0,display:'flex',flexDirection:'column',
    flex:'1 1 auto',minHeight:0}}>{children}</Box>;
}
function FeedbackListPagination(){
  const {total,isPending,error}=useListContext();
  if(isPending||error||(total??0)<=20)return null;
  return <Box sx={{display:'flex',justifyContent:'flex-end',mt:1.5}}>
    <RaPagination rowsPerPageOptions={[20]}/>
  </Box>;
}
function Queue({queue}:{queue:FeedbackQueue}){
  const [product]=useStore<string>('aisencore.current.product','');
  const active=queue==='workbench';
  const viewQueue=queue;
  const unselectAll=useUnselectAll('feedback');
  const [pendingRevision,setPendingRevision]=useState(0);
  const [params,setParams]=useSearchParams();
  const category=Object.hasOwn(categoryLabels,params.get('category')??'')?params.get('category')??'':'';
  const priority=Object.hasOwn(priorityLabels,params.get('priority')??'')?params.get('priority')??'':'';
  const starFilter=['true','false'].includes(params.get('star')??'')?params.get('star')??'':'';
  const feedbackNo=/^[1-9]\d{0,17}$/.test(params.get('no')??'')?params.get('no')??'':'';
  const [draftState,setDraftState]=useState({forNo:feedbackNo,value:feedbackNo});
  const draftNo=draftState.forNo===feedbackNo?draftState.value:feedbackNo;
  const setDraftNo=(value:string)=>setDraftState({forNo:feedbackNo,value});
  const invalidNo=!!draftNo.trim()&&!/^[1-9]\d{0,17}$/.test(draftNo.trim());
  const setFilter=(name:string,value:string)=>setParams(previous=>{
    const next=new URLSearchParams(previous);
    if(value)next.set(name,value);else next.delete(name);
    next.delete('page');return next;
  },{replace:true});
  // Selection is always cleared when the product, queue or category changes.
  // React-admin keeps bulk selections per resource rather than per queue.
  // Never carry selections into a different product or workflow stage.
  useEffect(()=>{unselectAll()},[viewQueue,product,category,priority,starFilter,feedbackNo,unselectAll]);
  return <Box className="aisen-admin-list-page" sx={{px:{xs:2,md:3,lg:4.5},pt:{xs:2,lg:2.5},pb:{xs:6,md:2},
    width:'100%',maxWidth:1720,mx:'auto',minWidth:0,boxSizing:'border-box'}}>
    <Typography component="h1" sx={{fontSize:{xs:22,md:26},fontWeight:740,mb:1.5}}>
      {queueNames[queue]}
    </Typography>
    <FeedbackQueueTabs active={queue}/>
    {queue==='inbox'&&<FeedbackPendingDeletes reloadKey={pendingRevision}/>}
    <ListBase resource="feedback" perPage={20} sort={{field:active?'updated_at':'created_at',order:'DESC'}}
      filter={{...(product?{product_id:product}:{}),queue_state:viewQueue,
        ...(priority?{priority}:{}),...(starFilter?{is_starred:starFilter}:{}),
        ...(category?{category}:{}),...(feedbackNo?{feedback_no:feedbackNo}:{})}}
>
      <Stack component="section" aria-label="筛选反馈" direction="row" useFlexGap
        sx={{width:'100%',mb:2,pt:1.5,alignItems:'center',gap:1.5,flexWrap:'wrap'}}>
        <TextField select size="small" label="优先级" value={priority}
          onChange={e=>setFilter('priority',e.target.value)}
          slotProps={{inputLabel:{shrink:true},select:{displayEmpty:true,
            renderValue:value=>priorityLabels[String(value)]??'全部优先级'}}}
          sx={{width:{xs:'calc(50% - 6px)',sm:155},flex:{sm:'0 0 155px'}}}>
          <MenuItem value="">全部优先级</MenuItem>
          {Object.entries(priorityLabels).map(([value,name])=>
            <MenuItem key={value} value={value}>{name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="星标" value={starFilter}
          onChange={e=>setFilter('star',e.target.value)}
          slotProps={{inputLabel:{shrink:true},select:{displayEmpty:true,
            renderValue:value=>value==='true'?'已星标':value==='false'?'未星标':'全部星标'}}}
          sx={{width:{xs:'calc(50% - 6px)',sm:135},flex:{sm:'0 0 135px'}}}>
          <MenuItem value="">全部</MenuItem>
          <MenuItem value="true">已星标</MenuItem>
          <MenuItem value="false">未星标</MenuItem>
        </TextField>
        <TextField select size="small" label="反馈类别" value={category}
          onChange={event=>setFilter('category',event.target.value)}
          slotProps={{inputLabel:{shrink:true},select:{displayEmpty:true,
            renderValue:value=>categoryLabels[String(value)]??'全部类别'}}}
          sx={{width:{xs:'100%',sm:190},flex:{sm:'1 1 190px'},maxWidth:{sm:250}}}>
          <MenuItem value="">全部类别</MenuItem>
          {Object.entries(categoryLabels).map(([key,label])=><MenuItem key={key} value={key}>{label}</MenuItem>)}
        </TextField>
        <Box component="form" onSubmit={event=>{
          event.preventDefault();if(!invalidNo)setFilter('no',draftNo.trim());
        }} sx={{display:'flex',gap:1,width:{xs:'100%',sm:'auto'}}}>
          <TextField size="small" label="反馈编号" value={draftNo}
            placeholder="输入完整编号" slotProps={{inputLabel:{shrink:true},htmlInput:{inputMode:'numeric'}}}
            error={invalidNo} onChange={event=>setDraftNo(event.target.value)}
            sx={{width:{xs:'100%',sm:135}}}/>
          <Button type="submit" size="small" disabled={invalidNo}>查找</Button>
        </Box>
        <Button size="small" onClick={()=>{setDraftNo('');setParams(previous=>{
          const next=new URLSearchParams(previous);
          for(const name of ['priority','star','category','no','page'])next.delete(name);
          return next;
        },{replace:true})}}>
          重置
        </Button>
        <Box sx={{ml:{sm:'auto'}}}>
          <FeedbackExport queue={viewQueue} mode="filtered" categoryFilter={category}
            feedbackNoFilter={feedbackNo}
            priorityFilter={priority} starFilter={starFilter}/>
        </Box>
      </Stack>
      <FeedbackPageSelection/>
      <FeedbackSelectionToolbar queue={viewQueue}
        onDeleted={()=>setPendingRevision(value=>value+1)}/>
      <FeedbackResults queue={queue} hasFilters={!!(category||priority||starFilter||feedbackNo)}>
      <FeedbackDatagrid>
        <FunctionField<FeedbackV2Record> source="id" label="选择"
          render={item=><FeedbackRowSelection item={item}/>}/>
        <FunctionField<FeedbackV2Record> source="feedback_no" label="反馈"
          render={item=><FeedbackSummary item={item} queue={queue}/>}/>
        <FunctionField<FeedbackV2Record> source="priority" label="优先级"
          render={item=><FeedbackPriority item={item}/>}/>
        {!product&&<ReferenceField source="product_id" reference="products" label="所属产品" link={false} emptyText="—">
          <RaTextField source="name"/>
        </ReferenceField>}
        <FunctionField<FeedbackV2Record> source={active?'updated_at':'created_at'}
          label={active?'最近更新':'收到时间'}
          render={item=><FeedbackTime value={active?item.updated_at:item.created_at}/>}/>
        <FunctionField<FeedbackV2Record> source="version" label="操作"
          render={item=><FeedbackRowActions item={item} queue={queue}
            onDeleted={()=>setPendingRevision(value=>value+1)}/>}/>
      </FeedbackDatagrid>
      </FeedbackResults>
      <FeedbackListPagination/>
    </ListBase>
  </Box>;
}
export function FeedbackInbox(){return <Queue queue="inbox"/>}
export function FeedbackWorkbench(){return <Queue queue="workbench"/>}
export function FeedbackArchived(){return <Queue queue="archived"/>}
/** Dedicated cross-queue, identity-scoped history, independent from bulk inbox workflows. */
export function FeedbackUserHistory(){
  const [params]=useSearchParams();
  const location=useLocation();
  const [product]=useStore<string>('aisencore.current.product','');
  const rawId=params.get('user_id')??'';
  const userId=validUuid.test(rawId)?rawId:'';
  const rawStage=params.get('queue_state')??'all';
  const stage:FeedbackView=rawStage==='inbox'||rawStage==='workbench'||
    rawStage==='archived'?rawStage:'all';
  const scopeKey=[userId,product,stage].join('|');
  const [cursor,setCursor]=useState({key:'',page:1});
  const page=cursor.key===scopeKey?cursor.page:1;
  const history=useGetList<FeedbackV2Record>('feedback',{
    pagination:{page,perPage:20},sort:{field:'created_at',order:'DESC'},
    filter:{user_id:userId,...(product?{product_id:product}:{}),
      ...(stage==='all'?{active_only:true}:{queue_state:stage})},
  },{enabled:!!userId,refetchOnWindowFocus:false,retry:false});
  const rows=!history.isError&&!history.isPending&&!history.isFetching?(history.data??[]):[];
  const ids=[...new Set(rows.map(item=>item.product_id).filter(Boolean))];
  const products=useGetMany('products',{ids},{enabled:ids.length>0});
  const names=new Map((products.data??[]).map(item=>[String(item.id),String(item.name)]));
  if(!userId)return <Alert severity="error" role="alert" sx={{m:3}}>
    用户反馈记录必须通过有效的用户编号定位；已阻止无筛选的查询。
  </Alert>;
  const stageLink=(next:FeedbackView)=>'/feedback/history?user_id='+encodeURIComponent(userId)+
    (next==='all'?'':'&queue_state='+next);
  return <Box sx={{px:{xs:2,md:3,lg:4.5},py:{xs:2,md:3},maxWidth:1450,mx:'auto',
    width:'100%',minWidth:0,boxSizing:'border-box'}}>
    <Stack direction={{xs:'column',sm:'row'}} sx={{justifyContent:'space-between',gap:1,mb:2}}>
      <Box sx={{minWidth:0}}>
        <Typography component="h1" variant="h5" sx={{fontWeight:750}}>该用户全部反馈</Typography>
        <Typography variant="caption" color="text.secondary" sx={{overflowWrap:'anywhere'}}>
          用户编号 {userId} · {product?'仅当前产品':'全平台产品'} · 按接收时间排序
        </Typography>
      </Box>
      <Button component={RouterLink} to={'/users/'+encodeURIComponent(userId)+'/show'} size="small">
        返回用户综合详情
      </Button>
    </Stack>
    <Tabs value={stage} variant="scrollable" scrollButtons="auto" aria-label="该用户反馈阶段"
      sx={{borderBottom:1,borderColor:'divider',mb:2}}>
      {(['all','inbox','workbench','archived'] as FeedbackView[]).map(next=>
        <Tab key={next} value={next} component={RouterLink} to={stageLink(next)}
          label={next==='all'?'全部阶段':queueNames[next]}/>)}
    </Tabs>
    {history.isPending||history.isFetching?
      <Typography role="status" sx={{py:4}}>正在读取该用户反馈记录…</Typography>:
      history.isError?<Alert severity="error" role="alert" action={
        <Button color="inherit" size="small" onClick={()=>void history.refetch()}>重试</Button>}>
        反馈记录读取失败，不能判定该用户没有反馈。
      </Alert>:
      rows.length===0?<Card variant="outlined" sx={{p:3}}>
        <Typography color="text.secondary">该用户在当前产品与阶段下暂无反馈。</Typography>
      </Card>:
      <Stack spacing={1.5}>
        {rows.map(item=><Card key={item.id} variant="outlined" sx={{p:{xs:2,sm:2.5}}}>
          <Stack direction={{xs:'column',sm:'row'}} sx={{gap:1.5,justifyContent:'space-between'}}>
            <Box sx={{minWidth:0,flex:1}}>
              <Stack direction="row" sx={{gap:1,alignItems:'center',flexWrap:'wrap',mb:.5}}>
                <Typography sx={{fontWeight:750}}>反馈 #{item.feedback_no}</Typography>
                <Chip size="small" variant="outlined" label={queueNames[item.queue_state]??'未知阶段'}/>
              </Stack>
              <Typography variant="body2" sx={{overflowWrap:'anywhere'}}>{item.content}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:.75}}>
                {!product?(names.get(item.product_id)??item.product_id)+' · ':''}{formatAdminInstant(item.created_at)}
              </Typography>
            </Box>
            <Box><Button component={RouterLink} to={'/feedback/'+item.id+'/show?returnTo='+encodeURIComponent(location.pathname+location.search)} size="small"
              variant="outlined">查看反馈详情与处理历史</Button></Box>
          </Stack>
        </Card>)}
      </Stack>}
    {!history.isPending&&!history.isFetching&&!history.isError&&(history.total??0)>20&&
      <Stack sx={{mt:2,alignItems:'flex-start'}} spacing={1}>
      <Typography variant="caption" color="text.secondary" role="status">
        第 {page} 页，共 {history.total} 条反馈
      </Typography>
      <Pagination aria-label="该用户反馈分页" page={page}
        count={Math.max(1,Math.ceil((history.total??0)/20))}
        onChange={(_,next)=>setCursor({key:scopeKey,page:next})}/>
    </Stack>}
  </Box>;
}
