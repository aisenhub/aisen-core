import { Show, useGetOne, useNotify, useRecordContext, useStore } from 'react-admin';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Card, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import AppsOutlinedIcon from '@mui/icons-material/AppsOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import GppBadOutlinedIcon from '@mui/icons-material/GppBadOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { ProtectedAction } from './lists';

type Name='products'|'memberships'|'grants'|'code-batches'|'codes'|'admins'|'restrictions'|'audit-logs';
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
    subtitle:'追溯已授予权益的起始、结束、来源和撤销状态。',
    fields:props(['user_id','关联账号','user'],['product_id','所属产品','product'],['tier','权益类型',undefined],
      ['source_type','授权来源',undefined],['grant_mode','授予模式',undefined],
      ['requested_duration_days','申请天数',undefined],['starts_at','生效时间','time'],
      ['ends_at','结束时间','time'],['revoked_at','撤销时间','time'],['created_at','建立时间','time'])},
  'code-batches':{title:'发行批次详情',eyebrow:'ISSUANCE / BATCH',icon:<ConfirmationNumberOutlinedIcon/>,
    subtitle:'核对创建时的非秘密参数与发行数量；完整兑换码不能恢复。',
    fields:props(['request_id','幂等请求号','code'],['product_id','适用产品','product'],
      ['quantity','码数量',undefined],['tier','权益',undefined],['grant_duration_days','每码授予天数',undefined],
      ['max_redemptions_per_code','每码可核销次数',undefined],
      ['code_expires_at','兑换码截止时间','time'],['note','备注',undefined],
      ['created_by','创建管理员','user'],['created_at','创建时间','time'])},
  codes:{title:'兑换码详情',eyebrow:'REDEMPTION / CODE',icon:<VerifiedUserOutlinedIcon/>,
    subtitle:'安全摘要与使用状态；不会回显可兑换的明文。',
    fields:props(['code_prefix','不可反查前缀','code'],['batch_id','所属批次','code'],
      ['product_id','所属产品','product'],['redeemed_count','已核销次数',undefined],
      ['max_redemptions','使用上限',undefined],['expires_at','到期时间','time'],
      ['revoked_at','撤销时间','time'],['created_by','发行人','user'])},
  admins:{title:'管理员资格详情',eyebrow:'GOVERNANCE / ADMIN',icon:<AdminPanelSettingsOutlinedIcon/>,
    subtitle:'平台敏感权限资格及其授权来源，遵守最后一名有效管理员保护。',
    fields:props(['user_id','管理员账号','user'],['active','当前资格','state'],
      ['granted_by','授权人','user'],['created_at','授权时间','time'],['updated_at','更新时间','time'])},
  restrictions:{title:'账号限制详情',eyebrow:'GOVERNANCE / BLOCK',icon:<GppBadOutlinedIcon/>,
    subtitle:'平台级账号限制与实施原因；影响所有产品的受保护操作。',
    fields:props(['user_id','受限账号','user'],['kind','限制类型','state'],
      ['reason_code','原因码',undefined],['created_by','实施者','user'],['created_at','实施时间','time'])},
  'audit-logs':{title:'审计记录详情',eyebrow:'GOVERNANCE / AUDIT',icon:<HistoryOutlinedIcon/>,
    subtitle:'只读审计事实，检查操作者、目标、理由与安全范围内的前后变化。',
    fields:props(['actor_user_id','操作者','user'],['action','管理动作',undefined],
      ['target_type','目标类型',undefined],['target_id','目标编号','code'],
      ['reason','操作理由',undefined],['created_at','发生时间','time'],
      ['before','变更前','json'],['after','变更后','json'])},
};
function display(value:unknown,type?:Property['type']){
  if(value===null||value===undefined||value==='')return '—';
  if(type==='time'){
    const date=new Date(String(value));
    return isNaN(date.getTime())?'—':date.toLocaleString('zh-CN',{hour12:false});
  }
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
  const user=useGetOne('users',{id:String(userId??'')},{enabled:!!userId&&resource!=='admins'&&resource!=='restrictions'});
  const owner=useGetOne('users',{id:String(userId??'')},{enabled:!!userId&&(resource==='admins'||resource==='restrictions')});
  const product=useGetOne('products',{id:String(productId??'')},{enabled:!!productId&&resource!=='products'});
  if(!item)return <Box sx={{p:5}}>正在加载详情…</Box>;
  const copy=async()=>{
    try{await navigator.clipboard.writeText(String(item.id));notify('已复制记录编号',{type:'success'})}
    catch{notify('无法访问剪贴板',{type:'warning'})}
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
    :resource==='code-batches'?'兑换码 / 发行批次'
    :resource==='codes'?'兑换码 / 兑换码记录'
    :resource==='audit-logs'?'平台管理 / 管理审计'
    :resource==='restrictions'?'平台管理 / 账号限制'
    :resource==='admins'?'平台管理 / 管理员权限':'平台管理 / 产品';
  const dangerAvailable=resource==='admins'||(resource==='restrictions'&&item.kind==='blocked')||resource==='codes'||
    resource==='code-batches'||resource==='grants'||resource==='memberships'||resource==='products';
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
        <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:.5,
          fontFamily:'ui-monospace,monospace',overflowWrap:'anywhere'}}>
          记录编号：{String(item.id)}
        </Typography>
      </Box>
      <Tooltip title="复制完整记录 ID">
        <IconButton onClick={()=>void copy()}
          sx={{border:'1px solid',borderColor:'divider',alignSelf:{xs:'flex-start',sm:'center'}}}
          aria-label="复制完整记录 ID"><ContentCopyRoundedIcon/></IconButton>
      </Tooltip>
    </Stack>
    {resource==='products'&&<Stack direction={{xs:'column',sm:'row'}} spacing={1} sx={{mb:2.5,flexWrap:'wrap'}}>
      {[
        {title:'查看此产品成员',to:'/memberships'},
        {title:'查看此产品 Pro 权益',to:'/grants'},
        {title:'查看此产品兑换码',to:'/code-batches'},
      ].map(link=><Button key={link.to} variant="outlined" size="small" component={RouterLink}
        to={link.to} onClick={()=>setScope(String(item.id))}>{link.title}</Button>)}
    </Stack>}
    {resource==='memberships'&&<Box sx={{mb:2.5}}>
      <Button component={RouterLink} variant="outlined" size="small"
        to={'/membership-events?membership_id='+encodeURIComponent(String(item.id))}>
        查看此成员事件历史
      </Button>
    </Box>}
    {resource==='code-batches'&&<Box sx={{mb:2.5}}>
      <Button component={RouterLink} variant="outlined" size="small"
        to={'/codes?batch_id='+encodeURIComponent(String(item.id))}>查看此批次兑换码记录</Button>
    </Box>}
    {resource==='grants'&&<Box sx={{mb:2.5}}>
      <Button component={RouterLink} variant="outlined" size="small"
        to={'/redemptions?grant_id='+encodeURIComponent(String(item.id))}>查看关联核销记录</Button>
    </Box>}
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
          </Box>)}
        </Box>
        {config.fields.filter(f=>f.type==='json').map(f=><Box key={f.key} sx={{mt:3}}>
          <Typography variant="subtitle2" sx={{mb:1}}>{f.label}</Typography>
          <Box component="pre" sx={{p:2,bgcolor:'#f7f8fc',borderRadius:2.5,
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
          {resource==='codes'&&!item.revoked_at&&<ProtectedAction title="撤销该兑换码" rpc="admin_revoke_code" keyName="p_code_id" danger/>}
          {resource==='codes'&&item.revoked_at&&<Typography variant="body2" color="text.secondary">该兑换码已经撤销。</Typography>}
          {resource==='code-batches'&&<ProtectedAction title="撤销整批兑换码" rpc="admin_revoke_batch" keyName="p_batch_id" danger/>}
          {resource==='admins'&&item.active===true&&<ProtectedAction title="撤销管理员资格" rpc="admin_revoke_admin" keyName="p_target_user_id" danger/>}
          {resource==='admins'&&item.active!==true&&<Typography variant="body2" color="text.secondary">该账号当前不具备有效管理员资格。</Typography>}
          {resource==='restrictions'&&item.kind==='blocked'&&<ProtectedAction title="解除平台封禁" rpc="admin_unblock_account" keyName="p_target_user_id"/>}
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
export const BatchShow=()=> <WorkspaceDetail resource="code-batches"/>;
export const CodeShow=()=> <WorkspaceDetail resource="codes"/>;
export const AdminShow=()=> <WorkspaceDetail resource="admins"/>;
export const RestrictionShow=()=> <WorkspaceDetail resource="restrictions"/>;
export const AuditShow=()=> <WorkspaceDetail resource="audit-logs"/>;
