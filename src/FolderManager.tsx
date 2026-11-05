import { useEffect, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderPlus, Layers, Pencil, Trash2, X } from 'lucide-react';
import { foldersIn, type DocumentFolder, type Note, type Section } from './model';

export const NOTE_DRAG_TYPE='application/x-prepwise-note';
export const FOLDER_DRAG_TYPE='application/x-prepwise-folder';
/** A drag carries one or more note ids. */
export const draggedNoteIds=(e:DragEvent)=>e.dataTransfer.getData(NOTE_DRAG_TYPE).split(',').filter(Boolean);

export default function FolderManager({section,folders,notes,selected,onSelect,onSave,onDelete,onMoveNote,onReorder}: {onReorder:(id:string,targetId:string,after:boolean)=>void;section:Section;folders:DocumentFolder[];notes:Note[];selected:string;onSelect:(id:string)=>void;onSave:(folder:DocumentFolder)=>void;onDelete:(id:string)=>void;onMoveNote:(noteIds:string[],folderId:string)=>void}) {
  const [editing,setEditing]=useState<DocumentFolder|null>(null);
  const [name,setName]=useState('');
  const [error,setError]=useState('');
  const [dropTarget,setDropTarget]=useState<string|null>(null);
  const [folderDrop,setFolderDrop]=useState<{id:string;after:boolean}|null>(null);
  const draggingFolder=useRef<string|null>(null);
  // Empty string is the Unfiled row. Only note drags count, so dropped files and text are ignored.
  const dropProps=(folderId:string)=>({
    onDragOver:(e:DragEvent)=>{if(!e.dataTransfer.types.includes(NOTE_DRAG_TYPE))return;e.preventDefault();e.dataTransfer.dropEffect='move';setDropTarget(folderId);},
    onDragLeave:()=>setDropTarget(current=>current===folderId?null:current),
    onDrop:(e:DragEvent)=>{const noteIds=draggedNoteIds(e);setDropTarget(null);if(noteIds.length){e.preventDefault();onMoveNote(noteIds,folderId);}},
  });
  // Which half of the row the pointer is in. The list runs sideways at phone width.
  const dropAfter=(e:DragEvent)=>{const row=e.currentTarget as HTMLElement,box=row.getBoundingClientRect();return getComputedStyle(row.parentElement!).flexDirection==='row' ? e.clientX>box.left+box.width/2 : e.clientY>box.top+box.height/2;};
  const folderProps=(folderId:string)=>{
    const notes=dropProps(folderId);
    return {
      draggable:true,
      title:'Drag to reorder folders',
      onDragStart:(e:DragEvent)=>{e.dataTransfer.setData(FOLDER_DRAG_TYPE,folderId);e.dataTransfer.effectAllowed='move';draggingFolder.current=folderId;},
      onDragEnd:()=>{draggingFolder.current=null;setFolderDrop(null);},
      onDragOver:(e:DragEvent)=>{
        if(!e.dataTransfer.types.includes(FOLDER_DRAG_TYPE)) {notes.onDragOver(e);return;}
        if(draggingFolder.current===folderId) {setFolderDrop(null);return;}
        e.preventDefault();e.dataTransfer.dropEffect='move';setFolderDrop({id:folderId,after:dropAfter(e)});
      },
      onDragLeave:()=>{notes.onDragLeave();setFolderDrop(current=>current?.id===folderId?null:current);},
      onDrop:(e:DragEvent)=>{
        const moved=e.dataTransfer.getData(FOLDER_DRAG_TYPE);
        if(!moved) {notes.onDrop(e);return;}
        e.preventDefault();setFolderDrop(null);onReorder(moved,folderId,dropAfter(e));
      },
    };
  };
  const rowClass=(folderId:string)=>`${selected===folderId?'selected':''} ${dropTarget===folderId?'drop-target':''} ${folderDrop?.id===folderId?(folderDrop.after?'drop-after':'drop-before'):''}`;
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(editing){dialog.current?.showModal();dialog.current?.querySelector('input')?.focus();}},[editing]);
  const edit=(folder?:DocumentFolder)=>{setEditing(folder || {id:crypto.randomUUID(),name:'',section});setName(folder?.name || '');setError('');};
  const items=foldersIn(folders,section);
  const selectedFolder=items.find(f=>f.id===selected);
  return <div className="folder-manager"><div className="folder-manager-heading"><span>FOLDERS</span><div>{selectedFolder && <><button className="icon-button" aria-label="Rename selected folder" title="Rename folder" onClick={()=>edit(selectedFolder)}><Pencil size={12}/></button><button className="icon-button danger" aria-label="Delete selected folder" title="Delete folder" onClick={()=>{if(window.confirm(`Delete “${selectedFolder.name}”? Its documents will be moved to Unfiled.`))onDelete(selectedFolder.id);}}><Trash2 size={12}/></button></>}<button className="icon-button" aria-label="Create folder" title="New folder" onClick={()=>edit()}><FolderPlus size={15}/></button></div></div>
    <div className="folder-options"><button className={selected==='*'?'selected':''} onClick={()=>onSelect('*')}><Layers size={13}/><span>All documents</span><small>{notes.length}</small></button><button className={rowClass('')} {...dropProps('')} onClick={()=>onSelect('')}><Folder size={13}/><span>Unfiled</span><small>{notes.filter(n=>!n.folderId).length}</small></button>{items.map(folder=><button key={folder.id} className={rowClass(folder.id)} {...folderProps(folder.id)} onClick={()=>onSelect(folder.id)}><Folder size={13}/><span>{folder.name}</span><small>{notes.filter(n=>n.folderId===folder.id).length}</small></button>)}</div>
    {editing && createPortal(<dialog ref={dialog} className="folder-edit-dialog" aria-labelledby="folder-edit-title" onCancel={()=>setEditing(null)}><form onSubmit={e=>{e.preventDefault();try{onSave({...editing,name});setEditing(null);}catch(error){setError(error instanceof Error?error.message:'Could not save folder.');}}}><div className="modal-heading"><h2 id="folder-edit-title">{items.some(f=>f.id===editing.id)?'Rename folder':'New folder'}</h2><button type="button" className="icon-button" aria-label="Close folder dialog" onClick={()=>setEditing(null)}><X size={17}/></button></div><label>Folder name<input autoFocus required maxLength={80} value={name} placeholder="e.g. System design, Lessons learned" onChange={e=>setName(e.target.value)}/></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-footer"><button type="button" className="small-button" onClick={()=>setEditing(null)}>Cancel</button><button className="primary" type="submit">Save folder</button></div></form></dialog>,document.body)}
  </div>;
}
