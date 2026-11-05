import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, BookOpen, ExternalLink, FileText, Images, Trash2, Upload } from 'lucide-react';
import { deleteUpload, getUpload, putUpload } from './uploads';
import { formatFileSize, isPdfFile, MAX_UPLOAD_BYTES, type SectionConfig, type UploadedFile } from './model';

// These open in a new tab. Anything else (HTML, SVG) could run scripts with access to this
// app's data if opened from this origin, so it is download-only.
const opensInline = (type: string) => /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|text\/plain)$/.test(type);

export default function SectionGallery({section,uploads,onAdd,onRemove,onRead,notify}: {onRead:(id:string)=>void;section:SectionConfig;uploads:UploadedFile[];onAdd:(file:UploadedFile)=>void;onRemove:(id:string)=>void;notify:(message:string)=>void}) {
  const input=useRef<HTMLInputElement>(null);
  const [urls,setUrls]=useState<Record<string,string|null>>({});
  const [dragging,setDragging]=useState(false);
  const created=useRef(new Map<string,string>());
  useEffect(()=>{
    let cancelled=false;
    for(const {id} of uploads) {
      if(created.current.has(id))continue;
      created.current.set(id,'');
      getUpload(id).then(blob=>{
        if(cancelled)return;
        const url=blob ? URL.createObjectURL(blob) : null;
        if(url)created.current.set(id,url);
        setUrls(current=>({...current,[id]:url}));
      }).catch(()=>{if(!cancelled)setUrls(current=>({...current,[id]:null}));});
    }
    return ()=>{cancelled=true;for(const url of created.current.values())if(url)URL.revokeObjectURL(url);created.current.clear();};
  },[uploads.map(u=>u.id).join()]);
  async function add(files: FileList | null | undefined) {
    for(const file of Array.from(files || [])) {
      if(file.size>MAX_UPLOAD_BYTES){notify(`“${file.name}” is larger than the ${MAX_UPLOAD_BYTES/1024/1024} MB limit.`);continue;}
      const id=crypto.randomUUID();
      try {
        await putUpload(id,file);
        onAdd({id,section:section.id,name:file.name,type:file.type,size:file.size,addedAt:new Date().toISOString()});
      } catch {notify(`Could not save “${file.name}” in this browser.`);}
    }
  }
  return <div className="gallery" onDragOver={e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();setDragging(true);}} onDragLeave={e=>{if(e.currentTarget===e.target)setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);void add(e.dataTransfer.files);}}>
    <div className="gallery-heading"><div><div className="eyebrow">{section.name.toUpperCase()}</div><h2>Gallery</h2><p>{uploads.length} {uploads.length===1?'file':'files'} · up to {MAX_UPLOAD_BYTES/1024/1024} MB each · saved on this device</p></div><button className="primary" onClick={()=>input.current?.click()}><Upload size={16}/> Upload files</button></div>
    <input ref={input} type="file" multiple hidden onChange={e=>{void add(e.target.files);e.target.value='';}}/>
    {uploads.length ? <div className="gallery-grid">{uploads.map(file=>{const url=urls[file.id];const missing=url===null;return <article className="gallery-card" key={file.id}>
      <div className="gallery-thumb">{url && file.type.startsWith('image/') ? <img src={url} alt=""/> : <FileText size={30}/>}</div>
      <div className="gallery-card-text"><strong title={file.name}>{file.name}</strong><small>{missing ? 'File not found in this browser' : `${formatFileSize(file.size)} · ${new Date(file.addedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}`}</small></div>
      <div className="gallery-actions">{!missing && isPdfFile(file) && <button className="icon-button" aria-label={`Read ${file.name}`} title="Read here" onClick={()=>onRead(file.id)}><BookOpen size={15}/></button>}{url && opensInline(file.type) && <a className="icon-button" href={url} target="_blank" rel="noreferrer" aria-label={`Open ${file.name}`} title="Open"><ExternalLink size={15}/></a>}{url && <a className="icon-button" href={url} download={file.name} aria-label={`Download ${file.name}`} title="Download"><ArrowDownToLine size={15}/></a>}<button className="icon-button danger" aria-label={`Delete ${file.name}`} title="Delete" onClick={()=>{if(window.confirm(`Delete “${file.name}”?`)){onRemove(file.id);void deleteUpload(file.id);}}}><Trash2 size={15}/></button></div>
    </article>;})}</div> : <button className={`gallery-empty ${dragging?'dragging':''}`} onClick={()=>input.current?.click()}><Images size={30}/><strong>Drop documents here</strong><span>PDFs, images, slides, spreadsheets, or anything else for this section.</span></button>}
    {dragging && uploads.length>0 && <div className="gallery-drop-hint">Drop to add to {section.name}</div>}
  </div>;
}
