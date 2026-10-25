import { useEffect, useState } from 'react';
import { Show, useGetList, useGetMany, useRecordContext } from 'react-admin';
import { Link as RouterLink } from 'react-router-dom';
import { OperationLink } from './OperationDialogs';
import { Box, Button, Card, Chip, Divider, Pagination, Stack, Typography } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';

const time=(v:unknown)=>v?new Date(String(v)).toLocaleString('zh-CN',{year:'numeric',month:'short',day:'numeric'}):'—';
const memberState:Record<string,{title:string,bg:string,fg:string}>={
  active:{title:'正常',bg:'#e6f5ec',fg:'#1c7651'},
  left:{title:'已退出',bg:'#f1f3f7',fg:'#53627a'},
  suspended:{title:'已暂停',bg:'#fff0e9',fg:'#934b25'},
};
function Section({icon,title,children}:{
  icon:React.ReactNode;title:string;children:React.ReactNode;
}) {
  return <Card sx={{p:{xs:2.3,md:3}}}>
    <Stack direction="row" spacing={1.5} sx={{alignItems:'center',mb:2.5}}>
      <Box sx={{width:38,height:38,borderRadius:2.4,display:'grid',placeItems:'center',
        bgcolor:'#f0eeff',color:'primary.main'}}>{icon}</Box>
      <Box>
        <Typography variant="h6">{title}</Typography>
      </Box>
    </Stack>
    {children}
  </Card>;
}
function UserOverview() {
  const record=useRecordContext();
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{
    const timer=window.setInterval(()=>setNow(Date.now()),60_000);
    return ()=>window.clearInterval(timer);
  },[]);
  const uid=String(record?.id??'');
  const [memberCursor,setMemberCursor]=useState({userId:'',page:1});
  const [grantCursor,setGrantCursor]=useState({userId:'',page:1});
  const memberPage=memberCursor.userId===uid?memberCursor.page:1;
  const grantPage=grantCursor.userId===uid?grantCursor.page:1;
  const members=useGetList('memberships',{
    pagination:{page:memberPage,perPage:20},sort:{field:'joined_at',order:'DESC'},filter:{user_id:uid},
  },{enabled:!!uid,refetchOnWindowFocus:false});
  const grants=useGetList('grants',{
    pagination:{page:grantPage,perPage:20},sort:{field:'created_at',order:'DESC'},filter:{user_id:uid},
  },{enabled:!!uid,refetchOnWindowFocus:false});
  const restrictions=useGetList('restrictions',{
    pagination:{page:1,perPage:1},sort:{field:'created_at',order:'DESC'},filter:{user_id:uid,kind:'blocked'},
  },{enabled:!!uid});
  const productIds=[...new Set([...(members.data??[]),...(grants.data??[])].map(x=>String(x.product_id)).filter(Boolean))];
  const products=useGetMany('products',{ids:productIds},{enabled:productIds.length>0});
  if(!record)return <Box sx={{p:4}}>正在读取用户信息…</Box>;
  const blocked=(restrictions.data??[]).some(x=>x.kind==='blocked');
  const productLabel=(productId:unknown)=>String(
    (products.data??[]).find(item=>String(item.id)===String(productId))?.name
    ?? String(productId).slice(0,8)+'…');
  const active=(grants.data??[]).filter(g=>!g.revoked_at&&
    new Date(String(g.starts_at)).getTime()<=now&&
    (!g.ends_at||new Date(String(g.ends_at)).getTime()>now));
  return <Box sx={{px:{xs:1,md:2},pb:3}}>
    <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',mb:2}}>
      <Button component={RouterLink} to="/users" startIcon={<ArrowBackRoundedIcon/>} variant="text">
        返回用户 · 查找账号
      </Button>
      <Chip label={restrictions.isPending?'账号状态核查中':restrictions.isError?'账号状态不可用':blocked?'平台账号已封禁':'平台账号正常'}
        sx={{bgcolor:blocked?'#fff0e9':'#e6f5ec',color:blocked?'#934b25':'#1c7651'}}/>
    </Stack>
    <Stack direction={{xs:'column',sm:'row'}} spacing={1.5}
      sx={{alignItems:{sm:'center'},justifyContent:'space-between',mb:2}}>
      <Box sx={{minWidth:0}}>
        <Typography component="h1" sx={{fontSize:{xs:22,md:26},fontWeight:740,
          lineHeight:1.3,overflowWrap:'anywhere'}}>
          {String(record.email??'受限用户')}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:.5}}>
          用户编号 {uid}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{flexShrink:0}}>
        注册于 {time(record.created_at)}
      </Typography>
    </Stack>
    <Box sx={{mb:2,display:'flex',flexWrap:'wrap',gap:1}}>
      <Button size="small" variant="outlined" component={OperationLink}
        to={'/account-actions?user_id='+encodeURIComponent(uid)}>平台账号与管理员权限操作</Button>
      <Button size="small" variant="text" component={RouterLink}
        to={'/memberships?user_id='+encodeURIComponent(uid)}>查看成员记录列表</Button>
    </Box>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(2,minmax(0,1fr))'},gap:2.5}}>
      <Section icon={<GroupsOutlinedIcon/>} title="产品成员关系">
        {members.isPending?<Typography color="text.secondary">正在载入成员关系…</Typography>:
          members.isError?<Typography color="error">成员关系读取失败，请刷新。</Typography>:
          (members.data??[]).length===0?<Typography color="text.secondary">该账号尚无产品成员关系</Typography>:
          <Stack divider={<Divider/>}>
            {(members.data??[]).map(item=>{
              const state=memberState[String(item.status)]??{title:'未知状态',bg:'#fff0e9',fg:'#934b25'};
              return <Stack key={item.id} direction="row" sx={{py:1.4,alignItems:'center',justifyContent:'space-between',gap:2}}>
                <Box sx={{minWidth:0}}>
                  <Typography sx={{fontSize:13,fontWeight:680}}>{productLabel(item.product_id)}</Typography>
                  <Typography variant="caption" color="text.secondary">加入于 {time(item.joined_at)}</Typography>
                </Box>
                <Stack direction="row" spacing={1} sx={{alignItems:'center'}}>
                  <Chip label={state.title} sx={{bgcolor:state.bg,color:state.fg}}/>
                  <Button component={RouterLink} to={'/memberships/'+item.id+'/show'} size="small">详情</Button>
                </Stack>
              </Stack>;
            })}
          </Stack>}
        {(members.total??0)>20&&<Stack spacing={1} sx={{mt:2,alignItems:'flex-start'}}>
          <Typography variant="caption" color="text.secondary" role="status">
            成员记录第 {memberPage} 页，共 {members.total} 条
          </Typography>
          <Pagination aria-label="成员关系列表分页" size="small" siblingCount={0} boundaryCount={1}
            page={memberPage} count={Math.max(1,Math.ceil((members.total??0)/20))}
            onChange={(_,page)=>setMemberCursor({userId:uid,page})}/>
        </Stack>}
      </Section>
      <Section icon={<WorkspacePremiumOutlinedIcon/>} title="Pro 授权记录">
        <Typography variant="body2" color="text.secondary" sx={{mb:1.4}}>
          共 {grants.isPending?'—':grants.total??'—'} 条历史记录
        </Typography>
        {grants.isPending?<Typography color="text.secondary">正在载入权益…</Typography>:
          grants.isError?<Typography color="error">权益读取失败，请刷新。</Typography>:
          (grants.data??[]).length===0?<Typography color="text.secondary">当前没有 Pro 授权记录</Typography>:
          <Stack divider={<Divider/>}>
            {(grants.data??[]).map(g=>{
              const valid=active.some(item=>item.id===g.id);
              return <Stack key={g.id} direction="row" sx={{alignItems:'center',
                justifyContent:'space-between',gap:1.5,py:1.2}}>
                <Box sx={{minWidth:0}}>
                  <Typography sx={{fontSize:13,fontWeight:680}}>
                    {productLabel(g.product_id)} · {g.ends_at?'期限授权':'永久授权'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {time(g.starts_at)} — {g.ends_at?time(g.ends_at):'永久'}
                  </Typography>
                </Box>
                <Chip label={valid?'生效中':g.revoked_at?'已撤销':new Date(String(g.starts_at)).getTime()>now?'待生效':'已过期'}
                  sx={{bgcolor:valid?'#e6f5ec':'#f1f3f7',color:valid?'#1c7651':'#53627a'}}/>
              </Stack>;
            })}
          </Stack>}
        {(grants.total??0)>20&&<Stack spacing={1} sx={{mt:2,alignItems:'flex-start'}}>
          <Typography variant="caption" color="text.secondary" role="status">
            授权历史第 {grantPage} 页，共 {grants.total} 条
          </Typography>
          <Pagination aria-label="授权历史列表分页" size="small" siblingCount={0} boundaryCount={1}
            page={grantPage} count={Math.max(1,Math.ceil((grants.total??0)/20))}
            onChange={(_,page)=>setGrantCursor({userId:uid,page})}/>
        </Stack>}
        <Button component={OperationLink} to={'/grant-new?user_id='+encodeURIComponent(uid)} size="small" sx={{mt:1.7}}>为此用户新建 Pro 授权</Button>
      </Section>
    </Box>
  </Box>;
}
export function UserShow() {
  return <Show title="用户综合详情"><UserOverview/></Show>;
}
