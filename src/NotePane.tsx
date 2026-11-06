import { lazy, Suspense, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bold, BookOpen, CheckCircle2, Circle, Clock3, Code2, Columns2, Download, Italic, List, ListTree, LoaderCircle, MessageCircle, PenLine, SquarePen, TextCursorInput, Trash2, X } from 'lucide-react';
import DocChat from './DocChat';
import { DocumentDetails, ExperienceDetails, type NoteTransfer } from './DocumentDetails';
import { clampColumn, clampRatio, dropZoneAt, type DropZone, type NoteMode } from './layout-settings';
import { safeFilename } from './local-files';
import { noteWordCount, type Note, type SectionConfig, type UploadedFile, type Workspace } from './model';
import { noteToMarkdown } from './note-files';
import { noteOutline, type NotePart } from './note-outline';
import NoteOutline from './NoteOutline';
import { linkNoteImages, UPLOAD_URL_PREFIX } from './note-images';
import NoteImage from './NoteImage';
import { download } from './Planner';

const Whiteboard = lazy(() => import('./Whiteboard'));
const LiveEditor = lazy(() => import('./LiveEditor'));
export const VIEW_DRAG_TYPE='application/x-prepwise-view';
const viewNames: Record<NoteMode,string>={preview:'Read',live:'Live',edit:'Write',split:'Split',board:'Whiteboard'};

type Props = {
  note: Note;
  mode: NoteMode;
  onMode: (mode: NoteMode) => void;
  theme: 'light' | 'dark';
  sectionName: string;
  sections: SectionConfig[];
  detailsOpen: boolean;
  onToggleDetails: () => void;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  onOutlineWidth: (width: number | null) => void;
  chatOpen: boolean;
  chatWidth: number | null;
  onToggleChat: () => void;
  onChatWidth: (width: number | null) => void;
  onOpenNote: (id: string) => void;
  onTransfer: NoteTransfer;
  onSplit: (parts: NotePart[]) => void;
  notes: Note[];
  allTags: string[];
  folders: NonNullable<Workspace['folders']>;
  uploads?: UploadedFile[];
  /** The same whiteboard is open in the other window. Two copies would overwrite each other's drawings. */
  boardTaken: boolean;
  onChange: (patch: Partial<Note>) => void;
  onDelete: () => void;
  onViewDragStart: (mode: NoteMode) => void;
  onViewDragEnd: () => void;
  onAddDrawing: (svg: string) => Promise<void>;
};

