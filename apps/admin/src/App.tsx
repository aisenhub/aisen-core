import { lazy, Suspense, useEffect, useState } from 'react';
import { Admin, AppBar, Authenticated, CustomRoutes, Layout, LoadingIndicator, Menu, Resource, UserMenu, useGetIdentity, useGetList, useGetOne, useSidebarState, useStore } from 'react-admin';
import { Route, useLocation } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, IconButton, MenuItem, Select, Stack, TextField, Tooltip, Typography, useMediaQuery } from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';

import { theme } from './theme';
import { chineseI18nProvider } from './i18n';
import { authProvider } from './auth/authProvider';
import { dataProvider } from './data/dataProvider';
import { OperationModalProvider } from './resources/OperationDialogs';

// Route-level lazy imports: no business page is evaluated on the login route.
// Pages exported from the same module intentionally share one async chunk.
const Dashboard = lazy(() => import('./Dashboard').then(m => ({ default: m.Dashboard })));
const LoginPage = lazy(() => import('./auth/LoginPage').then(m => ({ default: m.LoginPage })));
const AuthActionPage = lazy(() => import('./auth/AuthActionPage').then(m => ({ default: m.AuthActionPage })));
const ProductsList = lazy(() => import('./resources/lists').then(m => ({ default: m.ProductsList })));
const ProductCreate = lazy(() => import('./resources/ProductCreate').then(m => ({ default: m.ProductCreate })));
const ProductShow = lazy(() => import('./resources/WorkspaceDetails').then(m => ({ default: m.ProductShow })));
const MemberShow = lazy(() => import('./resources/WorkspaceDetails').then(m => ({ default: m.MemberShow })));
const GrantShow = lazy(() => import('./resources/WorkspaceDetails').then(m => ({ default: m.GrantShow })));
const BatchShow = lazy(() => import('./resources/WorkspaceDetails').then(m => ({ default: m.BatchShow })));
const CodeShow = lazy(() => import('./resources/WorkspaceDetails').then(m => ({ default: m.CodeShow })));
const AdminShow = lazy(() => import('./resources/WorkspaceDetails').then(m => ({ default: m.AdminShow })));
const RestrictionShow = lazy(() => import('./resources/WorkspaceDetails').then(m => ({ default: m.RestrictionShow })));
const AuditShow = lazy(() => import('./resources/WorkspaceDetails').then(m => ({ default: m.AuditShow })));
const MembersList = lazy(() => import('./resources/WorkspaceLists').then(m => ({ default: m.MembersList })));
const GrantsList = lazy(() => import('./resources/WorkspaceLists').then(m => ({ default: m.GrantsList })));
const BatchesList = lazy(() => import('./resources/WorkspaceLists').then(m => ({ default: m.BatchesList })));
const CodesList = lazy(() => import('./resources/WorkspaceLists').then(m => ({ default: m.CodesList })));
const RedemptionsList = lazy(() => import('./resources/WorkspaceLists').then(m => ({ default: m.RedemptionsList })));
const EventsList = lazy(() => import('./resources/WorkspaceLists').then(m => ({ default: m.EventsList })));
const AdminsList = lazy(() => import('./resources/WorkspaceLists').then(m => ({ default: m.AdminsList })));
const RestrictionsList = lazy(() => import('./resources/WorkspaceLists').then(m => ({ default: m.RestrictionsList })));
const AuditList = lazy(() => import('./resources/WorkspaceLists').then(m => ({ default: m.AuditList })));
const UsersList = lazy(() => import('./resources/WorkspaceLists').then(m => ({ default: m.UsersList })));
const UserShow = lazy(() => import('./resources/UserShow').then(m => ({ default: m.UserShow })));
const FeedbackList = lazy(() => import('./resources/FeedbackV2').then(m => ({ default: m.FeedbackInbox })));
const FeedbackWorkbench = lazy(() => import('./resources/FeedbackV2').then(m => ({ default: m.FeedbackWorkbench })));
const FeedbackArchived = lazy(() => import('./resources/FeedbackV2').then(m => ({ default: m.FeedbackArchived })));
const FeedbackTrash = lazy(() => import('./resources/FeedbackV2').then(m => ({ default: m.FeedbackTrash })));
const FeedbackShow = lazy(() => import('./resources/Feedback').then(m => ({ default: m.FeedbackShow })));
const GrantCreate = lazy(() => import('./resources/GrantCreate').then(m => ({ default: m.GrantCreate })));
const IssueCodes = lazy(() => import('./resources/IssueCodes').then(m => ({ default: m.IssueCodes })));
const AccountActions = lazy(() => import('./resources/AccountActions').then(m => ({ default: m.AccountActions })));

