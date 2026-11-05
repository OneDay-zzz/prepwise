import { defaultNoteSort, noteSortKeys, type NoteSort } from './model.ts';

export type NoteMode = 'edit' | 'preview' | 'split' | 'board' | 'live';
export type DocLayout = 'one' | 'columns' | 'rows';
export type LayoutSettings = {
  sidebarCollapsed: boolean;
  listCollapsed: boolean;
  detailsOpen: boolean;
  outlineOpen: boolean;
  outlineWidth: number | null;
  /** Whether each window has its chat open, and the chat for the whole workspace. */
  chatOpen: {first: boolean; second: boolean; workspace: boolean};
  chatWidth: number | null;
  docs: DocLayout;
  /** The first window's share of the space, from 0.25 to 0.75. */
  ratio: number;
  /** Column widths in pixels. Null keeps the default, which follows the window and text size. */
  sidebarWidth: number | null;
  listWidth: number | null;
  second: {id: string; mode: NoteMode};
  noteSort: NoteSort;
  /** How each note was last viewed, and the view used most recently for any note. */
  noteViews: Record<string, NoteMode>;
  lastView: NoteMode;
};
export const defaultLayout: LayoutSettings = {sidebarCollapsed:false,listCollapsed:false,detailsOpen:false,outlineOpen:true,outlineWidth:null,chatOpen:{first:false,second:false,workspace:false},chatWidth:null,docs:'one',ratio:.5,sidebarWidth:null,listWidth:null,second:{id:'',mode:'preview'},noteSort:defaultNoteSort,noteViews:{},lastView:'preview'};

export function clampRatio(value: number) {return Math.min(.75,Math.max(.25,value));}

export const columnLimits = {sidebar:{min:180,max:420},list:{min:180,max:560},outline:{min:120,max:480},chat:{min:280,max:640}} as const;
export function clampColumn(value: number, {min,max}: {min:number;max:number}) {return Math.round(Math.min(max,Math.max(min,value)));}
const savedColumn=(value: unknown, limits: {min:number;max:number})=>typeof value==='number' && Number.isFinite(value) ? clampColumn(value,limits) : null;

const isNoteMode=(value: unknown): value is NoteMode=>value==='edit' || value==='preview' || value==='split' || value==='board' || value==='live';
const REMEMBERED_NOTES=500;
function savedViews(value: unknown) {
  const entries=value && typeof value==='object' ? Object.entries(value).filter(([,mode])=>isNoteMode(mode)) : [];
  return Object.fromEntries(entries.slice(-REMEMBERED_NOTES)) as Record<string,NoteMode>;
}

export function normalizeLayout(value: unknown): LayoutSettings {
  const v=(value && typeof value==='object' ? value : {}) as Record<string,unknown>;
  const sort=(v.noteSort && typeof v.noteSort==='object' ? v.noteSort : {}) as Record<string,unknown>;
  const second=(v.second && typeof v.second==='object' ? v.second : {}) as Record<string,unknown>;
  const chat=(v.chatOpen && typeof v.chatOpen==='object' ? v.chatOpen : {}) as Record<string,unknown>;
  return {
    sidebarCollapsed:v.sidebarCollapsed===true,
    listCollapsed:v.listCollapsed===true,
    detailsOpen:v.detailsOpen===true,
    outlineOpen:v.outlineOpen!==false,
    outlineWidth:savedColumn(v.outlineWidth,columnLimits.outline),
    chatOpen:{first:chat.first===true,second:chat.second===true,workspace:chat.workspace===true},
    chatWidth:savedColumn(v.chatWidth,columnLimits.chat),
    docs:v.docs==='columns' || v.docs==='rows' ? v.docs : 'one',
    ratio:typeof v.ratio==='number' && Number.isFinite(v.ratio) ? clampRatio(v.ratio) : .5,
    sidebarWidth:savedColumn(v.sidebarWidth,columnLimits.sidebar),
    listWidth:savedColumn(v.listWidth,columnLimits.list),
    second:{id:typeof second.id==='string' ? second.id : '',mode:isNoteMode(second.mode) ? second.mode : 'preview'},
    noteSort:noteSortKeys.includes(sort.key as NoteSort['key']) && (sort.direction==='asc' || sort.direction==='desc') ? {key:sort.key as NoteSort['key'],direction:sort.direction} : defaultNoteSort,
    noteViews:savedViews(v.noteViews),
    lastView:isNoteMode(v.lastView) ? v.lastView : 'preview',
  };
}

export type PaneView = {id: string; mode: NoteMode};
export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center';
type Box = {left: number; top: number; width: number; height: number};

/** The outer part of the area docks to that side; the middle replaces what a window shows. */
export function dropZoneAt(x: number, y: number, box: Box, edge = .25): DropZone {
  const distances: [DropZone, number][] = [['left',(x-box.left)/box.width],['right',1-(x-box.left)/box.width],['top',(y-box.top)/box.height],['bottom',1-(y-box.top)/box.height]];
  const [zone,distance]=distances.reduce((closest,next)=>next[1]<closest[1] ? next : closest);
  return distance<edge ? zone : 'center';
}

/** What a window should show once the view it was showing has been pulled out of it. */
export function withoutView(mode: NoteMode, taken: NoteMode): NoteMode {
  if(mode===taken) return mode==='preview' ? 'edit' : 'preview';
  if(mode==='split' && taken==='preview') return 'edit';
  if(mode==='split' && taken==='edit') return 'preview';
  return mode;
}

type DropInput = {
  zone: DropZone;
  /** The window under the pointer, used by the center zone. */
  target: 0 | 1;
  from: 0 | 1;
  view: PaneView;
  docs: DocLayout;
  first: PaneView;
  second: PaneView | null;
};

export function arrangeDrop({zone,target,from,view,docs,first,second}: DropInput) {
  if(zone==='center') {
    const panes: (PaneView|null)[]=[first,second];
    const source=panes[from];
    panes[target]=view;
    if(target!==from && source && source.id===view.id) panes[from]={...source,mode:withoutView(source.mode,view.mode)};
    return {docs,first:panes[0]!,second:panes[1],focused:target};
  }
  const other=second ? (from===0 ? second : first) : first;
  const source=second && from===1 ? second : first;
  // Dragging a view the other window already shows trades places, so neither view is lost.
  const trade=second && other.id===view.id && other.mode===view.mode && source.mode!==view.mode;
  const rest=trade ? {...other,mode:source.mode} : second && other.id!==view.id ? other : {...other,mode:withoutView(other.mode,view.mode)};
  const dockedFirst=zone==='left' || zone==='top';
  return {docs:(zone==='left' || zone==='right' ? 'columns' : 'rows') as DocLayout,first:dockedFirst ? view : rest,second:dockedFirst ? rest : view,focused:(dockedFirst ? 0 : 1) as 0|1};
}
