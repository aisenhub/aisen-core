import {useEffect,useState} from 'react';
import {callRpc} from '../data/dataProvider';

// Server-side distinct tags over the entire authorized product scope.
// Never derive dropdown options from the current paginated table.
export function useFeedbackTags(productId?:string){
  const [tags,setTags]=useState<string[]>([]);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let alive=true;
    void callRpc<string[]>('admin_feedback_tags',{p_product_id:productId||null})
      .then(value=>{if(alive){setTags(Array.isArray(value)?value:[]);setError(false)}})
      .catch(()=>{if(alive)setError(true)});
    return ()=>{alive=false};
  },[productId]);
  return {tags,error};
}
