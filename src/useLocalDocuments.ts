import { useCallback, useEffect, useRef, useState } from 'react';
import type { Workspace } from './model';
import { blobToDataUrl, getUpload } from './uploads';

const SAVE_DELAY_MS=2000;
export type LocalDocumentsState={path?:string;files?:number;savedAt?:string;setAside?:number;ignoredBy?:string;error?:string};

async function post<T>(endpoint:string,body:unknown):Promise<T> {
  const response=await fetch(`/api/checkpoints/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json','X-Prepwise-Checkpoint':'1'},body:JSON.stringify(body)});
  const value=await response.json();
  if(!response.ok)throw new Error(value.error || 'The local files could not be saved.');
  return value as T;
}

/** Writes every note, drawing, and gallery file to the local documents folder shortly after each change. */
export default function useLocalDocuments(workspace:Workspace|null) {
  const [state,setState]=useState<LocalDocumentsState>({});
  const latest=useRef(workspace);latest.current=workspace;
  const lastSent=useRef('');
  const stagedFiles=useRef('');
  const running=useRef(false);
  const save=useCallback(async(takeOver=false)=>{
    const data=latest.current;
    if(!data || running.current)return;
    const text=JSON.stringify(data);
    if(text===lastSent.current && !takeOver)return;
    running.current=true;
    try {
      const ids=(data.uploads || []).map(f=>f.id);
      if(ids.join()!==stagedFiles.current) {
        const {missing}=await post<{missing:string[]}>('missing-uploads',{ids});
        for(const id of missing) {
          const blob=await getUpload(id);
          if(blob)await post('stage-upload',{id,data:(await blobToDataUrl(blob)).split(',')[1] || ''});
        }
        stagedFiles.current=ids.join();
      }
      const result=await post<{ignored?:boolean;owner?:string;path:string;files?:number;savedAt?:string;setAside?:number}>('local-documents',{workspace:data,takeOver});
      lastSent.current=text;
      setState(result.ignored ? {path:result.path,ignoredBy:result.owner} : {path:result.path,files:result.files,savedAt:result.savedAt,setAside:result.setAside});
    }catch(error){setState(current=>({...current,error:error instanceof Error ? error.message : 'The local files could not be saved.'}));}
    finally {
      running.current=false;
      // A change made during this save still needs its own.
      if(latest.current!==data)window.setTimeout(()=>void save(),SAVE_DELAY_MS);
    }
  },[]);
  useEffect(()=>{
    if(!workspace)return;
    const timer=window.setTimeout(()=>void save(),SAVE_DELAY_MS);
    return ()=>window.clearTimeout(timer);
  },[workspace,save]);
  return {...state,takeOver:()=>void save(true)};
}
export type LocalDocumentsControls=ReturnType<typeof useLocalDocuments>;