function RouteLoading() {
  return <Box role="status" aria-live="polite" sx={{ minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, p: 4 }}>
    <CircularProgress size={24} aria-hidden />
    <Typography color="text.secondary">正在加载工作区…</Typography>
  </Box>;
}

function ScopeSelector() {
  const compact=useMediaQuery('(max-width:599px)');
  const [product,setProduct]=useStore<string>('aisencore.current.product','');
  const {data,total}=useGetList('products',{pagination:{page:1,perPage:100},
    sort:{field:'name',order:'ASC'},filter:{}});
  const selected=useGetOne('products',{id:product},{enabled:!!product});
  const [searchOpen,setSearchOpen]=useState(false);
  const [draft,setDraft]=useState('');
  const [exactKey,setExactKey]=useState('');
  const matched=useGetList('products',{pagination:{page:1,perPage:1},
    sort:{field:'name',order:'ASC'},filter:{product_key:exactKey}},{enabled:!!exactKey});
  const items=new Map([...(data??[]),...(selected.data?[selected.data]:[])].map(item=>[String(item.id),item]));
  return <Stack direction="row" spacing={1} sx={{alignItems:"center",minWidth:0}}>
    <FormControl size="small" sx={{
      minWidth:{xs:94,sm:160,lg:196},maxWidth:{xs:105,sm:196,lg:234},
      flexShrink:1,
    }}>
      <Select displayEmpty aria-label={'切换管理产品范围，当前：'+(product ? String(selected.data?.name??'选定产品') : '全平台视角')} value={product??''}
        renderValue={id=>{
          if(!id)return compact?'全平台':'全平台视角';
          const name=String(items.get(String(id))?.name??'选定产品');
          return compact&&name.length>4?name.slice(0,4)+'…':name;
        }}
        onChange={e=>setProduct(String(e.target.value))}
        sx={{height:40,color:'text.primary',fontSize:{xs:12,sm:13},fontWeight:670,
          bgcolor:'rgba(246,248,251,.94)',borderRadius:'12px',
          '& .MuiOutlinedInput-notchedOutline':{borderColor:'#DBE2EA'},
          '&:hover .MuiOutlinedInput-notchedOutline':{borderColor:'#B8C5D3'},
          '& .MuiSelect-icon':{color:'#627281'},
          '&.Mui-focused .MuiOutlinedInput-notchedOutline':{borderColor:'primary.main'},
        }}>
        <MenuItem value="">全平台视角</MenuItem>
        {[...items.values()].map(item=><MenuItem key={item.id} value={String(item.id)}>
          {String(item.name)}
        </MenuItem>)}
      </Select>
    </FormControl>
    {(total??0)>100&&<>
      <Tooltip title="按完整产品键查找其他产品">
        <IconButton size="small" aria-label="查找更多产品" onClick={()=>setSearchOpen(true)} sx={{color:'text.secondary'}}>
          <SearchRoundedIcon fontSize="small"/>
        </IconButton>
      </Tooltip>
      <Dialog open={searchOpen} onClose={()=>setSearchOpen(false)} aria-labelledby="find-product-title">
        <DialogTitle id="find-product-title">按产品键切换工作范围</DialogTitle>
        <DialogContent>
          <Stack component="form" spacing={2} sx={{pt:1}}
            onSubmit={e=>{e.preventDefault();setExactKey(draft.trim())}}>
            <Typography variant="body2">可按完整产品键查找未列出的产品。</Typography>
            <TextField label="唯一产品键" value={draft} onChange={e=>setDraft(e.target.value)} autoComplete="off"/>
            <Button type="submit" variant="outlined" disabled={!draft.trim()}>查找产品</Button>
            {exactKey&&matched.isError&&<Alert severity="error">产品查询失败，请核实权限或重试。</Alert>}
            {exactKey&&!matched.isPending&&!matched.isError&&!matched.data?.length&&<Alert severity="info">没有找到该产品键。</Alert>}
            {matched.data?.map(item=><Button key={item.id} variant="contained" onClick={()=>{setProduct(String(item.id));setSearchOpen(false)}}>
              选择 {String(item.name)} · {String(item.product_key)}
            </Button>)}
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={()=>setSearchOpen(false)}>取消</Button></DialogActions>
      </Dialog>
    </>}
  </Stack>;
}

