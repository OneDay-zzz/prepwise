import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Check, Eye, EyeOff, Pencil, Plus, RotateCcw, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { createSection, defaultSections, sectionColors, templates, type Note, type SectionConfig, type UploadedFile } from './model';
import { sectionIcon, sectionIcons } from './section-icons';
import { defaultDisplay, displayLimits, type DisplaySettings } from './useDisplaySettings';

type Props = {
  initialEditing?: string;
  display: DisplaySettings;
  onDisplay: (display: DisplaySettings) => void;
  sections: SectionConfig[];
  notes: Note[];
  uploads: UploadedFile[];
  onOpenSection: (id: string) => void;
  onClose: () => void;
  removedSections: string[];
  onRestore: (id: string) => void;
  onSave: (section: SectionConfig) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onDelete: (id: string, moveNotesTo?: string) => void;
};

export default function SettingsPanel({initialEditing,display,onDisplay,sections,notes,uploads,onOpenSection,onClose,removedSections,onRestore,onSave,onMove,onDelete}: Props) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [draft,setDraft]=useState<SectionConfig|null>(()=>initialEditing==='new' ? createSection() : sections.find(s=>s.id===initialEditing) || null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  const removed=defaultSections.filter(s=>removedSections.includes(s.id));
  const [deleting,setDeleting]=useState('');
  const count=(id:string)=>notes.filter(n=>n.section===id).length;
  const itemCount=(id:string)=>count(id)+uploads.filter(u=>u.section===id).length;
  return createPortal(<dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title" onCancel={onClose}>
    <div className="modal-heading"><div><div className="eyebrow">MAKE IT YOURS</div><h2 id="settings-title"><SlidersHorizontal size={20}/> Customize</h2></div><button className="icon-button" aria-label="Close customization" onClick={onClose}><X size={19}/></button></div>
    {draft ? <SectionEditor key={draft.id} initial={draft} sections={sections} itemCount={itemCount(draft.id)} onBack={()=>initialEditing==='new' ? onClose() : setDraft(null)} onSave={section=>{const isNew=!sections.some(s=>s.id===section.id);onSave(section);if(isNew && initialEditing==='new')onOpenSection(section.id);else setDraft(null);}} onDelete={(id,target)=>{onDelete(id,target);setDraft(null);}}/> : <>
      <section className="settings-group">
        <div className="settings-group-heading"><h3>Text size</h3><button className="text-button" onClick={()=>onDisplay(defaultDisplay)}><RotateCcw size={12}/> Reset</button></div>
        <SizeControl label="Interface" hint="Navigation, lists, buttons, and page text" value={display.interface} limits={displayLimits.interface} onChange={value=>onDisplay({...display,interface:value})}/>
        <SizeControl label="Notes" hint="The Markdown editor and reading view" value={display.document} limits={displayLimits.document} onChange={value=>onDisplay({...display,document:value})}/>
        <p className="settings-hint">Text size is remembered on this device.</p>
      </section>
      <section className="settings-group">
        <div className="settings-group-heading"><h3>Sections</h3><button className="small-button" onClick={()=>setDraft(createSection())}><Plus size={14}/> Add section</button></div>
        <div className="settings-sections">{sections.map((s,index)=>{const Icon=sectionIcon(s.icon);return <div key={s.id}><div className={`settings-section-row ${s.hidden?'is-hidden':''}`}>
          <span className={`note-icon ${s.color}`}><Icon size={17}/></span>
          <div className="settings-section-text"><strong>{s.name}</strong><span>{s.hidden?'Hidden · ':''}{count(s.id)} {count(s.id)===1?'note':'notes'}</span></div>
          <button className="icon-button" aria-label={`Move ${s.name} up`} title="Move up" disabled={index===0} onClick={()=>onMove(s.id,-1)}><ArrowUp size={15}/></button>
          <button className="icon-button" aria-label={`Move ${s.name} down`} title="Move down" disabled={index===sections.length-1} onClick={()=>onMove(s.id,1)}><ArrowDown size={15}/></button>
          <button className="icon-button" aria-label={`${s.hidden?'Show':'Hide'} ${s.name}`} aria-pressed={!!s.hidden} title={s.hidden?'Show section':'Hide section'} onClick={()=>onSave({...s,hidden:!s.hidden})}>{s.hidden?<EyeOff size={15}/>:<Eye size={15}/>}</button>
          <button className="icon-button" aria-label={`Edit ${s.name}`} title="Edit section" onClick={()=>setDraft(s)}><Pencil size={14}/></button>
          <button className="icon-button danger-icon" aria-label={`Delete ${s.name}`} aria-expanded={deleting===s.id} title={sections.length>1 ? 'Delete section' : 'Keep at least one section'} disabled={sections.length<=1} onClick={()=>setDeleting(deleting===s.id ? '' : s.id)}><Trash2 size={14}/></button>
        </div>{deleting===s.id && <DeleteSection section={s} sections={sections} itemCount={itemCount(s.id)} onCancel={()=>setDeleting('')} onDelete={(id,target)=>{onDelete(id,target);setDeleting('');}}/>}</div>;})}</div>
        {removed.length>0 && <div className="removed-sections"><span>Deleted:</span>{removed.map(s=><button key={s.id} className="small-button" title={`Bring back ${s.name} with its original settings`} onClick={()=>onRestore(s.id)}><RotateCcw size={13}/> {s.name}</button>)}</div>}
        <p className="settings-hint">Sections and their order are saved with your workspace, backups, and checkpoints. Hiding a section keeps its notes. Deleting one moves them to the section you choose.</p>
      </section>
      <div className="modal-footer settings-footer"><button className="primary" onClick={onClose}>Done</button></div>
    </>}
  </dialog>,document.body);
}

