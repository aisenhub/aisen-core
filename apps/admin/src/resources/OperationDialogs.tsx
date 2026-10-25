import { createContext, forwardRef, lazy, Suspense, useCallback, useContext, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, Stack, Typography, useMediaQuery } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Link as RouterLink } from 'react-router-dom';
import type { LinkProps } from 'react-router-dom';

export type OperationSafety='idle'|'busy'|'pending'|'plaintext';
type Kind='grant'|'issue'|'account'|'product';
type OpenState={kind:Kind;userId?:string};
const paths:Record<string,Kind>={
  '/grant-new':'grant','/issue-codes':'issue','/account-actions':'account','/products/create':'product',
};
const titles:Record<Kind,string>={
  grant:'新增 Pro 授权',issue:'发行兑换码',account:'平台账号操作',product:'新建产品',
};
const OperationContext=createContext<((to:string)=>boolean)|null>(null);

const Grant=lazy(()=>import('./GrantCreate').then(m=>({default:m.GrantCreate})));
const Issue=lazy(()=>import('./IssueCodes').then(m=>({default:m.IssueCodes})));
const Account=lazy(()=>import('./AccountActions').then(m=>({default:m.AccountActions})));
const Product=lazy(()=>import('./ProductCreate').then(m=>({default:m.ProductCreate})));

/** Preserves a real href for deep links/new tabs, intercepts only ordinary in-app clicks. */
export const OperationLink=forwardRef<HTMLAnchorElement,LinkProps>(function OperationLink(
  {to,onClick,...rest},ref
){
  const open=useContext(OperationContext);
  return <RouterLink {...rest} to={to} ref={ref} onClick={(event:MouseEvent<HTMLAnchorElement>)=>{
    onClick?.(event);
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const target=typeof to==='string'?to:to.pathname+(to.search??'');
    if(open?.(target))event.preventDefault();
  }}/>;
});

export function OperationModalProvider({children}:{children:ReactNode}){
  const [opened,setOpened]=useState<OpenState|null>(null);
  const [safety,setSafety]=useState<OperationSafety>('idle');
  const [dirty,setDirty]=useState(false);
  const [leaveWarning,setLeaveWarning]=useState(false);
  const compact=useMediaQuery('(max-width:599px)');
  const open=useCallback((path:string)=>{
    const url=new URL(path,'https://aisencore.invalid');
    const kind=paths[url.pathname];
    if(!kind)return false;
    setOpened({kind,userId:url.searchParams.get('user_id')??undefined});
    setSafety('idle');setDirty(false);setLeaveWarning(false);
    return true;
  },[]);
  const forceClose=()=>{
    setOpened(null);setDirty(false);setSafety('idle');setLeaveWarning(false);
  };
  const attemptClose=()=>{
    if(safety==='busy')return;
    if(safety==='plaintext'||safety==='pending'||dirty){setLeaveWarning(true);return;}
    forceClose();
  };
  return <OperationContext.Provider value={open}>
    {children}
    <Dialog open={!!opened} onClose={attemptClose} fullWidth
      maxWidth={opened?.kind==='issue'?'md':'sm'} fullScreen={compact}
      aria-labelledby="aisencore-operation-title" scroll="paper"
      slotProps={{paper:{sx:{borderRadius:{xs:0,sm:3.5},
        maxHeight:{xs:'100dvh',sm:'min(90dvh,900px)'},border:'1px solid #E1E7EE',
        boxShadow:'0 24px 80px rgba(24,38,58,.19)',backgroundColor:'#fff'}}}}>
      {opened&&<>
        <DialogTitle id="aisencore-operation-title" sx={{py:2.2,px:{xs:2,sm:3},pr:7,
          fontWeight:760,fontSize:{xs:20,sm:22},color:'text.primary'}}>
          {titles[opened.kind]}
          <IconButton aria-label="关闭操作窗口" onClick={attemptClose} disabled={safety==='busy'}
            sx={{position:'absolute',right:16,top:15}}><CloseRoundedIcon/></IconButton>
        </DialogTitle>
        <DialogContent dividers onChangeCapture={()=>setDirty(true)}
          sx={{p:{xs:2,sm:3},overflowY:'auto',borderColor:'divider',
            '& .MuiCard-root':{boxShadow:'none',border:'none',background:'transparent'},
            '& .MuiCardContent-root':{p:'0 !important'},
            '& .MuiCardContent-root:last-child':{pb:'0 !important'},
          }}>
          {leaveWarning&&<Alert severity={safety==='plaintext'?'error':'warning'} sx={{mb:2}}>
            {safety==='plaintext'?'兑换码明文尚未确认安全保存。请先完成保存确认，不能直接关闭。':
              safety==='pending'?'请求结果尚未确认。稍后可重新打开本操作，使用已保存的原请求编号继续核查。':
                '表单已修改，关闭后未提交的内容将丢失。'}
            <Stack direction="row" spacing={1} sx={{mt:1.2,flexWrap:'wrap'}}>
              <Button size="small" onClick={()=>setLeaveWarning(false)}>继续操作</Button>
              {safety!=='plaintext'&&<Button size="small" color="warning" onClick={forceClose}>
                {safety==='pending'?'稍后恢复核查':'放弃修改并关闭'}
              </Button>}
            </Stack>
          </Alert>}
          <Suspense fallback={<Box role="status" sx={{p:3,display:'flex',gap:2}}>
            <CircularProgress size={22}/><Typography>正在加载操作…</Typography></Box>}>
            {opened.kind==='grant'&&<Grant embedded defaultUserId={opened.userId}
              onSafetyChange={setSafety} onCompleted={forceClose}/>}
            {opened.kind==='issue'&&<IssueCodesSlot onSafetyChange={setSafety} onCompleted={forceClose}/>}
            {opened.kind==='account'&&<Account embedded defaultUserId={opened.userId}
              onSafetyChange={setSafety} onCompleted={forceClose}/>}
            {opened.kind==='product'&&<Product embedded onSafetyChange={setSafety}
              onCompleted={forceClose}/>}
          </Suspense>
        </DialogContent>
        <DialogActions sx={{px:{xs:2,sm:3},py:1.8,justifyContent:'flex-start'}}>
          <Button size="small" color="inherit" onClick={attemptClose} disabled={safety==='busy'}>
            {safety==='pending'?'稍后处理':'关闭'}
          </Button>
        </DialogActions>
      </>}
    </Dialog>
  </OperationContext.Provider>;
}
function IssueCodesSlot({onSafetyChange,onCompleted}:{onSafetyChange:(v:OperationSafety)=>void;onCompleted:()=>void}){
  return <Issue embedded onSafetyChange={onSafetyChange} onCompleted={onCompleted}/>;
}
