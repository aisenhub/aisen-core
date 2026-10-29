import { Link as RouterLink } from 'react-router-dom';
import { OperationLink } from './resources/OperationDialogs';
import { useGetList, useGetOne, useStore } from 'react-admin';
import { Alert, Box, Button, Card, Divider, Skeleton, Stack, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { auditActionLabel, auditTargetLabel } from './adminCopy';
import { formatAdminInstant } from './dateDisplay';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';

type DashboardTotals = {
  id:string;
  normal_users:number;
  new_users_month:number;
  pro_members:number;
  new_pro_month:number;
  open_feedback:number;
  new_feedback:number;
};
type MetricKey=Exclude<keyof DashboardTotals,'id'>;
const metrics: {
  title:string;route:string;icon:React.ReactNode;
  first:{label:string;key:MetricKey};
  second:{label:string;key:MetricKey};
}[] = [
  {title:'用户',route:'/users',icon:<GroupsOutlinedIcon/>,
    first:{label:'正常用户',key:'normal_users'},
    second:{label:'本月新增用户',key:'new_users_month'}},
  {title:'订阅',route:'/grants',icon:<WorkspacePremiumOutlinedIcon/>,
    first:{label:'Pro 会员',key:'pro_members'},
    second:{label:'本月新增 Pro 会员',key:'new_pro_month'}},
  {title:'反馈',route:'/feedback',icon:<ChatBubbleOutlineRoundedIcon/>,
    first:{label:'收件箱 + 工作台',key:'open_feedback'},
    second:{label:'新反馈（收件箱）',key:'new_feedback'}},
];
const actions = [
  { label:'新建产品', route:'/products/create' },
  { label:'查看成员', route:'/memberships' },
  { label:'授予 Pro', route:'/grant-new' },
  { label:'发行兑换码', route:'/issue-codes' },
];

function MetricCard({title,route,icon,first,second,pending,error}:{
  title:string;route:string;icon:React.ReactNode;
  first:{label:string;value:number|undefined};
  second:{label:string;value:number|undefined};
  pending:boolean;error:boolean;
}) {
  return <Card component={RouterLink} to={route} aria-label={title+'统计'} sx={{
    display:'flex',flexDirection:'column',gap:2.5,minWidth:0,minHeight:164,
    p:{xs:2,md:2.7},color:'text.primary',textDecoration:'none',boxShadow:'none',
    border:'1px solid',borderColor:'divider',
    transition:'border-color 180ms ease,box-shadow 180ms ease',
    '&:hover':{borderColor:'primary.main',boxShadow:'0 7px 20px rgba(30,35,55,.06)'},
    '&:focus-visible':{outlineOffset:3},
  }}>
    <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between'}}>
      <Typography component="h2" sx={{fontSize:16,fontWeight:730}}>{title}</Typography>
      <Box aria-hidden sx={{color:'primary.main','& svg':{fontSize:21}}}>{icon}</Box>
    </Stack>
    <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:{xs:1,sm:2},minWidth:0}}>
      {[first,second].map((item,index)=><Box key={item.label} sx={{
        minWidth:0,pl:index?{xs:1.5,sm:2}:0,
        borderLeft:index?'1px solid':'none',borderColor:'divider',
      }}>
        <Typography sx={{fontSize:{xs:11.5,sm:12.5},color:'text.secondary',mb:1}}>{item.label}</Typography>
        {pending?<Skeleton width="70%" height={45}/>:
          <Typography sx={{fontSize:{xs:29,sm:33,lg:38},fontWeight:770,
            lineHeight:1.2,fontVariantNumeric:'tabular-nums',
            color:error?'text.disabled':'text.primary'}}>
            {error||item.value===undefined?'—':item.value.toLocaleString('zh-CN')}
          </Typography>}
      </Box>)}
    </Box>
  </Card>;
}