function SizeControl({label,hint,value,limits,onChange}: {label:string;hint:string;value:number;limits:{min:number;max:number};onChange:(value:number)=>void}) {
  return <label className="size-control"><div><strong>{label}</strong><span>{hint}</span></div><div className="size-control-input"><input type="range" min={limits.min} max={limits.max} step={5} value={value} onChange={e=>onChange(Number(e.target.value))}/><output>{value}%</output></div></label>;
}

function SectionEditor({initial,sections,itemCount,onBack,onSave,onDelete}: {initial:SectionConfig;sections:SectionConfig[];itemCount:number;onBack:()=>void;onSave:(section:SectionConfig)=>void;onDelete:(id:string,moveNotesTo?:string)=>void}) {
  const [draft,setDraft]=useState<SectionConfig>({...initial,template:initial.template ?? templates[initial.id]?.body ?? ''});
  const [error,setError]=useState('');
  const others=sections.filter(s=>s.id!==initial.id);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const isNew=!sections.some(s=>s.id===initial.id);
  const builtIn=defaultSections.find(s=>s.id===initial.id);
  const patch=(next:Partial<SectionConfig>)=>setDraft(d=>({...d,...next}));
  const attempt=(action:()=>void)=>{try{action();}catch(error){setError(error instanceof Error?error.message:'Could not save this section.');}};
  const Preview=sectionIcon(draft.icon);
  return <form className="section-editor" onSubmit={e=>{e.preventDefault();attempt(()=>onSave(draft));}}>
    <button type="button" className="text-button" onClick={onBack}><ArrowLeft size={13}/> All settings</button>
    <div className={`section-preview ${draft.color}`}><span className="section-icon"><Preview size={23}/></span><div><strong>{draft.name.trim() || 'Untitled section'}</strong><span>{draft.description.trim() || 'Your description appears on the overview.'}</span></div></div>
    <label>Title<input autoFocus={isNew} required maxLength={60} value={draft.name} placeholder="e.g. System design" onChange={e=>patch({name:e.target.value})}/></label>
    <label>Tagline<input maxLength={80} value={draft.short} placeholder="A few words shown above the note list" onChange={e=>patch({short:e.target.value})}/></label>
    <label>Description<textarea rows={2} maxLength={180} value={draft.description} placeholder="Shown on the overview card" onChange={e=>patch({description:e.target.value})}/></label>
    <fieldset><legend>Icon</legend><div className="icon-picker">{Object.entries(sectionIcons).map(([name,Icon])=><button type="button" key={name} className={draft.icon===name?'selected':''} aria-label={`${name.replace(/-/g,' ')} icon`} aria-pressed={draft.icon===name} onClick={()=>patch({icon:name})}><Icon size={17}/></button>)}</div></fieldset>
    <fieldset><legend>Color</legend><div className="color-picker">{sectionColors.map(color=><button type="button" key={color} className={color} aria-label={color} aria-pressed={draft.color===color} onClick={()=>patch({color})}><span className="section-icon">{draft.color===color && <Check size={15}/>}</span></button>)}</div></fieldset>
    <label>Note template<textarea className="template-input" rows={7} value={draft.template} placeholder="Markdown used by “Start from a template”" onChange={e=>patch({template:e.target.value})}/><small>The first # heading becomes the new note’s title.</small></label>
    {error && <p className="field-error" role="alert">{error}</p>}
    {!isNew && others.length>0 && (confirmDelete ? <DeleteSection section={initial} sections={sections} itemCount={itemCount} onCancel={()=>setConfirmDelete(false)} onDelete={onDelete}/> : <button type="button" className="small-button danger-button section-delete-start" onClick={()=>setConfirmDelete(true)}><Trash2 size={14}/> Delete this section</button>)}
    <div className="modal-footer">{builtIn && !isBuiltInDefault(draft,builtIn) ? <button type="button" className="small-button" onClick={()=>setDraft({...builtIn,hidden:draft.hidden,template:templates[builtIn.id]?.body ?? ''})}><RotateCcw size={14}/> Restore defaults</button> : <span/>}<div className="button-row"><button type="button" className="small-button" onClick={onBack}>Cancel</button><button className="primary" type="submit">{isNew?'Add section':'Save section'}</button></div></div>
  </form>;
}

