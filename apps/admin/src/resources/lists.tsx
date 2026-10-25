import { useState } from 'react';
import {
  Datagrid, DateField, List, TextField,
  useNotify, useRecordContext, useRefresh, useGetList,
} from 'react-admin';
import { Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography, TextField as MuiTextField } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { callRpc } from '../data/dataProvider';
import { DomainNavigation } from './DomainNavigation';
import { OperationLink } from './OperationDialogs';

type ActionProps = { title: string; rpc: string; keyName: string; targetId?: string;
  payload?: Record<string, unknown>; danger?: boolean };
export function ProtectedAction({ title, rpc, keyName, targetId, payload = {}, danger }: ActionProps) {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!record && !targetId) return null;
  async function confirm() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await callRpc(rpc, { [keyName]: targetId ?? record!.id, p_reason: reason.trim(), ...payload });
      notify('操作已由服务端确认', { type: 'success' });
      setOpen(false); setReason(''); refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : '操作失败', { type: 'error' });
      refresh();
    } finally { setBusy(false); }
  }
  const targetLabel=String(record?.name??record?.user_id??record?.product_key??targetId??record?.id??'');
  return <>
    <Button size="small" color={danger ? 'error' : 'primary'} onClick={event => { event.stopPropagation(); setOpen(true); }}>{title}</Button>
    <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }}
      aria-labelledby="confirm-rpc-title">
      <DialogTitle id="confirm-rpc-title">{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity={danger?'warning':'info'}>
            <Typography sx={{fontWeight:750,mb:.5}}>操作目标：{targetLabel}</Typography>
            <Typography variant="body2">完整记录编号：{String(targetId??record?.id??'')}</Typography>
            {danger&&<Typography variant="body2" sx={{mt:1}}>请确认目标和影响范围，填写操作理由后再提交。</Typography>}
          </Alert>
          <MuiTextField label="操作理由" value={reason} required multiline minRows={2}
            onChange={event => setReason(event.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)} disabled={busy}>取消</Button>
        <Button variant="contained" color={danger ? 'error' : 'primary'}
          onClick={() => void confirm()} disabled={busy || !reason.trim()}>确认提交</Button>
      </DialogActions>
    </Dialog>
  </>;
}

