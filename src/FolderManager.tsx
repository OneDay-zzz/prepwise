import { useEffect, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderPlus, Layers, Pencil, Trash2, X } from 'lucide-react';
import type { DocumentFolder, Note, Section } from './model';

export const NOTE_DRAG_TYPE='application/x-prepwise-note';
/** A drag carries one or more note ids. */
export const draggedNoteIds=(e:DragEvent)=>e.dataTransfer.getData(NOTE_DRAG_TYPE).split(',').filter(Boolean);

export default function FolderManager({section,folders,notes,selected,onSelect,onSave,onDelete,onMoveNote}: {section:Section;folders:DocumentFolder[];notes:Note[];selected:string;onSelect:(id:string)=>void;onSave:(folder:DocumentFolder)=>void;onDelete:(id:string)=>void;onMoveNote:(noteIds:string[],folderId:string)=>void}) {
  const [editing,setEditing]=useState<DocumentFolder|null>(null);
  const [name,setName]=useState('');
  const [error,setError]=useState('');
  const [dropTarget,setDropTarget]=useState<string|null>(null);
  // Empty string is the Unfiled row. Only note drags count, so dropped files and text are ignored.
  const dropProps=(folderId:string)=>({
    onDragOver:(e:DragEvent)=>{if(!e.dataTransfer.types.includes(NOTE_DRAG_TYPE))return;e.preventDefault();e.dataTransfer.dropEffect='move';setDropTarget(folderId);},
    onDragLeave:()=>setDropTarget(current=>current===folderId?null:current),
    onDrop:(e:DragEvent)=>{const noteIds=draggedNoteIds(e);setDropTarget(null);if(noteIds.length){e.preventDefault();onMoveNote(noteIds,folderId);}},
  });
  const rowClass=(folderId:string)=>`${selected===folderId?'selected':''} ${dropTarget===folderId?'drop-target':''}`;
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(editing){dialog.current?.showModal();dialog.current?.querySelector('input')?.focus();}},[editing]);
  const edit=(folder?:DocumentFolder)=>{setEditing(folder || {id:crypto.randomUUID(),name:'',section});setName(folder?.name || '');setError('');};
  const items=folders.filter(f=>f.section===section).sort((a,b)=>a.name.localeCompare(b.name));
  const selectedFolder=items.find(f=>f.id===selected);
  return <div className="folder-manager"><div className="folder-manager-heading"><span>FOLDERS</span><div>{selectedFolder && <><button className="icon-button" aria-label="Rename selected folder" title="Rename folder" onClick={()=>edit(selectedFolder)}><Pencil size={12}/></button><button className="icon-button danger" aria-label="Delete selected folder" title="Delete folder" onClick={()=>{if(window.confirm(`Delete “${selectedFolder.name}”? Its documents will be moved to Unfiled.`))onDelete(selectedFolder.id);}}><Trash2 size={12}/></button></>}<button className="icon-button" aria-label="Create folder" title="New folder" onClick={()=>edit()}><FolderPlus size={15}/></button></div></div>
    <div className="folder-options"><button className={selected==='*'?'selected':''} onClick={()=>onSelect('*')}><Layers size={13}/><span>All documents</span><small>{notes.length}</small></button><button className={rowClass('')} {...dropProps('')} onClick={()=>onSelect('')}><Folder size={13}/><span>Unfiled</span><small>{notes.filter(n=>!n.folderId).length}</small></button>{items.map(folder=><button key={folder.id} className={rowClass(folder.id)} {...dropProps(folder.id)} onClick={()=>onSelect(folder.id)}><Folder size={13}/><span>{folder.name}</span><small>{notes.filter(n=>n.folderId===folder.id).length}</small></button>)}</div>
    {editing && createPortal(<dialog ref={dialog} className="folder-edit-dialog" aria-labelledby="folder-edit-title" onCancel={()=>setEditing(null)}><form onSubmit={e=>{e.preventDefault();try{onSave({...editing,name});setEditing(null);}catch(error){setError(error instanceof Error?error.message:'Could not save folder.');}}}><div className="modal-heading"><h2 id="folder-edit-title">{items.some(f=>f.id===editing.id)?'Rename folder':'New folder'}</h2><button type="button" className="icon-button" aria-label="Close folder dialog" onClick={()=>setEditing(null)}><X size={17}/></button></div><label>Folder name<input autoFocus required maxLength={80} value={name} placeholder="e.g. System design, Lessons learned" onChange={e=>setName(e.target.value)}/></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-footer"><button type="button" className="small-button" onClick={()=>setEditing(null)}>Cancel</button><button className="primary" type="submit">Save folder</button></div></form></dialog>,document.body)}
  </div>;
}
