import { isPdfFile, workspaceSections, type Note, type Plan, type Section, type Workspace } from './model.ts';

export type ChatChangeStatus = 'applied' | 'conflict' | 'discarded' | 'undone' | 'missing';
/** The chat that covers everything rather than one document. */
export const WORKSPACE_CHAT = 'workspace';
export type ChatChange = {kind:'edit'|'new'|'plans'; noteId:string; title:string; before:string; after:string; section?:Section; folderId?:string; status?:ChatChangeStatus};
export const chatModels = [{id:'fable',label:'Fable'},{id:'opus',label:'Opus'},{id:'sonnet',label:'Sonnet'},{id:'haiku',label:'Haiku'}] as const;
export type ChatModel = typeof chatModels[number]['id'];
export const defaultChatModel: ChatModel = 'opus';
/** A readable name for what actually answered, such as claude-haiku-5-5 becoming Haiku 5.5. */
export function modelName(id: string) {
  const match=id.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?/);
  return match ? `${match[1][0].toUpperCase()}${match[1].slice(1)} ${match[2]}${match[3] ? `.${match[3]}` : ''}` : id;
}
export type ChatUsage = {input:number; cacheWrite:number; cacheRead:number; output:number};
export type ChatMessage = {usage?:ChatUsage; model?:string; id:string; role:'user'|'assistant'; text:string; tools?:string[]; changes?:ChatChange[]; notes?:string[]; error?:boolean; stopped?:boolean};
export type DiffLine = {type:'same'|'add'|'remove'; text:string};
type Result = {workspace:Workspace; ok:boolean; status:ChatChangeStatus};

const LCS_LIMIT = 4000000;

/** Line diff. Trims what matches at each end first, since an edit usually touches one place in a long note. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a=before ? before.split('\n') : [], b=after ? after.split('\n') : [];
  let start=0;
  while(start<a.length && start<b.length && a[start]===b[start]) start++;
  let endA=a.length,endB=b.length;
  while(endA>start && endB>start && a[endA-1]===b[endB-1]) {endA--;endB--;}
  const same=(lines:string[])=>lines.map(text=>({type:'same',text}) as DiffLine);
  const middleA=a.slice(start,endA),middleB=b.slice(start,endB);
  let middle:DiffLine[];
  if(middleA.length*middleB.length>LCS_LIMIT) middle=[...middleA.map(text=>({type:'remove',text}) as DiffLine),...middleB.map(text=>({type:'add',text}) as DiffLine)];
  else {
    const table=Array.from({length:middleA.length+1},()=>new Uint32Array(middleB.length+1));
    for(let i=middleA.length-1;i>=0;i--) for(let j=middleB.length-1;j>=0;j--) table[i][j]=middleA[i]===middleB[j] ? table[i+1][j+1]+1 : Math.max(table[i+1][j],table[i][j+1]);
    middle=[];
    let i=0,j=0;
    while(i<middleA.length || j<middleB.length) {
      if(i<middleA.length && j<middleB.length && middleA[i]===middleB[j]) {middle.push({type:'same',text:middleA[i]});i++;j++;}
      else if(i<middleA.length && (j===middleB.length || table[i+1][j]>=table[i][j+1])) middle.push({type:'remove',text:middleA[i++]});
      else middle.push({type:'add',text:middleB[j++]});
    }
  }
  return [...same(a.slice(0,start)),...middle,...same(a.slice(endA))];
}
export function diffCounts(lines: DiffLine[]) {return {added:lines.filter(l=>l.type==='add').length,removed:lines.filter(l=>l.type==='remove').length};}
/** Only the changed lines and a little around them. A null entry marks a gap. */
export function diffHunks(lines: DiffLine[], context = 2): (DiffLine|null)[] {
  const keep=new Set<number>();
  lines.forEach((line,i)=>{if(line.type!=='same') for(let k=Math.max(0,i-context);k<=Math.min(lines.length-1,i+context);k++) keep.add(k);});
  const out:(DiffLine|null)[]=[];
  let last=-1;
  [...keep].sort((x,y)=>x-y).forEach(i=>{if(last!==-1 && i!==last+1) out.push(null);out.push(lines[i]);last=i;});
  return out;
}