function DeleteSection({section,sections,itemCount,onCancel,onDelete}: {section:SectionConfig;sections:SectionConfig[];itemCount:number;onCancel:()=>void;onDelete:(id:string,moveNotesTo?:string)=>void}) {
  const others=sections.filter(s=>s.id!==section.id);
  const [target,setTarget]=useState(others[0]?.id || '');
  const [error,setError]=useState('');
  const builtIn=defaultSections.some(s=>s.id===section.id);
  return <div className="section-danger" role="group" aria-label={`Delete ${section.name}`}>
    {itemCount>0 ? <label>Move {itemCount} {itemCount===1?'item':'items'} to<select value={target} onChange={e=>setTarget(e.target.value)}>{others.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><small>Nothing is deleted except the section and its folders. Its notes become Unfiled, and gallery files move too.</small></label> : <span>This section is empty.</span>}
    {section.id==='resume' && <small>Your uploaded resume file is kept, and comes back if you bring this section back.</small>}
    {builtIn && <small>You can bring this section back afterwards.</small>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="button-row"><button type="button" className="small-button" onClick={onCancel}>Cancel</button><button type="button" className="small-button danger-button" onClick={()=>{try{onDelete(section.id,itemCount?target:undefined);}catch(failure){setError(failure instanceof Error?failure.message:'Could not delete this section.');}}}><Trash2 size={14}/> Delete {section.name}</button></div>
  </div>;
}

function isBuiltInDefault(draft:SectionConfig,builtIn:SectionConfig) {
  return draft.name===builtIn.name && draft.short===builtIn.short && draft.description===builtIn.description && draft.color===builtIn.color && draft.icon===builtIn.icon && draft.template===templates[builtIn.id]?.body;
}