function AccessibleUserMenu() {
  const { identity } = useGetIdentity();
  // React-admin's default label does not include the visible account name.
  // Match the visible text for WCAG 2.5.3 Label in Name.
  return <UserMenu label={identity?.fullName ? '账号 '+identity.fullName : '用户菜单'} />;
}
function AdminAppBar() {
  const permanentSidebar=useMediaQuery('(min-width:900px)');
  const [,setSidebarOpen]=useSidebarState();
  // Desktop has a permanent rail; entering the mobile breakpoint must close
  // any previously open rail instead of leaving a modal drawer over content.
  // Users may still open/close mobile navigation with its accessible toggle.
  useEffect(()=>{setSidebarOpen(permanentSidebar)},[permanentSidebar,setSidebarOpen]);
  return <AppBar userMenu={<AccessibleUserMenu/>}
    toolbar={<Box className="aisencore-topbar-tools" sx={{display:{xs:'none',sm:'flex'},alignItems:'center'}}><LoadingIndicator/></Box>}
    sx={{
    px:{xs:1,sm:2,md:2.5},minHeight:64,
    borderBottom:'1px solid #E3E9EF',
    '& .MuiToolbar-root':{
      minHeight:'64px !important',gap:{xs:.25,sm:1,md:1.5},display:'flex',
      // React-admin inserts the drawer toggle before the custom brand.
      // Visually place the logo first and the mobile toggle second.
      '& > *':{order:6},
      '& > .aisencore-brand':{order:1},
      '& > .RaAppBar-menuButton':{
        order:2,ml:{xs:0,sm:.5},width:44,height:44,
        color:'#354559',
        display:{xs:'inline-flex',md:'none'},
      },
      '& > .aisencore-scope':{order:3},
      '& > .aisencore-topbar-spacer':{order:4},
      '& > .aisencore-topbar-tools':{order:5},
      '& > :last-child':{order:6},
    },
    '& .RaUserMenu-userButton':{color:'#324457',fontWeight:700},
    '@media (max-width:1199px)':{'& .RaUserMenu-userButton .MuiTypography-root':{display:'none'}},
  }}>
    <Stack className="aisencore-brand" direction="row" spacing={1.1} sx={{
      order:1,alignItems:"center",flexShrink:0,mr:{xs:0,md:1},
    }}>
      <Box aria-hidden sx={{width:34,height:34,borderRadius:'11px',
        background:'linear-gradient(140deg,#e2f5c8,#a7d6bc)',display:'grid',placeItems:'center',
        border:'1px solid rgba(81,137,105,.16)',
        boxShadow:'0 4px 12px rgba(36,78,62,.1)'}}>
        <Typography component="span" sx={{fontSize:10,fontWeight:900,letterSpacing:'-.07em',color:'#23463e'}}>AC</Typography>
      </Box>
      <Box>
        <Typography sx={{display:{xs:'none',sm:'block'},fontSize:{sm:16,md:18},fontWeight:790,letterSpacing:'-.035em',lineHeight:1,color:'#243345'}}>
          AisenCore
        </Typography>
      </Box>
    </Stack>
    <Box className="aisencore-scope" sx={{
      flexShrink:1,minWidth:0,
      // Align the desktop scope control with the inner edge of the workspace.
      // On mobile/tablet, keep it beside the brand so action controls fit.
      ml:{xs:0,md:16.5},
    }}>
      <ScopeSelector/>
    </Box>
    <Box className="aisencore-topbar-spacer" sx={{flex:1,minWidth:0}}/>
  </AppBar>;
}