export default function NotePane({note,mode,onMode,theme,sectionName,sections,detailsOpen,onToggleDetails,outlineOpen,onToggleOutline,onOutlineWidth,chatOpen,chatWidth,onToggleChat,onChatWidth,onOpenNote,onTransfer,onSplit,notes,allTags,folders,uploads,boardTaken,onChange,onDelete,onViewDragStart,onViewDragEnd,onAddDrawing}: Props) {
  const editor=useRef<HTMLTextAreaElement>(null);
  const headings=useMemo(()=>noteOutline(note.body),[note.body]);
  const insertMarkdown=(before:string,after='')=>{
    const area=editor.current;
    if(!area) return;
    const start=area.selectionStart,end=area.selectionEnd;
    onChange({body:note.body.slice(0,start)+before+note.body.slice(start,end)+after+note.body.slice(end)});
    requestAnimationFrame(()=>{area.focus();area.setSelectionRange(start+before.length,end+before.length);});
  };
  return <>
    {chatOpen && <DocChat chatId={note.id} title={note.title || 'Untitled note'} label="Chat" host=".doc-pane" width={chatWidth} onWidth={onChatWidth} onClose={onToggleChat} onOpenNote={onOpenNote}/>}
    <div className="editor-title-row"><div><input aria-label="Note title" className="note-title" placeholder="Untitled note" value={note.title} onChange={e=>onChange({title:e.target.value})}/><div className="note-meta"><Clock3 size={12}/> Updated {new Date(note.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}<span>·</span>{noteWordCount(note)} words</div></div><button className={`small-button ready-button ${note.ready ? 'is-ready' : ''}`} onClick={()=>onChange({ready:!note.ready})}>{note.ready ? <CheckCircle2 size={15}/> : <Circle size={15}/>} {note.ready ? 'Interview ready' : 'Mark as ready'}</button></div>
    <DocumentDetails key={note.id} note={note} notes={notes} allTags={allTags} folders={folders} sections={sections} open={detailsOpen} onToggle={onToggleDetails} onTransfer={onTransfer} onSplit={onSplit} onChange={onChange}/>
    {note.section==='experiences' && <ExperienceDetails note={note} notes={notes} onChange={experience=>onChange({experience})}/>}
    <div className="editor-controls"><div className="editor-tabs">{([['preview','Read',BookOpen],['live','Live',TextCursorInput],['edit','Write',SquarePen],['split','Split',Columns2],['board','Whiteboard',PenLine]] as const).map(([key,label,Icon])=><button key={key} draggable title={`${label}. Drag to an edge to show it beside this document.`} className={mode===key ? 'active' : ''} onClick={()=>onMode(key)} onDragStart={e=>{e.dataTransfer.setData(VIEW_DRAG_TYPE,key);e.dataTransfer.effectAllowed='move';onViewDragStart(key);}} onDragEnd={onViewDragEnd}><Icon size={15}/>{label}{key==='board' && note.scene?.elements?.length ? <span className="tiny-dot"/> : null}</button>)}</div><div className="button-row"><button className={`icon-button outline-toggle ${chatOpen ? 'is-on' : ''}`} title={`${chatOpen ? 'Close' : 'Open'} chat about this doc`} aria-label="Chat about this doc" aria-pressed={chatOpen} onClick={onToggleChat}><MessageCircle size={16}/></button>{mode!=='board' && <button className={`icon-button outline-toggle ${outlineOpen && headings.length ? 'is-on' : ''}`} title={headings.length ? `${outlineOpen ? 'Hide' : 'Show'} table of contents` : 'Add a heading, such as ## Topic, to get a table of contents'} aria-label="Table of contents" aria-pressed={outlineOpen && headings.length>0} disabled={!headings.length} onClick={onToggleOutline}><ListTree size={16}/></button>}<button className="icon-button" title="Export Markdown" aria-label="Export Markdown" onClick={()=>download(`${safeFilename(note.title || 'note')}.md`,noteToMarkdown(note),'text/markdown')}><Download size={16}/></button><button className="icon-button danger" title="Delete note" aria-label="Delete note" onClick={()=>{if(window.confirm('Delete this note and its whiteboard?'))onDelete();}}><Trash2 size={16}/></button></div></div>
    {mode==='board' ? boardTaken ? <div className="empty-state spacious"><PenLine size={28}/><h3>This whiteboard is open in the other window.</h3><p>Draw there, or switch that window to another view to draw here.</p></div> : <Suspense fallback={<div className="empty-state spacious"><LoaderCircle className="spin"/><p>Opening Excalidraw…</p></div>}><Whiteboard key={note.id} theme={theme} note={note} onChange={scene=>onChange({scene})} onAddDrawing={onAddDrawing}/></Suspense> : <div className="note-with-outline"><div className={`note-outline-row is-${mode}`}>{mode==='live' ? <div className="writing-area live"><Suspense fallback={<div className="empty-state spacious"><LoaderCircle className="spin"/><p>Opening the editor…</p></div>}><LiveEditor key={note.id} body={note.body} section={note.section} uploads={uploads} onChange={body=>onChange({body})}/></Suspense></div> : <div className={`writing-area ${mode}`}>{(mode==='edit' || mode==='split') && <div className="markdown-editor"><div className="markdown-toolbar"><button aria-label="Bold" title="Bold" onClick={()=>insertMarkdown('**','**')}><Bold size={15}/></button><button aria-label="Italic" title="Italic" onClick={()=>insertMarkdown('*','*')}><Italic size={15}/></button><button aria-label="Heading" title="Heading" onClick={()=>insertMarkdown('\n## ')}>H₂</button><span/><button aria-label="Bullet list" title="Bullet list" onClick={()=>insertMarkdown('\n- ')}><List size={16}/></button><button aria-label="Code block" title="Code block" onClick={()=>insertMarkdown('\n```\n','\n```\n')}><Code2 size={16}/></button><small>Markdown</small></div><textarea key={note.id} ref={editor} aria-label="Markdown editor" spellCheck placeholder="Start writing… Markdown is welcome here." value={note.body} onChange={e=>onChange({body:e.target.value})}/></div>}{(mode==='preview' || mode==='split') && <article className="markdown-preview">{note.body ? <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={url=>url.startsWith(UPLOAD_URL_PREFIX) ? url : defaultUrlTransform(url)} components={{img:NoteImage,a:props=><a {...props} target="_blank" rel="noreferrer"/>}}>{linkNoteImages(note.body,note.section,uploads)}</ReactMarkdown> : <div className="empty-state"><PenLine size={28}/><h3>A fresh page, a fresh thought.</h3><p>Switch to Write to begin your note.</p><button className="small-button" onClick={()=>onMode('edit')}>Start writing</button></div>}</article>}</div>}{outlineOpen && headings.length>0 && <NoteOutline key={note.id} headings={headings} mode={mode} editor={editor} onWidth={onOutlineWidth}/>}</div></div>}
  </>;
}

/** Chooses the document for a window, from any section. */
export function PaneBar({number,active,noteId,sections,notes,pdfs,onPick,onClose}: {pdfs:UploadedFile[];number?:1|2;active:boolean;noteId:string;sections:SectionConfig[];notes:Note[];onPick:(id:string)=>void;onClose?:()=>void}) {
  return <div className={`pane-bar ${active ? 'active' : ''}`}>
    {number && <span className="pane-chip" title={active ? 'Clicking a note in the list opens it in this window' : `Window ${number}`}>{number}</span>}
    <select aria-label={number ? `Document in window ${number}` : 'Document'} value={notes.some(n=>n.id===noteId) || pdfs.some(f=>f.id===noteId) ? noteId : ''} onChange={e=>onPick(e.target.value)}>
      <option value="" disabled>Choose a document…</option>
      {sections.map(s=>{const inSection=notes.filter(n=>n.section===s.id);const files=pdfs.filter(f=>f.section===s.id);return inSection.length+files.length>0 && <optgroup key={s.id} label={s.name}>{inSection.map(n=><option key={n.id} value={n.id}>{n.title || 'Untitled note'}</option>)}{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>;})}
    </select>
    {number && active && <small>Opens from the list</small>}
    {onClose && <button className="icon-button" aria-label={`Close window ${number}`} title="Close this window" onClick={onClose}><X size={15}/></button>}
  </div>;
}

/** Drags the edge of a column. The drag only touches CSS; the width is saved when it ends. Double-click restores the default. */
export function ColumnResizer({className,label,column,cssVar,limits,onWidth}: {className:string;label:string;column:string;cssVar:string;limits:{min:number;max:number};onWidth:(width:number|null)=>void}) {
  const start=useRef({x:0,width:0});
  const measure=()=>document.querySelector(column)?.getBoundingClientRect().width || limits.min;
  const shell=(e:{currentTarget:Element})=>e.currentTarget.closest<HTMLElement>('.app-shell')!;
  // Leaves room for the document, however wide the window is.
  const clamp=(width:number)=>clampColumn(width,{min:limits.min,max:Math.max(limits.min,Math.min(limits.max,window.innerWidth*.45))});
  return <div className={`column-resizer ${className}`} role="separator" tabIndex={0} aria-label={label} aria-orientation="vertical" aria-valuemin={limits.min} aria-valuemax={limits.max} title="Drag to resize. Double-click to reset."
    onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);start.current={x:e.clientX,width:measure()};shell(e).dataset.resizing='true';}}
    onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){const style=shell(e).style;style.setProperty(cssVar,`${clamp(start.current.width+e.clientX-start.current.x)}px`);}}}
    onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){delete shell(e).dataset.resizing;if(e.clientX!==start.current.x)onWidth(clamp(start.current.width+e.clientX-start.current.x));}}}
    onDoubleClick={e=>{shell(e).style.removeProperty(cssVar);onWidth(null);}}
    onKeyDown={e=>{const delta={ArrowLeft:-16,ArrowRight:16}[e.key];if(delta){e.preventDefault();onWidth(clamp(measure()+delta));}}}/>;
}

