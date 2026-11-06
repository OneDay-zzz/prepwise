import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { get, set } from 'idb-keyval';
import { ArrowDownNarrowWide, ArrowDownToLine, ArrowRight, ArrowUpNarrowWide, ArrowUpRight, Bookmark, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, Columns2, Download, FileText, Flag, Github, Home, Images, LayoutList, ListCollapse, LoaderCircle, Maximize, Menu, Minimize, PanelLeftClose, PanelLeftOpen, PenLine, Pencil, Pin, Plus, Rows2, Search, ShieldCheck, SlidersHorizontal, Sparkles, Square, SquarePen, Table2, Trash2, Upload, X, MessagesSquare } from 'lucide-react';
import LocalFolder from './LocalFolder';
import ResumePreview from './ResumePreview';
import useTheme from './useTheme';
import ThemeToggle from './ThemeToggle';
import { PopMenu, SpaceDialog, WorkspaceSwitcher } from './Workspaces';
import { IMPORTABLE_FILES, importedDocument, MAX_IMPORT_BYTES, STARTER_TABLE } from './doc-formats';
import useCheckpoints from './useCheckpoints';
import useLocalDocuments from './useLocalDocuments';
import type { NotePart } from './note-outline';
import CheckpointPanel from './CheckpointPanel';
import SettingsPanel from './SettingsPanel';
import QuickOpen from './QuickOpen';
import PdfReader from './PdfReader';
import SectionGallery from './SectionGallery';
import { blobToDataUrl, dataUrlToBlob, getUpload, putUpload } from './uploads';
import useDisplaySettings from './useDisplaySettings';
import useLayoutSettings from './useLayoutSettings';
import { arrangeDrop, columnLimits, type DocLayout, type DropZone, type NoteMode } from './layout-settings';
import NotePane, { ColumnResizer, PaneBar, PaneDivider, ViewDropOverlay } from './NotePane';
import { sectionIcon } from './section-icons';
import FolderManager, { draggedNoteIds, FOLDER_DRAG_TYPE, NOTE_DRAG_TYPE } from './FolderManager';
import DocChat from './DocChat';
import { WORKSPACE_CHAT } from './doc-chat-model';
import { setChatBridge } from './doc-chat-store';
import { addDrawing, drawingFileName } from './whiteboard-export';
import Planner, { createPlan, download, PlanEditor, PlanRow } from './Planner';
import { createSpace, DEFAULT_SPACE, defaultSpace, deleteSpace, planSpace, saveSpace, sectionSpace, spaceSections, workspaceSpaces, type NoteFormat, type SpaceConfig, MAX_UPLOAD_BYTES, type UploadedFile, reorderFolders, reorderNotes, addNoteParts, formatFileSize, isPdfFile, saveFolder, removeFolder, companyGroups, companyKey, emptyExperience, matchesNote, sortNotes, initialWorkspace, localDate, newNote, copyNoteToSection, deleteSection, moveNoteToSection, moveSection, restoreSection, saveSection, validateWorkspace, workspaceSections, type Note, type NoteSort, type NoteSortKey, type Plan, type Section, type Workspace } from './model';
const DB_KEY = 'prepwise-workspace-v1';
const sortOptions: Record<NoteSortKey,{label:string;first:NoteSort['direction'];desc:string;asc:string}> = {
  manual: {label:'My order',first:'asc',desc:'My order',asc:'My order'},
  updated:{label:'Last updated',first:'desc',desc:'Newest first',asc:'Oldest first'},
  importance:{label:'Importance',first:'desc',desc:'Most important first',asc:'Least important first'},
  title:{label:'Title',first:'asc',desc:'Z to A',asc:'A to Z'},
  length:{label:'Length',first:'desc',desc:'Longest first',asc:'Shortest first'},
  ready:{label:'Ready or done',first:'desc',desc:'Ready first',asc:'Not ready first'},
  interview:{label:'Interview date',first:'desc',desc:'Latest first',asc:'Earliest first'},
};
type Route = 'overview' | 'planner' | 'calendar' | Section;
const toggleFullscreen=(onError:(message:string)=>void)=>{
  const change=document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  change.catch(()=>onError('Your browser blocked full screen.'));
};