const productStatus: Record<string,{title:string;background:string,foreground:string}> = {
  draft:{title:'草稿',background:'#f2f3f7',foreground:'#53627a'},
  active:{title:'运行中',background:'#e6f5ec',foreground:'#1c7651'},
  suspended:{title:'已暂停',background:'#fff0e9',foreground:'#a55a2c'},
};
function ProductIdentity(_props:{label?:string;source?:string}) {
  const item=useRecordContext();
  if(!item)return null;
  return <Stack direction="row" spacing={1.7} sx={{alignItems:"center"}}>
    <Box aria-hidden sx={{width:40,height:40,borderRadius:2.6,display:'grid',placeItems:'center',
      bgcolor:'#f0eeff',color:'primary.main',fontWeight:800,flexShrink:0,fontSize:16}}>
      {String(item.name??'P').slice(0,1).toUpperCase()}
    </Box>
    <Box sx={{minWidth:0}}>
      <Typography sx={{fontWeight:740,fontSize:14.2,color:'text.primary'}}>{String(item.name)}</Typography>
      <Typography variant="caption" color="text.secondary">{String(item.product_key)}</Typography>
    </Box>
  </Stack>;
}
function ProductStatus(_props:{label?:string;source?:string}) {
  const item=useRecordContext();
  if(!item)return null;
  const state=productStatus[String(item.status)];
  if(!state)return <Chip label={'未知状态 · '+String(item.status??'—')} sx={{bgcolor:'#fff0e9',color:'#934b25'}}/>;
  return <Chip label={state.title} sx={{bgcolor:state.background,color:state.foreground,
    '& .MuiChip-label':{px:1.4}}}/>;
}
export function ProductsList() {
  const [statusFilter,setStatusFilter]=useState('');
  const [productKeyDraft,setProductKeyDraft]=useState('');
  const [productKey,setProductKey]=useState('');
  const validKey=productKeyDraft.trim()===''||/^[a-z][a-z0-9_]{0,63}$/.test(productKeyDraft.trim());
  // Independent filtered totals: counting just the first 100 records would
  // silently lie as soon as the platform grows beyond its demo dataset.
  const page={pagination:{page:1,perPage:1},sort:{field:'id',order:'ASC' as const}};
  const all=useGetList('products',{...page,filter:{}});
  const running=useGetList('products',{...page,filter:{status:'active'}});
  const drafts=useGetList('products',{...page,filter:{status:'draft'}});
  const suspended=useGetList('products',{...page,filter:{status:'suspended'}});
  const total=all.total;
  const isPending=all.isPending||running.isPending||drafts.isPending||suspended.isPending;
  const isError=all.isError||running.isError||drafts.isError||suspended.isError;
  return <Box sx={{px:{xs:2,sm:3,lg:4.5},py:{xs:2,lg:2.5},maxWidth:1720,width:'100%',minWidth:0,mx:'auto'}}>
    <DomainNavigation resource="products"/>
    <Stack direction={{xs:'column',sm:'row'}} spacing={1.5} sx={{alignItems:{sm:'center'},justifyContent:'space-between',mb:1.8}}>
      <Typography component="h1" sx={{fontSize:{xs:22,md:26},fontWeight:740,lineHeight:1.3}}>
        产品目录
      </Typography>
      <Button component={OperationLink} to="/products/create" variant="contained"
        startIcon={<AddRoundedIcon/>} sx={{alignSelf:{xs:'flex-start',sm:'center'}}}>新建产品</Button>
    </Stack>
    <Box component="div" aria-label="按产品状态筛选" sx={{display:'flex',flexWrap:'wrap',gap:1,mb:1.8}}>
      {[
        {label:'全部产品',status:'',count:total},
        {label:'正常运行',status:'active',count:running.total},
        {label:'草稿',status:'draft',count:drafts.total},
        {label:'暂停服务',status:'suspended',count:suspended.total},
      ].map(c=><Button key={c.label} type="button"
        variant={statusFilter===c.status?'contained':'outlined'}
        aria-pressed={statusFilter===c.status}
        onClick={()=>setStatusFilter(c.status)}
        sx={{minHeight:38,fontSize:13,fontWeight:630,borderRadius:2}}>
        {c.label} · {isPending||isError||typeof c.count!=='number'?'—':c.count}
      </Button>)}
    </Box>
    <Stack component="form" direction={{xs:'column',sm:'row'}} spacing={1.3} sx={{alignItems:{sm:'flex-start'},mb:2}}
      onSubmit={event=>{event.preventDefault();if(validKey)setProductKey(productKeyDraft.trim())}}>
      <MuiTextField size="small" label="完整产品键（精确匹配）" value={productKeyDraft}
        error={!validKey} helperText={!validKey?'必须以字母开头，只能使用小写字母、数字与下划线':'例如 aisenlens（完整产品键）'}
        sx={{width:{xs:'100%',md:300},maxWidth:'100%'}} onChange={e=>setProductKeyDraft(e.target.value)}/>
      <Button variant="contained" type="submit" disabled={!validKey}
        sx={{alignSelf:{xs:'stretch',sm:'flex-start'},minHeight:40,flexShrink:0}}>查找产品</Button>
      {(statusFilter||productKey)&&<Button size="small" variant="outlined" sx={{alignSelf:{xs:'stretch',sm:'flex-start'},minHeight:40}} onClick={()=>{
        setStatusFilter('');setProductKey('');setProductKeyDraft('');
      }}>清除全部筛选</Button>}
    </Stack>
    <List key={statusFilter+'|'+productKey} title="产品目录" actions={false} perPage={25}
      filter={{...(statusFilter?{status:statusFilter}:{}),...(productKey?{product_key:productKey}:{})}}
      sort={{field:'created_at',order:'DESC'}}
      empty={<Card sx={{p:5,textAlign:'center'}}>
        <Typography variant="h6">{statusFilter||productKey?'没有匹配筛选的产品':'还没有产品'}</Typography>
        <Typography color="text.secondary" sx={{mt:1}}>{statusFilter||productKey?'请调整状态或产品键筛选。':'先创建产品，建立你的管理空间。'}</Typography>
        {!(statusFilter||productKey)&&<Button component={RouterLink} to="/products/create" sx={{mt:2}} variant="contained">新建产品</Button>}
      </Card>}>
      <Datagrid rowClick="show" bulkActionButtons={false} sx={{
        maxWidth:'100%',overflowX:'auto',
        '& .MuiTable-root':{minWidth:680,tableLayout:'fixed'},
        '& .column-name':{width:205,minWidth:190},
        '& .column-description':{width:215,maxWidth:215,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
        '& .column-status':{width:120},
        '& .column-created_at':{width:140},
        '& .MuiTableCell-root':{verticalAlign:'middle'},
        '& .MuiTableRow-root':{cursor:'pointer'},
      }}>
        <ProductIdentity source="name" label="产品" />
        <ProductStatus source="status" label="运行状态"/>
        <TextField source="description" label="简介" emptyText="—"/>
        <DateField source="created_at" label="建立日期" />
      </Datagrid>
    </List>
  </Box>;
}
