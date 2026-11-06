import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown, Plus, Settings2, Trash2, X } from 'lucide-react';
import { DEFAULT_SPACE, sectionColors, spaceStarters, type SpaceConfig } from './model';
import { sectionIcon } from './section-icons';

type MenuItem = {key:string; label:ReactNode; onSelect:()=>void; checked?:boolean};

/** A small menu. It's fixed to the screen, so a scrolling or narrow column can't clip it. */
export function PopMenu({button,buttonLabel,buttonClass,title,items,align='left'}: {button:ReactNode;buttonLabel:string;buttonClass:string;title?:string;items:MenuItem[];align?:'left'|'right'}) {
  const [box,setBox]=useState<{top:number;left:number}|null>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const menu=useRef<HTMLDivElement>(null);
  const close=()=>{setBox(null);trigger.current?.focus();};
  const open=()=>{
    const rect=trigger.current!.getBoundingClientRect();
    const width=Math.min(260,window.innerWidth-16);
    setBox({top:rect.bottom+4,left:Math.max(8,Math.min(align==='left' ? rect.left : rect.right-width,window.innerWidth-width-8))});
  };
  useEffect(()=>{
    if(!box)return;
    menu.current?.querySelector<HTMLElement>('[role^=menuitem]')?.focus();
    const outside=(e:PointerEvent)=>{if(!menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node))setBox(null);};
    window.addEventListener('pointerdown',outside);
    return ()=>window.removeEventListener('pointerdown',outside);
  },[box]);
  const onKeyDown=(e:React.KeyboardEvent)=>{
    if(e.key==='Escape') {e.preventDefault();e.stopPropagation();close();return;}
    if(e.key!=='ArrowDown' && e.key!=='ArrowUp')return;
    e.preventDefault();
    const entries=[...menu.current!.querySelectorAll<HTMLElement>('[role^=menuitem]')];
    const at=entries.indexOf(document.activeElement as HTMLElement);
    entries[(at+(e.key==='ArrowDown' ? 1 : -1)+entries.length)%entries.length]?.focus();
  };
  return <>
    <button ref={trigger} type="button" className={buttonClass} aria-label={buttonLabel} title={title} aria-haspopup="menu" aria-expanded={!!box} onClick={()=>box ? setBox(null) : open()}>{button}</button>
    {box && <div ref={menu} className="pop-menu" role="menu" aria-label={buttonLabel} style={box} onKeyDown={onKeyDown}>
      {items.map(item=><button key={item.key} type="button" role={item.checked===undefined ? 'menuitem' : 'menuitemradio'} aria-checked={item.checked} onClick={()=>{setBox(null);item.onSelect();}}>{item.label}{item.checked && <Check size={14} className="pop-menu-check"/>}</button>)}
    </div>}
  </>;
}

export function SpaceDot({color,title}: {color:string;title?:string}) {
  return <i className={`space-dot ${color}`} title={title} aria-label={title} role={title ? 'img' : undefined}/>;
}

export function WorkspaceSwitcher({spaces,current,onSwitch,onCreate,onEdit}: {spaces:SpaceConfig[];current:SpaceConfig;onSwitch:(id:string)=>void;onCreate:()=>void;onEdit:()=>void}) {
  const Icon=sectionIcon(current.icon);
  return <PopMenu buttonClass="workspace-switcher" buttonLabel={`Workspace: ${current.name}. Switch workspace`} title={current.name}
    button={<><span className={`workspace-mark ${current.color}`}><span className="section-icon"><Icon size={14}/></span></span><strong>{current.name}</strong><ChevronsUpDown size={14}/></>}
    items={[
      ...spaces.map(space=>{const SpaceIcon=sectionIcon(space.icon);return {key:space.id,checked:space.id===current.id,onSelect:()=>onSwitch(space.id),label:<><span className={`workspace-mark ${space.color}`}><span className="section-icon"><SpaceIcon size={13}/></span></span><span>{space.name}</span></>};}),
      {key:'edit',onSelect:onEdit,label:<><Settings2 size={14}/><span>Edit “{current.name}”</span></>},
      {key:'new',onSelect:onCreate,label:<><Plus size={14}/><span>New workspace</span></>},
    ]}/>;
}

/** Creates a workspace from a starter, or renames, recolors, or deletes one. */
export function SpaceDialog({space,onClose,onCreate,onSave,onDelete}: {space?:SpaceConfig;onClose:()=>void;onCreate:(name:string,color:string,starter:string)=>void;onSave:(space:SpaceConfig)=>void;onDelete:(id:string)=>void}) {
  const [starter,setStarter]=useState('fitness');
  const chosen=spaceStarters.find(s=>s.id===starter)!;
  const [name,setName]=useState(space?.name ?? '');
  const [color,setColor]=useState(space?.color ?? chosen.color);
  const [error,setError]=useState('');
  const pick=(id:string)=>{
    const next=spaceStarters.find(s=>s.id===id)!;
    // A name you typed stays. One that came from the previous starter follows the new one.
    if(!name.trim() || spaceStarters.some(s=>s.name===name))setName(next.id==='blank' ? '' : next.name);
    setColor(next.color);
    setStarter(id);
  };
  const submit=()=>{
    try {
      if(space)onSave({...space,name,color});
      else onCreate(name,color,starter);
    }catch(reason){setError(reason instanceof Error ? reason.message : 'Couldn’t save this workspace.');}
  };
  useEffect(()=>{if(!space)setName(chosen.name);},[]);// eslint-disable-line react-hooks/exhaustive-deps
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><dialog open className="plan-modal space-dialog" aria-labelledby="space-title" onKeyDown={e=>{if(e.key==='Escape')onClose();}}><form onSubmit={e=>{e.preventDefault();submit();}}>
    <div className="modal-heading"><h2 id="space-title">{space ? 'Edit workspace' : 'New workspace'}</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18}/></button></div>
    {!space && <fieldset className="space-starters"><legend>Start with</legend>{spaceStarters.map(option=>{const Icon=sectionIcon(option.icon);return <button type="button" key={option.id} className={option.id===starter ? 'selected' : ''} aria-pressed={option.id===starter} onClick={()=>pick(option.id)}><Icon size={17}/><strong>{option.name}</strong><small>{option.sections.map(s=>s.name).join(', ')}</small></button>;})}</fieldset>}
    <label>Name<input autoFocus required maxLength={60} value={name} onChange={e=>{setName(e.target.value);setError('');}} placeholder="e.g. Side project"/></label>
    <fieldset><legend>Color</legend><div className="color-picker">{sectionColors.map(option=><button type="button" key={option} className={option} aria-label={option} aria-pressed={color===option} onClick={()=>setColor(option)}><span className="section-icon">{color===option && <Check size={15}/>}</span></button>)}</div></fieldset>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="modal-footer"><div className="button-row">{space && (space.id===DEFAULT_SPACE ? <small className="field-hint">This workspace holds your original data, so it can be renamed but not deleted.</small> : <button type="button" className="small-button danger" onClick={()=>onDelete(space.id)}><Trash2 size={14}/> Delete workspace</button>)}</div><div className="button-row"><button type="button" className="small-button" onClick={onClose}>Cancel</button><button className="primary" type="submit">{space ? 'Save' : 'Create workspace'}</button></div></div>
  </form></dialog></div>;
}