export default function App() {
  const [fullscreen,setFullscreen]=useState(false);
  useEffect(()=>{
    // Follows the browser too, since Esc or the browser's own menu can also leave full screen.
    const sync=()=>setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange',sync);
    return ()=>document.removeEventListener('fullscreenchange',sync);
  },[]);
  const [folderSlot,setFolderSlot]=useState<HTMLElement|null>(null);
  const [theme,toggleTheme]=useTheme();
  const [display,setDisplay]=useDisplaySettings();
  const [layout,patchLayout]=useLayoutSettings();
  const layoutRef=useRef(layout);
  layoutRef.current=layout;
  const [focusedPane,setFocusedPane]=useState<0|1>(0);
  const [viewDrag,setViewDrag]=useState<{from:0|1;id:string;mode:NoteMode}|null>(null);
  const shellRef=useRef<HTMLElement>(null);
  const [settings,setSettings]=useState<{editing?:string}|null>(null);
  const [folderFilter,setFolderFilter]=useState('*');
  const [companyFilter,setCompanyFilter]=useState('*');
  const [documentFilter,setDocumentFilter]=useState('all');
  const [tagFilter,setTagFilter]=useState('');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  // Chat answers arrive whichever document is open, so edits go through the latest workspace.
  const latestWorkspace=useRef(workspace);
  latestWorkspace.current=workspace;
  useEffect(()=>setChatBridge({get:()=>latestWorkspace.current,update:change=>setWorkspace(current=>current ? change(current) : current),viewing:()=>viewing.current}),[]);
  const viewing=useRef('');
  const [showCheckpoints,setShowCheckpoints]=useState(false);
  const [gallery,setGallery]=useState(false);
  const localDocuments=useLocalDocuments(workspace);
  const checkpoints=useCheckpoints(workspace,next=>{setWorkspace(next);setActiveId('');navigate('overview');});
  const [route, setRoute] = useState<Route>('overview');
  const [activeId, setActiveId] = useState('');
  const [query, setQuery] = useState('');
  // A view chosen for the note now open. Any other note opens as it was last viewed.
  const [firstView, setFirstView] = useState<{id:string;mode:NoteMode}>({id:'',mode:'preview'});
  const [selection, setSelection] = useState<string[]>([]);
  const selectionAnchor = useRef('');
  // A column drag turns off text selection across the app. If it's interrupted, such as when the
  // window loses focus or the edge being dragged goes away, nothing else would turn it back on.
  useEffect(()=>{
    const finish=()=>{const shell=document.querySelector<HTMLElement>('.app-shell');if(shell)delete shell.dataset.resizing;};
    window.addEventListener('pointerup',finish,true);
    window.addEventListener('pointercancel',finish,true);
    window.addEventListener('blur',finish);
    return ()=>{window.removeEventListener('pointerup',finish,true);window.removeEventListener('pointercancel',finish,true);window.removeEventListener('blur',finish);};
  },[]);
  // While a document is dragged, the folders stay reachable however far the list has scrolled.
  const [noteDragging,setNoteDragging]=useState(false);
  useEffect(()=>{
    if(!noteDragging)return;
    const end=()=>setNoteDragging(false);
    window.addEventListener('dragend',end,true);
    window.addEventListener('drop',end,true);
    return ()=>{window.removeEventListener('dragend',end,true);window.removeEventListener('drop',end,true);};
  },[noteDragging]);
  const dragScroll=useRef({speed:0,seen:0,running:false});
  /** Scrolls the list while a drag is near its top or bottom edge, stopping soon after the drag leaves. */
  const scrollListWhileDragging=(e:DragEvent<HTMLElement>)=>{
    if(!e.dataTransfer.types.includes(NOTE_DRAG_TYPE) && !e.dataTransfer.types.includes(FOLDER_DRAG_TYPE))return;
    const list=e.currentTarget,box=list.getBoundingClientRect();
    const folders=e.dataTransfer.types.includes(NOTE_DRAG_TYPE) ? list.querySelector('.folder-manager')?.getBoundingClientRect() : undefined;
    const top=Math.max(box.top,folders?.bottom ?? box.top);
    const EDGE=64,FASTEST=14;
    const distance=e.clientY<top ? 0 : e.clientY<top+EDGE ? e.clientY-top-EDGE : e.clientY>box.bottom-EDGE ? e.clientY-box.bottom+EDGE : 0;
    const scroll=dragScroll.current;
    scroll.speed=distance/EDGE*FASTEST;
    scroll.seen=performance.now();
    if(scroll.running || !scroll.speed)return;
    scroll.running=true;
    const step=()=>{
      if(!scroll.speed || performance.now()-scroll.seen>250) {scroll.running=false;return;}
      list.scrollTop+=scroll.speed;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const [saved, setSaved] = useState('Loading workspace');
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const [planEditor, setPlanEditor] = useState<Plan | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [navDrop,setNavDrop]=useState('');
  const [quickOpen,setQuickOpen]=useState(false);
  const [undo,setUndo]=useState<{message:string;workspace:Workspace;route:Route;activeId:string;noteSort?:NoteSort}|null>(null);
  const [noteDrop,setNoteDrop]=useState<{id:string;after:boolean}|null>(null);
  const draggingNotes=useRef<string[]>([]);
  const [resumeUrl, setResumeUrl] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const documentImportRef = useRef<HTMLInputElement>(null);
  const [spaceDialog,setSpaceDialog]=useState<{editing?:SpaceConfig}|null>(null);
  const saveVersion = useRef(0);
  const pendingSave = useRef(false);

  useEffect(() => { get(DB_KEY).then(value => setWorkspace(value ? validateWorkspace(value) : initialWorkspace())).catch(() => setLoadError('Your saved workspace could not be opened. Reload to retry. Existing data has not been overwritten.')); }, []);
  useEffect(() => {
    if (!workspace) return;
    const version = ++saveVersion.current;
    pendingSave.current = true; setSaved('Saving…');
    set(DB_KEY, workspace).then(() => { if (saveVersion.current === version) {pendingSave.current = false;setSaved('Saved on this device');} }).catch(() => {if (saveVersion.current === version) {setSaved('Save failed — export a backup');setNotice('Browser storage could not save your work. Export a backup before closing.');}});
  }, [workspace]);
  useEffect(() => { const guard = (e: BeforeUnloadEvent) => { if(pendingSave.current) {e.preventDefault();e.returnValue = '';}}; window.addEventListener('beforeunload',guard);return () => window.removeEventListener('beforeunload',guard); }, []);
  useEffect(() => { if(!selection.length) return;const clear=(e:KeyboardEvent)=>{if(e.key==='Escape' && !document.querySelector('dialog[open]'))setSelection([]);};window.addEventListener('keydown',clear);return () => window.removeEventListener('keydown',clear); },[selection.length]);
  useEffect(() => { if(!notice) return;const timer=setTimeout(() => setNotice(''),undo?.message===notice ? 12000 : 6500);return () => clearTimeout(timer); },[notice,undo]);
  useEffect(() => {
    const onKeyDown=(e:KeyboardEvent)=>{
      if(!(e.metaKey || e.ctrlKey))return;
      // The whiteboard uses Cmd+K to add a link.
      if(e.key.toLowerCase()==='k' && !(e.target as Element|null)?.closest?.('.excalidraw')){e.preventDefault();setQuickOpen(open=>!open);}
      if(e.key==='\\'){e.preventDefault();patchLayout({sidebarCollapsed:!layoutRef.current.sidebarCollapsed});}
      if(e.key==='Enter' && e.shiftKey && document.fullscreenEnabled){e.preventDefault();toggleFullscreen(setNotice);}
    };
    window.addEventListener('keydown',onKeyDown);
    return () => window.removeEventListener('keydown',onKeyDown);
  },[patchLayout]);
  useEffect(() => { let url = '';let cancelled = false;if(workspace?.resume) fetch(workspace.resume.data).then(r => r.blob()).then(blob => {if(!cancelled) {url=URL.createObjectURL(blob);setResumeUrl(url);}}); else setResumeUrl('');return () => {cancelled=true;if(url) URL.revokeObjectURL(url);}; },[workspace?.resume]);

  const twoDocs=layout.docs!=='one';
  const focusFirstPane=useCallback(()=>setFocusedPane(0),[]);
  const focusSecondPane=useCallback(()=>setFocusedPane(1),[]);
  const targetPane=twoDocs ? focusedPane : 0;
  // While two windows are open, the first one keeps its document when the list's filters change.
  const clearFirstPane=()=>{if(!twoDocs)setActiveId('');};
  const viewOf=(id:string)=>layout.noteViews[id] ?? layout.lastView;
  const rememberedView=(id:string,view:NoteMode)=>({noteViews:{...layout.noteViews,[id]:view},lastView:view});
  const showNote=(id:string,nextMode?:NoteMode)=>{
    if(targetPane===1)patchLayout({second:{id,mode:nextMode || viewOf(id)},...(nextMode ? {noteViews:{...layout.noteViews,[id]:nextMode}} : {})});
    else{setActiveId(id);if(nextMode){setFirstView({id,mode:nextMode});patchLayout({noteViews:{...layout.noteViews,[id]:nextMode}});}}
  };
  const navigate = (next: Route) => {const target=workspace && workspaceSections(workspace).find(s=>s.id===next);if(target && sectionSpace(target)!==layoutRef.current.space)patchLayout({space:sectionSpace(target)});setSelection([]);setRoute(next);setGallery(false);setQuery('');setCompanyFilter('*');setFolderFilter('*');setDocumentFilter('all');setTagFilter('');setMobileNav(false);};
  const openNote = (id: string) => { const note=workspace?.notes.find(n => n.id === id);const file=workspace?.uploads?.find(u => u.id === id);if(note) {navigate(note.section);showNote(id,'preview');} else if(file) {navigate(file.section);showNote(id);} else setNotice('The linked note is no longer available.');};
  const updateNote = useCallback((id: string, patch: Partial<Note>) => setWorkspace(w => w ? ({...w, notes:w.notes.map(n => n.id === id ? {...n,...patch,updatedAt:new Date().toISOString()} : n)}) : w), []);
  const savePlan = (plan: Plan) => setWorkspace(w => w ? ({...w,plans:w.plans.some(p => p.id === plan.id) ? w.plans.map(p => p.id === plan.id ? plan : p) : [...w.plans,plan]}) : w);
  const deletePlan = (id: string) => setWorkspace(w => w ? ({...w,plans:w.plans.filter(p => p.id !== id)}) : w);
  const addNote = (section: Section, template = false, nextMode: NoteMode = 'edit', format?: NoteFormat) => { const note=newNote(section,format ? false : template || section==='experiences',workspace ? workspaceSections(workspace).find(s=>s.id===section) : undefined);if(format){note.format=format;note.body=format==='table' ? STARTER_TABLE : '';note.title=format==='table' ? 'Untitled table' : 'Untitled text';}if(folderFilter && folderFilter!=='*')note.folderId=folderFilter;if(section==='experiences') note.experience={...emptyExperience(),company:companyFilter!=='*' ? companyGroups(workspace?.notes || []).find(c=>c.key===companyFilter)?.name || '' : ''};setWorkspace(w => w ? ({...w,notes:[note,...w.notes]}) : w);navigate(section);if(note.folderId)setFolderFilter(note.folderId);showNote(note.id,nextMode);};
  const importDocuments = async (files: FileList|null, section: Section) => {
    if(!files?.length)return;
    const added:Note[]=[],skipped:string[]=[];
    for(const file of Array.from(files)) {
      const parsed=file.size<=MAX_IMPORT_BYTES ? importedDocument(file.name,await file.text()) : null;
      if(!parsed) {skipped.push(file.name);continue;}
      added.push({...newNote(section,false),title:parsed.title,body:parsed.body,...(parsed.format ? {format:parsed.format} : {}),...(folderFilter && folderFilter!=='*' ? {folderId:folderFilter} : {})});
    }
    if(added.length) {setWorkspace(w=>w ? {...w,notes:[...added,...w.notes]} : w);showNote(added[0].id);}
    setNotice([added.length ? `Imported ${added.length} ${added.length===1 ? 'document' : 'documents'}.` : '',skipped.length ? `Couldn’t import ${skipped.join(', ')}. Use a text, Markdown, CSV, TSV, or JSON file up to 5 MB, or add other files to the Gallery.` : ''].filter(Boolean).join(' '));
  };
  const switchSpace = (id: string) => {navigate('overview');setActiveId('');patchLayout({space:id});};
  const addSpace = (name: string, color: string, starter: string) => {
    if(!workspace)return;
    const created=createSpace(workspace,name,color,starter);
    setWorkspace(created.workspace);
    setSpaceDialog(null);
    switchSpace(created.id);
  };
  const removeSpace = (id: string) => {
    if(!workspace)return;
    const space=workspaceSpaces(workspace).find(s=>s.id===id);
    const inside=new Set(spaceSections(workspace,id).map(s=>s.id));
    const count=workspace.notes.filter(n=>inside.has(n.section)).length;
    if(!window.confirm(`Delete “${space?.name}” with its ${count} ${count===1 ? 'document' : 'documents'}, its files, and its plans?`))return;
    notifyWithUndo(`Deleted “${space?.name}”.`);
    setWorkspace(deleteSpace(workspace,id));
    setSpaceDialog(null);
    switchSpace(DEFAULT_SPACE);
  };
  const exportBackup = async () => {try {const uploadData: Record<string,string>={};for(const file of workspace?.uploads || []) {const blob=await getUpload(file.id);if(blob) uploadData[file.id]=await blobToDataUrl(blob);}download(`prepwise-backup-${localDate()}.json`,JSON.stringify({...workspace,uploadData},null,2),'application/json');setNotice('Backup exported with your notes, diagrams, plans, resume, and gallery files.');}catch {setNotice('Could not export the backup. Please try again.');}};
  async function importBackup(file?: File) { if(!file) return;try {if(file.size > 500*1024*1024) throw new Error('Backups must be smaller than 500 MB.');const {uploadData,...parsed}=JSON.parse(await file.text()) as Record<string,unknown>;const next=validateWorkspace(parsed);if(!window.confirm(`Replace your workspace with ${next.notes.length} notes and ${next.plans.length} plans? Export a backup first if you want to keep your current work.`)) return;for(const [id,data] of Object.entries((uploadData || {}) as Record<string,string>)) if(next.uploads?.some(u=>u.id===id) && /^data:[^,]*;base64,/.test(data)) await putUpload(id,await dataUrlToBlob(data));setWorkspace(next);setActiveId('');navigate('overview');setNotice('Workspace restored.');}catch(error) {setNotice(error instanceof Error ? error.message : 'Could not import this file.');} }
  async function uploadResume(file?: File) {if(!file) return;if(!/\.(pdf|docx?|txt|md)$/i.test(file.name)) {setNotice('Choose a PDF, DOC, DOCX, TXT, or Markdown resume.');return;}if(file.size > 10*1024*1024) {setNotice('Please choose a resume smaller than 10 MB.');return;}try {const data=await new Promise<string>((resolve,reject) => {const reader=new FileReader();reader.onload=() => resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});setWorkspace(w => w ? {...w,resume:{name:file.name,type:file.type,size:file.size,data}} : w);setNotice('Resume uploaded and saved on this device.');}catch {setNotice('Could not read this file. Please try again.');}}

  if(!workspace) return <div className="loading-screen"><div className="brand-mark"><BookOpen size={24}/></div><h2>{loadError ? 'Unable to open workspace' : 'Opening your workspace…'}</h2>{loadError ? <><p>{loadError}</p><button className="primary" onClick={() => location.reload()}>Retry</button></> : <LoaderCircle className="spin"/>}</div>;
  const sections=workspaceSections(workspace);
  const spaces=workspaceSpaces(workspace);
  const openSection=sections.find(s => s.id === route);
  const currentSpaceId=openSection ? sectionSpace(openSection) : spaces.some(s=>s.id===layout.space) ? layout.space : DEFAULT_SPACE;
  const currentSpace=spaces.find(s=>s.id===currentSpaceId)!;
  const isOriginal=currentSpaceId===DEFAULT_SPACE;
  const readyLabels=isOriginal ? {mark:'Mark as ready',done:'Interview ready',short:'Ready',progress:'notes interview ready'} : {mark:'Mark as done',done:'Done',short:'Done',progress:'documents done'};
  // Lists that reach across workspaces say which one a section belongs to.
  const pickerSections=spaces.length>1 ? sections.map(s=>{const owner=spaces.find(o=>o.id===sectionSpace(s));return owner && owner.id!==currentSpaceId ? {...s,name:`${owner.name} / ${s.name}`} : s;}) : sections;
  const shownSections=sections.filter(s=>!s.hidden && sectionSpace(s)===currentSpaceId);
  const shownNotes=workspace.notes.filter(n=>shownSections.some(s=>s.id===n.section));
  const section=sections.find(s => s.id === route);
  const sectionNotes=workspace.notes.filter(n => n.section === route);
  const sectionUploads=(workspace.uploads || []).filter(u => u.section === route);
  const companies=companyGroups(workspace.notes);
  const collectionNotes=sectionNotes.filter(n=>(folderFilter==='*' || (n.folderId || '')===folderFilter) && (route!=='experiences' || companyFilter==='*' || companyKey(n.experience?.company || '')===companyFilter));
  const allTags=[...new Set(workspace.notes.flatMap(n=>n.tags || []))].sort((a,b)=>a.localeCompare(b));
  const collectionTags=[...new Set(sectionNotes.flatMap(n=>n.tags || []))].sort((a,b)=>a.localeCompare(b));
  // Only company experiences have an interview date.
  const noteSort: NoteSort=layout.noteSort.key==='interview' && route!=='experiences' ? {key:'updated',direction:'desc'} : layout.noteSort;
  const visibleNotes=sortNotes(collectionNotes.filter(n=>matchesNote(n,query) && (documentFilter==='all' || (documentFilter==='pinned' ? n.pinned : n.marked)) && (!tagFilter || n.tags?.includes(tagFilter))),noteSort);
  const pdfs=(workspace.uploads || []).filter(isPdfFile);
  const firstPdf=pdfs.find(f=>f.id===activeId && (twoDocs || f.section===route));
  const secondPdf=twoDocs ? pdfs.find(f=>f.id===layout.second.id) : undefined;
  const listPdfs=folderFilter==='*' && documentFilter==='all' && !tagFilter && companyFilter==='*' ? pdfs.filter(f=>f.section===route && f.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : [];
  const focusedPdf=targetPane===1 ? secondPdf : firstPdf;
  const current=firstPdf ? undefined : (twoDocs ? workspace.notes.find(n => n.id === activeId) : collectionNotes.find(n => n.id === activeId)) || (twoDocs && visibleNotes.find(n => n.id !== layout.second.id)) || visibleNotes[0];
  const secondNote=twoDocs ? workspace.notes.find(n => n.id === layout.second.id) : undefined;
  const mode: NoteMode=current && firstView.id===current.id ? firstView.mode : current ? viewOf(current.id) : layout.lastView;
  const focusedNote=targetPane===1 ? secondNote : current;
  // Only what's on screen counts, so a filter can't move notes you can't see.
  const selectedIds=visibleNotes.filter(n=>selection.includes(n.id)).map(n=>n.id);
  const clickNote=(e:ReactMouseEvent,id:string)=>{
    if(e.metaKey || e.ctrlKey) {
      // The open note is highlighted already, so it counts as the first of the selection.
      const base=selectedIds.length || !focusedNote || !visibleNotes.some(n=>n.id===focusedNote.id) ? selectedIds : [focusedNote.id];
      setSelection(base.includes(id) ? base.filter(other=>other!==id) : [...base,id]);
      selectionAnchor.current=id;
      return;
    }
    if(e.shiftKey) {
      const order=visibleNotes.map(n=>n.id);
      const from=order.indexOf(selectionAnchor.current || focusedNote?.id || id),to=order.indexOf(id);
      setSelection(order.slice(Math.min(Math.max(from,0),to),Math.max(from,to)+1));
      return;
    }
    setSelection([]);
    selectionAnchor.current=id;
    showNote(id);
    if(targetPane===0)setGallery(false);
  };
  const startNoteDrag=(e:DragEvent,id:string)=>{
    const ids=selectedIds.includes(id) ? selectedIds : [id];
    draggingNotes.current=ids;
    setTimeout(()=>setNoteDragging(true));
    e.dataTransfer.setData(NOTE_DRAG_TYPE,ids.join(','));
    e.dataTransfer.effectAllowed='copyMove';
    if(ids.length>1) {
      const badge=document.createElement('div');
      badge.className='note-drag-badge';
      badge.textContent=`${ids.length} documents`;
      document.body.append(badge);
      e.dataTransfer.setDragImage(badge,12,12);
      setTimeout(()=>badge.remove());
    }
    // Waits a moment because changing the page during dragstart cancels the drag in Chrome.
    else if(selectedIds.length)setTimeout(()=>setSelection([]));
  };
  const patchNote=(note:Note,patch:Partial<Note>)=>{if('folderId' in patch)setFolderFilter('*');if(patch.experience && patch.experience.company!==note.experience?.company)setCompanyFilter('*');updateNote(note.id,patch);};
  const addDrawingToNote=async(note:Note,svg:string)=>{
    const blob=new Blob([svg],{type:'image/svg+xml'});
    if(blob.size>MAX_UPLOAD_BYTES)throw new Error('This drawing is too large.');
    // The picture goes in as a Markdown link, so the first tab has to be a note.
    if(note.format)throw new Error('This document’s first tab isn’t a note.');
    const upload:UploadedFile={id:crypto.randomUUID(),section:note.section,name:drawingFileName(note.title,note.section,latestWorkspace.current?.uploads),type:blob.type,size:blob.size,addedAt:new Date().toISOString()};
    await putUpload(upload.id,blob);
    setWorkspace(current=>current ? addDrawing(current,note.id,upload) : current);
    setNotice(`Added “${upload.name}” to the end of “${note.title || 'Untitled note'}”.`);
  };
  const notifyWithUndo=(message:string,previousSort?:NoteSort)=>{setUndo({message,workspace,route,activeId,noteSort:previousSort});setNotice(message);};
  const undoLast=()=>{if(!undo)return;setWorkspace(undo.workspace);navigate(undo.route);setActiveId(undo.activeId);if(undo.noteSort)patchLayout({noteSort:undo.noteSort});setUndo(null);setNotice('Undone.');};
  // Pinned notes stay on top, so a drop can't carry a note across that line. Showing no marker says so.
  const reorderProps=(target:Note)=>{
    const dropAfter=(e:DragEvent)=>{const box=(e.currentTarget as HTMLElement).getBoundingClientRect();return e.clientY>box.top+box.height/2;};
    const canDrop=()=>{
      const dragged=visibleNotes.filter(n=>draggingNotes.current.includes(n.id));
      return dragged.length>0 && !draggingNotes.current.includes(target.id) && dragged.some(n=>!!n.pinned===!!target.pinned);
    };
    return {
      onDragEnd:()=>{draggingNotes.current=[];setNoteDrop(null);},
      onDragOver:(e:DragEvent)=>{
        if(!e.dataTransfer.types.includes(NOTE_DRAG_TYPE) || !canDrop()) {setNoteDrop(null);return;}
        e.preventDefault();e.dataTransfer.dropEffect='move';setNoteDrop({id:target.id,after:dropAfter(e)});
      },
      onDragLeave:()=>setNoteDrop(current=>current?.id===target.id?null:current),
      onDrop:(e:DragEvent)=>{
        const ids=draggedNoteIds(e);setNoteDrop(null);
        if(!ids.length)return;
        e.preventDefault();setSelection([]);
        const next=reorderNotes(workspace,ids,target.id,dropAfter(e),noteSort);
        if(next===workspace)return;
        setWorkspace(next);
        if(noteSort.key!=='manual') {patchLayout({noteSort:{key:'manual',direction:'asc'}});notifyWithUndo('Sorting by My order, so documents stay where you put them.',noteSort);}
      },
    };
  };
  const removeNote=(id:string)=>{notifyWithUndo(`Deleted “${workspace.notes.find(n=>n.id===id)?.title || 'Untitled note'}”.`);setWorkspace({...workspace,notes:workspace.notes.filter(n => n.id!==id),plans:workspace.plans.map(p => p.noteId===id ? {...p,noteId:''} : p)});if(activeId===id || current?.id===id)setActiveId('');};
  const revealFirstPane=(note?:Note)=>{if(note && !collectionNotes.some(n=>n.id===note.id))navigate(note.section);};
  const closeSecondPane=()=>{patchLayout({docs:'one'});setFocusedPane(0);if(firstPdf){if(firstPdf.section!==route)navigate(firstPdf.section);}else revealFirstPane(current);};
  const closeFirstPane=()=>{if(secondPdf){patchLayout({docs:'one'});setFocusedPane(0);setActiveId(secondPdf.id);setGallery(false);if(secondPdf.section!==route)navigate(secondPdf.section);return;}if(!secondNote){closeSecondPane();return;}patchLayout({docs:'one'});setFocusedPane(0);setActiveId(secondNote.id);setFirstView({id:secondNote.id,mode:layout.second.mode});setGallery(false);revealFirstPane(secondNote);};
  // Delayed because changing the page during dragstart makes Chrome cancel the drag.
  const startViewDrag=(from:0|1,id:string,dragged:NoteMode)=>{setTimeout(()=>setViewDrag({from,id,mode:dragged}),0);};
  const dropView=(zone:DropZone,target:0|1)=>{
    if(!viewDrag)return;
    const next=arrangeDrop({zone,target,from:viewDrag.from,view:{id:viewDrag.id,mode:viewDrag.mode},docs:layout.docs,first:{id:firstPdf?.id || current?.id || '',mode},second:twoDocs ? layout.second : null});
    setViewDrag(null);
    setActiveId(next.first.id);setFirstView(next.first);
    patchLayout(next.second ? {docs:next.docs,second:next.second} : {docs:next.docs});
    setFocusedPane(next.focused);
    if(zone!=='center' || target===0)setGallery(false);
  };
  const splitDocument=(id:string,parts:NotePart[])=>{
    const note=workspace.notes.find(n=>n.id===id);
    if(!note)return;
    setWorkspace(addNoteParts(workspace,id,parts));
    setFolderFilter('*');
    notifyWithUndo(`Split “${note.title || 'Untitled note'}” into ${parts.length} documents. The original is still here.`);
  };
  const transferNotes=(kind:'move'|'copy',ids:string[],target:Section)=>{
    setSelection([]);
    if(ids.length===1){transferNote(kind,ids[0],target);return;}
    const notes=ids.filter(id=>workspace.notes.some(n=>n.id===id && (kind==='copy' || n.section!==target)));
    if(!notes.length)return;
    // Copies go on top one at a time, so going backwards keeps them in order.
    setWorkspace(kind==='move' ? notes.reduce((w,id)=>moveNoteToSection(w,id,target),workspace) : [...notes].reverse().reduce((w,id)=>copyNoteToSection(w,id,target),workspace));
    notifyWithUndo(`${kind==='move' ? 'Moved' : 'Copied'} ${notes.length} documents to ${sections.find(s=>s.id===target)?.name || 'that section'}.`);
  };
  const transferNote=(kind:'move'|'copy',id:string,target:Section,folderId?:string,follow=false)=>{
    const note=workspace.notes.find(n=>n.id===id);
    if(!note || (kind==='move' && note.section===target))return;
    setWorkspace((kind==='move' ? moveNoteToSection : copyNoteToSection)(workspace,id,target,folderId));
    const name=sections.find(s=>s.id===target)?.name || 'that section';
    notifyWithUndo(`${kind==='move' ? 'Moved' : 'Copied'} “${note.title || 'Untitled note'}” to ${name}.`);
    // With one window, a moved document would otherwise vanish from the page, so follow it there.
    if(kind==='move' && follow && !twoDocs){navigate(target);setActiveId(id);}
  };
  const changeDocs=(docs:DocLayout)=>{
    if(docs==='one'){if(twoDocs)closeSecondPane();return;}
    if(twoDocs){patchLayout({docs});return;}
    const firstId=firstPdf?.id || current?.id;
    if(firstId)setActiveId(firstId);
    const keep=layout.second.id!==firstId && (workspace.notes.some(n=>n.id===layout.second.id) || pdfs.some(f=>f.id===layout.second.id));
    patchLayout({docs,second:keep ? layout.second : (nextId=>({id:nextId,mode:viewOf(nextId)}))(visibleNotes.find(n=>n.id!==firstId)?.id || '')});
    setFocusedPane(1);
  };
  const completed=shownNotes.filter(n => n.ready).length;
  viewing.current=section ? `${section.name}${focusedNote ? `: ${focusedNote.title || 'Untitled note'}` : ''}` : route==='overview' ? 'the Overview page' : route==='planner' ? 'the Planner' : 'the Calendar';
  if(spaces.length>1)viewing.current+=` in the ${JSON.stringify(currentSpace.name)} workspace`;
  const upcoming=[...workspace.plans].filter(p => planSpace(p)===currentSpaceId && !p.done && (p.date >= localDate() || p.kind === 'milestone')).sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const recent=[...shownNotes].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0,4);
  return <div className={`app-shell ${layout.sidebarCollapsed ? 'sidebar-collapsed' : ''}`} style={{...(layout.sidebarWidth ? {'--sidebar-width':`${layout.sidebarWidth}px`} : {}),...(layout.listWidth ? {'--list-width':`${layout.listWidth}px`} : {}),...(layout.outlineWidth ? {'--outline-width':`${layout.outlineWidth}px`} : {})} as CSSProperties}>
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <button className="brand" onClick={() => navigate('overview')}><span className="brand-mark"><BookOpen size={20}/></span><span>prepwise<span className="brand-dot">.</span></span></button>
      <WorkspaceSwitcher spaces={spaces} current={currentSpace} onSwitch={switchSpace} onCreate={()=>setSpaceDialog({})} onEdit={()=>setSpaceDialog({editing:currentSpace})}/>
      <button className="nav-item quick-open-button" title="Search all documents" onClick={()=>setQuickOpen(true)}><Search size={17}/><span>Search all</span><kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</kbd></button>
      <nav><button className={`nav-item ${route === 'overview' ? 'active' : ''}`} title="Overview" onClick={() => navigate('overview')}><Home size={18}/><span>Overview</span></button><div className="nav-label nav-label-row"><span>My knowledge</span><button className="nav-add-section" aria-label="Add a knowledge section" title="Add a section" onClick={()=>setSettings({editing:'new'})}><Plus size={15}/></button></div>{shownSections.map(s => {const Icon=sectionIcon(s.icon);return <button key={s.id} className={`nav-item ${route === s.id ? 'active' : ''} ${navDrop===s.id ? 'drop-target' : ''}`} title={s.name} onClick={() => navigate(s.id)} onDragOver={e=>{if(!e.dataTransfer.types.includes(NOTE_DRAG_TYPE))return;e.preventDefault();e.dataTransfer.dropEffect=e.altKey ? 'copy' : 'move';setNavDrop(s.id);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setNavDrop(current=>current===s.id ? '' : current);}} onDrop={e=>{const ids=draggedNoteIds(e);setNavDrop('');if(!ids.length)return;e.preventDefault();transferNotes(e.altKey ? 'copy' : 'move',ids,s.id);}}><Icon size={18}/><span>{s.name}</span><small>{workspace.notes.filter(n => n.section === s.id).length}</small></button>;})}<div className="nav-label"><span>Planning</span></div><button className={`nav-item ${route === 'planner' ? 'active' : ''}`} title="Planner" onClick={() => navigate('planner')}><LayoutList size={18}/><span>Planner</span></button><button className={`nav-item ${route === 'calendar' ? 'active' : ''}`} title="Calendar" onClick={() => navigate('calendar')}><CalendarDays size={18}/><span>Calendar</span></button></nav>
      <div className="sidebar-bottom"><div className="progress-card" role="group" aria-label="Progress"><p><strong>{completed} of {shownNotes.length}</strong> {readyLabels.progress}</p><div className="progress-track"><span style={{width:`${shownNotes.length ? completed/shownNotes.length*100 : 0}%`}}/></div></div><div className="sidebar-tools"><button className="icon-button" aria-label="Customize" title="Customize" onClick={()=>setSettings({})}><SlidersHorizontal size={17}/></button><button className="icon-button sidebar-tool-checkpoint" aria-label={`GitHub checkpoints${checkpoints.busy?', saving':checkpoints.error?', needs attention':checkpoints.enabled?', automatic':''}`} title={`GitHub checkpoints${checkpoints.busy?' · Saving':checkpoints.error?' · Needs attention':checkpoints.enabled?' · Automatic':''}`} onClick={()=>setShowCheckpoints(true)}><Github size={17}/>{(checkpoints.busy||checkpoints.error||checkpoints.enabled) && <i className={checkpoints.error?'is-error':''}/>}</button><button className="icon-button" aria-label="Export workspace" title="Export workspace" onClick={()=>void exportBackup()}><Download size={17}/></button><button className="icon-button" aria-label="Restore backup" title="Restore backup" onClick={() => importRef.current?.click()}><Upload size={17}/></button></div></div>
    </aside>
    <div className={`main-shell ${section ? 'app-columns' : ''} ${twoDocs && section ? 'two-docs' : ''}`}>{layout.chatOpen.workspace && <DocChat chatId={WORKSPACE_CHAT} everything title="Your whole workspace" label="Workspace chat" host=".main-shell" width={layout.chatWidth} onWidth={chatWidth=>patchLayout({chatWidth})} onClose={()=>patchLayout({chatOpen:{...layout.chatOpen,workspace:false}})} onOpenNote={openNote}/>}{!layout.sidebarCollapsed && <ColumnResizer className="sidebar-resizer" label="Resize sidebar" column=".sidebar" cssVar="--sidebar-width" limits={columnLimits.sidebar} onWidth={sidebarWidth=>patchLayout({sidebarWidth})}/>}<header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20}/></button><button className="icon-button sidebar-toggle" aria-label={layout.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!layout.sidebarCollapsed} title={layout.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={()=>patchLayout({sidebarCollapsed:!layout.sidebarCollapsed})}>{layout.sidebarCollapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</button><span>{currentSpace.name}</span><ChevronRight size={14}/><strong>{section?.name || (route === 'overview' ? 'Overview' : route === 'planner' ? 'Planner' : 'Calendar')}</strong></div><div className="topbar-actions"><span className="folder-slot" ref={setFolderSlot}/><button className={`icon-button outline-toggle ${layout.chatOpen.workspace ? 'is-on' : ''}`} aria-label="Chat about your whole workspace" aria-pressed={layout.chatOpen.workspace} title={`${layout.chatOpen.workspace ? 'Close' : 'Open'} chat about your whole workspace`} onClick={()=>patchLayout({chatOpen:{...layout.chatOpen,workspace:!layout.chatOpen.workspace}})}><MessagesSquare size={17}/></button>{section && <div className="layout-controls"><button className="icon-button" aria-label="Show note list" aria-pressed={!layout.listCollapsed} title={layout.listCollapsed ? 'Show note list' : 'Hide note list'} onClick={()=>patchLayout({listCollapsed:!layout.listCollapsed})}><ListCollapse size={17}/></button><div className="segmented" role="group" aria-label="Document windows">{([['one','One document',Square],['columns','Two documents, side by side',Columns2],['rows','Two documents, top and bottom',Rows2]] as const).map(([value,label,Icon])=><button key={value} className={layout.docs===value ? 'active' : ''} aria-label={label} aria-pressed={layout.docs===value} title={label} onClick={()=>changeDocs(value)}><Icon size={15}/></button>)}</div></div>}<div className={`save-status ${saved.startsWith('Save failed') ? 'error' : ''}`} role="status">{saved === 'Saving…' ? <LoaderCircle size={13} className="spin"/> : <CheckCircle2 size={13}/>}<span>{saved}</span></div>{document.fullscreenEnabled && <button className="icon-button fullscreen-toggle" aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'} title={`${fullscreen ? 'Exit' : 'Enter'} full screen (${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘⇧↩' : 'Ctrl+Shift+Enter'})`} onClick={()=>toggleFullscreen(setNotice)}>{fullscreen ? <Minimize size={17}/> : <Maximize size={17}/>}</button>}<ThemeToggle theme={theme} onToggle={toggleTheme}/></div></header>
    <LocalFolder slot={folderSlot} quiet={!section} current={section ? focusedNote : undefined} section={section?.id || sections.find(s=>s.id==='projects')?.id || sections[0].id} sections={sections} notify={setNotice} onOpen={note => {setWorkspace(w => {if(!w)return w;const existing=w.notes.find(n=>n.id===note.id);note={...note,folderId:existing?.folderId || (folderFilter!=='*' && folderFilter && w.folders?.some(f=>f.id===folderFilter && f.section===note.section) ? folderFilter : undefined)};return {...w,notes:w.notes.some(n => n.id===note.id) ? w.notes.map(n => n.id===note.id ? note : n) : [note,...w.notes]};});navigate(note.section);showNote(note.id,note.scene && !note.body ? 'board' : 'edit');}}/>
    {route === 'overview' && <main className="page overview-page"><div className="page-heading"><div><h1>{isOriginal && currentSpace.name===defaultSpace.name ? 'A little preparation. A lot more confidence.' : currentSpace.name}</h1><p>{isOriginal && currentSpace.name===defaultSpace.name ? 'Your stories, your skills, your next opportunity. All in one place.' : 'Your documents and plans for this workspace, all in one place.'}</p></div><button className="primary" onClick={() => setPlanEditor(createPlan('interview',undefined,currentSpaceId))}><Plus size={16}/> {isOriginal ? 'Plan an interview' : 'Add an event'}</button></div>
      <div className="overview-summary"><div><strong>{shownNotes.length}</strong> {shownNotes.length===1 ? 'document' : 'documents'} <i/><strong>{completed}</strong> {isOriginal ? 'ready to go' : 'done'} <i/><strong>{upcoming.filter(p => p.kind==='interview' || p.kind==='event').length}</strong> {isOriginal ? 'upcoming interviews' : 'upcoming events'}</div></div>
      <div className="overview-columns"><section className="panel"><div className="panel-heading"><h2>Pick up where you left off</h2><span className="subtle">Recently edited</span></div>{recent.map(n => {const config=sections.find(s => s.id===n.section);const Icon=sectionIcon(config?.icon || '');return <button className="recent-row" key={n.id} onClick={() => openNote(n.id)}><span className={`note-icon ${config?.color}`}><Icon size={18}/></span><span><strong>{n.title || 'Untitled note'}</strong><small>{config?.name}</small></span><span className={`note-status ${n.ready ? 'ready' : ''}`}>{n.ready ? readyLabels.short : 'In progress'}</span><ChevronRight size={15}/></button>;})}{!recent.length && <div className="empty-state"><p>Create a note to start building your knowledge.</p></div>}</section>
      <section className="panel upcoming-panel"><div className="panel-heading"><h2>Coming up next</h2><button className="text-button" onClick={() => navigate('calendar')}>Calendar <ArrowUpRight size={13}/></button></div>{upcoming.slice(0,3).map(p => <PlanRow key={p.id} plan={p} onEdit={setPlanEditor} onToggle={p => savePlan({...p,done:!p.done})} onOpenNote={openNote}/>)}{!upcoming.length && <div className="empty-state"><div className="empty-icon"><CalendarDays size={23}/></div><h3>Make space for your next step</h3><p>Add an event or a task.<br/>A small plan goes a long way.</p><button className="small-button" onClick={() => setPlanEditor(createPlan('task',undefined,currentSpaceId))}><Plus size={14}/> Add a task</button></div>}</section></div>
      <div className="section-heading"><h2>{isOriginal ? 'Your preparation toolkit' : 'Sections'}</h2></div><div className="toolkit-grid">{shownSections.map(s => {const Icon=sectionIcon(s.icon);const count=workspace.notes.filter(n => n.section===s.id).length;return <button className={`toolkit-card ${s.color}`} key={s.id} onClick={() => navigate(s.id)}><div className="card-top"><span className="section-icon"><Icon size={18}/></span><h3>{s.name}</h3></div><p>{s.description}</p><div className="card-footer"><span>{count} {count === 1 ? 'note' : 'notes'}</span><ArrowRight size={16}/></div></button>;})}</div>
      <div className="tip-bar"><span className="tip-icon"><PenLine size={21}/></span><div><strong>Some ideas are better drawn.</strong><span>Every note has an Excalidraw whiteboard. Sketch an architecture, map a story, or trace an algorithm.</span></div><button className="text-button" onClick={() => {const target=shownSections.find(s => s.id === 'projects')?.id || shownSections[0]?.id || sections[0].id;const existing=workspace.notes.find(n => n.section === target);if(existing) {navigate(target);showNote(existing.id,'board');}else addNote(target,true,'board');}}>Try the whiteboard <ArrowRight size={15}/></button></div>
      <footer className="page-footer"><span>Built for the work behind the opportunity.</span><span>Markdown notes · Excalidraw boards · Your own pace</span></footer>
    </main>}
    {(route === 'planner' || route === 'calendar') && <Planner key={route} spaces={spaces} sections={sections} currentSpace={currentSpaceId} mode={route} plans={workspace.plans} notes={workspace.notes} onSave={savePlan} onDelete={deletePlan} onOpenNote={openNote} editor={planEditor} setEditor={setPlanEditor}/>}
    {section && <main className="notebook"><aside className={`note-list ${layout.listCollapsed ? 'is-collapsed' : ''} ${noteDragging ? 'is-note-dragging' : ''}`} onDragOver={scrollListWhileDragging}><div className="note-list-heading"><div className="eyebrow">YOUR KNOWLEDGE</div><h2 className="section-title">{section.name}<button className="icon-button" aria-label={`Customize ${section.name}`} title="Customize section" onClick={()=>setSettings({editing:section.id})}><Pencil size={13}/></button></h2><p>{section.short}</p><PopMenu buttonClass="primary new-doc-button" buttonLabel="New document: choose a type" title="Choose what kind of document to create" button={<><Plus size={16}/>New<ChevronDown size={14}/></>} items={[{key:'note',onSelect:()=>addNote(section.id),label:<><SquarePen size={14}/><span>{section.id==='experiences' ? 'Interview experience' : 'Note'}</span><small>.md</small></>},{key:'text',onSelect:()=>addNote(section.id,false,'edit','text'),label:<><FileText size={14}/><span>Plain text</span><small>.txt</small></>},{key:'table',onSelect:()=>addNote(section.id,false,'preview','table'),label:<><Table2 size={14}/><span>Table</span><small>.csv</small></>},{key:'board',onSelect:()=>addNote(section.id,false,'board'),label:<><PenLine size={14}/><span>Whiteboard</span><small>.excalidraw</small></>},{key:'import',onSelect:()=>documentImportRef.current?.click(),label:<><Upload size={14}/><span>Import a file…</span></>}]}/><button className={`section-gallery-link ${gallery?'active':''}`} aria-pressed={gallery} onClick={()=>setGallery(!gallery)}><Images size={15}/> Gallery<small>{sectionUploads.length}</small></button></div>
      <FolderManager key={section.id} section={section.id} folders={workspace.folders || []} notes={sectionNotes} selected={folderFilter} onSelect={id=>{setFolderFilter(id);clearFirstPane();}} onSave={folder=>{setWorkspace(saveFolder(workspace,folder));setFolderFilter(folder.id);clearFirstPane();}} onDelete={id=>{setWorkspace(removeFolder(workspace,id));setFolderFilter('');clearFirstPane();}} onReorder={(id,targetId,after)=>setWorkspace(reorderFolders(workspace,id,targetId,after))} onMoveNote={(noteIds,folderId)=>{setSelection([]);const moving=workspace.notes.filter(n=>noteIds.includes(n.id) && n.section===section.id && (n.folderId || '')!==folderId);if(!moving.length)return;const updatedAt=new Date().toISOString();setWorkspace({...workspace,notes:workspace.notes.map(n=>moving.includes(n) ? {...n,folderId:folderId || undefined,updatedAt} : n)});if(moving.some(n=>n.id===activeId) && folderFilter!=='*')clearFirstPane();notifyWithUndo(`Moved ${moving.length===1 ? `“${moving[0].title || 'Untitled note'}”` : `${moving.length} documents`} to ${workspace.folders?.find(f=>f.id===folderId)?.name || 'Unfiled'}.`);}}/>
      {section.id==='experiences' && <div className="company-collection-filter"><label htmlFor="company-filter">COMPANIES <span>{companies.filter(c=>c.key).length}</span></label><select id="company-filter" value={companyFilter} onChange={e=>{setCompanyFilter(e.target.value);clearFirstPane();}}><option value="*">All companies ({sectionNotes.length})</option>{companies.map(c=><option key={c.key} value={c.key}>{c.name} ({c.count})</option>)}</select></div>}
      <div className="document-list-filters"><div className="segmented" aria-label="Document filters">{[['all','All'],['pinned','Pinned'],['marked','Bookmarks']].map(([value,label])=><button key={value} className={documentFilter===value?'active':''} aria-pressed={documentFilter===value} onClick={()=>{setDocumentFilter(value);clearFirstPane();}}>{label}</button>)}</div>{collectionTags.length>0 && <select aria-label="Filter by tag" value={tagFilter} onChange={e=>{setTagFilter(e.target.value);clearFirstPane();}}><option value="">All tags</option>{collectionTags.map(tag=><option key={tag} value={tag}>#{tag}</option>)}</select>}<div className="note-sort"><label htmlFor="note-sort">Sort by</label><select id="note-sort" value={noteSort.key} onChange={e=>{const key=e.target.value as NoteSortKey;patchLayout({noteSort:{key,direction:sortOptions[key].first}});}}>{(Object.keys(sortOptions) as NoteSortKey[]).filter(key=>key!=='interview' || route==='experiences').map(key=><option key={key} value={key}>{sortOptions[key].label}</option>)}</select>{noteSort.key!=='manual' && <button className="icon-button" aria-label={`${sortOptions[noteSort.key][noteSort.direction]}. Click to reverse.`} title={`${sortOptions[noteSort.key][noteSort.direction]}. Click to reverse.`} onClick={()=>patchLayout({noteSort:{...noteSort,direction:noteSort.direction==='desc' ? 'asc' : 'desc'}})}>{noteSort.direction==='desc' ? <ArrowDownNarrowWide size={15}/> : <ArrowUpNarrowWide size={15}/>}</button>}</div></div><div className="search-box"><Search size={15}/><input aria-label="Search notes" placeholder="Search this collection…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={13}/></button>}</div>{selectedIds.length>0 && <div className="note-selection" role="status"><span><strong>{selectedIds.length} selected</strong><small>Drag to reorder, or onto a folder or section</small></span><button className="text-button" onClick={()=>setSelection(visibleNotes.map(n=>n.id))}>All</button><button className="text-button" onClick={()=>setSelection([])}>Clear</button></div>}<div className="note-list-items">{visibleNotes.map(n => <button key={n.id} draggable aria-pressed={selectedIds.length ? selectedIds.includes(n.id) : undefined} title="Drag up or down to reorder. Drag onto a folder or a section in the sidebar to move this document, holding Option on a section to copy it. Cmd-click or Shift-click to select several." onDragStart={e=>startNoteDrag(e,n.id)} {...reorderProps(n)} onClick={e=>clickNote(e,n.id)} className={`note-list-item ${focusedNote?.id===n.id ? 'selected' : ''} ${selectedIds.includes(n.id) ? 'is-picked' : ''} ${noteDrop?.id===n.id ? (noteDrop.after ? 'drop-after' : 'drop-before') : ''}`}><div><FileText size={15}/><strong>{n.title || 'Untitled note'}</strong>{n.ready && <Check size={13}/>}{twoDocs && current?.id===n.id && <i className={`pane-chip ${targetPane===0 ? 'active' : ''}`}>1</i>}{secondNote?.id===n.id && <i className={`pane-chip ${targetPane===1 ? 'active' : ''}`}>2</i>}</div><p>{n.body.replace(/[#*>`\[\]]/g,'').trim().slice(0,90) || 'A blank page for your next idea.'}</p>{n.section==='experiences' && <span className="company-note-label">{n.experience?.company.trim() || 'Unassigned'}{n.experience?.round ? ` · ${n.experience.round}` : ''}</span>}<div className="note-badges">{n.importance && <span className={`importance-badge ${n.importance>=4 ? 'high' : ''}`} aria-label={`Importance level ${n.importance}`}><Flag size={9}/>{n.importance}</span>}{n.pinned && <Pin size={11} aria-label="Pinned"/>}{n.marked && <Bookmark size={11} aria-label="Bookmarked"/>}{n.tags?.slice(0,3).map(tag=><span key={tag}>#{tag}</span>)}{(n.tags?.length || 0)>3 && <span>+{n.tags!.length-3}</span>}</div><small>{new Date(n.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}{n.scene?.elements?.length ? ' · Whiteboard attached' : ''}</small></button>)}{listPdfs.length>0 && <div className="note-list-group">PDF FILES</div>}{listPdfs.map(f=><button key={f.id} onClick={()=>{showNote(f.id);if(targetPane===0)setGallery(false);}} className={`note-list-item pdf-list-item ${focusedPdf?.id===f.id ? 'selected' : ''}`}><div><FileText size={15}/><strong title={f.name}>{f.name}</strong><span className="pdf-badge">PDF</span>{twoDocs && firstPdf?.id===f.id && <i className={`pane-chip ${targetPane===0 ? 'active' : ''}`}>1</i>}{secondPdf?.id===f.id && <i className={`pane-chip ${targetPane===1 ? 'active' : ''}`}>2</i>}</div><small>{formatFileSize(f.size)} · {new Date(f.addedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small></button>)}{!visibleNotes.length && !listPdfs.length && <p className="no-results">{query || documentFilter!=='all' || tagFilter ? 'No matching documents.' : folderFilter!=='*' && folderFilter!=='' ? 'This folder is empty. Open All documents and drag a document onto this folder, or create a new note here.' : section.id==='experiences' ? 'Collect your first company experience.' : 'Your first note starts here.'}</p>}</div><button className="template-button" onClick={() => addNote(section.id,true)}><Sparkles size={16}/> Start from a template <Plus size={14}/></button></aside>
    {!layout.listCollapsed && <ColumnResizer className="list-resizer" label="Resize note list" column=".note-list" cssVar="--list-width" limits={columnLimits.list} onWidth={listWidth=>patchLayout({listWidth})}/>}<section ref={shellRef} className={`editor-shell docs-${layout.docs}`} style={{'--pane-first':layout.ratio} as CSSProperties}><div className="doc-pane first" onMouseDownCapture={()=>setFocusedPane(0)} onFocusCapture={()=>setFocusedPane(0)}>{(twoDocs || layout.listCollapsed) && <PaneBar number={twoDocs ? 1 : undefined} active={twoDocs && targetPane===0} noteId={firstPdf?.id || current?.id || ''} sections={pickerSections} notes={workspace.notes} pdfs={pdfs} onPick={id=>{setGallery(false);if(twoDocs)setActiveId(id);else openNote(id);}} onClose={twoDocs ? closeFirstPane : undefined}/>}{gallery ? <SectionGallery key={section.id} section={section} uploads={sectionUploads} notify={setNotice} onAdd={file=>setWorkspace(w=>w ? {...w,uploads:[file,...(w.uploads || [])]} : w)} onRemove={id=>setWorkspace(w=>w ? {...w,uploads:w.uploads?.filter(u=>u.id!==id)} : w)} onRead={id=>{setGallery(false);setActiveId(id);}}/> : <>{section.id === 'resume' && <div className="resume-upload" onDragOver={e => e.preventDefault()} onDrop={e => {e.preventDefault();void uploadResume(e.dataTransfer.files[0]);}}><span className="upload-icon"><FileText size={22}/></span><div><strong>{workspace.resume?.name || 'Bring your experience into focus'}</strong><p>{workspace.resume ? `${(workspace.resume.size/1024).toFixed(0)} KB · Saved on this device` : 'Upload your resume or drop it here. PDF, DOCX, DOC, TXT, MD · up to 10 MB'}</p></div><div className="button-row">{workspace.resume && <><a className="icon-button" href={resumeUrl} download={workspace.resume.name} aria-label="Download resume"><ArrowDownToLine size={17}/></a>{/\.pdf$/i.test(workspace.resume.name) && <button className="small-button" onClick={() => setShowResume(!showResume)}>{showResume ? 'Hide' : 'Preview'}</button>}<button className="icon-button danger" aria-label="Remove resume" onClick={() => {if(window.confirm('Remove the uploaded resume? Your notes will remain.')) setWorkspace({...workspace,resume:undefined});}}><Trash2 size={16}/></button></>}<button className="small-button" onClick={() => uploadRef.current?.click()}><Upload size={15}/>{workspace.resume ? 'Replace' : 'Upload resume'}</button></div></div>}
    {showResume && section.id === 'resume' && workspace.resume && /\.pdf$/i.test(workspace.resume.name) && <ResumePreview key={resumeUrl} url={resumeUrl} name={workspace.resume.name} onClose={() => setShowResume(false)}/>}
    {firstPdf ? <PdfReader key={firstPdf.id} file={firstPdf} onFocus={focusFirstPane}/> : current ? <NotePane onTabDeleted={name=>notifyWithUndo(`Deleted the “${name}” tab.`)} readyLabels={readyLabels} note={current} mode={mode} onMode={next=>{setFirstView({id:current.id,mode:next});patchLayout(rememberedView(current.id,next));}} theme={theme} sectionName={sections.find(s=>s.id===current.section)?.name || ''} sections={pickerSections} detailsOpen={layout.detailsOpen} onToggleDetails={()=>patchLayout({detailsOpen:!layout.detailsOpen})} outlineOpen={layout.outlineOpen} onToggleOutline={()=>patchLayout({outlineOpen:!layout.outlineOpen})} onAddDrawing={svg=>addDrawingToNote(current,svg)} chatOpen={layout.chatOpen.first} chatWidth={layout.chatWidth} onToggleChat={()=>patchLayout({chatOpen:{...layout.chatOpen,first:!layout.chatOpen.first}})} onChatWidth={chatWidth=>patchLayout({chatWidth})} onOpenNote={openNote} onOutlineWidth={outlineWidth=>patchLayout({outlineWidth})} onTransfer={(kind,target,folderId)=>transferNote(kind,current.id,target,folderId,true)} onSplit={parts=>splitDocument(current.id,parts)} notes={workspace.notes} allTags={allTags} folders={workspace.folders || []} uploads={workspace.uploads} boardTaken={false} onChange={patch=>patchNote(current,patch)} onDelete={()=>removeNote(current.id)} onViewDragStart={dragged=>startViewDrag(0,current.id,dragged)} onViewDragEnd={()=>setViewDrag(null)}/> : <div className="empty-state spacious"><BookOpen size={32}/><h3>{section.id==='experiences' ? 'Build a playbook for your target companies.' : 'Your knowledge starts with a note.'}</h3><p>{section.id==='experiences' ? 'Collect questions, interview rounds, and source links. Group everything by company.' : 'Create a blank page or use a guided template.'}</p><button className="primary" onClick={() => addNote(section.id,true)}><Plus size={16}/>{section.id==='experiences' ? 'Add interview experience' : 'Use a template'}</button></div>}</>}</div>
    {twoDocs && <><PaneDivider vertical={layout.docs==='columns'} ratio={layout.ratio} onRatio={ratio=>patchLayout({ratio})}/><div className="doc-pane second" onMouseDownCapture={()=>setFocusedPane(1)} onFocusCapture={()=>setFocusedPane(1)}><PaneBar number={2} active={targetPane===1} noteId={layout.second.id} sections={pickerSections} notes={workspace.notes} pdfs={pdfs} onPick={id=>patchLayout({second:{id,mode:viewOf(id)}})} onClose={closeSecondPane}/>{secondPdf ? <PdfReader key={secondPdf.id} file={secondPdf} onFocus={focusSecondPane}/> : secondNote ? <NotePane onTabDeleted={name=>notifyWithUndo(`Deleted the “${name}” tab.`)} readyLabels={readyLabels} note={secondNote} mode={layout.second.mode} onMode={next=>patchLayout({second:{...layout.second,mode:next},...rememberedView(secondNote.id,next)})} theme={theme} sectionName={sections.find(s=>s.id===secondNote.section)?.name || ''} sections={pickerSections} detailsOpen={layout.detailsOpen} onToggleDetails={()=>patchLayout({detailsOpen:!layout.detailsOpen})} outlineOpen={layout.outlineOpen} onToggleOutline={()=>patchLayout({outlineOpen:!layout.outlineOpen})} onAddDrawing={svg=>addDrawingToNote(secondNote,svg)} chatOpen={layout.chatOpen.second} chatWidth={layout.chatWidth} onToggleChat={()=>patchLayout({chatOpen:{...layout.chatOpen,second:!layout.chatOpen.second}})} onChatWidth={chatWidth=>patchLayout({chatWidth})} onOpenNote={openNote} onOutlineWidth={outlineWidth=>patchLayout({outlineWidth})} onTransfer={(kind,target,folderId)=>transferNote(kind,secondNote.id,target,folderId)} onSplit={parts=>splitDocument(secondNote.id,parts)} notes={workspace.notes} allTags={allTags} folders={workspace.folders || []} uploads={workspace.uploads} boardTaken={current?.id===secondNote.id && mode==='board' && !gallery} onChange={patch=>patchNote(secondNote,patch)} onDelete={()=>removeNote(secondNote.id)} onViewDragStart={dragged=>startViewDrag(1,secondNote.id,dragged)} onViewDragEnd={()=>setViewDrag(null)}/> : <div className="empty-state spacious"><Columns2 size={30}/><h3>Choose a document for this window.</h3><p>Pick one above, or click a note in the list.</p></div>}</div></>}
    {viewDrag && <ViewDropOverlay shell={shellRef} mode={viewDrag.mode} onDrop={dropView}/>}
    </section></main>}
    </div>
    {spaceDialog && <SpaceDialog key={spaceDialog.editing?.id || 'new'} space={spaceDialog.editing} onClose={()=>setSpaceDialog(null)} onCreate={addSpace} onSave={space=>{setWorkspace(saveSpace(workspace,space));setSpaceDialog(null);}} onDelete={removeSpace}/>}
    {planEditor && route !== 'planner' && route !== 'calendar' && <PlanEditor key={planEditor.id} plan={planEditor} spaces={spaces} sections={sections} notes={workspace.notes} existing={workspace.plans.some(p => p.id===planEditor.id)} onClose={() => setPlanEditor(null)} onSave={p => {savePlan(p);setPlanEditor(null);}} onDelete={() => {deletePlan(planEditor.id);setPlanEditor(null);}}/>}
    <input type="file" hidden multiple ref={documentImportRef} aria-label="Import documents" accept={IMPORTABLE_FILES} onChange={e=>{if(section)void importDocuments(e.target.files,section.id);e.target.value='';}}/><input type="file" hidden ref={importRef} accept="application/json,.json" onChange={e => {void importBackup(e.target.files?.[0]);e.target.value='';}}/><input type="file" hidden ref={uploadRef} accept=".pdf,.doc,.docx,.txt,.md" onChange={e => {void uploadResume(e.target.files?.[0]);e.target.value='';}}/>
    {settings && <SettingsPanel initialEditing={settings.editing} display={display} onDisplay={setDisplay} sections={sections.filter(s=>sectionSpace(s)===currentSpaceId)} notes={workspace.notes} uploads={workspace.uploads || []} onOpenSection={id=>{setSettings(null);navigate(id);setActiveId('');}} onClose={()=>setSettings(null)} removedSections={isOriginal ? workspace.removedSections || [] : []} onRestore={id=>setWorkspace(restoreSection(workspace,id))} onSave={next=>setWorkspace(saveSection(workspace,isOriginal || next.space ? next : {...next,space:currentSpaceId}))} onMove={(id,delta)=>setWorkspace(moveSection(workspace,id,delta))} onDelete={(id,target)=>{setWorkspace(deleteSection(workspace,id,target));if(route===id)navigate('overview');setActiveId('');}}/>}
    {quickOpen && <QuickOpen notes={workspace.notes} pdfs={pdfs} sections={pickerSections} onClose={()=>setQuickOpen(false)} onOpen={id=>{setQuickOpen(false);openNote(id);}}/>}
    {showCheckpoints && <CheckpointPanel controls={checkpoints} documents={localDocuments} onClose={()=>setShowCheckpoints(false)}/>}
    {notice && <div className="toast" role="status"><span>{notice}</span>{undo?.message===notice && <button className="small-button toast-undo" onClick={undoLast}>Undo</button>}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16}/></button></div>}
  </div>;
}