/** Something that can be @mentioned to limit a message to it. */
export type ContextItem = {kind:'note'|'upload'|'plans'|'resume'; id:string; title:string; detail:string};
export type ChatContext = {notes:string[]; uploads:string[]; plans:boolean; resume:boolean};
export function contextItems(workspace: Workspace): ContextItem[] {
  const sections=new Map(workspaceSections(workspace).map(s=>[s.id,s.name]));
  return [
    {kind:'plans',id:'plans',title:'Calendar and plans',detail:'Tasks, interviews, milestones'},
    ...(workspace.resume ? [{kind:'resume',id:'resume',title:workspace.resume.name,detail:'Resume'} as ContextItem] : []),
    ...workspace.notes.filter(n=>sections.has(n.section)).map(n=>({kind:'note',id:n.id,title:n.title || 'Untitled note',detail:sections.get(n.section)!}) as ContextItem),
    ...(workspace.uploads || []).filter(u=>sections.has(u.section)).map(u=>({kind:'upload',id:u.id,title:u.name,detail:`${sections.get(u.section)} · ${isPdfFile(u) ? 'PDF' : 'File'}`}) as ContextItem),
  ];
}
/** The @word being typed at the caret. An @ inside a word, like an email address, doesn't count. */
export function activeMention(text: string, caret: number): {start:number; query:string}|null {
  const before=text.slice(0,caret);
  const start=before.lastIndexOf('@');
  if(start===-1 || (start>0 && !/\s/.test(before[start-1])) || before.slice(start).includes('\n')) return null;
  return {start,query:before.slice(start+1)};
}
/** Titles that start with the query come first. Titles can have spaces, so an answer can run past one. */
export function matchContext(items: ContextItem[], query: string, limit = 8) {
  const term=query.toLocaleLowerCase();
  const rank=(item:ContextItem)=>{const title=item.title.toLocaleLowerCase();return title.startsWith(term) ? 0 : title.includes(term) ? 1 : item.detail.toLocaleLowerCase().includes(term) ? 2 : 3;};
  return items.map(item=>({item,score:rank(item)})).filter(x=>x.score<3).sort((a,b)=>a.score-b.score).slice(0,limit).map(x=>x.item);
}
/** What a message limits itself to: the mentions whose @title is still in its text. */
export function messageContext(text: string, picked: ContextItem[]): ChatContext|undefined {
  const items=picked.filter(item=>text.includes(`@${item.title}`));
  if(!items.length) return undefined;
  const of=(kind:ContextItem['kind'])=>items.filter(item=>item.kind===kind);
  return {notes:of('note').map(i=>i.id),uploads:of('upload').map(i=>i.id),plans:of('plans').length>0,resume:of('resume').length>0};
}
export function tokenTotal(usage: ChatUsage) {return usage.input+usage.cacheWrite+usage.cacheRead+usage.output;}
/** Puts a chat edit into the workspace. A document that changed while Claude worked is never overwritten unless forced. */
export function applyChatChange(workspace: Workspace, change: ChatChange, force = false, now = new Date().toISOString()): Result {
  if(change.kind==='plans') {
    const current=JSON.stringify(workspace.plans);
    if(current===change.after) return {workspace,ok:true,status:'applied'};
    if(current!==change.before && !force) return {workspace,ok:false,status:'conflict'};
    return {workspace:{...workspace,plans:JSON.parse(change.after)},ok:true,status:'applied'};
  }
  if(change.kind==='new') {
    if(workspace.notes.some(n=>n.id===change.noteId)) return {workspace,ok:true,status:'applied'};
    const folderId=workspace.folders?.some(f=>f.id===change.folderId && f.section===change.section) ? change.folderId : undefined;
    const note:Note={id:change.noteId,section:change.section!,title:change.title,body:change.after,updatedAt:now,ready:false,...(folderId ? {folderId} : {})};
    return {workspace:{...workspace,notes:[note,...workspace.notes]},ok:true,status:'applied'};
  }
  const note=workspace.notes.find(n=>n.id===change.noteId);
  if(!note) return {workspace,ok:false,status:'missing'};
  if(note.body===change.after) return {workspace,ok:true,status:'applied'};
  if(note.body!==change.before && !force) return {workspace,ok:false,status:'conflict'};
  return {workspace:{...workspace,notes:workspace.notes.map(n=>n===note ? {...n,body:change.after,updatedAt:now} : n)},ok:true,status:'applied'};
}
/** Takes an edit back, but only while the document still has exactly what the edit left there. */
export function undoChatChange(workspace: Workspace, change: ChatChange, now = new Date().toISOString()): Result {
  if(change.kind==='plans') {
    if(JSON.stringify(workspace.plans)!==change.after) return {workspace,ok:false,status:'applied'};
    return {workspace:{...workspace,plans:JSON.parse(change.before)},ok:true,status:'undone'};
  }
  const note=workspace.notes.find(n=>n.id===change.noteId);
  if(!note) return {workspace,ok:false,status:'missing'};
  if(note.body!==change.after) return {workspace,ok:false,status:'applied'};
  if(change.kind==='new') return {workspace:{...workspace,notes:workspace.notes.filter(n=>n!==note)},ok:true,status:'undone'};
  return {workspace:{...workspace,notes:workspace.notes.map(n=>n===note ? {...n,body:change.before,updatedAt:now} : n)},ok:true,status:'undone'};
}
/** What a chat sends: drawings can be large, so a whiteboard goes as just the text written on it. */
export function chatWorkspace(workspace: Workspace): {workspace:Workspace; boards:Record<string,string>} {
  const boards:Record<string,string>={};
  for(const note of workspace.notes) {
    const text=(note.scene?.elements || []).filter(e=>e?.type==='text' && !e.isDeleted && e.text).map(e=>e.text).join('\n');
    if(text) boards[note.id]=text;
  }
  return {workspace:{...workspace,notes:workspace.notes.map(({scene:_scene,...note})=>note)},boards};
}
/** The lines a change's details show: the text of a document, or one line for each plan. */
export function changeLines(change: ChatChange) {
  if(change.kind!=='plans') return lineDiff(change.before,change.after);
  const names:Record<Plan['kind'],string>={task:'Prep task',interview:'Interview',milestone:'Milestone'};
  const text=(json:string)=>(JSON.parse(json) as Plan[]).map(p=>`${names[p.kind]} · ${p.date}${p.time ? ` ${p.time}` : ''} · ${p.title}${p.done ? ' (done)' : ''}`).join('\n');
  return lineDiff(text(change.before),text(change.after));
}
