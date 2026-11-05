import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Flag, Search } from 'lucide-react';
import { searchNotes, type Note, type SectionConfig, type UploadedFile } from './model';

const MAX_RESULTS = 30;

/** Finds a document in any section from the keyboard. */
export default function QuickOpen({notes,pdfs,sections,onOpen,onClose}: {pdfs:UploadedFile[];notes:Note[];sections:SectionConfig[];onOpen:(id:string)=>void;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [query,setQuery]=useState('');
  const [index,setIndex]=useState(0);
  const term=query.trim().toLocaleLowerCase();
  const results=[
    ...searchNotes(notes,query).map(n=>({id:n.id,title:n.title || 'Untitled note',section:n.section,importance:n.importance,pdf:false})),
    ...pdfs.filter(f=>f.name.toLocaleLowerCase().includes(term)).map(f=>({id:f.id,title:f.name,section:f.section,importance:undefined,pdf:true})),
  ].slice(0,MAX_RESULTS);
  const selected=Math.min(index,Math.max(results.length-1,0));
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{dialog.current?.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});},[selected]);
  const onKeyDown=(e:KeyboardEvent)=>{
    if(e.key==='ArrowDown' || e.key==='ArrowUp'){
      e.preventDefault();
      if(results.length)setIndex((selected+(e.key==='ArrowDown' ? 1 : results.length-1))%results.length);
    }
    if(e.key==='Enter' && results[selected]){e.preventDefault();onOpen(results[selected].id);}
  };
  return createPortal(<dialog ref={dialog} className="quick-open" aria-label="Search all documents" onCancel={onClose} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}} onKeyDown={onKeyDown}>
    <div className="quick-open-input"><Search size={16}/><input autoFocus aria-label="Search all documents" placeholder="Search all documents…" value={query} onChange={e=>{setQuery(e.target.value);setIndex(0);}}/><kbd>esc</kbd></div>
    <div className="quick-open-results" role="listbox">
      {results.map((item,i)=><button key={item.id} role="option" aria-selected={i===selected} onMouseMove={()=>setIndex(i)} onClick={()=>onOpen(item.id)}><strong>{item.title}</strong>{item.pdf && <span className="pdf-badge">PDF</span>}{item.importance && <span className="quick-open-level"><Flag size={10}/>{item.importance}</span>}<small>{sections.find(s=>s.id===item.section)?.name}</small></button>)}
      {!results.length && <p>No documents match “{query}”.</p>}
    </div>
  </dialog>,document.body);
}
