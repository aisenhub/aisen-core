import { useMemo, useState } from 'react';
import { useGetList, useGetMany, useStore } from 'react-admin';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, IconButton, MenuItem,
  Pagination, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { OperationLink } from './OperationDialogs';
import { ProtectedAction } from './lists';
import { formatAdminInstant } from '../dateDisplay';
import { adminRadii } from '../theme';

type Batch={
  id:string;product_id:string;request_id:string;quantity:number;
  grant_duration_days:number;code_expires_at:string|null;note:string|null;
  created_at:string;created_by:string;used_count:number;available_count:number;
  product_status:string;
};
type CodeRow={
  id:string;batch_ordinal:number;code_prefix:string;status:string;
  expires_at:string|null;revoked_at:string|null;redeemed_count:number;
  redeemed_by:string|null;grant_id:string|null;redeemed_at:string|null;
};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const statusLabels:Record<string,string>={
  available:'可使用',redeemed:'已核销',expired:'已过期',
  revoked:'已撤销',product_unavailable:'产品已暂停',
};
function Status({value}:{value:string}){
  return <Chip size="small" variant="outlined"
    color={value==='redeemed'?'success':value==='available'?'primary':'default'}
    label={statusLabels[value]??value} sx={{fontWeight:500}}/>;
}
const pageStyle={px:{xs:2,md:3,lg:4.5},pt:{xs:2,md:2.5},pb:2,
  maxWidth:1720,width:'100%',minWidth:0,mx:'auto'};
const tableShell={display:'flex',flexDirection:'column',flex:'1 1 auto',
  minHeight:0,overflow:'hidden'};
const tableScroll={flex:'1 1 auto',minHeight:0,maxWidth:'100%',
  overflow:'auto',overscrollBehavior:'contain'};
