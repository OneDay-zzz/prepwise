import { useMemo, useState } from 'react';
import { ArrowUpRight, Bookmark, Building2, ChevronDown, ChevronRight, Copy, FileInput, Flag, FolderInput, Pin, Scissors, Tag, X } from 'lucide-react';
import { splitLevels, type NotePart } from './note-outline';
import SplitNoteDialog from './SplitNoteDialog';
import { addTag, companyGroups, emptyExperience, type DocumentFolder, type Experience, type Note, type SectionConfig } from './model';

export type NoteTransfer = (kind:'move'|'copy',section:string,folderId?:string)=>void;

function TransferPanel({note,sections,folders,onTransfer,onClose}: {note:Note;sections:SectionConfig[];folders:DocumentFolder[];onTransfer:NoteTransfer;onClose:()=>void}) {
  const [section,setSection]=useState(()=>sections.find(s=>s.id!==note.section)?.id || note.section);
  const [folderId,setFolderId]=useState('');
  const available=folders.filter(f=>f.section===section);
  const send=(kind:'move'|'copy')=>{onTransfer(kind,section,folderId || undefined);onClose();};
  return <div className="note-transfer" role="group" aria-label="Move or copy this document">
    <label>To section<select value={section} onChange={e=>{setSection(e.target.value);setFolderId('');}}>{sections.map(s=><option key={s.id} value={s.id}>{s.name}{s.id===note.section ? ' (current)' : s.hidden ? ' (hidden)' : ''}</option>)}</select></label>
    <label>Folder<select value={folderId} onChange={e=>setFolderId(e.target.value)}><option value="">Unfiled</option>{available.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
    <div className="button-row"><button className="small-button" onClick={onClose}>Cancel</button><button className="small-button" onClick={()=>send('copy')}><Copy size={14}/> Copy</button><button className="small-button" disabled={section===note.section} title={section===note.section ? 'This document is already in that section' : undefined} onClick={()=>send('move')}><FileInput size={14}/> Move</button></div>
  </div>;
}

export function DocumentDetails({note,onChange,allTags,folders,sections,notes,onTransfer,onSplit,open,onToggle}: {notes:Note[];onSplit:(parts:NotePart[])=>void;open:boolean;onToggle:()=>void;folders:DocumentFolder[];note:Note;onChange:(patch:Partial<Note>)=>void;allTags:string[];sections:SectionConfig[];onTransfer:NoteTransfer}) {
  const [draft,setDraft]=useState('');
  const [transferring,setTransferring]=useState(false);
  const [splitting,setSplitting]=useState(false);
  const canSplit=useMemo(()=>open && splitLevels(note.body).length>0,[open,note.body]);
  const sectionFolders=folders.filter(f=>f.section===note.section);
  const submit=()=>{if(!draft.trim())return;const tags=addTag(note.tags || [],draft);if(tags!==note.tags)onChange({tags});setDraft('');};
  return <div className="document-details">
    <div className="document-flags"><button className={`small-button ${note.pinned?'flag-active':''}`} aria-pressed={!!note.pinned} onClick={()=>onChange({pinned:!note.pinned})}><Pin size={14}/>{note.pinned?'Pinned':'Pin'}</button><button className={`small-button ${note.marked?'flag-active':''}`} aria-pressed={!!note.marked} onClick={()=>onChange({marked:!note.marked})}><Bookmark size={14}/>{note.marked?'Bookmarked':'Bookmark'}</button><button className="small-button" aria-expanded={open} onClick={onToggle}>{open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>} Details</button>{!open && <button className="details-summary" aria-label="Show document details" onClick={onToggle}><span><FolderInput size={12}/>{sectionFolders.find(f=>f.id===note.folderId)?.name || 'Unfiled'}</span>{note.importance && <span><Flag size={12}/>{note.importance}</span>}{note.tags?.slice(0,3).map(tag=><span key={tag}>#{tag}</span>)}{(note.tags?.length || 0)>3 && <span>+{note.tags!.length-3}</span>}</button>}{open && <><button className="small-button" aria-expanded={transferring} onClick={()=>setTransferring(!transferring)}><FileInput size={14}/> Move or copy</button>{canSplit && <button className="small-button" onClick={()=>setSplitting(true)}><Scissors size={14}/> Split into documents</button>}<label className="move-document-label"><FolderInput size={14}/> Folder<select className="move-document" aria-label="Move document to folder" value={note.folderId || ''} onChange={e=>onChange({folderId:e.target.value || undefined})}><option value="">Unfiled</option>{sectionFolders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label></>}</div>
    {splitting && <SplitNoteDialog note={note} notes={notes} folders={folders} onClose={()=>setSplitting(false)} onSplit={parts=>{setSplitting(false);onSplit(parts);}}/>}
    {open && transferring && <TransferPanel note={note} sections={sections} folders={folders} onTransfer={onTransfer} onClose={()=>setTransferring(false)}/>}
    {open && <><div className="document-importance" role="group" aria-label="Importance"><Flag size={14}/><span className="importance-label">Importance</span><div className="importance-levels">{[1,2,3,4,5].map(level=><button key={level} className={level<=(note.importance || 0) ? 'filled' : ''} aria-label={`Importance ${level} of 5`} aria-pressed={note.importance===level} title={note.importance===level ? 'Click to clear' : `Set importance to ${level}`} onClick={()=>onChange({importance:note.importance===level ? undefined : level})}>{level}</button>)}</div><span className="tag-hint">{note.importance ? `Level ${note.importance} of 5` : '5 is the highest'}</span></div>
    <div className="document-tags"><Tag size={14}/>{(note.tags || []).map(tag=><span className="document-tag" key={tag}>{tag}<button aria-label={`Remove tag ${tag}`} onClick={()=>onChange({tags:note.tags!.filter(t=>t!==tag)})}><X size={11}/></button></span>)}<input aria-label="Add document tag" list="document-tag-suggestions" value={draft} maxLength={40} placeholder="Add tag…" onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft.trim())submit();}} onKeyDown={e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();submit();}if(e.key==='Escape')setDraft('');}}/><datalist id="document-tag-suggestions">{allTags.filter(t=>!note.tags?.includes(t)).map(t=><option key={t} value={t}/>)}</datalist><span className="tag-hint">Enter to add</span></div></>}
  </div>;
}
export function ExperienceDetails({note,notes,onChange}: {note:Note;notes:Note[];onChange:(experience:Experience)=>void}) {
  const info=note.experience || emptyExperience();
  const field=(key:keyof Experience,value:string)=>onChange({...info,[key]:value});
  const sourceValid=!info.sourceUrl || /^https?:\/\/\S+$/i.test(info.sourceUrl);
  return <div className="experience-details"><div className="experience-heading"><Building2 size={15}/><span>Company interview experience</span><small>公司面经</small></div><div className="experience-fields">
    <label>Company<input aria-label="Company name" list="company-suggestions" placeholder="e.g. Google, Meta, Stripe" value={info.company} onChange={e=>field('company',e.target.value)} onBlur={()=>field('company',info.company.trim())}/><datalist id="company-suggestions">{companyGroups(notes).filter(c=>c.key).map(c=><option key={c.key} value={c.name}/>)}</datalist></label>
    <label>Role / level<input placeholder="e.g. Backend engineer · L4" value={info.role} onChange={e=>field('role',e.target.value)}/></label>
    <label>Round<input placeholder="e.g. Phone screen, onsite" value={info.round} onChange={e=>field('round',e.target.value)}/></label>
    <label>Interview date<input type="date" aria-label="Experience interview date" value={info.date} onChange={e=>field('date',e.target.value)}/></label>
    <label className="experience-source">Source link<div><input type="url" aria-label="Experience source link" placeholder="https://…" value={info.sourceUrl} aria-invalid={!sourceValid} onChange={e=>field('sourceUrl',e.target.value)}/>{info.sourceUrl && sourceValid && <a className="icon-button" aria-label="Open experience source" href={info.sourceUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={16}/></a>}</div>{!sourceValid && <small className="field-error">Use a complete http:// or https:// link.</small>}</label>
  </div></div>;
}
