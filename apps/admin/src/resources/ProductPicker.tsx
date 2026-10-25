import { useState } from 'react';
import { useGetList, useGetOne } from 'react-admin';
import { Alert, Button, MenuItem, Skeleton, Stack, TextField, Typography } from '@mui/material';

export function ProductPicker({value,onChange,disabled=false}:{
  value:string;
  onChange:(id:string)=>void;
  disabled?:boolean;
}) {
  const [draft,setDraft]=useState('');
  const [exactKey,setExactKey]=useState('');
  const {data,isPending,isError,total}=useGetList('products',{
    pagination:{page:1,perPage:100},sort:{field:'name',order:'ASC'},filter:{},
  });
  // Exact-key lookup makes every accessible product selectable even when the
  // platform has more products than the first 100 dropdown suggestions.
  const match=useGetList('products',{
    pagination:{page:1,perPage:1},sort:{field:'name',order:'ASC'},filter:{product_key:exactKey},
  },{enabled:!!exactKey});
  const chosen=useGetOne('products',{id:value},{enabled:!!value});
  const unique=new Map([...(data??[]),...(match.data??[]),...(chosen.data?[chosen.data]:[])]
    .map(item=>[String(item.id),item]));
  const products=[...unique.values()];
  const selected=products.find(product=>String(product.id)===value);
  return <>
    <TextField select label="目标产品" required value={selected?value:''}
      disabled={disabled||isPending||isError} onChange={event=>onChange(event.target.value)}
      >
      <MenuItem value="" disabled>选择一个产品</MenuItem>
      {products.map(product=><MenuItem key={product.id} value={String(product.id)}>
        {String(product.name)} · {String(product.product_key)}
        {product.status==='suspended'?'（已暂停）':product.status==='draft'?'（草稿）':''}
      </MenuItem>)}
    </TextField>
    {isPending?<Skeleton width="100%" height={14}/>:
      isError?<Alert severity="error">产品目录读取失败。请检查管理员权限或网络连接。</Alert>:null}
    {(total??0)>100&&<Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">未找到产品？使用完整产品键查找。</Typography>
      <Stack direction={{xs:'column',sm:'row'}} spacing={1} component="form"
        onSubmit={event=>{event.preventDefault();setExactKey(draft.trim())}}>
        <TextField size="small" label="精确产品键" value={draft} disabled={disabled}
          onChange={event=>setDraft(event.target.value)} helperText="例如 aisenlens"/>
        <Button type="submit" variant="outlined" disabled={disabled||!draft.trim()}>查找产品</Button>
      </Stack>
      {exactKey&&match.isError?<Alert severity="error">产品键查询失败，请重试。</Alert>:null}
      {exactKey&&!match.isPending&&!match.isError&&(match.data??[]).length===0?<Alert severity="info">找不到该产品键。</Alert>:null}
      {exactKey&&(match.data??[]).length>0?<Button size="small" variant="outlined" disabled={disabled}
        onClick={()=>onChange(String(match.data![0].id))}>使用找到的产品：{String(match.data![0].name)}</Button>:null}
    </Stack>}
  </>;
}
