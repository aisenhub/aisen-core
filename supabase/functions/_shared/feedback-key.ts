const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const feedbackKeyPattern=new RegExp('^feedback/'+uuid+'/'+uuid+'/'+uuid+
 '/[12]-[0-9a-f]{64}\\.(?:png|jpg|webp)$','i');

export function validFeedbackObjectKey(key:string,product:string,owner:string,request:string):boolean{
 return feedbackKeyPattern.test(key)&&key.startsWith(`feedback/${product}/${owner}/${request}/`);
}
