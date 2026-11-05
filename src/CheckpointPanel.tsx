import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, CheckCircle2, CloudUpload, FileText, Github, History, LoaderCircle, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { CheckpointControls } from './useCheckpoints';
import type { LocalDocumentsControls } from './useLocalDocuments';

export default function CheckpointPanel({controls,documents,onClose}: {controls:CheckpointControls;documents:LocalDocumentsControls;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  const {status,busy,error,message,conflict,enabled,savedAt}=controls;
  return createPortal(<dialog ref={dialog} className="checkpoint-dialog" aria-labelledby="checkpoint-title" onCancel={onClose}><div className="modal-heading"><div><div className="eyebrow">YOUR WORK, WITH A HISTORY</div><h2 id="checkpoint-title"><Github size={21}/> GitHub checkpoints</h2></div><button className="icon-button" aria-label="Close GitHub checkpoints" onClick={onClose}><X size={19}/></button></div>
    <p className="checkpoint-intro">Back up your entire workspace to a private repository: notes, drawings, folders, interviews, plans, and your uploaded resume. Notes, drawings, and gallery files are also saved as ordinary files in a documents folder.</p>
    {status?.configured ? <><div className="checkpoint-repo"><ShieldCheck size={19}/><div><strong>{status.repo}</strong><span>Private repository · workspace.json and documents/</span></div><a className="icon-button" href={status.url} target="_blank" rel="noreferrer" aria-label="Open private repository"><ArrowUpRight size={18}/></a></div>
    <label className="checkpoint-auto"><div><strong>Automatic checkpoints</strong><span>Checks for changes every minute while this app is open.</span></div><input type="checkbox" role="switch" aria-label="Automatic GitHub checkpoints" checked={enabled} disabled={busy||conflict} onChange={controls.toggle}/></label>
    <div className="checkpoint-status"><CheckCircle2 size={15}/><span>{savedAt ? `Last checkpoint / restore: ${new Date(savedAt).toLocaleString()}` : 'No checkpoint from this browser yet.'}</span></div>
    {conflict && <div className="checkpoint-warning"><strong>A different checkpoint is on GitHub</strong><p>Restore it to continue from that version, or explicitly save this workspace as the latest version. Automatic uploads are paused until this is resolved.</p><button className="small-button" disabled={busy} onClick={()=>void controls.replace()}>Use this workspace</button></div>}
    <div className="checkpoint-actions"><button className="primary" disabled={busy||conflict} onClick={()=>void controls.checkpoint()}>{busy?<LoaderCircle className="spin" size={16}/>:<CloudUpload size={16}/>}Checkpoint now</button><button className="small-button" disabled={busy||!status.sha} onClick={()=>void controls.restore()}><History size={15}/> Restore latest</button></div>
    <p className="checkpoint-local">Local recovery copies are also saved in <code>.prepwise/checkpoints/</code>. Older remote versions are in the repository’s commit history.</p></> : <div className="checkpoint-setup"><h3>One-time connection</h3><ol><li>Create a <strong>private</strong> GitHub repository for your prep data.</li><li>Create a fine-grained token restricted to that repository, with <strong>Contents: read and write</strong>.</li><li>Copy <code>.env.example</code> to <code>.env.local</code> in this project and fill in your repository and token.</li><li>Restart <code>npm run dev</code>, then enable automatic checkpoints here.</li></ol><p>The token stays in the local server environment. It is never stored in your workspace or sent to the browser.</p></div>}
    {documents.path && <div className="checkpoint-status"><FileText size={15}/><span>Markdown copies save automatically to <code>{documents.path}</code>{documents.savedAt ? ` · ${documents.files} files · last saved ${new Date(documents.savedAt).toLocaleTimeString()}` : ''}</span></div>}
    {documents.ignoredBy && <div className="checkpoint-warning"><strong>That folder belongs to another browser address</strong><p>It holds the workspace from {documents.ignoredBy}, so this one is not being saved there. Using this workspace replaces those files, and anything edited outside the app is set aside first.</p><button className="small-button" onClick={documents.takeOver}>Use this workspace</button></div>}
    {documents.error && <p className="checkpoint-error" role="alert">Local files: {documents.error}</p>}
    {error && <p className="checkpoint-error" role="alert">{error}</p>}{message && <p className="checkpoint-message" role="status">{message}</p>}
    <div className="modal-footer"><button className="small-button" disabled={busy} onClick={()=>void controls.refresh().catch(()=>{})}><RefreshCw size={14}/> Check connection</button><button className="small-button" onClick={onClose}>Done</button></div>
  </dialog>,document.body);
}
