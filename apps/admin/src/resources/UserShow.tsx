import { useId, useState } from 'react';
import { Show, useGetList, useGetMany, useGetOne, useNotify, useRecordContext, useRefresh, useStore } from 'react-admin';
import { Link as RouterLink } from 'react-router-dom';
import { OperationLink } from './OperationDialogs';
import { Box, Button, Card, Chip, Collapse, Divider, IconButton, Pagination, Stack, Tooltip, Typography } from '@mui/material';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { formatAdminCalendarDate, formatAdminInstant } from '../dateDisplay';
import { auditActionLabel } from '../adminCopy';
import { adminRadii } from '../theme';

type EntitlementRow={
  product_id:string;product_name:string;product_status:string;membership_status:string;
  account_blocked:boolean;pro_active:boolean;is_lifetime:boolean;
  effective_ends_at:string|null;
};

const memberState:Record<string,{title:string;color:'success'|'warning'|'default'}>={
  active:{title:'正常',color:'success'},
  left:{title:'已退出',color:'default'},
  suspended:{title:'已暂停',color:'warning'},
};
function Section({icon,title,summary,children}:{
  icon:React.ReactNode;title:string;summary:string;children:React.ReactNode;
}) {
  const [expanded,setExpanded]=useState(false);
  const contentId=useId();
  return <Card sx={{p:{xs:2.3,md:3},minWidth:0}}>
    <Stack direction="row" spacing={1.5} sx={{alignItems:'center'}}>
      <Box sx={{width:38,height:38,borderRadius:adminRadii.circle,display:'grid',placeItems:'center',
        bgcolor:'action.hover',color:'primary.main'}}>{icon}</Box>
      <Box sx={{flex:1,minWidth:0}}>
        <Typography variant="h6">{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{overflowWrap:'anywhere'}}>{summary}</Typography>
      </Box>
      <Button size="small" aria-expanded={expanded} aria-controls={contentId}
        aria-label={(expanded?'收起':'展开')+title+'详情'}
        endIcon={<ExpandMoreRoundedIcon sx={{transform:expanded?'rotate(180deg)':'none'}}/>}
        onClick={()=>setExpanded(v=>!v)}>{expanded?'收起':'详情'}</Button>
    </Stack>
    <Collapse id={contentId} in={expanded} unmountOnExit role="region" aria-label={title+'详情'}>
      <Divider sx={{my:2}}/>
      {children}
    </Collapse>
  </Card>;
}
function UserOverview() {
  const record=useRecordContext();
  const notify=useNotify();
  const refresh=useRefresh();
  const uid=String(record?.id??'');
  const [selectedProduct]=useStore<string>('aisencore.current.product','');
  const scopeFilter=selectedProduct?{user_id:uid,product_id:selectedProduct}:{user_id:uid};
  const scopeKey=uid+'|'+selectedProduct;
  // Cache-keyed to the actual user; React-admin refresh now re-checks the
  // authoritative Pro ledger after grants and governance changes.
  const entitlements=useGetOne<{id:string;items:EntitlementRow[]}>('user-pro-entitlements',
    {id:uid},{enabled:!!uid,refetchOnWindowFocus:true,retry:false});
  const visibleEntitlements=entitlements.isPending||entitlements.isFetching||entitlements.isError?
    null:entitlements.data?.items??null;
  const entitlementFailed=entitlements.isError;
  const [memberCursor,setMemberCursor]=useState({userId:'',page:1});
  const [grantCursor,setGrantCursor]=useState({userId:'',page:1});
  const memberPage=memberCursor.userId===scopeKey?memberCursor.page:1;
  const grantPage=grantCursor.userId===scopeKey?grantCursor.page:1;
  const members=useGetList('memberships',{
    pagination:{page:memberPage,perPage:20},sort:{field:'joined_at',order:'DESC'},filter:scopeFilter,
  },{enabled:!!uid,refetchOnWindowFocus:false});
  const grants=useGetList('grants',{
    pagination:{page:grantPage,perPage:20},sort:{field:'created_at',order:'DESC'},filter:scopeFilter,
  },{enabled:!!uid,refetchOnWindowFocus:false});
  const restrictions=useGetList('restrictions',{
    pagination:{page:1,perPage:1},sort:{field:'created_at',order:'DESC'},filter:{user_id:uid,kind:'blocked'},
  },{enabled:!!uid});
  const admins=useGetList('admins',{
    pagination:{page:1,perPage:1},sort:{field:'created_at',order:'DESC'},filter:{user_id:uid},
  },{enabled:!!uid});
  const feedback=useGetList('feedback',{
    pagination:{page:1,perPage:5},sort:{field:'created_at',order:'DESC'},
    filter:{...scopeFilter,active_only:true},
  },{enabled:!!uid,refetchOnWindowFocus:false});
  const accountAudit=useGetList('audit-logs',{
    pagination:{page:1,perPage:5},sort:{field:'created_at',order:'DESC'},filter:{target_id:uid},
  },{enabled:!!uid,refetchOnWindowFocus:false});
  const productIds=[...new Set([...(members.data??[]),...(grants.data??[])].map(x=>String(x.product_id)).filter(Boolean))];
  const products=useGetMany('products',{ids:productIds},{enabled:productIds.length>0});
  if(!record)return <Box sx={{p:4}}>正在读取用户信息…</Box>;
  const blocked=(restrictions.data??[]).some(x=>x.kind==='blocked');
  const accountState=restrictions.isPending?'pending':restrictions.isError?'unknown':blocked?'blocked':'normal';
  const visibleScopedEntitlements=visibleEntitlements?.filter(x=>!selectedProduct||x.product_id===selectedProduct)??null;
  const roleState=admins.isError?'管理员资格读取失败':admins.isPending?'管理员资格读取中':
    (admins.data??[]).some(x=>x.active===true)?'平台管理员':'普通用户';
  const productLabel=(productId:unknown)=>String(
    (products.data??[]).find(item=>String(item.id)===String(productId))?.name
    ?? String(productId).slice(0,8)+'…');
  return <Box sx={{px:{xs:1,md:2},pb:3}}>
    <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',mb:2}}>
      <Button component={RouterLink} to="/users" startIcon={<ArrowBackRoundedIcon/>} variant="text">
        返回用户 · 查找账号
      </Button>
      <Chip role="status" variant="outlined"
        label={accountState==='pending'?'账号状态核查中':accountState==='unknown'?'账号状态不可用':accountState==='blocked'?'平台账号已封禁':'平台账号正常'}
        color={accountState==='pending'?'default':accountState==='unknown'?'warning':accountState==='blocked'?'error':'success'}/>
    </Stack>
    <Stack direction={{xs:'column',sm:'row'}} spacing={1.5}
      sx={{alignItems:{sm:'center'},justifyContent:'space-between',mb:2}}>
      <Box sx={{minWidth:0}}>
        <Typography component="h1" sx={{fontSize:{xs:22,md:26},fontWeight:740,
          lineHeight:1.3,overflowWrap:'anywhere'}}>
          {String(record.email??'受限用户')}
        </Typography>
        <Stack direction="row" spacing={.5} sx={{alignItems:'center',mt:.5,flexWrap:'wrap'}}>
          <Typography component="code" variant="caption" color="text.secondary" sx={{overflowWrap:'anywhere'}}>
            用户编号：{uid}
          </Typography>
          <Tooltip title="复制用户编号"><IconButton aria-label="复制用户编号" size="small"
            onClick={()=>void navigator.clipboard.writeText(uid).then(
              ()=>notify('已复制用户编号',{type:'success'}),
              ()=>notify('复制失败，请手动选择编号',{type:'warning'}))}>
            <ContentCopyRoundedIcon fontSize="small"/>
          </IconButton></Tooltip>
        </Stack>
      </Box>
      <Tooltip title="刷新用户数据">
        <IconButton aria-label="刷新用户数据" onClick={()=>refresh()}
          sx={{flexShrink:0,alignSelf:{xs:'flex-end',sm:'auto'},border:1,borderColor:'divider'}}>
          <RefreshRoundedIcon/>
        </IconButton>
      </Tooltip>
    </Stack>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(2,minmax(0,1fr))'},gap:2.5}}>
      <Section icon={<ShieldOutlinedIcon/>} title="账号状态与权限"
        summary={(accountState==='pending'?'正在核查账号状态':accountState==='unknown'?'账号状态未知':blocked?'已封禁':'正常')+' · '+roleState}>
        <Typography variant="body2">账号邮箱：{String(record.email??'未提供')}</Typography>
        <Typography variant="body2" sx={{mt:1}}>注册时间：{formatAdminCalendarDate(record.created_at)}</Typography>
        <Typography variant="body2" sx={{mt:1}}>
          邮箱验证：{record.email_confirmed_at?'已验证 · '+formatAdminInstant(record.email_confirmed_at):'尚未验证'}
        </Typography>
        <Typography variant="body2" sx={{mt:1}}>
          最近登录：{record.last_sign_in_at?formatAdminInstant(record.last_sign_in_at):'暂无登录记录'}
        </Typography>
        <Typography variant="body2" sx={{mt:1}}>平台权限：{roleState}</Typography>
        {accountState==='unknown'&&<Typography color="error" role="alert">账号状态读取失败，请勿据此判断账号正常。</Typography>}
        <Button component={OperationLink} to={'/account-actions?user_id='+encodeURIComponent(uid)}
          sx={{mt:2}} size="small">查看或管理平台账号</Button>
      </Section>
      <Section icon={<GroupsOutlinedIcon/>} title="成员关系"
        summary={members.isError?'成员记录读取失败':members.isPending?'正在读取成员记录':
          '共 '+(members.total??0)+' 条成员关系'}>
        {members.isPending?<Typography color="text.secondary">正在载入成员关系…</Typography>:
          members.isError?<Typography color="error">成员关系读取失败，请刷新。</Typography>:
          (members.data??[]).length===0?<Typography color="text.secondary">该账号尚无产品成员关系</Typography>:
          <Stack divider={<Divider/>}>
            {(members.data??[]).map(item=>{
              const state=memberState[String(item.status)]??{title:'未知状态',color:'warning' as const};
              return <Stack key={item.id} direction={{xs:'column',sm:'row'}}
                sx={{py:1.4,alignItems:{xs:'flex-start',sm:'center'},justifyContent:'space-between',gap:1.2}}>
                <Box sx={{minWidth:0}}>
                  <Typography sx={{fontSize:13,fontWeight:680}}>{productLabel(item.product_id)}</Typography>
                  <Typography variant="caption" color="text.secondary">加入于 {formatAdminCalendarDate(item.joined_at)}</Typography>
                </Box>
                <Stack direction="row" spacing={.5} sx={{alignItems:'center',flexWrap:'wrap'}}>
                  <Chip label={state.title} color={state.color} variant="outlined"/>
                  <Button component={RouterLink} to={'/memberships/'+item.id+'/show'} size="small">详情</Button>
                  <Button component={RouterLink}
                    to={'/membership-events?membership_id='+encodeURIComponent(String(item.id))}
                    size="small">事件</Button>
                </Stack>
              </Stack>;
            })}
          </Stack>}
        <Button component={RouterLink} to={'/memberships?user_id='+encodeURIComponent(uid)}
          size="small" sx={{mt:1.5}}>完整成员记录</Button>
        {(members.total??0)>20&&<Stack spacing={1} sx={{mt:2,alignItems:'flex-start'}}>
          <Typography variant="caption" color="text.secondary" role="status">
            成员记录第 {memberPage} 页，共 {members.total} 条
          </Typography>
          <Pagination aria-label="成员关系列表分页" size="small" siblingCount={0} boundaryCount={1}
            page={memberPage} count={Math.max(1,Math.ceil((members.total??0)/20))}
            onChange={(_,page)=>setMemberCursor({userId:scopeKey,page})}/>
        </Stack>}
      </Section>
      <Section icon={<WorkspacePremiumOutlinedIcon/>} title="订阅与 Pro 权益"
        summary={entitlementFailed?'当前权益读取失败':visibleScopedEntitlements===null?'正在读取订阅权益':
          visibleScopedEntitlements.length===0?'暂无当前产品权益':
          visibleScopedEntitlements.map(x=>x.product_name+'：'+
            (x.membership_status!=='active'||x.product_status!=='active'||x.account_blocked?'不可使用':
              x.is_lifetime?'永久 Pro':x.pro_active?'Pro':'Free')).join('；')}>
        <Typography sx={{fontWeight:700,mb:1}}>各产品当前权益</Typography>
        {entitlementFailed?<Typography color="error" role="alert">综合权益查询失败，当前状态未知；请重试读取。</Typography>:
          visibleEntitlements===null?<Typography color="text.secondary" role="status">正在读取服务端综合权益…</Typography>:
          visibleScopedEntitlements?.length===0?<Typography color="text.secondary">当前范围无产品权益</Typography>:
          <Stack divider={<Divider/>} sx={{mb:2}}>
            {visibleScopedEntitlements!.map(entitlement=>{
              const usable=entitlement.membership_status==='active'&&
                entitlement.product_status==='active'&&!entitlement.account_blocked;
              const status=!usable?'当前不可使用':entitlement.is_lifetime?'永久 Pro':
                entitlement.pro_active?'Pro':'Free';
              return <Stack key={entitlement.product_id} direction={{xs:'column',sm:'row'}} spacing={1}
                sx={{py:1.2,alignItems:{xs:'flex-start',sm:'center'},justifyContent:'space-between',gap:1}}>
                <Box sx={{minWidth:0}}>
                  <Typography sx={{fontWeight:700,fontSize:13}}>{entitlement.product_name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {entitlement.is_lifetime?'永久有效':entitlement.pro_active&&entitlement.effective_ends_at?
                      '综合到期 '+formatAdminInstant(entitlement.effective_ends_at):'当前无有限 Pro 余额'}
                    {!usable?' · 产品或账号资格受限':''}
                  </Typography>
                </Box>
                <Chip size="small" label={status} variant="outlined"
                  color={!usable?'warning':entitlement.pro_active?'success':'default'}/>
              </Stack>;
            })}
          </Stack>}
        <Divider sx={{mb:2}}/>
        <Typography variant="body2" color="text.secondary" sx={{mb:1.4}}>
          共 {grants.isPending?'—':grants.total??'—'} 条历史记录
        </Typography>
        {grants.isPending?<Typography color="text.secondary">正在载入权益…</Typography>:
          grants.isError?<Typography color="error">权益读取失败，请刷新。</Typography>:
          (grants.data??[]).length===0?<Typography color="text.secondary">当前没有 Pro 授权记录</Typography>:
          <Stack divider={<Divider/>}>
            {(grants.data??[]).map(g=>{
              return <Stack key={g.id} direction={{xs:'column',sm:'row'}}
                sx={{alignItems:{xs:'flex-start',sm:'center'},
                  justifyContent:'space-between',gap:1.5,py:1.2}}>
                <Box sx={{minWidth:0}}>
                  <Typography sx={{fontSize:13,fontWeight:680,overflowWrap:'anywhere'}}>
                    {productLabel(g.product_id)} · {g.grant_mode==='duration'?
                      `固定天数 ${String(g.requested_duration_days)} 天`:'永久授权'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    入账于 {formatAdminInstant(g.created_at)}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={.5} sx={{alignItems:'center',flexWrap:'wrap'}}>
                  <Chip label={g.revoked_at?'已撤销':'已入账'}
                    color={g.revoked_at?'default':'success'} variant="outlined"/>
                  <Button component={RouterLink} to={'/grants/'+g.id+'/show'} size="small">详情</Button>
                </Stack>
              </Stack>;
            })}
          </Stack>}
        {(grants.total??0)>20&&<Stack spacing={1} sx={{mt:2,alignItems:'flex-start'}}>
          <Typography variant="caption" color="text.secondary" role="status">
            授权历史第 {grantPage} 页，共 {grants.total} 条
          </Typography>
          <Pagination aria-label="授权历史列表分页" size="small" siblingCount={0} boundaryCount={1}
            page={grantPage} count={Math.max(1,Math.ceil((grants.total??0)/20))}
            onChange={(_,page)=>setGrantCursor({userId:scopeKey,page})}/>
        </Stack>}
        <Button component={OperationLink} to={'/grant-new?user_id='+encodeURIComponent(uid)} size="small" sx={{mt:1.7}}>为此用户新建 Pro 授权</Button>
        <Button component={RouterLink} to={'/grants?user_id='+encodeURIComponent(uid)}
          sx={{mt:1.7,ml:1}} size="small">完整授权记录</Button>
      </Section>
      <Section icon={<FeedbackOutlinedIcon/>} title="用户反馈"
        summary={feedback.isError?'反馈读取失败':feedback.isPending?'正在读取反馈':
          '共 '+(feedback.total??0)+' 条反馈'}>
        {feedback.isPending?<Typography role="status">正在载入用户反馈…</Typography>:
          feedback.isError?<Typography color="error" role="alert">反馈读取失败，不能判定该用户没有反馈。</Typography>:
          (feedback.data??[]).length===0?<Typography color="text.secondary">当前范围暂无反馈</Typography>:
          <Stack divider={<Divider/>}>
            {(feedback.data??[]).map(item=><Stack key={item.id} direction={{xs:'column',sm:'row'}}
              sx={{py:1.2,gap:1,alignItems:{xs:'flex-start',sm:'center'},justifyContent:'space-between'}}>
              <Box sx={{minWidth:0}}>
                <Typography sx={{fontWeight:700,fontSize:13}}>反馈 #{String(item.feedback_no??'—')}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {item.queue_state==='workbench'?'处理工作台':item.queue_state==='archived'?'已归档':
                    item.queue_state==='trashed'?'回收站':'收件箱'}
                </Typography>
                <Typography variant="body2" sx={{overflowWrap:'anywhere'}}>{String(item.content??'').slice(0,120)}</Typography>
                <Typography variant="caption" color="text.secondary">{formatAdminInstant(item.created_at)}</Typography>
              </Box>
              <Button component={RouterLink} to={'/feedback/'+item.id+'/show'} size="small">查看记录</Button>
            </Stack>)}
          </Stack>}
        {(feedback.total??0)>5&&<Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1}}>
          最近 5 条，共 {feedback.total} 条；可从反馈工作台继续查阅。
        </Typography>}
        <Button component={RouterLink} to={'/feedback/history?user_id='+encodeURIComponent(uid)}
          size="small" sx={{mt:1}}>查看此用户全部反馈记录</Button>
      </Section>
      <Section icon={<HistoryOutlinedIcon/>} title="账号管理审计"
        summary={accountAudit.isError?'管理审计读取失败':accountAudit.isPending?'正在读取管理审计':
          '共 '+(accountAudit.total??0)+' 条以此账号为目标的操作'}>
        <Typography variant="body2" color="text.secondary" sx={{mb:1}}>
          此处仅显示直接以该用户编号为目标的全平台管理审计；产品成员和授权记录请查看对应业务卡片。
        </Typography>
        {accountAudit.isPending?<Typography role="status">正在读取审计记录…</Typography>:
          accountAudit.isError?<Typography color="error" role="alert">审计读取失败，不能判定没有管理操作。</Typography>:
          (accountAudit.data??[]).length===0?<Typography color="text.secondary">尚无直接针对该账号的管理审计</Typography>:
          <Stack divider={<Divider/>}>
            {(accountAudit.data??[]).map(item=><Stack key={item.id} direction={{xs:'column',sm:'row'}}
              sx={{py:1.2,gap:1,alignItems:{xs:'flex-start',sm:'center'},justifyContent:'space-between'}}>
              <Box sx={{minWidth:0}}>
                <Typography variant="body2" sx={{fontWeight:700}}>{auditActionLabel(item.action)}</Typography>
                <Typography variant="caption" color="text.secondary">{formatAdminInstant(item.created_at)}</Typography>
              </Box>
              <Button component={RouterLink} to={'/audit-logs/'+item.id+'/show'} size="small">详情</Button>
            </Stack>)}
          </Stack>}
        <Button component={RouterLink} to={'/audit-logs?target_id='+encodeURIComponent(uid)}
          size="small" sx={{mt:1.5}}>查看此用户完整管理审计</Button>
      </Section>
    </Box>
  </Box>;
}
export function UserShow() {
  return <Show title="用户 360° 管理中心"><UserOverview/></Show>;
}