/** Sets the space each window gets. The drag only touches CSS, so drawings and notes don't re-render until it ends. */
export function PaneDivider({vertical,ratio,onRatio}: {vertical:boolean;ratio:number;onRatio:(ratio:number)=>void}) {
  const at=(e:PointerEvent<HTMLDivElement>)=>{
    const box=e.currentTarget.parentElement!.getBoundingClientRect();
    return clampRatio(vertical ? (e.clientX-box.left)/box.width : (e.clientY-box.top)/box.height);
  };
  const onKeyDown=(e:KeyboardEvent)=>{
    const delta={ArrowLeft:-.05,ArrowUp:-.05,ArrowRight:.05,ArrowDown:.05}[e.key];
    if(delta){e.preventDefault();onRatio(clampRatio(ratio+delta));}
  };
  return <div className="pane-divider" role="separator" tabIndex={0} aria-label="Resize windows" aria-orientation={vertical ? 'vertical' : 'horizontal'} aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(ratio*100)} title="Drag to resize. Double-click to make them equal."
    onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.parentElement!.style.setProperty('--pane-first',String(at(e)));}}
    onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))onRatio(at(e));}}
    onDoubleClick={()=>onRatio(.5)} onKeyDown={onKeyDown}/>;
}

const dropLabels: Record<DropZone,string>={left:'on the left',right:'on the right',top:'on top',bottom:'on the bottom',center:'here'};
type Rect = {left:number;top:number;width:number;height:number};
const clipped=(box:DOMRect,area:Rect):Rect=>{
  const top=Math.max(box.top,area.top),bottom=Math.min(box.bottom,area.top+area.height);
  return {left:box.left,top,width:box.width,height:Math.max(0,bottom-top)};
};

