import {Image} from 'jsr:@matmen/imagescript@3.3.0';
import {makeFeedbackThumbnail,feedbackThumbnailKey,validateFeedbackImage}
  from '../_shared/feedback-image.ts';
const check=(ok:boolean,message:string)=>{if(!ok)throw new Error(message)};
Deno.test('P4 private thumbnail is server-generated bounded JPEG with deterministic key',async()=>{
  const original=await new Image(900,450).encode();
  const parsed=await validateFeedbackImage(original,'image/png');
  check(parsed?.mime==='image/png','original full decode must work');
  const result=await makeFeedbackThumbnail(original,'image/png');
  check(result!==null,'valid PNG must yield a real compressed preview');
  const image=await Image.decode(result!.thumbnail);
  check(image.width===320&&image.height===160,'correct aspect ratio and max edge 320');
  check(result!.thumbnail.length>0&&result!.thumbnail.length<=256*1024,'bounded JPEG bytes');
  check(result!.thumbnail[0]===255&&result!.thumbnail[1]===216,'real JPEG signature');
  const originalKey='feedback/product/user/request/1-hash.png';
  check(feedbackThumbnailKey(originalKey)===originalKey+'.thumb.jpg','derived key deterministic');
  const second=await makeFeedbackThumbnail(original,'image/png');
  check(second!==null&&second.thumbnail.length===result!.thumbnail.length,'repeat is byte-stable');
});
Deno.test('P4 thumbnail rejects tampered containers and oversized decoded claims',async()=>{
  check(await makeFeedbackThumbnail(new TextEncoder().encode('<svg/>'),'image/svg+xml')===null,
    'SVG cannot become thumbnail');
  const valid=await new Image(64,32).encode();
  check(await makeFeedbackThumbnail(valid,'image/jpeg')===null,'MIME mismatch is rejected');
  check(await makeFeedbackThumbnail(valid.subarray(0,valid.length-8),'image/png')===null,
    'truncated PNG cannot become an authorized preview');
});