function Summary({batch}:{batch:Batch}){
  const invalid=Math.max(0,batch.quantity-batch.used_count-batch.available_count);
  return <Stack direction="row" spacing={{xs:2,sm:4}} useFlexGap
    sx={{py:2,px:{xs:2,sm:3},mb:2,border:'1px solid',borderColor:'divider',
      borderRadius:adminRadii.card,flexWrap:'wrap'}}>
    {[
      ['发行',batch.quantity],['已核销',batch.used_count],
      ['仍可使用',batch.available_count],['已失效',invalid],
    ].map(([name,count])=><Box key={name} sx={{minWidth:75}}>
      <Typography color="text.secondary" sx={{fontSize:12}}>{name}</Typography>
      <Typography sx={{fontSize:22,fontWeight:700,fontVariantNumeric:'tabular-nums'}}>
        {count}
      </Typography>
    </Box>)}
  </Stack>;
}
function ErrorNotice({onRetry}:{onRetry:()=>void}){
  return <Alert severity="error" action={<Button color="inherit" onClick={onRetry}>重试</Button>}>
    兑换码数据读取失败，无法确认状态。
  </Alert>;
}
function BatchLabel({item}:{item:Batch}){
  return <Box sx={{minWidth:0}}>
    <Typography sx={{fontSize:14,fontWeight:550,
      textOverflow:'ellipsis',whiteSpace:'nowrap',overflow:'hidden',maxWidth:340}}>
      {item.note?.trim()||('发行批次 '+item.request_id.slice(0,8))}
    </Typography>
    <Typography component="code" sx={{fontSize:11.5,color:'text.secondary'}}>
      {item.request_id.slice(0,12)}…
    </Typography>
  </Box>;
}
function Footer({page,setPage,total}:{page:number;setPage:(n:number)=>void;total:number}){
  return <Stack direction="row" spacing={1} sx={{alignItems:"center",justifyContent:"space-between",
    flexWrap:"wrap",p:1.5,borderTop:'1px solid',borderColor:'divider'}}>
    <Typography variant="caption" color="text.secondary">共 {total} 条 · 第 {page} 页</Typography>
    <Pagination count={Math.max(1,Math.ceil(total/20))} page={page}
      onChange={(_,value)=>setPage(value)} size="small" showFirstButton showLastButton/>
  </Stack>;
}
export function RedemptionBatchesList(){
  const [scope]=useStore<string>('aisencore.current.product','');
  const [view,setView]=useState({scope:'',page:1});
  const page=view.scope===scope?view.page:1;
  const setPage=(n:number)=>setView({scope,page:n});
  const [draft,setDraft]=useState('');
  const [request,setRequest]=useState('');
  const list=useGetList<Batch>('redemption-batches-v2',{
    pagination:{page,perPage:20},sort:{field:'created_at',order:'DESC'},
    filter:{product_id:scope,request_id:request},
  },{refetchOnWindowFocus:true,retry:false});
  const ids=useMemo(()=>[...new Set((list.data??[]).map(b=>b.product_id))],
    [list.data]);
  const products=useGetMany('products',{ids},{enabled:!scope&&ids.length>0});
  const productMap=new Map((products.data??[]).map(p=>[String(p.id),String(p.name)]));
  return <Box className="aisen-admin-list-page" sx={pageStyle}>
    <Stack direction="row" spacing={2} sx={{alignItems:"center",justifyContent:"space-between",mb:2}}>
      <Typography component="h1" sx={{fontSize:{xs:23,md:27},fontWeight:740}}>兑换码</Typography>
      <Button component={OperationLink} to="/issue-codes" variant="contained">
        发行兑换码
      </Button>
    </Stack>
    <Stack direction={{xs:'column',sm:'row'}} sx={{alignItems:{sm:'center'},gap:1.2,mb:2}}>
      <Typography color="text.secondary" variant="body2" sx={{mr:'auto'}}>
        {list.isPending?'正在读取…':list.isError?'读取失败':`共 ${list.total??0} 个发行批次`}
      </Typography>
      <Box component="form" onSubmit={e=>{e.preventDefault();setRequest(draft.trim());setPage(1)}}
        sx={{display:'flex',alignItems:'center',gap:1,minWidth:0}}>
        <TextField size="small" label="精确请求编号" value={draft} onChange={e=>setDraft(e.target.value)}
          slotProps={{htmlInput:{maxLength:128}}} sx={{width:{xs:185,sm:255}}}/>
        <Button type="submit">查询</Button>
        {request&&<Button onClick={()=>{setDraft('');setRequest('');setPage(1)}}>清除</Button>}
      </Box>
      <Tooltip title="刷新统计"><IconButton onClick={()=>void list.refetch()}>
        <RefreshRoundedIcon/></IconButton></Tooltip>
    </Stack>
    {list.isError?<ErrorNotice onRetry={()=>void list.refetch()}/>:
      <Card sx={tableShell}>
        <TableContainer sx={tableScroll}>
          <Table stickyHeader size="medium" sx={{minWidth:scope?810:930,tableLayout:'fixed'}}>
            <TableHead><TableRow>
              <TableCell>批次</TableCell>
              {!scope&&<TableCell sx={{width:126}}>所属产品</TableCell>}
              <TableCell sx={{width:125}}>权益</TableCell>
              <TableCell sx={{width:88}}>发行</TableCell>
              <TableCell sx={{width:90}}>已核销</TableCell>
              <TableCell sx={{width:90}}>可用</TableCell>
              <TableCell sx={{width:90}}>失效</TableCell>
              <TableCell sx={{width:164}}>发行时间</TableCell>
              <TableCell align="right" sx={{width:96}}>查看</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {(list.data??[]).map(item=><TableRow hover key={item.id}>
                <TableCell><BatchLabel item={item}/></TableCell>
                {!scope&&<TableCell>{productMap.get(item.product_id)??'—'}</TableCell>}
                <TableCell>Pro {item.grant_duration_days} 天</TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{item.used_count}</TableCell>
                <TableCell>{item.available_count}</TableCell>
                <TableCell>{Math.max(0,item.quantity-item.used_count-item.available_count)}</TableCell>
                <TableCell>{formatAdminInstant(item.created_at)}</TableCell>
                <TableCell align="right"><Button component={RouterLink}
                  to={`/code-batches/${item.id}/show`} size="small"
                  endIcon={<ArrowForwardRoundedIcon/>}>详情</Button></TableCell>
              </TableRow>)}
              {!list.isPending&&!list.data?.length&&<TableRow>
                <TableCell colSpan={scope?8:9} align="center" sx={{py:5}}>
                  当前范围暂无发行批次
                </TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
        <Footer page={page} setPage={setPage} total={list.total??0}/>
      </Card>}
  </Box>;
}
export function RedemptionBatchShow(){
  const {id=''}=useParams<{id:string}>();
  const [scope]=useStore<string>('aisencore.current.product','');
  const valid=uuid.test(id);
  const [selection,setSelection]=useState({scope:'',page:1,status:''});
  const stateKey=id+'|'+scope;
  const page=selection.scope===stateKey?selection.page:1;
  const status=selection.scope===stateKey?selection.status:'';
  const setPage=(n:number)=>setSelection({scope:stateKey,page:n,status});
  const setStatus=(value:string)=>setSelection({scope:stateKey,page:1,status:value});
  // One server-authoritative AAL2 batch summary also enforces product scope.
  const summary=useGetList<Batch>('redemption-batches-v2',{
    pagination:{page:1,perPage:1},sort:{field:'created_at',order:'DESC'},
    filter:{batch_id:id,product_id:scope},
  },{enabled:valid,refetchOnWindowFocus:true,retry:false});
  const item=summary.data?.find(b=>b.id===id);
  const codes=useGetList<CodeRow>('redemption-batch-codes-v2',{
    pagination:{page,perPage:20},sort:{field:'batch_ordinal',order:'ASC'},
    filter:{batch_id:id,product_id:scope,status},
  },{enabled:valid&&!!item,refetchOnWindowFocus:true,retry:false});
  const userIds=useMemo(()=>[...new Set((codes.data??[])
    .map(c=>c.redeemed_by).filter((uid):uid is string=>!!uid))],[codes.data]);
  const users=useGetMany('users',{ids:userIds},{enabled:userIds.length>0});
  const emails=new Map((users.data??[]).map(user=>[String(user.id),String(user.email??'')]));
  if(!valid)return <Alert severity="error">无效的批次编号</Alert>;
  return <Box className="aisen-admin-list-page" sx={pageStyle}>
    <Stack direction="row" spacing={1.5} sx={{mb:2,alignItems:"center",flexWrap:'wrap'}}>
      <Button component={RouterLink} to="/code-batches" startIcon={<ArrowBackRoundedIcon/>}>返回批次</Button>
      <Typography component="h1" sx={{fontSize:{xs:22,md:26},fontWeight:720}}>
        批次详情
      </Typography>
      <Box sx={{flex:1}}/>
      {item&&item.available_count>0&&<ProtectedAction title="撤销整批未使用兑换码"
        rpc="admin_revoke_batch" keyName="p_batch_id" targetId={id} danger/>}
    </Stack>
    {!summary.isPending&&!summary.isError&&!item&&<Alert severity="warning">
      当前所选产品下找不到该批次。
    </Alert>}
    {(summary.isError||codes.isError)&&
      <ErrorNotice onRetry={()=>{void summary.refetch();if(item)void codes.refetch()}}/>}
    {item&&<>
      <Stack direction="row" spacing={1} sx={{mb:2,alignItems:'center'}}>
        <Typography sx={{fontWeight:600}}>{item.note?.trim()||'发行批次'}</Typography>
        <Typography color="text.secondary" variant="caption">
          Pro {item.grant_duration_days} 天 · {formatAdminInstant(item.created_at)}
        </Typography>
      </Stack>
      <Summary batch={item}/>
      <Stack direction="row" spacing={1.5} sx={{mb:1.5,alignItems:"center"}}>
        <Typography variant="subtitle1" sx={{fontWeight:650}}>兑换码核销记录</Typography>
        <Box sx={{flex:1}}/>
        <TextField select label="状态" value={status} size="small" sx={{width:160}}
          onChange={e=>setStatus(e.target.value)}>
          <MenuItem value="">全部</MenuItem>
          {Object.entries(statusLabels).map(([value,label])=>
            <MenuItem value={value} key={value}>{label}</MenuItem>)}
        </TextField>
        <IconButton aria-label="刷新兑换记录" onClick={()=>{void codes.refetch();void summary.refetch()}}>
          <RefreshRoundedIcon/>
        </IconButton>
      </Stack>
      <Card sx={tableShell}>
        <TableContainer sx={tableScroll}>
          <Table stickyHeader sx={{minWidth:800}}>
            <TableHead><TableRow>
              <TableCell>序号 / 安全前缀</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>核销用户</TableCell>
              <TableCell>核销时间</TableCell>
              <TableCell>关联授权</TableCell>
              <TableCell align="right">管理操作</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {(codes.data??[]).map(code=><TableRow hover key={code.id}>
                <TableCell>
                  <Typography sx={{fontSize:13,fontWeight:550}}>#{code.batch_ordinal}</Typography>
                  <Typography component="code" sx={{fontSize:12,color:'text.secondary'}}>
                    {code.code_prefix}…
                  </Typography>
                </TableCell>
                <TableCell><Status value={code.status}/></TableCell>
                <TableCell>{code.redeemed_by?
                  <Button size="small" component={RouterLink}
                    to={`/users/${code.redeemed_by}/show`}>
                    {emails.get(code.redeemed_by)||code.redeemed_by.slice(0,8)+'…'}
                  </Button>:'—'}</TableCell>
                <TableCell>{code.redeemed_at?formatAdminInstant(code.redeemed_at):'—'}</TableCell>
                <TableCell>{code.grant_id?<Button component={RouterLink} size="small"
                  to={`/grants/${code.grant_id}/show`}>查看授权</Button>:'—'}</TableCell>
                <TableCell align="right">
                  {code.status==='available'&&<ProtectedAction
                    title="撤销" rpc="admin_revoke_code" keyName="p_code_id"
                    targetId={code.id} danger/>}
                </TableCell>
              </TableRow>)}
              {!codes.isPending&&!codes.data?.length&&<TableRow>
                <TableCell colSpan={6} align="center" sx={{py:5}}>暂无符合条件的兑换码</TableCell>
              </TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
        <Footer page={page} setPage={setPage} total={codes.total??0}/>
      </Card>
    </>}
    {summary.isPending&&!item&&
      <Box sx={{display:'flex',gap:1,p:4,alignItems:'center'}}>
        <CircularProgress size={20}/><Typography variant="body2">正在加载批次数据…</Typography>
      </Box>}
  </Box>;
}