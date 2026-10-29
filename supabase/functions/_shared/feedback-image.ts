import {Image} from 'jsr:@matmen/imagescript@3.3.0';
import {detectMime} from './feedback.ts';

// F07: Edge-side byte- and pixel-bounded *full decode*, not just magic bytes.
// A 3 MiB compressed file can claim enormous decoded memory; maxPixels is
// enforced by the decoder before allocating the RGBA output buffer.
export const MAX_FEEDBACK_IMAGE_PIXELS=12_000_000;
export const MAX_FEEDBACK_IMAGE_DIMENSION=6000;
const THUMB_MAX_EDGE=320;
const THUMB_MAX_BYTES=256*1024;
export const feedbackThumbnailKey=(originalObjectKey:string)=>
  originalObjectKey+'.thumb.jpg';
async function decodeFeedbackImage(bytes:Uint8Array,declaredMime:string){
  if(!bytes.length||bytes.length>3*1024*1024)return null;
  const parsed=detectMime(bytes);
  if(!parsed||parsed.mime!==declaredMime)return null;
  // The decoder accepts some otherwise-decodable truncated containers.
  // Require terminal markers so a dropped final chunk/EOI is never stored.
  if(parsed.mime==='image/png'){
    const iend=[0,0,0,0,73,69,78,68,174,66,96,130];
    if(bytes.length<45||!iend.every((value,i)=>
      bytes[bytes.length-iend.length+i]===value))return null;
  }
  if(parsed.mime==='image/jpeg'&&
    (bytes.length<4||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217))
    return null;
  // RIFF length must describe the whole WebP blob, not a truncated prefix.
  if(parsed.mime==='image/webp'&&
    (bytes.length<20||new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
      .getUint32(4,true)!==bytes.length-8))return null;
  try{
    const image=await Image.decode(bytes,{
      maxPixels:MAX_FEEDBACK_IMAGE_PIXELS,applyOrientation:false,
    });
    if(image.width<1||image.height<1||
      image.width>MAX_FEEDBACK_IMAGE_DIMENSION||
      image.height>MAX_FEEDBACK_IMAGE_DIMENSION||
      image.width*image.height>MAX_FEEDBACK_IMAGE_PIXELS)return null;
    return {parsed,image};
  }catch{
    // Malformed content, unsupported animation and decompression bombs are
    // all rejected without returning decoder internals to the caller.
    return null;
  }
}
export async function validateFeedbackImage(
  bytes:Uint8Array,declaredMime:string
):Promise<{mime:string;ext:string}|null>{
  const result=await decodeFeedbackImage(bytes,declaredMime);
  return result?.parsed??null;
}
// Private, server-generated, content-addressed derivative. Never accept a
// caller-supplied thumbnail. The same decoder and pixel bomb protections
// govern both the original and JPEG output; one decode per submission image.
export async function makeFeedbackThumbnail(
  bytes:Uint8Array,declaredMime:string
):Promise<{mime:string;ext:string;thumbnail:Uint8Array}|null>{
  const decoded=await decodeFeedbackImage(bytes,declaredMime);
  if(!decoded)return null;
  try{
    const {image,parsed}=decoded;
    const scale=Math.min(1,THUMB_MAX_EDGE/Math.max(image.width,image.height));
    const resized=scale===1?image:image.resize(
      Math.max(1,Math.round(image.width*scale)),
      Math.max(1,Math.round(image.height*scale)));
    const thumbnail=await resized.encodeJPEG(72);
    if(thumbnail.length===0||thumbnail.length>THUMB_MAX_BYTES)return null;
    return {...parsed,thumbnail};
  }catch{return null}
}
