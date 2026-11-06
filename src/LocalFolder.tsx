import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, FolderOpen, PenLine, RefreshCw, Save, X } from 'lucide-react';
import { chooseFolder, listLocalFiles, openLocalNote, saveLocalNote, type FileBinding, type LocalDirectory, type LocalEntry } from './local-files';
import type { Note, Section, SectionConfig } from './model';
import { noteToMarkdown } from './note-files';

export default function LocalFolder({current, section, sections, onOpen, notify, quiet, slot}: {slot?:HTMLElement|null;quiet?:boolean;current?:Note;section:Section;sections:SectionConfig[];onOpen:(note:Note)=>void;notify:(message:string)=>void}) {
  const [folder,setFolder]=useState<LocalDirectory|null>(null);
  const [entries,setEntries]=useState<LocalEntry[]>([]);
  const [visible,setVisible]=useState(false);
  const [busy,setBusy]=useState(false);
  const [filter,setFilter]=useState('');
  const [revision,setRevision]=useState(0);
  const bindings=useRef(new Map<string,FileBinding>());
  const opened=useRef(new Map<string,string>());
  const dirty=useRef(false);
  const noteSnapshots=useRef(new Map<string,string>());
  const allNotes=useRef(new Map<string,Note>());
  if(current) allNotes.current.set(current.id,current);
  dirty.current=Array.from(noteSnapshots.current).some(([id,snapshot]) => {const note=allNotes.current.get(id);return note && snapshot !== JSON.stringify([noteToMarkdown(note),note.scene]);});
  useEffect(() => { const warn=(e:BeforeUnloadEvent) => {if(dirty.current) {e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return () => window.removeEventListener('beforeunload',warn);},[]);
  async function connect() {
    try {
      if(dirty.current && !window.confirm('Some edits have not been saved to their local files. They are still in your browser workspace. Switch folders?')) return;
      const selected=await chooseFolder();setBusy(true);
      const files=await listLocalFiles(selected);
      setFolder(selected);setEntries(files);bindings.current.clear();opened.current.clear();noteSnapshots.current.clear();setRevision(n=>n+1);setVisible(true);
    }catch(error) {if(!(error instanceof DOMException && error.name==='AbortError')) notify(error instanceof Error ? error.message : 'Could not open this folder.');}finally{setBusy(false);}
  }
  async function refresh() {if(!folder)return;setBusy(true);try{setEntries(await listLocalFiles(folder));}catch(error){notify(error instanceof Error?error.message:'Could not refresh folder.');}finally{setBusy(false);}}
  async function open(entry:LocalEntry) {
    if(!folder)return;setBusy(true);
    try {
      const key=entry.path.replace(/\.(md|excalidraw)$/i,'').toLowerCase();
      const existing=opened.current.get(key);
      const oldNote=existing ? allNotes.current.get(existing) : undefined;
      if(oldNote && noteSnapshots.current.get(oldNote.id)!==JSON.stringify([noteToMarkdown(oldNote),oldNote.scene]) && !window.confirm('Reload this file from disk? Unsaved edits to this note will be replaced.')) return;
      const {note,binding}=await openLocalNote(folder,entry,entries,oldNote?.section || section,sections);
      if(existing)note.id=existing;
      bindings.current.set(note.id,binding);opened.current.set(key,note.id);noteSnapshots.current.set(note.id,JSON.stringify([noteToMarkdown(note),note.scene]));onOpen(note);setVisible(false);
    }catch(error){notify(error instanceof Error?error.message:'Could not open file.');}finally{setBusy(false);}
  }
  async function save() {
    if(!folder || !current)return;setBusy(true);
    try {
      const previous=bindings.current.get(current.id) || {folder};bindings.current.set(current.id,previous);
      const binding=await saveLocalNote(current,folder,previous);bindings.current.set(current.id,binding);
      noteSnapshots.current.set(current.id,JSON.stringify([noteToMarkdown(current),current.scene]));
      const path=binding.markdown?.entry.path || binding.drawing?.entry.path;
      if(path)opened.current.set(path.replace(/\.(md|excalidraw)$/i,'').toLowerCase(),current.id);
      setEntries(await listLocalFiles(folder));setRevision(n=>n+1);notify('Saved to your local folder.');
    }catch(error){notify(error instanceof Error?error.message:'Could not save to the folder. Your browser copy is still available.');}finally{setBusy(false);}
  }
  const binding=current ? bindings.current.get(current.id) : undefined;
  const changed=!!current && !!binding && noteSnapshots.current.get(current.id)!==JSON.stringify([noteToMarkdown(current),current.scene]);
  // Outside the notebook, the bar only appears once a folder is connected.
  if(quiet && !folder)return null;
  // Until a folder is connected this is one button in the top bar, so it doesn't take a row from the document.
  if(!folder)return slot ? createPortal(<button className="icon-button" disabled={busy} aria-label="Connect local folder" title="Connect local folder: open Markdown and Excalidraw files from your computer" onClick={()=>void connect()}><FolderOpen size={17}/></button>,slot) : null;
  return <><div className="folder-bar" data-revision={revision}><button className="small-button" disabled={busy} onClick={() => folder ? setVisible(true) : void connect()}><FolderOpen size={15}/>{folder?.name || 'Connect local folder'}</button><span className="folder-path">{binding?.markdown?.entry.path || binding?.drawing?.entry.path || (folder ? 'Save any note into this folder' : 'Open Markdown & Excalidraw files from your computer')}{changed && ' · Unsaved to file'}</span>{folder && current && <button className="small-button" disabled={busy} onClick={() => void save()}><Save size={14}/>{busy ? 'Working…' : 'Save to folder'}</button>}</div>
    {visible && folder && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setVisible(false);}}><dialog open className="plan-modal folder-modal" aria-labelledby="folder-title" onCancel={()=>setVisible(false)} onKeyDown={e=>{if(e.key==='Escape')setVisible(false);}}><div className="modal-heading"><div><div className="eyebrow">LOCAL FILES</div><h2 id="folder-title">{folder.name}</h2></div><button className="icon-button" aria-label="Close folder browser" onClick={()=>setVisible(false)}><X size={18}/></button></div><p className="folder-help">Open a file to edit it. Matching .md and .excalidraw files open together. Use “Save to folder” to write your changes back.</p><div className="folder-actions"><input autoFocus aria-label="Filter local files" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Find a file…"/><button className="icon-button" aria-label="Refresh files" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={17}/></button></div><div className="local-file-list">{entries.filter(e=>e.path.toLowerCase().includes(filter.toLowerCase())).map(entry=><button disabled={busy} key={entry.path} onClick={()=>void open(entry)}>{/\.md$/i.test(entry.path)?<FileText size={16}/>:<PenLine size={16}/>}<span>{entry.path}</span></button>)}{!entries.length && <p>No Markdown or Excalidraw files yet. Close this panel, create a note, then save it to this folder.</p>}</div><div className="modal-footer"><span className="field-hint">{entries.length} files · Files on disk are never deleted here.</span><button className="small-button" disabled={busy} onClick={()=>void connect()}>Change folder</button></div></dialog></div>}
  </>;
}
