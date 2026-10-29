import { Show, useGetOne, useNotify, useRecordContext, useStore } from 'react-admin';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Card, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import AppsOutlinedIcon from '@mui/icons-material/AppsOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { ProtectedAction } from './lists';
import { OperationLink } from './OperationDialogs';
import { formatAdminInstant } from '../dateDisplay';
import { adminRadii } from '../theme';

type Name='products'|'memberships'|'grants'|'admins'|'audit-logs';
type Property={key:string;label:string;type?:'time'|'state'|'user'|'product'|'json'|'code'};
const props=(...rows:[string,string,Property['type']][])=>rows.map(([key,label,type])=>({key,label,type}));
const resources:Record<Name,{
  title:string;subtitle:string;icon:React.ReactNode;eyebrow:string;fields:Property[];
}>={
  products:{title:'产品详情',eyebrow:'PRODUCT / DETAILS',icon:<AppsOutlinedIcon/>,
    subtitle:'管理产品的生命周期、状态与业务标识。',
    fields:props(['name','产品名称',undefined],['product_key','产品键','code'],
      ['description','产品介绍',undefined],['status','服务状态','state'],
      ['created_at','创建时间','time'],['updated_at','更新时间','time'])},
  memberships:{title:'成员详情',eyebrow:'MEMBER / PROFILE',icon:<GroupsOutlinedIcon/>,
    subtitle:'一个账号在指定产品中的独立成员关系，暂停和恢复须注明理由。',
    fields:props(['user_id','关联账号','user'],['product_id','所属产品','product'],
      ['status','当前状态','state'],['pre_suspend_status','暂停前状态','state'],
      ['joined_at','加入时间','time'],['updated_at','更新时间','time'])},
  grants:{title:'Pro 授权详情',eyebrow:'PRO / ENTITLEMENT',icon:<WorkspacePremiumOutlinedIcon/>,
    subtitle:'逐笔追溯入账面值、历史覆盖日期与撤销事实。当前综合到期以服务端权益摘要为准。',
    fields:props(['user_id','关联账号','user'],['product_id','所属产品','product'],['tier','权益类型',undefined],
      ['source_type','授权来源',undefined],['grant_mode','授予模式',undefined],
      ['requested_duration_days','入账天数',undefined],['starts_at','历史覆盖起点','time'],
      ['ends_at','历史覆盖终点（非综合到期）','time'],['revoked_at','撤销时间','time'],['created_at','入账记录时间','time'])},
  admins:{title:'管理员资格详情',eyebrow:'GOVERNANCE / ADMIN',icon:<AdminPanelSettingsOutlinedIcon/>,
    subtitle:'平台敏感权限资格及其授权来源，遵守最后一名有效管理员保护。',
    fields:props(['user_id','管理员账号','user'],['active','当前资格','state'],
      ['granted_by','授权人','user'],['created_at','授权时间','time'],['updated_at','更新时间','time'])},
  'audit-logs':{title:'审计记录详情',eyebrow:'GOVERNANCE / AUDIT',icon:<HistoryOutlinedIcon/>,
    subtitle:'只读审计事实，检查操作者、目标、理由与安全范围内的前后变化。',
    fields:props(['actor_user_id','操作者','user'],['action','管理动作',undefined],
      ['target_type','目标类型',undefined],['target_id','目标编号','code'],
      ['reason','操作理由',undefined],['created_at','发生时间','time'],
      ['before','变更前','json'],['after','变更后','json'])},
};
const recordLabels:Record<Name,string>={
  products:'产品编号',memberships:'成员关系编号',grants:'授权编号',
  admins:'用户编号','audit-logs':'审计记录编号',
};
function display(value:unknown,type?:Property['type']){
  if(value===null||value===undefined||value==='')return '—';
  if(type==='time')return formatAdminInstant(value);
  if(type==='state'){
    const code=typeof value==='boolean'?(value?'active':'inactive'):String(value);
    const labels:Record<string,string>={active:'有效 / 正常',inactive:'无效',draft:'草稿',
      suspended:'已暂停',blocked:'已封禁',left:'已退出'};
    return labels[code]??code;
  }
  if(type==='json')return JSON.stringify(value,null,2);
  return String(value);
}
function DetailContent({resource}:{resource:Name}){
  const item=useRecordContext();
  const config=resources[resource];
  const notify=useNotify();
  const [,setScope]=useStore<string>('aisencore.current.product','');
  const userId=item?.user_id;
  const productId=item?.product_id;
  const user=useGetOne('users',{id:String(userId??'')},{enabled:!!userId&&resource!=='admins'});
  const owner=useGetOne('users',{id:String(userId??'')},{enabled:!!userId&&(resource==='admins')});
  const product=useGetOne('products',{id:String(productId??'')},{enabled:!!productId&&resource!=='products'});
  if(!item)return <Box sx={{p:5}}>正在加载详情…</Box>;
  const copy=async(id:string,label:string)=>{
    try{await navigator.clipboard.writeText(id);notify('已复制'+label,{type:'success'})}
    catch{notify('复制失败，请手动选择编号',{type:'warning'})}
  };
  const accountName=user.data?.email??owner.data?.email;
  const productName=product.data?.name;
  const resolve=(key:string,kind?:Property['type']):unknown=>{
    if(kind==='user'&&key==='user_id'&&accountName)return accountName;
    if(kind==='product'&&productName)return productName;
    return display(item[key],kind);
  };
  const parentName=resource==='memberships'?'用户 / 成员关系'
    :resource==='grants'?'权益 / 授权记录'
    :resource==='audit-logs'?'平台管理 / 管理审计'
    :resource==='admins'?'平台管理 / 管理员权限':'平台管理 / 产品';
  const dangerAvailable=resource==='admins'||resource==='grants'||resource==='memberships'||resource==='products';
  return <Box sx={{px:{xs:1,md:2},pb:4,maxWidth:1250,mx:'auto'}}>
    <Box component="nav" aria-label="当前位置" sx={{mb:1}}>
      <Typography variant="caption" color="text.secondary">{parentName} / {config.title}</Typography>
    </Box>
    <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',mb:2,flexWrap:'wrap',gap:1.5}}>
      <Button component={RouterLink} to={'/'+resource} startIcon={<ArrowBackRoundedIcon/>}>返回列表</Button>
    </Stack>
    <Stack direction={{xs:'column',sm:'row'}} spacing={1.5}
      sx={{alignItems:{sm:'center'},justifyContent:'space-between',mb:2.2}}>
      <Box sx={{minWidth:0}}>
        <Typography component="h1" sx={{fontSize:{xs:22,md:26},fontWeight:740,lineHeight:1.3}}>
          {config.title}
        </Typography>
        <Stack direction="row" spacing={.6} sx={{alignItems:'center',mt:.5,flexWrap:'wrap'}}>
          <Typography variant="caption" color="text.secondary" sx={{
            fontFamily:'ui-monospace,monospace',overflowWrap:'anywhere'}}>
            {recordLabels[resource]}：{String(item.id)}
          </Typography>
          <Tooltip title={'复制'+recordLabels[resource]}><IconButton size="small"
            aria-label={'复制'+recordLabels[resource]}
            onClick={()=>void copy(String(item.id),recordLabels[resource])}>
            <ContentCopyRoundedIcon fontSize="small"/>
          </IconButton></Tooltip>
        </Stack>
      </Box>
    </Stack>
    {resource==='products'&&<Stack direction={{xs:'column',sm:'row'}} spacing={1} sx={{mb:2.5,flexWrap:'wrap'}}>
      {[
        {title:'查看此产品成员',to:'/memberships'},
        {title:'查看此产品 Pro 权益',to:'/grants'},
        {title:'查看此产品兑换码',to:'/code-batches'},
      ].map(link=><Button key={link.to} variant="outlined" size="small" component={RouterLink}
        to={link.to} onClick={()=>setScope(String(item.id))}>{link.title}</Button>)}
    </Stack>}
    {resource==='memberships'&&<Card variant="outlined" sx={{mb:2.5,p:2.5,
      backgroundColor:'action.hover'}}>
      <Typography variant="subtitle2" sx={{mb:.75}}>这里是单个平台的成员关系记录</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mb:1.5}}>
        账号状态、所有产品成员关系、订阅与 Pro 权益、用户反馈、管理审计统一在「用户360°管理中心」查看。
      </Typography>
      <Stack direction="row" sx={{gap:1,flexWrap:'wrap'}}>
        {userId&&<Button component={RouterLink} variant="contained" size="small"
          to={'/users/'+encodeURIComponent(String(userId))+'/show'}>
          查看该用户360°管理中心
        </Button>}
        <Button component={RouterLink} variant="outlined" size="small"
          to={'/membership-events?membership_id='+encodeURIComponent(String(item.id))}>
          查看此成员事件历史
        </Button>
      </Stack>
    </Card>}
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:dangerAvailable?'minmax(0,1.5fr) minmax(280px,.8fr)':'1fr'},gap:2.5}}>
      <Card sx={{p:{xs:2.5,md:3.5}}}>
        <Typography variant="h6" sx={{mb:.4}}>业务信息</Typography>
                <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))'},gap:2.5}}>
          {config.fields.filter(f=>f.type!=='json').map(f=><Box key={f.key} sx={{minWidth:0}}>
            <Typography variant="caption" color="text.secondary" sx={{display:'block',mb:.6}}>{f.label}</Typography>
            <Typography sx={{fontSize:14,fontWeight:660,overflowWrap:'anywhere',
              fontFamily:f.type==='code'?'Consolas,ui-monospace,monospace':'inherit',
              color:f.type==='state'?'primary.main':'text.primary'}}>
              {String(resolve(f.key,f.type))}
            </Typography>
            {f.key==='user_id'&&userId&&<Stack direction="row" spacing={.5}
              sx={{mt:.6,alignItems:'center',flexWrap:'wrap'}}>
              <Typography component="code" variant="caption" sx={{overflowWrap:'anywhere'}}>
                用户编号：{String(userId)}
              </Typography>
              <Tooltip title="复制用户编号"><IconButton size="small" aria-label="复制用户编号"
                onClick={()=>void copy(String(userId),'用户编号')}>
                <ContentCopyRoundedIcon fontSize="small"/>
              </IconButton></Tooltip>
            </Stack>}
          </Box>)}
        </Box>
        {config.fields.filter(f=>f.type==='json').map(f=><Box key={f.key} sx={{mt:3}}>
          <Typography variant="subtitle2" sx={{mb:1}}>{f.label}</Typography>
          <Box component="pre" sx={{p:2,bgcolor:'#f7f8fc',borderRadius:adminRadii.small,
            whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontFamily:'Consolas,monospace',
            fontSize:12,color:'#465575',border:'1px solid #e7eaf2'}}>
            {String(resolve(f.key,f.type))}
          </Box>
        </Box>)}
      </Card>
      {dangerAvailable&&<Card sx={{p:{xs:2.5,md:3.2},alignSelf:'start'}}>
        <Typography variant="h6" sx={{mb:.65}}>管理操作</Typography>
        <Stack spacing={1.2} sx={{alignItems:'stretch','& button':{justifyContent:'flex-start'}}}>
          {resource==='products'&&String(item.status)!=='active'&&<ProtectedAction title="恢复运行" rpc="admin_set_product_status" keyName="p_product_id"
            payload={{p_status:'active'}}/>}
          {resource==='products'&&String(item.status)==='active'&&<ProtectedAction title="暂停产品" rpc="admin_set_product_status" keyName="p_product_id"
            payload={{p_status:'suspended'}} danger/>}
          {resource==='memberships'&&String(item.status)!=='suspended'&&<ProtectedAction title="暂停成员" rpc="admin_suspend_membership" keyName="p_membership_id" danger/>}
          {resource==='memberships'&&String(item.status)==='suspended'&&<ProtectedAction title="解除暂停" rpc="admin_restore_membership" keyName="p_membership_id"/>}
          {resource==='grants'&&!item.revoked_at&&<ProtectedAction title="撤销 Pro 授权" rpc="admin_revoke_grant" keyName="p_grant_id" danger/>}
          {resource==='grants'&&item.revoked_at&&<Typography variant="body2" color="text.secondary">该授权已经撤销，历史事实不可重复变更。</Typography>}
          {resource==='admins'&&userId&&<Button component={OperationLink}
            to={'/admin-actions?user_id='+encodeURIComponent(String(userId))} size="small">
            管理管理员资格
          </Button>}
        </Stack>
      </Card>}
    </Box>
  </Box>;
}
export function WorkspaceDetail({resource}:{resource:Name}){
  return <Show title={resources[resource].title} actions={false}>
    <DetailContent resource={resource}/>
  </Show>;
}
export const ProductShow=()=> <WorkspaceDetail resource="products"/>;
export const MemberShow=()=> <WorkspaceDetail resource="memberships"/>;
export const GrantShow=()=> <WorkspaceDetail resource="grants"/>;
export const AdminShow=()=> <WorkspaceDetail resource="admins"/>;
export const AuditShow=()=> <WorkspaceDetail resource="audit-logs"/>;