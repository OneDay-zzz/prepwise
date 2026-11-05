import { useCallback, useEffect, useRef, useState } from 'react';
import { validateWorkspace, type Workspace } from './model';
import { blobToDataUrl, dataUrlToBlob, getUpload, putUpload } from './uploads';

type Status = {configured:boolean;repo:string|null;url?:string;sha?:string|null;localAt?:string|null};
type Preferences = {enabled:boolean;repo:string|null;sha:string|null;savedAt:string|null};
const KEY='prepwise-github-checkpoints';
function readPreferences():Preferences {
  try{const value=JSON.parse(localStorage.getItem(KEY)||'null');if(value && typeof value.enabled==='boolean' && (value.repo===null||typeof value.repo==='string') && (value.sha===null||typeof value.sha==='string'))return value;}catch{}
  return {enabled:false,repo:null,sha:null,savedAt:null};
}
async function api<T>(endpoint:string,body?:unknown):Promise<T> {
  let response:Response;
  try{response=await fetch(`/api/checkpoints/${endpoint}`,body===undefined ? {cache:'no-store'} : {method:'POST',headers:{'Content-Type':'application/json','X-Prepwise-Checkpoint':'1'},body:JSON.stringify(body)});}catch{throw new Error('The local checkpoint service is unavailable. Start the app with npm run dev.');}
  let value;try{value=await response.json();}catch{throw new Error('Restart the local app with npm run dev to load the checkpoint service.');}
  if(!response.ok)throw new Error(value.error || 'The checkpoint request failed.');
  return value as T;
}
export default function useCheckpoints(workspace:Workspace|null,onRestore:(workspace:Workspace)=>void) {
  const [preferences,setPreferences]=useState<Preferences>(readPreferences);
  const [status,setStatus]=useState<Status|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const latest=useRef(workspace);latest.current=workspace;
  const running=useRef(false);
  const lastSaved=useRef('');
  const prefs=useRef(preferences);prefs.current=preferences;
  const currentStatus=useRef(status);currentStatus.current=status;
  const updatePreferences=useCallback((next:Preferences)=>{prefs.current=next;setPreferences(next);try{localStorage.setItem(KEY,JSON.stringify(next));}catch{}},[]);
  const refresh=useCallback(async(clearError=true)=>{
    try{const value=await api<Status>('status');currentStatus.current=value;setStatus(value);if(clearError)setError('');return value;}catch(error){setError(error instanceof Error?error.message:'Could not check GitHub.');throw error;}
  },[]);
  useEffect(()=>{void refresh().catch(()=>{});},[refresh]);
  const checkpoint=useCallback(async(replace=false)=>{
    const data=latest.current;const config=currentStatus.current;
    if(!data || !config?.configured || running.current)return;
    running.current=true;setBusy(true);setError('');setMessage('Saving checkpoint…');
    try{
      const expectedSha=replace ? config.sha ?? null : prefs.current.repo===config.repo ? prefs.current.sha : null;
      const files=data.uploads || [];
      if(files.length) {
        const {missing}=await api<{missing:string[]}>('missing-uploads',{ids:files.map(f=>f.id)});
        for(const id of missing) {
          const blob=await getUpload(id);
          if(!blob)throw new Error(`“${files.find(f=>f.id===id)?.name}” is not in this browser. Delete it from its gallery or upload it again.`);
          await api('stage-upload',{id,data:(await blobToDataUrl(blob)).split(',')[1] || ''});
        }
      }
      const result=await api<{sha:string;savedAt:string;url:string}>('save',{workspace:data,expectedSha});
      lastSaved.current=JSON.stringify(data);
      updatePreferences({...prefs.current,repo:config.repo,sha:result.sha,savedAt:result.savedAt});
      const next={...config,sha:result.sha,localAt:result.savedAt};currentStatus.current=next;setStatus(next);
      setMessage('Checkpoint saved to your private repository.');
    }catch(error){setMessage('');setError(error instanceof Error?error.message:'Checkpoint failed.');void refresh(false).catch(()=>{});}
    finally{running.current=false;setBusy(false);}
  },[refresh,updatePreferences]);
  // Coalesce changes into at most one automatic checkpoint per minute while open.
  useEffect(()=>{
    if(!preferences.enabled || !status?.configured || preferences.repo!==status.repo)return;
    const timer=setInterval(()=>{
      const config=currentStatus.current;
      if(!latest.current || running.current || !config || (config.sha || null)!==prefs.current.sha)return;
      if(JSON.stringify(latest.current)!==lastSaved.current)void checkpoint();
    },60000);
    return()=>clearInterval(timer);
  },[preferences.enabled,preferences.repo,status?.configured,status?.repo,checkpoint]);
  const restore=async()=>{
    if(running.current || !latest.current)return;
    if(!window.confirm('Restore the latest GitHub checkpoint? Your current workspace will first be saved as a local recovery checkpoint.'))return;
    running.current=true;setBusy(true);setError('');setMessage('');
    try{
      const result=await api<{workspace:unknown;sha:string;repo:string;uploadData:Record<string,string>;missingUploads:number}>('latest');
      const next=validateWorkspace(result.workspace);
      await api('preserve',{workspace:latest.current});
      for(const file of next.uploads || []) if(result.uploadData[file.id]!==undefined) await putUpload(file.id,await dataUrlToBlob(`data:${file.type || 'application/octet-stream'};base64,${result.uploadData[file.id]}`));
      onRestore(next);lastSaved.current=JSON.stringify(next);
      updatePreferences({...prefs.current,repo:result.repo,sha:result.sha,savedAt:new Date().toISOString()});
      setStatus(s=>s?{...s,sha:result.sha}:s);setMessage(`Workspace restored. Your previous data is saved in the local checkpoints folder.${result.missingUploads ? ` ${result.missingUploads} gallery file(s) were not found on GitHub.` : ''}`);
    }catch(error){setError(error instanceof Error?error.message:'Could not restore the checkpoint.');}
    finally{running.current=false;setBusy(false);}
  };
  const expectedSha=preferences.repo===status?.repo ? preferences.sha : null;
  const conflict=!!status?.configured && (status.sha || null)!==expectedSha;
  const enabled=preferences.enabled && preferences.repo===status?.repo;
  const toggle=()=>{if(!status?.configured)return;updatePreferences({...preferences,enabled:!enabled,repo:status.repo,sha:expectedSha});if(!enabled && !conflict)void checkpoint();};
  const replace=async()=>{
    if(!window.confirm('Make this browser workspace the latest GitHub checkpoint? Previous versions will remain in GitHub history.'))return;
    try{await refresh();await checkpoint(true);}catch{}
  };
  return {status,busy,error,message,conflict,enabled,savedAt:preferences.repo===status?.repo?preferences.savedAt:null,refresh,checkpoint,restore,replace,toggle};
}
export type CheckpointControls=ReturnType<typeof useCheckpoints>;
