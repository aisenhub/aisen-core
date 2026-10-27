import { Link as RouterLink } from 'react-router-dom';
import { OperationLink } from './resources/OperationDialogs';
import { useGetList, useStore } from 'react-admin';
import { Box, Button, Card, Divider, Skeleton, Stack, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { auditActionLabel, auditTargetLabel } from './adminCopy';
import { formatAdminInstant } from './dateDisplay';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';

const metrics = [
  { label: '产品', route: '/products', icon: <LayersOutlinedIcon/>, scope: '全平台' },
  { label: '成员关系', route: '/memberships', icon: <GroupsOutlinedIcon/> },
  { label: 'Pro 授权', route: '/grants', icon: <WorkspacePremiumOutlinedIcon/> },
  { label: '发行批次', route: '/code-batches', icon: <ConfirmationNumberOutlinedIcon/> },
  { label: '待筛选反馈', route: '/feedback', icon: <ChatBubbleOutlineRoundedIcon/> },
];
const actions = [
  { label:'新建产品', route:'/products/create' },
  { label:'查看成员', route:'/memberships' },
  { label:'授予 Pro', route:'/grant-new' },
  { label:'发行兑换码', route:'/issue-codes' },
];

function StatCard({label,route,icon,value,pending,error,scope}:{
  label:string;route:string;icon:React.ReactNode;value?:number;pending:boolean;error:boolean;scope?:string
}) {
  return <Card component={RouterLink} to={route} sx={{
    display:'flex',flexDirection:'column',justifyContent:'space-between',gap:1.8,
    minWidth:0,minHeight:148,p:{xs:2,md:2.7},color:'text.primary',textDecoration:'none',
    boxShadow:'none',border:'1px solid',borderColor:'divider',
    transition:'border-color 180ms ease,box-shadow 180ms ease',
    '&:hover':{borderColor:'primary.main',boxShadow:'0 7px 20px rgba(30,35,55,.06)'},
    '&:focus-visible':{outlineOffset:3},
  }}>
    <Stack direction="row" spacing={1} sx={{alignItems:"center",justifyContent:"space-between"}}>
      <Typography sx={{fontSize:14,fontWeight:700}}>{label}</Typography>
      <Box aria-hidden sx={{color:'primary.main','& svg':{fontSize:20}}}>{icon}</Box>
    </Stack>
    <Box>
      {pending?<Skeleton width={110} height={47}/>:
        <Typography sx={{fontSize:{xs:31,lg:39},fontWeight:760,lineHeight:1.18,fontVariantNumeric:'tabular-nums'}}>
          {error?'—':(value??0).toLocaleString('zh-CN')}
        </Typography>}
      <Typography sx={{fontSize:12,color:error?'error.main':'text.secondary',mt:.5}}>
        {error?'数据暂不可用':scope??'当前工作范围'}
      </Typography>
    </Box>
  </Card>;
}

export function Dashboard() {
  const [product]=useStore<string>('aisencore.current.product','');
  const filter=product?{product_id:product}:{};
  const common={pagination:{page:1,perPage:1},sort:{field:'created_at',order:'DESC' as const}};
  const products=useGetList('products',{...common,filter:{}});
  const members=useGetList('memberships',{...common,filter,sort:{field:'joined_at',order:'DESC'}});
  const grants=useGetList('grants',{...common,filter});
  const batches=useGetList('code-batches',{...common,filter});
  const feedback=useGetList('feedback',{...common,filter:{...filter,queue_state:'inbox'},sort:{field:'updated_at',order:'DESC'}});
  const audit=useGetList('audit-logs',{...common,pagination:{page:1,perPage:5},filter:{}});
  const queries=[products,members,grants,batches,feedback];
  return <Box sx={{maxWidth:1720,width:'100%',minWidth:0,mx:'auto',px:{xs:2,md:3,lg:4.5},pt:{xs:2.5,md:3},pb:8}}>
    <Stack direction={{xs:'column',sm:'row'}} spacing={1.2} sx={{justifyContent:"space-between",alignItems:{xs:"flex-start",sm:"center"},mb:2.5}}>
      <Box>
        <Typography component="h1" sx={{fontSize:{xs:25,md:29},fontWeight:760,lineHeight:1.3}}>管理概览</Typography>
        <Typography sx={{fontSize:13,color:'text.secondary',mt:.4}}>
          {product?'成员、授权与批次按所选产品统计':'查看全平台业务与管理记录'}
        </Typography>
      </Box>
      <Button component={RouterLink} to="/audit-logs" endIcon={<ArrowForwardRoundedIcon/>} size="small">
        管理审计
      </Button>
    </Stack>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',lg:'repeat(5,minmax(0,1fr))'},
      '@media(max-width:360px)':{gridTemplateColumns:'1fr'},gap:{xs:1.3,md:2},mb:{xs:3.5,md:4.5}}}>
      {metrics.map((m,i)=><StatCard key={m.route} {...m} value={queries[i].total}
        pending={queries[i].isPending} error={queries[i].isError}/>)}
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
