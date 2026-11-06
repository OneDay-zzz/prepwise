import { useState, type KeyboardEvent } from 'react';
import { FileText, PenLine, Plus, SquarePen, Table2, X } from 'lucide-react';
import { mainTabName, type DocTabKind, type Note } from './model';
import { PopMenu } from './Workspaces';

const icons={note:SquarePen,text:FileText,table:Table2,board:PenLine};
const MAIN='';

/** The parts of one document. Each tab has its own type and content. Double-click or press F2 to rename one. */
export default function DocTabs({note,active,onSelect,onAdd,onRename,onDelete}: {note:Note;active:string;onSelect:(id:string)=>void;onAdd:(kind:DocTabKind)=>void;onRename:(id:string,name:string)=>void;onDelete:(id:string)=>void}) {
  const [renaming,setRenaming]=useState<{id:string;name:string}|null>(null);
  const tabs=[{id:MAIN,name:mainTabName(note),kind:(note.format || 'note') as DocTabKind},...(note.tabs || [])];
  const finish=()=>{
    if(renaming?.name.trim())onRename(renaming.id,renaming.name.trim());
    setRenaming(null);
  };
  const onKeyDown=(e:KeyboardEvent<HTMLButtonElement>,id:string,name:string)=>{
    if(e.key==='F2') {e.preventDefault();setRenaming({id,name});}
    else if((e.key==='Delete' || e.key==='Backspace') && id!==MAIN) {e.preventDefault();onDelete(id);}
  };
  return <div className="doc-tabs" role="tablist" aria-label="Parts of this document">
    {tabs.map(tab=>{
      const Icon=icons[tab.kind];
      if(renaming?.id===tab.id) return <span key={tab.id} className="doc-tab is-active"><Icon size={14}/><input autoFocus aria-label={`Rename ${tab.name}`} maxLength={60} value={renaming.name} onChange={e=>setRenaming({id:tab.id,name:e.target.value})} onBlur={finish} onFocus={e=>e.target.select()} onKeyDown={e=>{if(e.key==='Enter') {e.preventDefault();finish();}else if(e.key==='Escape') {e.preventDefault();e.stopPropagation();setRenaming(null);}}}/></span>;
      return <span key={tab.id} className={`doc-tab ${tab.id===active ? 'is-active' : ''}`}>
        <button type="button" role="tab" aria-selected={tab.id===active} title="Double-click to rename" onClick={()=>onSelect(tab.id)} onDoubleClick={()=>setRenaming({id:tab.id,name:tab.name})} onKeyDown={e=>onKeyDown(e,tab.id,tab.name)}><Icon size={14}/><span>{tab.name}</span></button>
        {tab.id!==MAIN && <button type="button" className="doc-tab-close" aria-label={`Delete ${tab.name}`} title="Delete this tab" onClick={()=>onDelete(tab.id)}><X size={12}/></button>}
      </span>;
    })}
    <PopMenu buttonClass="icon-button doc-tab-add" buttonLabel="Add a tab to this document" title="Add a tab" button={<Plus size={15}/>} items={([['note','Note','.md'],['text','Plain text','.txt'],['table','Table','.csv'],['board','Whiteboard','.excalidraw']] as const).map(([kind,label,type])=>{const Icon=icons[kind];return {key:kind,onSelect:()=>onAdd(kind),label:<><Icon size={14}/><span>{label}</span><small>{type}</small></>};})}/>
  </div>;
}