export function Dashboard() {
  const [product]=useStore<string>('aisencore.current.product','');
  // The top product switch drives one authoritative, scope-keyed snapshot.
  // Never aggregate page-1 records, Grant rows or cached results from another product.
  const currentScope=product||'all';
  const stats=useGetOne<DashboardTotals>('dashboard-metrics',{id:currentScope},
    {refetchOnWindowFocus:true});
  const validScope=stats.data?.id===currentScope;
  const counts=validScope?stats.data:undefined;
  const pending=stats.isPending||(!validScope&&!stats.isError);
  const audit=useGetList('audit-logs',{
    pagination:{page:1,perPage:5},sort:{field:'created_at',order:'DESC'},filter:{},
  });
  return <Box sx={{maxWidth:1720,width:'100%',minWidth:0,mx:'auto',px:{xs:2,md:3,lg:4.5},pt:{xs:2.5,md:3},pb:8}}>
    <Stack direction={{xs:'column',sm:'row'}} spacing={1.2} sx={{justifyContent:"space-between",alignItems:{xs:"flex-start",sm:"center"},mb:2.5}}>
      <Box>
        <Typography component="h1" sx={{fontSize:{xs:25,md:29},fontWeight:760,lineHeight:1.3}}>管理概览</Typography>
        <Typography sx={{fontSize:13,color:'text.secondary',mt:.4}}>
          {product?'当前产品统计':'全平台去重统计'}
        </Typography>
      </Box>
      <Button component={RouterLink} to="/audit-logs" endIcon={<ArrowForwardRoundedIcon/>} size="small">
        管理审计
      </Button>
    </Stack>
    {stats.isError&&<Alert severity="error" variant="outlined" sx={{mb:2}}
      action={<Button color="inherit" size="small" onClick={()=>void stats.refetch()}>重试</Button>}>
      概览统计读取失败，无法确认当前数据。
    </Alert>}
    <Box sx={{display:'grid',gridTemplateColumns:{
      xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))',md:'repeat(3,minmax(0,1fr))'
    },'& > :last-child':{gridColumn:{sm:'1 / -1',md:'auto'}},
      gap:{xs:1.4,md:2},mb:{xs:3.5,md:4.5}}}>
      {metrics.map(m=><MetricCard key={m.title} title={m.title} route={m.route}
        icon={m.icon} first={{label:m.first.label,value:counts?.[m.first.key]}}
        second={{label:m.second.label,value:counts?.[m.second.key]}}
        pending={pending} error={stats.isError}/>)}
    </Box>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',lg:'minmax(0,1fr) minmax(0,1.15fr)'},gap:{xs:3,md:3.5}}}>
      <Box>
        <Typography component="h2" sx={{fontSize:{xs:20,md:22},fontWeight:730,mb:1.5}}>快捷操作</Typography>
        <Card sx={{overflow:'hidden',boxShadow:'none'}}>
          <Stack divider={<Divider/>}>
            {actions.map(a=><Button key={a.route} component={OperationLink} to={a.route}
              endIcon={<ArrowForwardRoundedIcon/>}
              sx={{justifyContent:'space-between',minHeight:54,px:2.3,borderRadius:0,color:'text.primary',
                '&:hover':{bgcolor:'action.hover'}}}>{a.label}</Button>)}
          </Stack>
        </Card>
      </Box>
      <Box sx={{minWidth:0}}>
        <Stack direction="row" sx={{justifyContent:"space-between",alignItems:"center",mb:1.5}}>
          <Typography component="h2" sx={{fontSize:{xs:20,md:22},fontWeight:730}}>最近管理动态</Typography>
          <Button component={RouterLink} to="/audit-logs" size="small">查看全部</Button>
        </Stack>
        <Card sx={{p:{xs:2,md:2.5},boxShadow:'none',minHeight:260}}>
          {audit.isPending?<Skeleton height={210} variant="rounded"/>:
           audit.isError?<Stack spacing={1}><Typography color="error">审计记录读取失败</Typography>
             <Button size="small" onClick={()=>void audit.refetch()}>重试</Button></Stack>:
           (audit.data??[]).length===0?<Typography color="text.secondary" sx={{py:3}}>暂无管理操作记录</Typography>:
           <Stack divider={<Divider/>}>
             {(audit.data??[]).map(item=><Stack key={item.id} direction="row" spacing={2}
               sx={{alignItems:"center",py:1.5,minWidth:0}}>
               <Box sx={{flex:1,minWidth:0}}>
                 <Typography sx={{fontWeight:670,fontSize:13.5}} noWrap>{auditActionLabel(item.action)}</Typography>
                 <Typography sx={{fontSize:12,color:'text.secondary'}} noWrap>{auditTargetLabel(item.target_type)}</Typography>
               </Box>
               <Typography sx={{fontSize:12,color:'text.secondary',maxWidth:158,textAlign:'right'}}>
                 {formatAdminInstant(item.created_at)}
               </Typography>
             </Stack>)}
           </Stack>}
        </Card>
      </Box>
    </Box>
  </Box>;
}