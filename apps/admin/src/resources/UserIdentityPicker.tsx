import { useState } from 'react';
import { useGetList, useGetOne, useNotify } from 'react-admin';
import { Alert, Box, Button, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// Human-facing exact email lookup; only a verified user UUID can be selected.
// Both paths use the existing restricted admin_lookup_users RPC via DataProvider.
export function UserIdentityPicker({value,onChange,disabled=false}:{
  value:string;onChange:(id:string)=>void;disabled?:boolean;
}) {
  const notify=useNotify();
  const [email,setEmail]=useState('');
  const [searched,setSearched]=useState('');
  const byId=useGetOne('users',{id:value},
    {enabled:uuid.test(value),refetchOnMount:'always',refetchOnWindowFocus:true});
  const lookup=useGetList('users',{
    pagination:{page:1,perPage:2},sort:{field:'id',order:'ASC'},filter:{email:searched},
  },{enabled:!!searched&&!value,refetchOnWindowFocus:false,retry:false});
  const verified=uuid.test(value)&&!byId.isPending&&!byId.isFetching&&!byId.isError&&
    String(byId.data?.id)===value&&typeof byId.data?.email==='string'&&!!byId.data.email;
  const exact=(lookup.data??[]).filter(row=>
    typeof row.email==='string'&&row.email.toLowerCase()===searched.toLowerCase());
  const candidate=!lookup.isPending&&!lookup.isFetching&&!lookup.isError&&
    lookup.total===1&&exact.length===1?exact[0]:null;
  const copy=async()=>{
    try { await navigator.clipboard.writeText(value);notify('已复制用户编号',{type:'success'}); }
    catch {notify('复制失败，请手动选择编号',{type:'warning'});}
  };
  return <Stack spacing={1.2}>
    {value ? <Alert severity={verified?'success':'warning'} role="status">
      {verified?<Stack spacing={.6}>
        <Typography sx={{fontWeight:700}}>已核实目标账号：{String(byId.data?.email)}</Typography>
        <Stack direction="row" spacing={.5} sx={{alignItems:'center',flexWrap:'wrap'}}>
          <Typography component="code" sx={{fontSize:12,overflowWrap:'anywhere'}}>用户编号：{value}</Typography>
          <Tooltip title="复制用户编号"><IconButton size="small" aria-label="复制用户编号"
            onClick={()=>void copy()} disabled={disabled}><ContentCopyRoundedIcon fontSize="small"/></IconButton></Tooltip>
        </Stack>
      </Stack>:byId.isPending?'正在核实目标账号…':'目标账号未能核实，禁止提交'}
      <Button size="small" disabled={disabled} onClick={()=>{onChange('');setSearched('');setEmail('');}}>
        更换目标用户
      </Button>
    </Alert>:<Box>
      <Stack direction={{xs:'column',sm:'row'}} spacing={1} sx={{alignItems:{sm:'flex-start'}}}>
        <TextField label="完整注册邮箱" type="email" autoComplete="off" fullWidth size="small" required
          value={email} disabled={disabled} onChange={event=>{setEmail(event.target.value);setSearched('');}}
          onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(email.trim())setSearched(email.trim());}}}/>
        <Button type="button" variant="outlined" disabled={disabled||!email.trim()}
          onClick={()=>setSearched(email.trim())} sx={{whiteSpace:'nowrap'}}>
          查找账号
        </Button>
      </Stack>
      {searched&&(lookup.isPending||lookup.isFetching)&&<Typography role="status" variant="body2">正在精确查找账号…</Typography>}
      {searched&&lookup.isError&&<Alert severity="error">账号查询失败或无权访问；请重新核实权限与网络。</Alert>}
      {searched&&!lookup.isPending&&!lookup.isFetching&&!lookup.isError&&!candidate&&
        <Alert severity="info">未找到该邮箱的唯一账号，请检查完整注册邮箱。</Alert>}
      {candidate&&<Stack direction="row" spacing={1} sx={{mt:1.5,alignItems:'center',flexWrap:'wrap'}}>
        <Typography sx={{overflowWrap:'anywhere'}}>{String(candidate.email)}</Typography>
        <Button variant="contained" size="small" disabled={disabled}
          onClick={()=>{onChange(String(candidate.id));setSearched('');setEmail('');}}>确认选择此用户</Button>
      </Stack>}
    </Box>}
  </Stack>;
}
