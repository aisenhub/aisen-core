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
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import { auditActionLabel, auditTargetLabel } from '../adminCopy';
import { DomainNavigation } from './DomainNavigation';
import { adminRadii } from '../theme';
import { domainFor, domainViews } from './domainNavigationModel';
import { formatAdminCalendarDate, formatAdminInstant } from '../dateDisplay';

type ResourceName = 'memberships'|'grants'|
  'membership-events'|'admins'|'audit-logs'|'users';
type Kind='user'|'product'|'date'|'instant'|'status'|'code'|'id'|'number'|'text'|'grant-state';
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
  memberships:{title:'成员关系记录',eyebrow:'PEOPLE / MEMBERS',icon:<GroupsOutlinedIcon/>,sort:'joined_at',scoped:true,show:true,
    description:'保留为用户详情内部的产品成员管理及历史查询，不再充当用户中心的用户列表。',
    fields:[field('user_id','成员账号','user'),field('product_id','所属产品','product'),field('status','状态','status'),field('joined_at','加入日期','date')],
    search:{field:'email',label:'完整用户邮箱'},
    selectFilter:{field:'status',label:'成员状态',values:[['active','正常'],['suspended','已暂停'],['left','已退出']]},
    hint:'成员暂停仅影响指定产品，与平台级账号封禁互相独立。'},
  grants:{title:'授权记录',eyebrow:'ENTITLEMENTS / PRO',icon:<WorkspacePremiumOutlinedIcon/>,sort:'created_at',scoped:true,show:true,
    description:'查看逐笔入账来源与撤销事实；综合 Pro 到期以服务端权益摘要为准。',
    fields:[field('user_id','授权账号','user'),field('product_id','所属产品','product'),field('id','入账状态','grant-state'),field('starts_at','历史覆盖起点','instant'),field('ends_at','历史覆盖终点','instant'),field('revoked_at','撤销时刻','instant')],
    search:{field:'email',label:'完整用户邮箱'},
    selectFilter:{field:'source_type',label:'授权来源',values:[['admin','管理员'],['redeem_code','兑换码']]},
    action:{label:'新增 Pro 授权',to:'/grant-new'},hint:'单笔旧覆盖日期不是综合 Pro 到期；需以服务端统一结算为准。'},
  'membership-events':{title:'成员事件',eyebrow:'LIFECYCLE / EVENTS',icon:<EventNoteOutlinedIcon/>,sort:'created_at',
    description:'完整查看成员加入、退出、暂停及恢复的时间轨迹。',
    fields:[field('membership_id','对应成员','id'),field('action','事件类型','status'),field('from_status','之前','status'),field('to_status','之后','status'),field('created_at','发生时间','instant')],
    search:{field:'membership_id',label:'精确成员关系 UUID'},
    hint:'事件为全平台历史记录，本视图不受产品作用域切换影响。'},
  admins:{title:'管理员权限',eyebrow:'GOVERNANCE / ACCESS',icon:<AdminPanelSettingsOutlinedIcon/>,sort:'created_at',show:true,
    description:'查看平台级管理员及其资格和授权来源。',
    fields:[field('user_id','管理员账号','user'),field('active','资格','status'),field('granted_by','授权人','user'),field('created_at','授权日期','date')],
    search:{field:'user_id',label:'精确管理员 UUID'},
    action:{label:'管理员资格操作',to:'/admin-actions'},hint:'管理员资格须由受保护命令变更，最后一名有效管理员不可被撤销。'},
  'audit-logs':{title:'管理审计',eyebrow:'GOVERNANCE / AUDIT',icon:<HistoryOutlinedIcon/>,sort:'created_at',show:true,
    description:'按时间回溯业务管理命令、目标及处理理由。',
    fields:[field('action','操作类型','text'),field('actor_user_id','操作者','user'),field('target_type','对象类型','text'),field('target_id','目标编号','id'),field('created_at','执行时间','instant')],
    search:{field:'target_id',label:'精确目标 UUID'},
    hint:'demo_fixture_preview 是合成演示记录，不能作为真实合规审计证据。'},
  users:{title:'用户中心',eyebrow:'IDENTITY / CENTER',icon:<PersonSearchOutlinedIcon/>,sort:'created_at',show:true,scoped:true,
    description:'一个注册账号一行。点击「用户360°」查看账号、成员、订阅与权益、反馈及审计。',
    fields:[field('email','账号邮箱','text'),field('id','用户编号','id'),field('account_blocked','账号状态','status'),field('membership_count','关联产品','number'),field('created_at','注册时间','date')],
    search:{field:'email',label:'完整邮箱地址'},hint:'仅有效的 AAL2 平台管理员可以分页查看；支持精确邮箱查询，不支持模糊枚举。单产品视图仅包含该产品成员账号。'},
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
function CellValue({item,field,userMap,productMap,copyId}:{item:Item;field:Field;userMap:Map<string,string>;productMap:Map<string,string>;copyId?:()=>void}){
  const raw=item[field.key],value=String(raw??'');
  if(field.key==='account_blocked')return <State value={raw?'blocked':'active'}/>;
  if(field.key==='action')return <Typography variant="body2">{auditActionLabel(raw)}</Typography>;
  if(field.key==='target_type')return <Typography variant="body2">{auditTargetLabel(raw)}</Typography>;
  if(field.kind==='status')return <State value={raw}/>;
  if(field.kind==='grant-state'){
    // Grant history is an immutable credit fact, not an active coverage
    // window. Future legacy spans already contribute to the credit balance.
    return <State value={item.revoked_at?'revoked':'已入账'}/>;
  }
  if(field.kind==='date'||field.kind==='instant')return <Typography variant="body2" sx={{whiteSpace:'nowrap'}}>
    {field.kind==='instant'?formatAdminInstant(raw):formatAdminCalendarDate(raw)}</Typography>;
  if(field.kind==='number')return <Typography sx={{fontVariantNumeric:'tabular-nums',fontWeight:740}}>{text(raw)}</Typography>;
  if(field.kind==='user')return <Typography variant="body2" sx={{fontWeight:680,overflowWrap:'anywhere'}}>
    {userMap.get(value)??(value?value.slice(0,8)+'…':'—')}</Typography>;
  if(field.kind==='product')return <Typography variant="body2" sx={{fontWeight:650}}>
    {productMap.get(value)??(value?value.slice(0,8)+'…':'—')}</Typography>;
  if(field.kind==='id'&&copyId)return <Stack direction="row" spacing={.5}
    sx={{alignItems:'center',flexWrap:'wrap'}}>
    <Typography component="code" sx={{fontFamily:'ui-monospace,monospace',color:'text.secondary',
      fontSize:12,overflowWrap:'anywhere'}} title={value}>{text(raw)}</Typography>
    <Tooltip title="复制用户编号"><IconButton size="small" aria-label="复制用户编号"
      onClick={copyId}><ContentCopyRoundedIcon sx={{fontSize:16}}/></IconButton></Tooltip>
  </Stack>;
  if(field.kind==='id')return <Typography component="code" sx={{fontFamily:'Consolas,monospace',color:'text.secondary',fontSize:12}} title={value}>
    {value?value.slice(0,10)+'…':'—'}</Typography>;
  if(field.kind==='code')return <Typography component="code" sx={{fontSize:12.5,color:'#5145aa',fontWeight:730,overflowWrap:'anywhere'}}>{text(raw)}</Typography>;
  return <Typography variant="body2" sx={{fontWeight:field.key==='email'?700:500,overflowWrap:'anywhere'}}>{text(raw)}</Typography>;
}
function Action({resource,item}:{resource:ResourceName;item:Item}){
  if(resource==='users'){
    return <Button component={RouterLink}
      to={'/users/'+encodeURIComponent(String(item.id))+'/show'}
      size="small" variant="contained" endIcon={<ArrowForwardRoundedIcon/>}
      sx={{whiteSpace:'nowrap'}}>用户360°</Button>;
  }
  if(resource==='memberships'){
    // One product member relation is not the user's identity. The User menu
    // must open the account-level 360 view using the real auth user UUID.
    const uid=String(item.user_id??'');
    const valid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(uid);
    return <Stack direction="row" spacing={.75} sx={{alignItems:'center',flexWrap:'wrap',
      justifyContent:'flex-end'}}>
      {valid?<Button component={RouterLink} to={'/users/'+uid+'/show'} size="small"
        endIcon={<ArrowForwardRoundedIcon/>} sx={{whiteSpace:'nowrap'}}>
        用户360°
      </Button>:<Typography variant="caption" role="alert" color="error">
        用户编号无效，已阻止打开
      </Typography>}
      <Button component={RouterLink} to={'/memberships/'+item.id+'/show'} size="small"
        variant="outlined" sx={{whiteSpace:'nowrap'}}>成员记录</Button>
    </Stack>;
  }
  let href=configs[resource].show?'/'+resource+'/'+item.id+'/show':'';
  if(resource==='membership-events'&&item.membership_id)href='/memberships/'+item.membership_id+'/show';
  return href?<Button component={RouterLink} to={href} size="small" endIcon={<ArrowForwardRoundedIcon/>}>详情</Button>:null;
}
function EmptyScene({title,scoped,idle}:{title:string;scoped:boolean;idle:boolean}){
  return <Card sx={{py:{xs:3.5,md:4.5},px:3,textAlign:'center',
    background:'background.paper'}}>
    <Box sx={{width:46,height:46,borderRadius:adminRadii.circle,mx:'auto',mb:1.2,display:'grid',placeItems:'center',
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
  const displayFields=resource==='users'&&scope?
    [...config.fields.slice(0,3),field('scope_membership_status','当前产品成员状态','status'),
      ...config.fields.slice(3)]:config.fields;
  const [params]=useSearchParams();
  // A bounded UUID deep-link pre-fills a normal server-side list filter.
  // Never read email or redeemable code values from query parameters.
  const emailResource=resource==='memberships'||resource==='grants';
  const uuidPattern=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const linkField=emailResource?'user_id':config.search?.field;
  const linkParam=linkField&&['user_id','membership_id','batch_id','grant_id','target_id'].includes(linkField)
    ?params.get(linkField)??'':'';
  const linkQuery=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(linkParam)
    ?linkParam:'';
  const [pagination,setPagination]=useState({scope:'',page:1});
  const [sortField,setSortField]=useState(config.sort);
  const [sortOrder,setSortOrder]=useState<'ASC'|'DESC'>('DESC');
  const [state,setState]=useState('');
  const [draft,setDraft]=useState('');
  const [search,setSearch]=useState(linkQuery);
  const editingSearch=emailResource&&!!search&&draft.trim()!==search&&
    !(linkQuery===search&&draft==='');

  const notify=useNotify();
  const scoped=!!scope&&!!config.scoped;
  const scopeKey=config.scoped?scope:'';
  // Scope changes derive the effective page without cascading setState effects.
  // The active page belongs to its source product scope.
  const page=pagination.scope===scopeKey?pagination.page:1;
  const setPage=(next:number)=>setPagination({scope:scopeKey,page:next});
  // Resolve a human-entered email only through the restricted exact lookup.
  // A failed lookup must never become an unfiltered membership/grant read.
  const emailLookupRequired=emailResource&&!!search&&!uuidPattern.test(search);
  const emailLookup=useGetList('users',{
    pagination:{page:1,perPage:2},sort:{field:'id',order:'ASC'},
    filter:{email:emailLookupRequired?search:''},
  },{enabled:emailLookupRequired,refetchOnWindowFocus:false,retry:false});
  const emailReady=emailLookupRequired&&!emailLookup.isPending&&!emailLookup.isFetching&&!emailLookup.isError;
  const emailMatches=emailReady?(emailLookup.data??[]).filter(item=>
    typeof item.email==='string'&&item.email.toLowerCase()===search.toLowerCase()):[];
  const foundUser=emailReady&&emailLookup.total===1&&emailMatches.length===1?emailMatches[0]:null;
  const identityPending=emailLookupRequired&&(emailLookup.isPending||emailLookup.isFetching);
  const identityError=emailLookupRequired&&emailLookup.isError;
  const identityMissing=emailLookupRequired&&!identityPending&&!identityError&&!foundUser;
  const filter:Record<string,string>={};
  if(scoped)filter.product_id=scope;
  if(state&&config.selectFilter)filter[config.selectFilter.field]=state;
  if(search&&config.search&&(!emailLookupRequired||foundUser))
    filter[emailResource?'user_id':config.search.field]=emailLookupRequired?String(foundUser?.id):search;
  // The true User Center lists *users* using the AAL2-only paginated RPC.
  // The older identity lookup still requires explicit UUID/email when other
  // resources resolve emails, but the new directory has its own policy.
  const idle=false;
  const uuidSearch=!!config.search&&['user_id','grant_id','batch_id','membership_id','target_id'].includes(config.search.field);
  const invalidSearch=uuidSearch&&!!draft.trim()&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draft.trim());
  const query=useGetList(resource,{
    pagination:{page,perPage:20},sort:{field:sortField,order:sortOrder},filter
  },{enabled:!idle&&!editingSearch&&!identityPending&&!identityError&&!identityMissing,refetchOnWindowFocus:false});
  // React Query may keep retrying a 503 while retaining cached rows. Surface
  // the first failed attempt instead of reporting those rows as current.
  const failedRead=!idle&&!editingSearch&&!identityPending&&!identityError&&!identityMissing&&
    (query.isError||(query.isFetching&&query.failureCount>0));
  const readError=query.error??query.failureReason;
  // Cached rows must not drive supplemental identity reads while the operator
  // is switching to another email or an exact lookup is unresolved.
  const unsafeIdentity=editingSearch||identityPending||identityError||identityMissing;
  const rows=useMemo(()=>(unsafeIdentity?[]:(query.data??[])) as Item[],
    [unsafeIdentity,query.data]);
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
  const copy=async(id:string,label='记录编号')=>{
    try{await navigator.clipboard.writeText(id);notify('已复制'+label,{type:'success'})}
    catch{notify('复制失败，请手动选择编号',{type:'warning'})}
  };
  return <Box className="aisen-admin-list-page" sx={{px:{xs:2,md:3,lg:4.5},py:{xs:2,lg:2.5},
    pb:{xs:7,md:2},maxWidth:1720,mx:'auto',minWidth:0,width:'100%'}}>
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
          {editingSearch?'邮箱已修改，查询后显示新结果':identityPending?'正在核实邮箱':identityError?
            '邮箱查询失败':identityMissing?'未找到唯一账号':idle?'等待完整邮箱查询':failedRead?'记录读取失败，当前状态未确认':
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
            type={resource==='users'||emailResource?'email':undefined}
            helperText={invalidSearch?'请输入完整、有效的 UUID':undefined}
            onChange={event=>setDraft(event.target.value)} sx={{flex:1,minWidth:0}}/>
          <Button type="submit" disabled={invalidSearch} variant="contained" startIcon={<SearchRoundedIcon/>}>查询</Button>
        </Box>}
        {(state||search)&&<Button size="small" onClick={()=>{setState('');setSearch('');setDraft('');setPage(1)}}>清除筛选</Button>}
        <Tooltip title="刷新数据"><span><IconButton aria-label="刷新数据"
          disabled={unsafeIdentity||idle||query.isPending}
          onClick={()=>{if(!unsafeIdentity&&!idle)void query.refetch()}}
          sx={{border:'1px solid #e4e7f0',alignSelf:{xs:'flex-end',lg:'auto'}}}><RefreshRoundedIcon/></IconButton></span></Tooltip>
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
    {identityPending&&<Alert severity="info" role="status" sx={{mb:2}}>正在精确查找用户邮箱…</Alert>}
    {identityError&&<Alert severity="error" role="alert" sx={{mb:2}}>账号查询失败或权限不足，未展示其他用户记录。请核实权限或重试查询。</Alert>}
    {identityMissing&&<Alert severity="info" role="status" sx={{mb:2}}>未找到此邮箱的唯一注册账号，当前未展示成员或授权记录。</Alert>}
    {pageOutOfRange?<Alert severity="info" sx={{mb:2}}>当前页已超出结果范围。
      <Button onClick={()=>setPage(1)}>返回第一页</Button>
    </Alert>:null}
    {!failedRead&&(editingSearch||identityPending||identityError||identityMissing)?
      null:!failedRead&&(idle||(!query.isPending&&rows.length===0))?
      <EmptyScene title={config.title} scoped={scoped} idle={idle}/>:
      !failedRead&&<Card sx={{overflow:'hidden',display:'flex',flexDirection:'column',
        flex:'1 1 auto',minHeight:0}}>
        {desktop&&<TableContainer sx={{maxWidth:'100%',minHeight:0,flex:'1 1 auto',
          overflowX:'auto',overflowY:'auto',overscrollBehavior:'contain'}}>
          <Table stickyHeader sx={{minWidth:700}}><TableHead><TableRow>
            {displayFields.map(f=>{
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
            <TableRow><TableCell colSpan={displayFields.length+1} sx={{p:0,borderBottom:0}}>
              <Box sx={{minHeight:194,display:'flex',alignItems:'center',justifyContent:'center',gap:1.5}}>
                <CircularProgress size={22} aria-hidden/>
                <Typography color="text.secondary" variant="body2">正在读取记录…</Typography>
              </Box>
            </TableCell></TableRow>:
            rows.map(item=><TableRow hover key={item.id}>
              {displayFields.map(f=><TableCell key={f.key}>
                <CellValue item={item} field={f} userMap={userMap} productMap={productMap}
                  copyId={resource==='users'&&f.key==='id'?()=>void copy(String(item.id),'用户编号'):undefined}/>
              </TableCell>)}
              <TableCell align="right"><Stack direction="row" spacing={.2}
                sx={{justifyContent:'flex-end',alignItems:'center'}}>
                {resource!=='users'&&<Tooltip title="复制完整编号"><IconButton size="small" aria-label="复制完整编号"
                  onClick={()=>void copy(String(item.id))}><ContentCopyRoundedIcon sx={{fontSize:16}}/></IconButton></Tooltip>}
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
              <Stack direction={resource==='memberships'?'column':'row'}
                sx={{justifyContent:'space-between',alignItems:'flex-start',mb:1.8,gap:1}}>
                <Box sx={{minWidth:0,flex:1}}>
                  <Typography variant="overline" color="primary.main">第 {index+1+(page-1)*20} 条</Typography>
                  <Box sx={{mt:.65}}><CellValue item={item} field={displayFields[0]} userMap={userMap} productMap={productMap}/></Box>
                </Box>
                <Action resource={resource} item={item}/>
              </Stack>
              <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:2}}>
                {displayFields.slice(1).map(f=><Box key={f.key} sx={{minWidth:0}}>
                  <Typography variant="caption" color="text.secondary" sx={{display:'block',mb:.45}}>{f.label}</Typography>
                  <CellValue item={item} field={f} userMap={userMap} productMap={productMap}
                    copyId={resource==='users'&&f.key==='id'?()=>void copy(String(item.id),'用户编号'):undefined}/>
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
export const EventsList=()=> <ResourceWorkspace resource="membership-events"/>;
export const AdminsList=()=> <ResourceWorkspace resource="admins"/>;
export const AuditList=()=> <ResourceWorkspace resource="audit-logs"/>;
export const UsersList=()=> <ResourceWorkspace resource="users"/>;