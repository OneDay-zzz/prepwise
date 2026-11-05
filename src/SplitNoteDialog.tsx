import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Folder, Scissors, X } from 'lucide-react';
import { planNotePart, type DocumentFolder, type Note } from './model';
import { splitLevels, splitNote, suggestedSplitLevel, type NotePart } from './note-outline';

const planLabels={new:'',fill:'fills your empty document',same:'already has this text, so it stays as it is',another:'adds a second one, and yours stays as it is'};

type Props = {note:Note;notes:Note[];folders:DocumentFolder[];onSplit:(parts:NotePart[])=>void;onClose:()=>void};

export default function SplitNoteDialog({note,notes,folders,onSplit,onClose}: Props) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  const title=note.title || 'Untitled note';
  const levels=useMemo(()=>splitLevels(note.body),[note.body]);
  const [depth,setDepth]=useState(()=>suggestedSplitLevel(note.body,levels) ?? levels[0]);
  const parts=useMemo(()=>splitNote(note.body,depth,title),[note.body,depth,title]);
  const unfiled=folders.find(f=>f.id===note.folderId)?.name || 'Unfiled';
  const groups=[...new Set(parts.map(p=>p.group ?? ''))];
  const count=(level:number)=>splitNote(note.body,level,title).length;
  return createPortal(<dialog ref={dialog} className="folder-edit-dialog split-dialog" aria-labelledby="split-title" onCancel={onClose}>
    <div className="modal-heading"><div><div className="eyebrow">ONE DOCUMENT PER TOPIC</div><h2 id="split-title"><Scissors size={18}/> Split into documents</h2></div><button className="icon-button" aria-label="Close split" onClick={onClose}><X size={19}/></button></div>
    <label>Start a new document at<select value={depth} onChange={e=>setDepth(Number(e.target.value))}>{levels.map(level=><option key={level} value={level}>{'#'.repeat(level)} headings: {count(level)} documents</option>)}</select></label>
    <div className="split-preview">{groups.map(group=><section key={group}><h3><Folder size={13}/> {group || unfiled}</h3><ol>{parts.filter(p=>(p.group ?? '')===group).map((part,i)=><li key={i}>{part.title}{planLabels[planNotePart(notes,note,part).kind] && <small> · {planLabels[planNotePart(notes,note,part).kind]}</small>}</li>)}</ol></section>)}</div>
    <p className="settings-hint">“{title}” stays as it is, so you can compare and delete it when you're happy.{note.scene?.elements?.length ? ' Its whiteboard stays with it.' : ''} Tags and importance carry over.</p>
    <div className="modal-footer"><span/><div className="button-row"><button className="small-button" onClick={onClose}>Cancel</button><button className="primary" onClick={()=>onSplit(parts)}>Split into {parts.length} documents</button></div></div>
  </dialog>,document.body);
}