/** Covers the documents during a tab drag, so the whiteboard and editors can't swallow it, and previews where the tab will land. */
export function ViewDropOverlay({shell,mode,onDrop}: {shell:RefObject<HTMLElement|null>;mode:NoteMode;onDrop:(zone:DropZone,target:0|1)=>void}) {
  const [geometry]=useState(()=>{
    const box=shell.current!.getBoundingClientRect();
    const barBottom=document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
    const top=Math.max(box.top,barBottom),bottom=Math.min(box.bottom,window.innerHeight);
    const area:Rect={left:box.left,top,width:box.width,height:bottom-top};
    return {area,panes:[...shell.current!.querySelectorAll(':scope>.doc-pane')].map(pane=>clipped(pane.getBoundingClientRect(),area))};
  });
  const {area,panes}=geometry;
  const [hover,setHover]=useState<{zone:DropZone;target:0|1}|null>(null);
  const locate=(e:DragEvent)=>{
    const zone=dropZoneAt(e.clientX,e.clientY,area);
    const second=panes[1];
    const target:0|1=second && e.clientX>=second.left && e.clientY>=second.top ? 1 : 0;
    return {zone,target};
  };
  let preview:Rect|null=null;
  if(hover) {
    const {zone,target}=hover;
    if(zone==='center') preview=panes[target];
    else if(zone==='left' || zone==='right') preview={...area,width:area.width/2,left:zone==='left' ? area.left : area.left+area.width/2};
    else preview={...area,height:area.height/2,top:zone==='top' ? area.top : area.top+area.height/2};
  }
  return <div className="view-drop-overlay" data-zone={hover?.zone} style={area}
    onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move';const next=locate(e);if(next.zone!==hover?.zone || next.target!==hover?.target)setHover(next);}}
    onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setHover(null);}}
    onDrop={e=>{e.preventDefault();const {zone,target}=locate(e);onDrop(zone,target);}}>
    {preview && hover && <div className="view-drop-preview" style={{left:preview.left-area.left,top:preview.top-area.top,width:preview.width,height:preview.height}}><span>{viewNames[mode]} {dropLabels[hover.zone]}</span></div>}
  </div>;
}
