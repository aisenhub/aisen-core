import { useEffect, useState } from 'react';
import { useNotify, useRefresh } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Chip, Divider, Stack, TextField, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { callRpc } from '../data/dataProvider';
import { OperationLayout } from './OperationLayout';
import type { OperationSafety } from './OperationDialogs';

const keyPattern=/^[a-z][a-z0-9_]{0,63}$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function ProductCreate({embedded=false,onSafetyChange,onCompleted}:{
  embedded?:boolean;onSafetyChange?:(v:OperationSafety)=>void;onCompleted?:()=>void;
}={}){
  const notify=useNotify(),refresh=useRefresh(),navigate=useNavigate();
  const [productKey,setProductKey]=useState('');
  const [name,setName]=useState('');
  const [description,setDescription]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{onSafetyChange?.(busy?'busy':'idle')},[onSafetyChange,busy]);
  const [failure,setFailure]=useState('');
  const keyOk=keyPattern.test(productKey);
  const nameOk=name.trim().length>=1&&name.trim().length<=160;
  const canSubmit=keyOk&&nameOk&&!busy;
  async function submit(event:React.FormEvent){
    event.preventDefault();
    if(!canSubmit)return;
    setBusy(true);setFailure('');
    try{
      const result=await callRpc<{id:string}>('admin_create_product',{
        p_product_key:productKey,p_name:name.trim(),p_description:description.trim()||null,
      });
      if(!uuidPattern.test(result.id))throw Error('服务端未返回有效的产品编号，请检查产品目录确认是否创建成功。');
      notify('产品已建立为草稿；通过状态管理操作后才能启用。',{type:'success'});
      refresh();
      if(embedded){onCompleted?.();}else navigate('/products/'+result.id+'/show');
    }catch(error){
      const message=error instanceof Error?error.message:'产品创建失败';
      setFailure(message);
      notify(message,{type:'error'});
    }finally{setBusy(false)}
  }
  return <OperationLayout title="建立新产品" embedded={embedded}>
    <Card><CardContent>
      <Stack spacing={2.4} component="form" onSubmit={event=>void submit(event)}>
        {failure&&<Alert severity="error">{failure}</Alert>}
        <TextField label="产品名称" name="product-name" autoComplete="off"
          required value={name} onChange={event=>setName(event.target.value)}
          error={name.length>0&&!nameOk} helperText="1–160 个字符"
          slotProps={{htmlInput:{maxLength:160}}}/>
        <TextField label="唯一产品键" name="product-key" autoComplete="off"
          required value={productKey} onChange={event=>setProductKey(event.target.value)}
          error={productKey.length>0&&!keyOk}
          helperText={productKey.length>0&&!keyOk?'必须以小写字母开头，只能使用小写字母、数字和下划线（最长 64 位）':'例如 aisen_studio（创建后不建议修改）'}
          slotProps={{htmlInput:{maxLength:64,pattern:'[a-z][a-z0-9_]*'}}}/>
        <TextField label="产品简介（可选）" name="product-description" value={description}
          multiline minRows={3} onChange={event=>setDescription(event.target.value)}
          helperText="帮助平台管理员区分产品用途；不要录入真实用户个人信息"/>
        <Divider/>
        <Stack direction="row" spacing={1.2} sx={{alignItems:'center',flexWrap:'wrap'}}>
          <Typography variant="subtitle2">创建后默认状态</Typography>
          <Chip label="草稿 / 未启用" sx={{bgcolor:'#f0f1f7',color:'#4c5970'}}/>
        </Stack>
        <Stack direction={{xs:'column-reverse',sm:'row'}} spacing={1.4}>
          {!embedded&&<Button variant="outlined" onClick={()=>navigate('/products')} disabled={busy}>返回目录</Button>}
          <Button variant="contained" type="submit" disabled={!canSubmit}
            endIcon={<ArrowForwardRoundedIcon/>}>{busy?'正在创建…':'确认创建草稿产品'}</Button>
        </Stack>
      </Stack>
    </CardContent></Card>
  </OperationLayout>;
}