function GroupLabel({children}:{children:string}) {
  return <Typography component="div"
    sx={{mt:2.7,mb:1,mx:2.7,color:'text.secondary',fontSize:12,fontWeight:680,
      letterSpacing:'.02em',lineHeight:1.5}}>
    {children}
  </Typography>;
}
function AdminMenu() {
  const {pathname}=useLocation();
  // A business domain remains selected on its list, detail, or protected action route.
  // The list Resource URLs and their independent authorization do not change.
  const current=(...roots:string[])=>roots.some(root=>pathname===root||pathname.startsWith(root+'/'));
  const domainStyle=(selected:boolean)=>selected?{
    bgcolor:'#EFEDFC',color:'primary.dark',fontWeight:740,
    '& .MuiListItemIcon-root':{color:'primary.main'},
    '&:hover':{bgcolor:'#E8E4FA'},
  }:{};
  return <Menu sx={{
    display:'flex',flexDirection:'column',minHeight:{xs:'100%',md:'calc(100dvh - 100px)'},
    pt:1,pb:1.5,
    // React-admin Menu.Item renders MUI MenuItem, not ListItemButton.
    // Inset the active selection inside the rounded floating navigation card.
    '& .MuiMenuItem-root':{
      minHeight:46,py:.8,px:1.5,mx:1.25,my:.2,
      width:'calc(100% - 20px)',borderRadius:2.5,
    },
    '& .MuiListItemIcon-root':{minWidth:32,'& svg':{fontSize:20}},
    '& .MuiListItemText-primary':{fontSize:15,fontWeight:520,lineHeight:1.5},
    '& .RaMenuItemLink-active .MuiListItemText-primary':{fontWeight:660},
  }}>
    <GroupLabel>工作区</GroupLabel>
    <Menu.Item to="/" primaryText="概览" leftIcon={<DashboardRoundedIcon fontSize="small"/>}/>
    <Menu.Item to="/memberships" primaryText="用户"
      sx={domainStyle(current('/memberships','/users','/membership-events'))}
      leftIcon={<GroupsOutlinedIcon fontSize="small"/>}/>
    <Menu.Item to="/grants" primaryText="权益"
      sx={domainStyle(current('/grants','/grant-new'))}
      leftIcon={<WorkspacePremiumOutlinedIcon fontSize="small"/>}/>
    <Menu.Item to="/code-batches" primaryText="兑换码"
      sx={domainStyle(current('/code-batches','/codes','/redemptions','/issue-codes'))}
      leftIcon={<ConfirmationNumberOutlinedIcon fontSize="small"/>}/>
    <Menu.Item to="/feedback" primaryText="用户反馈"
      sx={domainStyle(current('/feedback'))}
      leftIcon={<ChatBubbleOutlineRoundedIcon fontSize="small"/>}/>
    <Menu.Item to="/audit-logs" primaryText="平台管理"
      sx={domainStyle(current('/products','/audit-logs','/restrictions','/admins','/account-actions'))}
      leftIcon={<ShieldOutlinedIcon fontSize="small"/>}/>
    <Box sx={{mx:2,mt:'auto',borderTop:'1px solid',borderColor:'divider',pt:1.7,pb:.8,px:.5}}>
      <Stack direction="row" spacing={1} sx={{alignItems:'center'}}>
        <Box aria-hidden sx={{width:7,height:7,borderRadius:'50%',bgcolor:'success.main'}}/>
        <Typography sx={{fontSize:12,color:'text.secondary',fontWeight:580}}>本地开发环境</Typography>
      </Stack>
    </Box>
  </Menu>;
}
function AdminLayout(props:React.ComponentProps<typeof Layout>) {
  return <OperationModalProvider><Layout {...props} appBar={AdminAppBar} menu={AdminMenu} sx={{
    backgroundColor:'background.default',
    minWidth:0,
    '& .RaLayout-appFrame':{marginTop:'64px'},
    '& .RaLayout-contentWithSidebar':{
      display:'flex',alignItems:'flex-start',
      gap:{xs:0,md:2},px:{xs:0,md:2},pt:{xs:0,md:2},pb:{xs:0,md:2},
      minWidth:0,
    },
    '& .RaLayout-content':{
      minWidth:0,width:'auto',maxWidth:'none',boxSizing:'border-box',
      padding:'0 !important',margin:0,overflowX:'hidden',
      background:{xs:'#F8FAFC',md:'rgba(255,255,255,.91)'},
      border:{xs:'none',md:'1px solid #E5EAF0'},
      borderRadius:{xs:0,md:'21px'},
      boxShadow:{xs:'none',md:'0 12px 40px rgba(35,52,72,.045), 0 2px 7px rgba(35,52,72,.025)'},
      minHeight:{xs:'calc(100dvh - 64px)',md:'calc(100dvh - 96px)'},
    },
    '@media (min-width:900px)':{
      '& .RaSidebar-root':{flexShrink:0,height:'calc(100dvh - 96px)',minHeight:0},
      '& .RaSidebar-paper':{
        border:'1px solid #E5EAF0 !important',
        background:'rgba(255,255,255,.94) !important',
        borderRadius:'20px !important',
        boxShadow:'0 10px 32px rgba(33,50,69,.055), 0 2px 6px rgba(33,50,69,.025)',
        minHeight:'calc(100dvh - 96px)',maxHeight:'calc(100dvh - 96px)',
        overflowY:'auto',overflowX:'hidden',
      },
    },
  }}/></OperationModalProvider>;
}
export default function App() {
  if(location.pathname.startsWith('/auth/'))return <Suspense fallback={<RouteLoading/>}><AuthActionPage/></Suspense>;
  return <Suspense fallback={<RouteLoading/>}><Admin requireAuth dataProvider={dataProvider} authProvider={authProvider}
    i18nProvider={chineseI18nProvider} theme={theme} loginPage={LoginPage}
    layout={AdminLayout} dashboard={Dashboard} title="AisenCore 管理平台">
    <Resource name="products" options={{label:'产品'}} list={ProductsList} create={ProductCreate} show={ProductShow}/>
    <Resource name="memberships" options={{label:'成员关系'}} list={MembersList} show={MemberShow}/>
    <Resource name="grants" options={{label:'Pro 授权'}} list={GrantsList} show={GrantShow}/>
    <Resource name="code-batches" options={{label:'发行批次'}} list={BatchesList} show={BatchShow}/>
    <Resource name="codes" options={{label:'兑换码记录'}} list={CodesList} show={CodeShow}/>
    <Resource name="redemptions" options={{label:'核销记录'}} list={RedemptionsList}/>
    <Resource name="admins" options={{label:'管理员权限'}} list={AdminsList} show={AdminShow}/>
    <Resource name="restrictions" options={{label:'平台封禁'}} list={RestrictionsList} show={RestrictionShow}/>
    <Resource name="audit-logs" options={{label:'管理审计'}} list={AuditList} show={AuditShow}/>
    <Resource name="membership-events" options={{label:'成员事件'}} list={EventsList}/>
    <Resource name="users" options={{label:'查找账号'}} list={UsersList} show={UserShow}/>
    <Resource name="feedback" options={{label:'用户反馈'}} list={FeedbackList} show={FeedbackShow}/>
    <CustomRoutes>
      <Route path="/grant-new" element={<Authenticated><GrantCreate/></Authenticated>}/>
      <Route path="/issue-codes" element={<Authenticated><IssueCodes/></Authenticated>}/>
      <Route path="/account-actions" element={<Authenticated><AccountActions/></Authenticated>}/>
      <Route path="/feedback/workbench" element={<Authenticated><FeedbackWorkbench/></Authenticated>}/>
      <Route path="/feedback/archived" element={<Authenticated><FeedbackArchived/></Authenticated>}/>
      <Route path="/feedback/trash" element={<Authenticated><FeedbackTrash/></Authenticated>}/>
    </CustomRoutes>
  </Admin></Suspense>;
}
