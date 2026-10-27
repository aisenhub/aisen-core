import { OperationLink } from './OperationDialogs';
import { useMemo, useState } from 'react';
import { useGetList, useGetMany, useNotify, useStore } from 'react-admin';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Divider, IconButton, MenuItem,
  Pagination, Stack, Table, TableBody, TableCell, TableContainer, TableHead, useMediaQuery,
  TableRow, TableSortLabel, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import GppBadOutlinedIcon from '@mui/icons-material/GppBadOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import { auditActionLabel, auditTargetLabel } from '../adminCopy';
import { DomainNavigation } from './DomainNavigation';
import { domainFor, domainViews } from './domainNavigationModel';
import { formatAdminCalendarDate, formatAdminInstant } from '../dateDisplay';

type ResourceName = 'memberships'|'grants'|'code-batches'|'codes'|'redemptions'|
  'membership-events'|'admins'|'restrictions'|'audit-logs'|'users';
type Kind='user'|'product'|'date'|'instant'|'status'|'code'|'id'|'number'|'text'|'grant-state'|'code-state';
type Field={key:string;label:string;kind:Kind};
type Config={
  title:string;eyebrow:string;description:string;icon:React.ReactNode;fields:Field[];
  sort:string;scoped?:boolean;show?:boolean;
  action?:{label:string;to:string};hint?:string;
  search?:{field:string;label:string};
  selectFilter?:{field:string;label:string;values:[string,string][]};
};
const field=(key:string,label:string,kind:Kind):Field=>({key,label,kind});
const configs:Record<ResourceName,Config>={
  memberships:{title:'成员关系',eyebrow:'PEOPLE / MEMBERS',icon:<GroupsOutlinedIcon/>,sort:'joined_at',scoped:true,show:true,
    description:'从账号到产品关系，追踪每位成员的状态与加入时间。',
    fields:[field('user_id','成员账号','user'),field('product_id','所属产品','product'),field('status','状态','status'),field('joined_at','加入日期','date')],
    search:{field:'user_id',label:'精确成员 UUID'},
    selectFilter:{field:'status',label:'成员状态',values:[['active','正常'],['suspended','已暂停'],['left','已退出']]},
    hint:'成员暂停仅影响指定产品，与平台级账号封禁互相独立。'},
  grants:{title:'授权记录',eyebrow:'ENTITLEMENTS / PRO',icon:<WorkspacePremiumOutlinedIcon/>,sort:'created_at',scoped:true,show:true,
    description:'查看权益的授权来源、有效期限和撤销状态。',
    fields:[field('user_id','授权账号','user'),field('product_id','所属产品','product'),field('id','权益状态','grant-state'),field('starts_at','生效时刻','instant'),field('ends_at','结束时刻','instant'),field('revoked_at','撤销时刻','instant')],
    search:{field:'user_id',label:'精确授权用户 UUID'},
    selectFilter:{field:'source_type',label:'授权来源',values:[['admin','管理员'],['redeem_code','兑换码']]},
    action:{label:'新增 Pro 授权',to:'/grant-new'},hint:'列表包含历史记录，过期和撤销授权不等于当前可用。'},
  'code-batches':{title:'发行批次',eyebrow:'ISSUANCE / BATCHES',icon:<ConfirmationNumberOutlinedIcon/>,sort:'created_at',scoped:true,show:true,
    description:'每一次批量发行都对应唯一请求编号与清晰的业务归属。',
    fields:[field('request_id','请求编号','code'),field('product_id','适用产品','product'),field('quantity','发行数量','number'),field('grant_duration_days','权益天数','number'),field('created_at','发行时间','instant')],
    action:{label:'发行兑换码',to:'/issue-codes'},search:{field:'request_id',label:'准确请求编号'},
    hint:'安全限制：兑换码明文仅在首次发行响应出现，此处只展示批次摘要。'},
  codes:{title:'兑换码记录',eyebrow:'REDEMPTION / SECURITY',icon:<VerifiedUserOutlinedIcon/>,sort:'created_at',scoped:true,show:true,
    description:'安全查看码前缀、核销次数和到期及撤销状态。',
    fields:[field('code_prefix','安全前缀','code'),field('product_id','所属产品','product'),field('id','码状态','code-state'),field('redeemed_count','已核销','number'),field('max_redemptions','使用上限','number'),field('expires_at','到期时间','instant'),field('revoked_at','撤销时间','instant')],
    search:{field:'batch_id',label:'精确批次 UUID'},
    action:{label:'发行新批次',to:'/issue-codes'},hint:'不会显示完整兑换码明文、码哈希，也不支持二次获取。'},
  redemptions:{title:'核销记录',eyebrow:'REDEMPTION / HISTORY',icon:<FactCheckOutlinedIcon/>,sort:'created_at',scoped:true,
    description:'核销是一项可追溯的权益事实，记录对应账号、产品及生效授权。',
    fields:[field('user_id','核销账号','user'),field('product_id','所属产品','product'),field('code_id','安全码编号','id'),field('grant_id','授权编号','id'),field('created_at','核销时间','instant')],
    search:{field:'grant_id',label:'精确授权 UUID'},
    hint:'撤销兑换码不影响已经核销生效的授权。'},
  'membership-events':{title:'成员事件',eyebrow:'LIFECYCLE / EVENTS',icon:<EventNoteOutlinedIcon/>,sort:'created_at',
    description:'完整查看成员加入、退出、暂停及恢复的时间轨迹。',
    fields:[field('membership_id','对应成员','id'),field('action','事件类型','status'),field('from_status','之前','status'),field('to_status','之后','status'),field('created_at','发生时间','instant')],
    search:{field:'membership_id',label:'精确成员关系 UUID'},
    hint:'事件为全平台历史记录，本视图不受产品作用域切换影响。'},
  admins:{title:'管理员权限',eyebrow:'GOVERNANCE / ACCESS',icon:<AdminPanelSettingsOutlinedIcon/>,sort:'created_at',show:true,
    description:'查看平台级管理员及其资格和授权来源。',
    fields:[field('user_id','管理员账号','user'),field('active','资格','status'),field('granted_by','授权人','user'),field('created_at','授权日期','date')],
    search:{field:'user_id',label:'精确管理员 UUID'},
    action:{label:'账号管理操作',to:'/account-actions'},hint:'管理员资格须由受保护命令变更，最后一名有效管理员不可被撤销。'},
  restrictions:{title:'账号限制',eyebrow:'GOVERNANCE / SAFETY',icon:<GppBadOutlinedIcon/>,sort:'created_at',show:true,
    description:'集中审查全平台账号限制与执行理由。',
    fields:[field('user_id','目标账号','user'),field('kind','限制类型','status'),field('reason_code','原因','text'),field('created_at','限制日期','date')],
    search:{field:'user_id',label:'精确账号 UUID'},
    action:{label:'账号管理操作',to:'/account-actions'},hint:'平台封禁与产品成员暂停的影响范围不同。'},
  'audit-logs':{title:'管理审计',eyebrow:'GOVERNANCE / AUDIT',icon:<HistoryOutlinedIcon/>,sort:'created_at',show:true,
    description:'按时间回溯业务管理命令、目标及处理理由。',
    fields:[field('action','操作类型','text'),field('actor_user_id','操作者','user'),field('target_type','对象类型','text'),field('target_id','目标编号','id'),field('created_at','执行时间','instant')],
    search:{field:'target_id',label:'精确目标 UUID'},
    hint:'demo_fixture_preview 是合成演示记录，不能作为真实合规审计证据。'},
  users:{title:'查找账号',eyebrow:'IDENTITY / LOOKUP',icon:<PersonSearchOutlinedIcon/>,sort:'id',show:true,
    description:'使用完整邮箱定位账号，再查看其产品成员关系和权益。',
    fields:[field('email','账号邮箱','text'),field('id','用户编号','id'),field('created_at','注册时间','date'),field('last_sign_in_at','最后登录','date')],
    search:{field:'email',label:'完整邮箱地址'},hint:'基于身份隐私要求，不允许枚举全部账号或模糊搜索。'},
};
type Item=Record<string,unknown>&{id:string|number};
const text=(value:unknown)=>value==null||value===''?'—':String(value);
function State({value}:{value:unknown}){
  const key=typeof value==='boolean'?(value?'active':'revoked'):String(value??'');
  const zh:Record<string,string>={active:'正常',suspended:'暂停',left:'已退出',blocked:'已封禁',revoked:'已撤销',
    draft:'草稿',join:'加入',leave:'退出',suspend:'暂停',restore:'恢复',pro:'Pro'};
  const good=['active','join','restore'].includes(key),bad=['suspended','blocked','revoked','suspend'].includes(key);
  return <Chip label={zh[key]??(key||'—')} size="small" variant="outlined"
    color={good?'success':bad?'warning':'default'} sx={{fontWeight:750}}/>;
}
function CellValue({item,field,userMap,productMap}:{item:Item;field:Field;userMap:Map<string,string>;productMap:Map<string,string>}){
  const [now]=useState(()=>Date.now());
  const raw=item[field.key],value=String(raw??'');
  if(field.key==='action')return <Typography variant="body2">{auditActionLabel(raw)}</Typography>;
  if(field.key==='target_type')return <Typography variant="body2">{auditTargetLabel(raw)}</Typography>;
  if(field.kind==='status')return <State value={raw}/>;
  if(field.kind==='grant-state'){
    const revoked=!!item.revoked_at,
      future=Date.parse(String(item.starts_at))>now,
      expired=!!item.ends_at&&Date.parse(String(item.ends_at))<=now;
    return <State value={revoked?'revoked':future?'待生效':expired?'已过期':'active'}/>;
  }
  if(field.kind==='code-state'){
    const revoked=!!item.revoked_at,
      used=Number(item.redeemed_count)>=Number(item.max_redemptions),
      expired=!!item.expires_at&&Date.parse(String(item.expires_at))<=now;
    return <State value={revoked?'revoked':used?'已用尽':expired?'已过期':'可核销'}/>;
  }
  if(field.kind==='date'||field.kind==='instant')return <Typography variant="body2" sx={{whiteSpace:'nowrap'}}>
    {field.kind==='instant'?formatAdminInstant(raw):formatAdminCalendarDate(raw)}</Typography>;
  if(field.kind==='number')return <Typography sx={{fontVariantNumeric:'tabular-nums',fontWeight:740}}>{text(raw)}</Typography>;
  if(field.kind==='user')return <Typography variant="body2" sx={{fontWeight:680,overflowWrap:'anywhere'}}>
    {userMap.get(value)??(value?value.slice(0,8)+'…':'—')}</Typography>;
  if(field.kind==='product')return <Typography variant="body2" sx={{fontWeight:650}}>
    {productMap.get(value)??(value?value.slice(0,8)+'…':'—')}</Typography>;
  if(field.kind==='id')return <Typography component="code" sx={{fontFamily:'Consolas,monospace',color:'#53627a',fontSize:12}} title={value}>
    {value?value.slice(0,10)+'…':'—'}</Typography>;
  if(field.kind==='code')return <Typography component="code" sx={{fontSize:12.5,color:'#5145aa',fontWeight:730,overflowWrap:'anywhere'}}>{text(raw)}</Typography>;
  return <Typography variant="body2" sx={{fontWeight:field.key==='email'?700:500,overflowWrap:'anywhere'}}>{text(raw)}</Typography>;
}
function Action({resource,item}:{resource:ResourceName;item:Item}){
  let href=configs[resource].show?'/'+resource+'/'+item.id+'/show':'';
  if(resource==='redemptions'&&item.grant_id)href='/grants/'+item.grant_id+'/show';
  if(resource==='membership-events'&&item.membership_id)href='/memberships/'+item.membership_id+'/show';
  return href?<Button component={RouterLink} to={href} size="small" endIcon={<ArrowForwardRoundedIcon/>}>详情</Button>:null;
}
function EmptyScene({title,scoped,idle}:{title:string;scoped:boolean;idle:boolean}){
  return <Card sx={{py:{xs:3.5,md:4.5},px:3,textAlign:'center',
    background:'background.paper'}}>
    <Box sx={{width:46,height:46,borderRadius:3.5,mx:'auto',mb:1.2,display:'grid',placeItems:'center',
      bgcolor:'#eeebff',color:'primary.main'}}><InboxOutlinedIcon sx={{fontSize:24}}/></Box>
    <Typography variant="h5" sx={{mb:1}}>{idle?'请输入邮箱查找账号':scoped?'当前产品暂无'+title:'暂无匹配的'+title}</Typography>
    <Typography color="text.secondary" sx={{fontSize:13.5,maxWidth:460,mx:'auto',lineHeight:1.9}}>
      {idle?'请输入完整邮箱查找账号。':
        scoped?'可调整筛选条件，或通过顶部选择其他工作范围。':
          '尝试调整筛选条件。'}
    </Typography>
  </Card>;
}
function readFailureMessage(error:unknown){
  const status=(error as {status?:number}|null)?.status;
  if(status===401)return '登录会话已失效，请重新登录后读取记录。';
  if(status===403)return '当前管理员资格或 TOTP 验证不满足读取要求，请重新验证权限。';
  if(status===409)return '记录状态已变化，请刷新列表后重新核对。';
  if(status===429)return '请求过于频繁，请稍后重试。';
  if(status===503)return '数据服务暂时不可用，请稍后重试。';
  const message=error instanceof Error?error.message:'';
  if(/failed to fetch|network|fetch failed|超时|timeout|网络|连接中断/i.test(message))
    return '网络连接或响应超时，记录尚未读取成功。请检查网络后重试。';
  return '记录读取失败，未能确认当前数据。请稍后重试。';
}
export function ResourceWorkspace({resource}:{resource:ResourceName}){
  const [params]=useSearchParams();
  // A new deep-link UUID is a new view instance; React resets the search form
  // with a stable URL key, without an effect-triggered render cascade.
  return <ResourceWorkspaceView key={resource+'?'+params.toString()} resource={resource}/>;
}
function ResourceWorkspaceView({resource}:{resource:ResourceName}){
  const config=configs[resource];
  const desktop=useMediaQuery('(min-width:900px)');
  const [scope]=useStore<string>('aisencore.current.product','');
  const [params]=useSearchParams();
  // A bounded UUID deep-link pre-fills a normal server-side list filter.
  // Never read email or redeemable code values from query parameters.
  const linkField=config.search?.field;
  const linkParam=linkField&&['user_id','membership_id','batch_id','grant_id'].includes(linkField)
    ?params.get(linkField)??'':'';
  const linkQuery=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(linkParam)
    ?linkParam:'';
  const [pagination,setPagination]=useState({scope:'',page:1});
  const [sortField,setSortField]=useState(config.sort);
  const [sortOrder,setSortOrder]=useState<'ASC'|'DESC'>('DESC');
  const [state,setState]=useState('');
  const [draft,setDraft]=useState(linkQuery);
  const [search,setSearch]=useState(linkQuery);

  const notify=useNotify();
  const scoped=!!scope&&!!config.scoped;
  const scopeKey=config.scoped?scope:'';
  // Scope changes derive the effective page without cascading setState effects.
  // The active page belongs to its source product scope.
  const page=pagination.scope===scopeKey?pagination.page:1;
  const setPage=(next:number)=>setPagination({scope:scopeKey,page:next});
  const filter:Record<string,string>={};
  if(scoped)filter.product_id=scope;
  if(state&&config.selectFilter)filter[config.selectFilter.field]=state;
  if(search&&config.search)filter[config.search.field]=search;
  const idle=resource==='users'&&!search;
  const uuidSearch=!!config.search&&['user_id','grant_id','batch_id','membership_id','target_id'].includes(config.search.field);
  const invalidSearch=uuidSearch&&!!draft.trim()&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draft.trim());
  const query=useGetList(resource,{
    pagination:{page,perPage:20},sort:{field:sortField,order:sortOrder},filter
  },{enabled:!idle,refetchOnWindowFocus:false});
  // React Query may keep retrying a 503 while retaining cached rows. Surface
  // the first failed attempt instead of reporting those rows as current.
  const failedRead=!idle&&(query.isError||(query.isFetching&&query.failureCount>0));
  const readError=query.error??query.failureReason;
  const rows=useMemo(()=>(query.data??[]) as Item[],[query.data]);
  const userIds=useMemo(()=>[...new Set(rows.flatMap(r=>['user_id','actor_user_id','granted_by']
    .map(k=>r[k]).filter(Boolean).map(String)))].slice(0,100),[rows]);
  const productIds=useMemo(()=>[...new Set(rows.map(r=>r.product_id).filter(Boolean).map(String))].slice(0,100),[rows]);
  const identities=useGetMany('users',{ids:userIds},{enabled:userIds.length>0});
  const products=useGetMany('products',{ids:productIds},{enabled:productIds.length>0});
  const userMap=new Map((identities.data??[]).map(r=>[String(r.id),text(r.email)]));
  const productMap=new Map((products.data??[]).map(r=>[String(r.id),text(r.name)]));
  const total=query.total??0;
  const pageOutOfRange=page>1&&!query.isPending&&!failedRead&&page>Math.max(1,Math.ceil(total/20));
  const changeSort=(field:string)=>{
    if(resource==='users')return; // identity lookup deliberately does not offer enumeration or sortable listings
    if(sortField===field)setSortOrder(old=>old==='ASC'?'DESC':'ASC');
    else{setSortField(field);setSortOrder('ASC')}
    setPage(1);
  };
  const copy=async(id:string)=>{
    try{await navigator.clipboard.writeText(id);notify('已复制记录编号',{type:'success'})}
    catch{notify('无法访问剪贴板',{type:'warning'})}
  };
  return <Box sx={{px:{xs:2,md:3,lg:4.5},py:{xs:2,lg:2.5},pb:7,maxWidth:1720,mx:'auto',minWidth:0,width:'100%'}}>
    <DomainNavigation resource={resource}/>
    {domainFor[resource]?
      <Typography component="h1" sx={{
        position:'absolute',width:'1px',height:'1px',p:0,m:-1,overflow:'hidden',
        clip:'rect(0,0,0,0)',whiteSpace:'nowrap',border:0,
      }}>{domainViews[domainFor[resource]].title} · {config.title}</Typography>:
      <Typography component="h1" sx={{fontSize:{xs:22,md:26},lineHeight:1.3,fontWeight:740,mb:2}}>
        {config.title}
      </Typography>}
    <Stack direction={{xs:'column',md:'row'}} spacing={2} sx={{alignItems:{md:'center'},justifyContent:'space-between',mb:1.5}}>
      <Box sx={{minWidth:0}}>
        <Typography component="div" sx={{fontSize:13,fontWeight:660,color:'text.secondary',whiteSpace:'nowrap'}} role="status" aria-live="polite">
          {idle?'等待完整邮箱查询':failedRead?'记录读取失败，当前状态未确认':
            query.isPending?'正在加载记录':query.isFetching?'正在更新记录 · 共 '+total+' 条':'共 '+total+' 条记录 · 第 '+page+' 页'}
        </Typography>
        {!config.scoped&&<Typography component="div" sx={{fontSize:11,color:'text.secondary',mt:.4}}>全平台数据</Typography>}
      </Box>
      <Stack direction={{xs:'column',lg:'row'}} spacing={1.2}
        sx={{alignItems:{lg:'center'},minWidth:0,maxWidth:'100%',flexWrap:'wrap'}}>
        {config.selectFilter&&<TextField select label={config.selectFilter.label} size="small"
          value={state} sx={{width:{xs:'100%',lg:146}}}
          onChange={event=>{setState(event.target.value);setPage(1)}}>
          <MenuItem value="">全部状态</MenuItem>
          {config.selectFilter.values.map(v=><MenuItem key={v[0]} value={v[0]}>{v[1]}</MenuItem>)}
        </TextField>}
        {config.search&&<Box component="form" sx={{display:'flex',gap:1,minWidth:0,width:{xs:'100%',lg:330}}}
          onSubmit={event=>{event.preventDefault();if(invalidSearch)return;setSearch(draft.trim());setPage(1)}}>
          <TextField label={config.search.label} size="small" value={draft} error={invalidSearch}
            helperText={invalidSearch?'请输入完整、有效的 UUID':undefined}
            onChange={event=>setDraft(event.target.value)} sx={{flex:1,minWidth:0}}/>
          <Button type="submit" disabled={invalidSearch} variant="contained" startIcon={<SearchRoundedIcon/>}>查询</Button>
        </Box>}
        {(state||search)&&<Button size="small" onClick={()=>{setState('');setSearch('');setDraft('');setPage(1)}}>清除筛选</Button>}
        <Tooltip title="刷新数据"><IconButton aria-label="刷新数据" onClick={()=>void query.refetch()}
          sx={{border:'1px solid #e4e7f0',alignSelf:{xs:'flex-end',lg:'auto'}}}><RefreshRoundedIcon/></IconButton></Tooltip>
        {config.action&&<Button component={OperationLink} to={config.action.to} variant="contained"
          sx={{whiteSpace:'nowrap',alignSelf:{xs:'flex-start',lg:'center'}}}>{config.action.label}</Button>}
      </Stack>
    </Stack>
    {failedRead?<Alert severity="error" role="alert" sx={{mb:2}}>
      {readFailureMessage(readError)}
      {[401,403].includes((readError as {status?:number}|null)?.status??0)?
        <Button component={RouterLink} to="/login">重新验证</Button>:
        <Button onClick={()=>void query.refetch()}>重试读取</Button>}
    </Alert>:null}
    {pageOutOfRange?<Alert severity="info" sx={{mb:2}}>当前页已超出结果范围。
      <Button onClick={()=>setPage(1)}>返回第一页</Button>
    </Alert>:null}
    {!failedRead&&(idle||(!query.isPending&&rows.length===0))?
      <EmptyScene title={config.title} scoped={scoped} idle={idle}/>:
      !failedRead&&<Card sx={{overflow:'hidden'}}>
        {desktop&&<TableContainer sx={{maxWidth:'100%',overflowX:'auto'}}>
          <Table sx={{minWidth:700}}><TableHead><TableRow>
            {config.fields.map(f=>{
              const sortable=resource!=='users'&&!['grant-state','code-state'].includes(f.kind);
              return <TableCell key={f.key} sortDirection={sortable&&sortField===f.key?(sortOrder==='ASC'?'asc':'desc'):false}
                sx={{minWidth:f.kind==='user'?180:110}}>
                {sortable?<TableSortLabel active={sortField===f.key} direction={sortField===f.key?(sortOrder==='ASC'?'asc':'desc'):'asc'}
                  onClick={()=>changeSort(f.key)}>{f.label}</TableSortLabel>:f.label}
              </TableCell>;
            })}
            <TableCell align="right">查看</TableCell>
          </TableRow></TableHead>
          <TableBody>{query.isPending?
            <TableRow><TableCell colSpan={config.fields.length+1} sx={{p:0,borderBottom:0}}>
              <Box sx={{minHeight:194,display:'flex',alignItems:'center',justifyContent:'center',gap:1.5}}>
                <CircularProgress size={22} aria-hidden/>
                <Typography color="text.secondary" variant="body2">正在读取记录…</Typography>
              </Box>
            </TableCell></TableRow>:
            rows.map(item=><TableRow hover key={item.id}>
              {config.fields.map(f=><TableCell key={f.key}>
                <CellValue item={item} field={f} userMap={userMap} productMap={productMap}/>
              </TableCell>)}
              <TableCell align="right"><Stack direction="row" spacing={.2}
                sx={{justifyContent:'flex-end',alignItems:'center'}}>
                <Tooltip title="复制完整编号"><IconButton size="small" aria-label="复制完整编号"
                  onClick={()=>void copy(String(item.id))}><ContentCopyRoundedIcon sx={{fontSize:16}}/></IconButton></Tooltip>
                <Action resource={resource} item={item}/>
              </Stack></TableCell>
            </TableRow>)}</TableBody></Table>
        </TableContainer>}
        {!desktop&&<Box>
          {query.isPending?
            <Box sx={{minHeight:194,display:'flex',alignItems:'center',justifyContent:'center',gap:1.5}}>
              <CircularProgress size={22} aria-hidden/>
              <Typography color="text.secondary" variant="body2">正在读取记录…</Typography>
            </Box>:
            rows.map((item,index)=><Box key={item.id} sx={{p:2.5,borderBottom:index+1===rows.length?'none':'1px solid #edf0f5'}}>
              <Stack direction="row" sx={{justifyContent:'space-between',alignItems:'flex-start',mb:1.8}}>
                <Box sx={{minWidth:0,flex:1}}>
                  <Typography variant="overline" color="primary.main">第 {index+1+(page-1)*20} 条</Typography>
                  <Box sx={{mt:.65}}><CellValue item={item} field={config.fields[0]} userMap={userMap} productMap={productMap}/></Box>
                </Box>
                <Action resource={resource} item={item}/>
              </Stack>
              <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:2}}>
                {config.fields.slice(1).map(f=><Box key={f.key} sx={{minWidth:0}}>
                  <Typography variant="caption" color="text.secondary" sx={{display:'block',mb:.45}}>{f.label}</Typography>
                  <CellValue item={item} field={f} userMap={userMap} productMap={productMap}/>
                </Box>)}
              </Box>
            </Box>)}
        </Box>}
        {!query.isPending&&<>
          <Divider/>
          <Stack direction={{xs:'column',sm:'row'}} spacing={1.2} sx={{p:2.5,alignItems:'center',justifyContent:'space-between'}}>
            <Typography variant="caption" color="text.secondary">
              第 {(page-1)*20+1}–{Math.min(page*20,total)} 条，共 {total} 条
            </Typography>
            <Pagination count={Math.max(1,Math.ceil(total/20))} page={page}
              onChange={(_,next)=>setPage(next)} size="small" color="primary" siblingCount={0}
              showFirstButton showLastButton/>
          </Stack>
        </>}
      </Card>}
  </Box>;
}
export const MembersList=()=> <ResourceWorkspace resource="memberships"/>;
export const GrantsList=()=> <ResourceWorkspace resource="grants"/>;
export const BatchesList=()=> <ResourceWorkspace resource="code-batches"/>;
export const CodesList=()=> <ResourceWorkspace resource="codes"/>;
export const RedemptionsList=()=> <ResourceWorkspace resource="redemptions"/>;
export const EventsList=()=> <ResourceWorkspace resource="membership-events"/>;
export const AdminsList=()=> <ResourceWorkspace resource="admins"/>;
export const RestrictionsList=()=> <ResourceWorkspace resource="restrictions"/>;
export const AuditList=()=> <ResourceWorkspace resource="audit-logs"/>;
export const UsersList=()=> <ResourceWorkspace resource="users"/>;
