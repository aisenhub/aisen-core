import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3@3.1156.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.1156.0';
export const cors = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
};
export const json=(value:unknown,status=200)=>Response.json(value,{status,headers:cors});
export const fail=(message:string,status:number)=>json({message},status);
function r2(){
  const account=Deno.env.get('R2_ACCOUNT_ID');
  const key=Deno.env.get('R2_ACCESS_KEY_ID');
  const secret=Deno.env.get('R2_SECRET_ACCESS_KEY');
  const bucket=Deno.env.get('R2_FEEDBACK_BUCKET');
  if(!account||!key||!secret||!bucket)throw new Error('R2_NOT_CONFIGURED');
  return {bucket,client:new S3Client({region:'auto',
    endpoint:'https://'+account+'.r2.cloudflarestorage.com',
    credentials:{accessKeyId:key,secretAccessKey:secret},
  })};
}
export function detectMime(data:Uint8Array):{mime:string;ext:string}|null{
  if(data.length>=8&&data[0]===137&&data[1]===80&&data[2]===78&&data[3]===71&&
    data[4]===13&&data[5]===10&&data[6]===26&&data[7]===10)
    return {mime:'image/png',ext:'png'};
  if(data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255)
    return {mime:'image/jpeg',ext:'jpg'};
  if(data.length>=12&&String.fromCharCode(...data.slice(0,4))==='RIFF'&&
    String.fromCharCode(...data.slice(8,12))==='WEBP')
    return {mime:'image/webp',ext:'webp'};
  return null;
}
export async function feedbackObjectKey(productId:string,userId:string,
  requestId:string,slot:number,bytes:Uint8Array,ext:string):Promise<string>{
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(![productId,userId,requestId].every(x=>uuid.test(x))||![1,2].includes(slot)||
     !['png','jpg','webp'].includes(ext))throw new Error('INVALID_OBJECT_KEY');
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes)));
  const hash=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
  return 'feedback/'+productId+'/'+userId+'/'+requestId+'/'+slot+'-'+hash+'.'+ext;
}
export async function boundedForm(req:Request,max:number):Promise<FormData>{
  const reader=req.body?.getReader();
  if(!reader)throw new Error('EMPTY_BODY');
  const chunks:Uint8Array[]=[];let length=0;
  try {
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>max)throw new Error('REQUEST_TOO_LARGE');
      chunks.push(value);
    }
  }finally{reader.releaseLock()}
  const data=new Uint8Array(length);let at=0;
  for(const chunk of chunks){data.set(chunk,at);at+=chunk.byteLength}
  return new Request(req.url,{method:'POST',
    headers:{'content-type':req.headers.get('content-type')??''},body:data}).formData();
}
// Injecting a client here allows a loopback S3 protocol fixture in tests;
// the production wrapper always creates the scoped R2 client from secrets.
export async function putObject(client:S3Client,bucket:string,key:string,
 data:Uint8Array,mime:string):Promise<boolean>{
  try{
    await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:data,
      ContentType:mime,ContentLength:data.length,IfNoneMatch:'*'}));
    return true;
  }catch(e){
    // Deterministic content-addressed retries may find an existing object.
    if((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===412)
      return false;
    throw e;
  }
}
export async function putFile(key:string,data:Uint8Array,mime:string):Promise<boolean>{
  const {client,bucket}=r2();
  return putObject(client,bucket,key,data,mime);
}
export async function deleteFile(key:string){
  const {client,bucket}=r2();
  await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
}
export async function readObject(client:S3Client,bucket:string,key:string,
 maxBytes=3*1024*1024):Promise<Uint8Array>{
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>3*1024*1024)
    throw new Error('INVALID_OBJECT_READ_LIMIT');
  const result=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  if(!result.Body)throw new Error('MISSING_OBJECT_BODY');
  if(result.ContentLength!==undefined&&result.ContentLength>maxBytes)
    throw new Error('OBJECT_TOO_LARGE');
  // Enforce the byte cap while the S3 response streams. Never trust DB
  // metadata or an optional/forged Content-Length as a memory limit.
  const reader=result.Body.transformToWebStream().getReader();
  const chunks:Uint8Array[]=[];let length=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>maxBytes)throw new Error('OBJECT_TOO_LARGE');
      chunks.push(value);
    }
  }catch(e){
    await reader.cancel().catch(()=>{});
    throw e;
  }finally{reader.releaseLock()}
  const output=new Uint8Array(length);let at=0;
  for(const chunk of chunks){output.set(chunk,at);at+=chunk.byteLength}
  return output;
}
export async function readFile(key:string):Promise<Uint8Array>{
  const {client,bucket}=r2();
  return readObject(client,bucket,key);
}
export async function signedGet(key:string){
  const {client,bucket}=r2();
  return getSignedUrl(client,new GetObjectCommand({Bucket:bucket,Key:key}),{expiresIn:60});
}
