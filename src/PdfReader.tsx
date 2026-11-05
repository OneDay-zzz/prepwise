import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ExternalLink, FileText, LoaderCircle } from 'lucide-react';
import { formatFileSize, type UploadedFile } from './model';
import { getUpload } from './uploads';

/** Reads a gallery PDF in the browser's own viewer, which brings page navigation, zoom, and search. */
export default function PdfReader({file,onFocus}: {file:UploadedFile;onFocus:()=>void}) {
  const [url,setUrl]=useState<string|null|undefined>(undefined);
  const frame=useRef<HTMLIFrameElement>(null);
  useEffect(()=>{
    let cancelled=false,created='';
    getUpload(file.id).then(blob=>{
      if(cancelled)return;
      if(!blob){setUrl(null);return;}
      // Always served as a PDF, so a mislabelled file can't run as a page with access to this app's data.
      created=URL.createObjectURL(new Blob([blob],{type:'application/pdf'}));
      setUrl(created);
    }).catch(()=>{if(!cancelled)setUrl(null);});
    return ()=>{cancelled=true;if(created)URL.revokeObjectURL(created);};
  },[file.id]);
  // Clicks inside the viewer never reach this page. The window losing focus to the frame is the only sign of one.
  useEffect(()=>{
    const onBlur=()=>{if(document.activeElement===frame.current)onFocus();};
    window.addEventListener('blur',onBlur);
    return ()=>window.removeEventListener('blur',onBlur);
  },[onFocus]);
  return <section className="pdf-reader" aria-label={`PDF: ${file.name}`}>
    <div className="pdf-reader-bar"><FileText size={15}/><strong title={file.name}>{file.name}</strong><small>{formatFileSize(file.size)}</small>
      {url && <div className="button-row"><a className="icon-button" href={url} target="_blank" rel="noreferrer" aria-label={`Open ${file.name} in a new tab`} title="Open in a new tab"><ExternalLink size={15}/></a><a className="icon-button" href={url} download={file.name} aria-label={`Download ${file.name}`} title="Download"><ArrowDownToLine size={15}/></a></div>}
    </div>
    {url ? <iframe ref={frame} className="pdf-reader-frame" title={file.name} src={`${url}#view=FitH`}/> : <div className="empty-state spacious">{url===null ? <><FileText size={28}/><h3>This file isn’t in this browser.</h3><p>Restore a backup or checkpoint that includes it.</p></> : <LoaderCircle className="spin"/>}</div>}
  </section>;
}
