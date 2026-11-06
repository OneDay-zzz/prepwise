import { STARTER_TABLE } from './doc-formats.ts';

export type Section = string;
export type Experience = { company: string; role: string; round: string; date: string; sourceUrl: string };
export type DocumentFolder = {id:string; section:Section; name:string; order?:number};
export type NoteFormat = 'text' | 'table';
export type DocTabKind = 'note' | 'text' | 'table' | 'board';
export type DocTab = { id: string; name: string; kind: DocTabKind; body: string; scene?: Note['scene'] };
// A document's first tab is its body and scene, so a document with no other tabs is stored exactly as before.
export type Note = { tabs?: DocTab[]; tabName?: string; format?: NoteFormat; order?: number; folderId?: string; pinned?: boolean; marked?: boolean; tags?: string[]; importance?: number; experience?: Experience; id: string; section: Section; title: string; body: string; updatedAt: string; ready: boolean; scene?: { elements: readonly any[]; appState: Record<string, any>; files: Record<string, any> } };
export type Resume = { name: string; data: string; type: string; size: number };
export type Plan = { space?: string; id: string; kind: 'task' | 'interview' | 'milestone' | 'event'; title: string; date: string; time: string; duration: number; company: string; round: string; notes: string; noteId: string; done: boolean };
export type UploadedFile = { id: string; section: Section; name: string; type: string; size: number; addedAt: string };
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export type SectionConfig = { space?: string; id: Section; name: string; short: string; description: string; color: string; icon: string; hidden?: boolean; template?: string };
// `sections` is only stored once customized, so older workspaces and backups stay valid.
export type SpaceConfig = { id: string; name: string; color: string; icon: string };
export type Workspace = { version: 1; spaces?: SpaceConfig[]; uploads?: UploadedFile[]; sections?: SectionConfig[]; removedSections?: Section[]; folders?: DocumentFolder[]; notes: Note[]; plans: Plan[]; resume?: Resume };
export const sectionColors = ['purple','orange','blue','rose','amber','green'];
export const defaultSections: SectionConfig[] = [
  { id: 'resume', name: 'Resume', short: 'Your first impression', description: 'Refine your experience and tell a clear story.', color: 'purple', icon: 'file-text' },
  { id: 'behavioral', name: 'Behavioral questions', short: 'Stories that resonate', description: 'Turn your experiences into memorable answers.', color: 'orange', icon: 'message-square' },
  { id: 'projects', name: 'Project deep dives', short: 'Know every trade-off', description: 'Explore architecture, decisions, and impact.', color: 'blue', icon: 'folder-kanban' },
  { id: 'experiences', name: 'Company experiences', short: 'A playbook for every company', description: 'Collect interview questions, rounds, and takeaways by company.', color: 'rose', icon: 'building' },
  { id: 'reflections', name: 'Reflections', short: 'A little room to think', description: 'Capture insights, lessons, and anything on your mind.', color: 'amber', icon: 'pen-line' },
  { id: 'leetcode', name: 'LeetCode notes', short: 'Patterns over problems', description: 'Build a playbook of approaches that stick.', color: 'green', icon: 'code' },
];
export const templates: Record<Section, { title: string; body: string }> = {
  reflections: {title:'A moment to reflect', body:'# A moment to reflect\n\n## What’s on my mind\n\nWrite freely. This space is yours.\n\n## What I learned\n\nCapture an insight, a surprising detail, or a lesson worth remembering.\n\n## What I’ll try next\n\n- Add a small next step.\n'},
  experiences: { title: 'Interview experience', body: '# Interview experience\n\n## Overview\n\nSummarize the role, interview process, and where this experience came from.\n\n## Interview rounds\n\n| Round | Format | Topics |\n| --- | --- | --- |\n| 1 | Add format | Add topics |\n\n## Questions asked\n\n- Add the question, constraints, and follow-up questions.\n\n## Approaches and takeaways\n\nWhat worked? What would you prepare differently?\n\n## My preparation checklist\n\n- [ ] Review the recurring topics\n- [ ] Practice the questions\n- [ ] Prepare relevant project and behavioral stories\n\n## Source notes\n\nRecord context, publication date, and anything you still need to verify.\n' },
  resume: { title: 'My resume talking points', body: '# My resume talking points\n\nA clear introduction connects your experience to your next opportunity.\n\n## My 60-second introduction\n\n- **Present:** What do I work on today?\n- **Past:** What experiences brought me here?\n- **Future:** What am I looking for next?\n\n## Experience highlights\n\nFor each role, capture the problem, your contribution, and a measurable result.\n\n## Questions to prepare for\n\n- Which accomplishment am I most proud of?\n- Why am I interested in this role?\n- What would I like to learn next?\n\n## Final checklist\n\n- [ ] Tailor the resume to the role\n- [ ] Check dates, links, and contact details\n- [ ] Practice a concise introduction\n' },
  behavioral: { title: 'A story about ownership', body: '# A story about ownership\n\n> Tell me about a time you took ownership of a difficult problem.\n\n## Situation\n\nSet the context. What was at stake, and who was involved?\n\n## Task\n\nWhat were you personally responsible for?\n\n## Action\n\nDescribe the specific steps you took and why. Focus on your contribution.\n\n1. Identify the underlying problem.\n2. Explain the options you considered.\n3. Describe how you brought others along.\n\n## Result\n\nWhat changed? Include concrete outcomes where possible.\n\n## Reflection\n\nWhat did you learn, and what would you do differently?\n\n---\n\n**Practice prompt:** Tell this story in two minutes, then prepare for follow-up questions.\n' },
  projects: { title: 'Project deep dive template', body: '# Project deep dive\n\n## The problem\n\nWho was this for, and what problem did it solve?\n\n## My role\n\nDescribe your ownership, team, and timeline.\n\n## Architecture\n\nOpen the **Whiteboard** tab to draw the system and its data flow.\n\n## Key decisions\n\n| Decision | Alternatives | Trade-off |\n| --- | --- | --- |\n| Add your decision | What else did you consider? | Why was this the right fit? |\n\n## The hardest challenge\n\nExplain a technical obstacle, how you diagnosed it, and how you resolved it.\n\n## Impact\n\n- What improved for users?\n- How did you measure success?\n- What would you change at 10× scale?\n\n## Follow-up questions\n\n- Where are the bottlenecks?\n- How does the system handle failure?\n- What would you build differently today?\n' },
  leetcode: { title: 'Two pointers pattern', body: '# Two pointers\n\n## When to use it\n\nUse two positions to scan a sequence when their movement can eliminate unnecessary work. Common examples include sorted arrays, palindromes, and in-place partitioning.\n\n## Core idea\n\nMove one or both pointers according to a condition. Explain why each move safely narrows the search.\n\n```python\ndef has_pair_with_sum(nums, target):\n    # Assumes nums is sorted in ascending order.\n    left, right = 0, len(nums) - 1\n    while left < right:\n        total = nums[left] + nums[right]\n        if total == target:\n            return True\n        if total < target:\n            left += 1\n        else:\n            right -= 1\n    return False\n```\n\n## Complexity\n\n- **Time:** O(n) for an already sorted array\n- **Extra space:** O(1)\n\n## Edge cases\n\n- [ ] Empty input or a single element\n- [ ] Duplicate values\n- [ ] Negative numbers\n- [ ] No valid answer\n\n## Practice log\n\nAdd problem links, mistakes, and takeaways here. Use the whiteboard to trace pointer movement.\n' },
};
function sectionTemplate(section: Section, config?: SectionConfig) {
  if(config?.template === undefined) return templates[section] || {title:'Untitled note',body:''};
  return {title:config.template.match(/^#\s+(.+)$/m)?.[1].trim() || 'Untitled note',body:config.template};
}
const targetFolder=(workspace:Workspace,section:Section,folderId?:string)=>workspace.folders?.some(f=>f.id===folderId && f.section===section) ? folderId : undefined;
/** Moves a note to a section. Folders belong to one section, so it only keeps a folder chosen in the new one. */
export function moveNoteToSection(workspace:Workspace,id:string,section:Section,folderId?:string): Workspace {
  return {...workspace,notes:workspace.notes.map(n=>n.id===id ? {...n,section,order:undefined,folderId:targetFolder(workspace,section,folderId)} : n)};
}
type NotePartInput={title:string;body:string;group?:string};
export type NotePartPlan={kind:'new'|'fill'|'same'|'another';existing?:Note};
const textLines=(body:string)=>new Set(body.split('\n').map(line=>line.replace(/^\s*#+\s*/,'').trim()).filter(Boolean));
/** What a part does when the section already has a document with its name. Nothing already written is changed. */
export function planNotePart(notes:Note[],note:Note,part:NotePartInput):NotePartPlan {
  const name=part.title.trim().toLocaleLowerCase();
  const existing=notes.find(n=>n.id!==note.id && n.section===note.section && n.title.trim().toLocaleLowerCase()===name);
  if(!existing) return {kind:'new'};
  if(!existing.body.trim()) return {kind:'fill',existing};
  const lines=textLines(existing.body);
  return {kind:[...textLines(part.body)].every(line=>lines.has(line)) ? 'same' : 'another',existing};
}
/** Adds documents cut from a note, right after it. Groups become folders, reusing one with the same name. */
export function addNoteParts(workspace:Workspace,id:string,parts:NotePartInput[]): Workspace {
  const index=workspace.notes.findIndex(n=>n.id===id);
  if(index<0) return workspace;
  const note=workspace.notes[index];
  const folders=[...(workspace.folders || [])];
  const folderFor=(group:string|undefined,fallback:string|undefined)=>{
    if(!group) return fallback;
    const existing=folders.find(f=>f.section===note.section && f.name.toLocaleLowerCase()===group.toLocaleLowerCase());
    if(existing) return existing.id;
    const folder:DocumentFolder={id:crypto.randomUUID(),section:note.section,name:group};
    folders.push(folder);
    return folder.id;
  };
  const now=Date.now();
  const changed=new Map<string,Note>();
  const added:Note[]=[];
  parts.forEach((part,i)=>{
    const {kind,existing}=planNotePart(workspace.notes,note,part);
    // A millisecond apart, so sorting by last updated keeps the original order.
    const updatedAt=new Date(now-i).toISOString();
    if(existing && kind==='fill') {changed.set(existing.id,{...existing,body:part.body,folderId:folderFor(part.group,existing.folderId),updatedAt});return;}
    if(existing && kind==='same') {changed.set(existing.id,{...existing,folderId:folderFor(part.group,existing.folderId)});return;}
    const {scene:_scene,pinned:_pinned,marked:_marked,...kept}=structuredClone(note);
    added.push({...kept,id:crypto.randomUUID(),title:part.title,body:part.body,folderId:folderFor(part.group,note.folderId),ready:false,updatedAt});
  });
  const notes=workspace.notes.map(n=>changed.get(n.id) || n);
  return {...workspace,folders,notes:[...notes.slice(0,index+1),...added,...notes.slice(index+1)]};
}
/** Adds an independent copy, including its whiteboard. Links from plans stay on the original. */
export function copyNoteToSection(workspace:Workspace,id:string,section:Section,folderId?:string): Workspace {
  const note=workspace.notes.find(n=>n.id===id);
  if(!note) return workspace;
  const copy:Note={...structuredClone(note),order:undefined,id:crypto.randomUUID(),section,folderId:targetFolder(workspace,section,folderId),title:note.section===section ? `${note.title || 'Untitled note'} (copy)` : note.title,updatedAt:new Date().toISOString()};
  return {...workspace,notes:[copy,...workspace.notes]};
}
export const isPdfFile = (file: Pick<UploadedFile,'name'|'type'>) => file.type==='application/pdf' || ((!file.type || file.type==='application/octet-stream') && /\.pdf$/i.test(file.name));
export const formatFileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export function saveSpace(workspace:Workspace, space:SpaceConfig): Workspace {
  const name=space.name.trim();
  if(!name) throw new Error('Give your workspace a name.');
  const current=workspaceSpaces(workspace);
  if(current.some(s=>s.id!==space.id && s.name.toLocaleLowerCase()===name.toLocaleLowerCase())) throw new Error('Another workspace already has that name.');
  const next={...space,name};
  return {...workspace,spaces:current.some(s=>s.id===space.id) ? current.map(s=>s.id===space.id ? next : s) : [...current,next]};
}
type StarterSection = {name:string; short:string; description:string; icon:string; color:string; template:string; first?:{title:string; format?:NoteFormat; body:string}};
const blankTemplate='# New note\n\n## Summary\n\nWhat is this note about?\n\n## Details\n\nAdd the specifics worth remembering.\n';
export const spaceStarters: {id:string; name:string; icon:string; color:string; sections:StarterSection[]}[] = [
  {id:'blank',name:'Blank',icon:'book',color:'blue',sections:[{name:'Notes',short:'Anything worth keeping',description:'Start here, and add more sections as you need them.',icon:'book',color:'blue',template:blankTemplate}]},
  {id:'fitness',name:'Working out',icon:'dumbbell',color:'green',sections:[
    {name:'Training plan',short:'What to lift and when',description:'Your weekly split, programs, and exercise notes.',icon:'dumbbell',color:'green',template:'# Workout\n\n## Focus\n\nWhat is this session for?\n\n## Exercises\n\n| Exercise | Sets | Reps | Weight |\n| --- | --- | --- | --- |\n|  |  |  |  |\n\n## Notes\n\nHow did it feel?\n',first:{title:'Weekly split',format:'table',body:'Day,Focus,Exercises,Notes\nMonday,,,\nTuesday,,,\nWednesday,,,\nThursday,,,\nFriday,,,\nSaturday,,,\nSunday,,,\n'}},
    {name:'Diet',short:'What you eat',description:'Meal plans, recipes, and nutrition targets.',icon:'utensils',color:'orange',template:'# Meal plan\n\n## Targets\n\nCalories and protein for the day.\n\n## Meals\n\n- Breakfast:\n- Lunch:\n- Dinner:\n- Snacks:\n'},
    {name:'Progress',short:'How it’s going',description:'Body weight, lifts, and photos over time.',icon:'trophy',color:'amber',template:'# Check-in\n\n## This week\n\nWhat went well, and what to change?\n',first:{title:'Log',format:'table',body:'Date,Body weight,Notes\n,,\n'}},
  ]},
  {id:'travel',name:'Travel',icon:'plane',color:'blue',sections:[
    {name:'Trips',short:'Where you’re going',description:'Itineraries, bookings, and plans for each trip.',icon:'plane',color:'blue',template:'# Trip\n\n## Dates\n\n## Bookings\n\n## Day by day\n\n### Day 1\n'},
    {name:'Ideas',short:'Places to see someday',description:'Destinations, restaurants, and things to try.',icon:'compass',color:'rose',template:'# Place\n\n## Why go\n\n## What to see\n'},
    {name:'Checklists',short:'Nothing left behind',description:'Packing lists and things to do before you leave.',icon:'checklist',color:'green',template:'# Checklist\n\n- [ ] Passport\n- [ ] Chargers\n',first:{title:'Packing list',format:'table',body:'Item,Packed,Notes\n,,\n'}},
  ]},
  {id:'work',name:'Work',icon:'briefcase',color:'orange',sections:[
    {name:'Projects',short:'What you’re building',description:'Plans, decisions, and status for each project.',icon:'folder-kanban',color:'orange',template:'# Project\n\n## Goal\n\n## Status\n\n## Decisions\n\n## Next steps\n\n- [ ] \n'},
    {name:'Meetings',short:'What was said',description:'Agendas, notes, and follow-ups.',icon:'users',color:'blue',template:'# Meeting\n\n## Agenda\n\n## Notes\n\n## Follow-ups\n\n- [ ] \n'},
    {name:'Reference',short:'Worth finding again',description:'How-tos, contacts, and anything you look up often.',icon:'book',color:'purple',template:blankTemplate},
  ]},
];
/** Adds a workspace with a starter's sections. Returns its id, so the app can open it. */
export function createSpace(workspace:Workspace, name:string, color:string, starterId:string, now=new Date().toISOString()):{workspace:Workspace; id:string; section:Section} {
  const starter=spaceStarters.find(s=>s.id===starterId) || spaceStarters[0];
  const id=`space-${crypto.randomUUID()}`;
  const withSpace=saveSpace(workspace,{id,name,color,icon:starter.icon});
  const added=starter.sections.map(s=>({section:{id:`section-${crypto.randomUUID()}`,space:id,name:s.name,short:s.short,description:s.description,icon:s.icon,color:s.color,template:s.template} as SectionConfig,first:s.first}));
  const notes:Note[]=added.flatMap(({section,first})=>first ? [{id:crypto.randomUUID(),section:section.id,title:first.title,body:first.body,updatedAt:now,ready:false,...(first.format ? {format:first.format} : {})}] : []);
  return {id,section:added[0].section.id,workspace:{...withSpace,sections:[...workspaceSections(workspace),...added.map(a=>a.section)],notes:[...notes,...workspace.notes]}};
}
/** Removes a workspace and everything in it. The original can't be removed, since older data belongs to it. */
export function deleteSpace(workspace:Workspace, id:string): Workspace {
  if(id===DEFAULT_SPACE) throw new Error('This workspace can be renamed, but not deleted.');
  const sections=workspaceSections(workspace);
  const gone=new Set(sections.filter(s=>sectionSpace(s)===id).map(s=>s.id));
  const removedNotes=new Set(workspace.notes.filter(n=>gone.has(n.section)).map(n=>n.id));
  return {...workspace,
    spaces:workspaceSpaces(workspace).filter(s=>s.id!==id),
    sections:sections.filter(s=>!gone.has(s.id)),
    folders:workspace.folders?.filter(f=>!gone.has(f.section)),
    uploads:workspace.uploads?.filter(u=>!gone.has(u.section)),
    notes:workspace.notes.filter(n=>!removedNotes.has(n.id)),
    plans:workspace.plans.filter(p=>planSpace(p)!==id).map(p=>removedNotes.has(p.noteId) ? {...p,noteId:''} : p),
  };
}
export function newNote(section: Section, template = true, config?: SectionConfig): Note {
  const content = template ? sectionTemplate(section,config) : {title:'Untitled note',body:''};
  return { id: crypto.randomUUID(), section, title: content.title, body: content.body, updatedAt: new Date().toISOString(), ready: false };
}
export function initialWorkspace(): Workspace { return { version: 1, notes: defaultSections.filter(s => s.id !== 'experiences' && s.id !== 'reflections').map(s => newNote(s.id)), plans: [] }; }
export function localDate(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
/** Whole calendar days from `today` to `date`; negative once the date has passed. */
export function daysUntil(date: string, today = localDate()): number { const day = (value: string) => { const [y, m, d] = value.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((day(date) - day(today)) / 86400000); }
export function milestoneStatus(plan: Pick<Plan, 'date' | 'done'>, today = localDate()): string {
  if (plan.done) return 'Finished';
  const days = daysUntil(plan.date, today);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return days > 0 ? `${days} days left` : `${-days} ${days === -1 ? 'day' : 'days'} overdue`;
}
export function calendarDays(year: number, month: number): Date[] { const first = new Date(year, month, 1); const offset = (first.getDay() + 6) % 7; return Array.from({ length: 42 }, (_, i) => new Date(year, month, i - offset + 1)); }
const reservedRoutes=['overview','planner','calendar'];
// Built-ins missing from a saved list are appended so a section added in a later version still appears.
export function workspaceSections(workspace: Pick<Workspace,'sections'|'removedSections'>): SectionConfig[] {
  const saved=workspace.sections || [];
  return [...saved,...defaultSections.filter(d=>!saved.some(s=>s.id===d.id) && !workspace.removedSections?.includes(d.id))];
}
// Everything made before workspaces existed has no space set, and belongs to this one.
export const DEFAULT_SPACE = 'default';
export const defaultSpace: SpaceConfig = {id:DEFAULT_SPACE,name:'Interview',color:'purple',icon:'briefcase'};
export const sectionSpace = (section: Pick<SectionConfig,'space'>) => section.space || DEFAULT_SPACE;
export const planSpace = (plan: Pick<Plan,'space'>) => plan.space || DEFAULT_SPACE;
export function workspaceSpaces(workspace: Pick<Workspace,'spaces'>): SpaceConfig[] {
  const saved=workspace.spaces || [];
  return saved.some(s=>s.id===DEFAULT_SPACE) ? saved : [defaultSpace,...saved];
}
export function spaceSections(workspace: Pick<Workspace,'sections'|'removedSections'>, space: string) { return workspaceSections(workspace).filter(s=>sectionSpace(s)===space); }
export function validateWorkspace(value: unknown): Workspace {
  const w = value as Workspace;
  if (!w || w.version !== 1 || !Array.isArray(w.notes) || !Array.isArray(w.plans)) throw new Error('This is not a Prepwise backup.');
  if(w.sections !== undefined && !Array.isArray(w.sections)) throw new Error('The backup contains invalid sections.');
  if(w.spaces !== undefined && !Array.isArray(w.spaces)) throw new Error('The backup contains invalid workspaces.');
  const spaceIds=new Set<string>([DEFAULT_SPACE]);
  const seenSpaces=new Set<string>();
  for(const s of w.spaces || []) {
    if(!s || typeof s.id!=='string' || !s.id || seenSpaces.has(s.id) || typeof s.name!=='string' || !s.name.trim() || !sectionColors.includes(s.color) || typeof s.icon!=='string') throw new Error('The backup contains invalid workspaces.');
    seenSpaces.add(s.id);spaceIds.add(s.id);
  }
  const seenSections=new Set<string>();
  for(const s of w.sections || []) {
    if(!s || typeof s.id!=='string' || !s.id || seenSections.has(s.id) || reservedRoutes.includes(s.id) || !['name','short','description','icon'].every(key=>typeof s[key as keyof SectionConfig]==='string') || !s.name.trim() || !sectionColors.includes(s.color) || (s.hidden!==undefined && typeof s.hidden!=='boolean') || (s.template!==undefined && typeof s.template!=='string')) throw new Error('The backup contains invalid sections.');
    if(s.space!==undefined && !spaceIds.has(s.space)) throw new Error('A section points to a workspace that doesn’t exist.');
    seenSections.add(s.id);
  }
  if(w.removedSections !== undefined && (!Array.isArray(w.removedSections) || w.removedSections.some(id=>typeof id!=='string'))) throw new Error('The backup contains invalid sections.');
  const knownSections=new Set(workspaceSections(w).map(s=>s.id));
  if(w.folders !== undefined && !Array.isArray(w.folders)) throw new Error('The backup contains invalid folders.');
  const folderIds=new Set<string>();
  for(const folder of w.folders || []) {
    if(!folder || typeof folder.id!=='string' || !folder.id || folderIds.has(folder.id) || !knownSections.has(folder.section) || typeof folder.name!=='string' || !folder.name.trim() || (folder.order!==undefined && !Number.isFinite(folder.order))) throw new Error('The backup contains invalid folders.');
    folderIds.add(folder.id);
  }
  const ids = new Set<string>();
  for (const n of w.notes) {
    if (!n || typeof n.id !== 'string' || ids.has(n.id) || !knownSections.has(n.section) || typeof n.title !== 'string' || typeof n.body !== 'string' || typeof n.ready !== 'boolean' || !Number.isFinite(Date.parse(n.updatedAt))) throw new Error('The backup contains an invalid note.');
    if (n.scene && (!Array.isArray(n.scene.elements) || !n.scene.appState || !n.scene.files)) throw new Error('The backup contains an invalid whiteboard.');
    if (n.pinned !== undefined && typeof n.pinned !== 'boolean' || n.marked !== undefined && typeof n.marked !== 'boolean' || n.tags !== undefined && (!Array.isArray(n.tags) || n.tags.some(t => typeof t !== 'string'))) throw new Error('The backup contains invalid document labels.');
    if (n.importance !== undefined && (!Number.isInteger(n.importance) || (n.importance as number) < 1 || (n.importance as number) > 5)) throw new Error('The backup contains an invalid importance level.');
    if (n.experience !== undefined && (!n.experience || typeof n.experience !== 'object' || !['company','role','round','date','sourceUrl'].every(key => typeof n.experience![key as keyof Experience] === 'string'))) throw new Error('The backup contains invalid company details.');
    if(n.tabName !== undefined && (typeof n.tabName!=='string' || !n.tabName.trim())) throw new Error('The backup contains an invalid document tab.');
    if(n.tabs !== undefined) {
      if(!Array.isArray(n.tabs)) throw new Error('The backup contains an invalid document tab.');
      const tabIds=new Set<string>();
      for(const tab of n.tabs) {
        if(!tab || typeof tab.id!=='string' || !tab.id || tabIds.has(tab.id) || typeof tab.name!=='string' || !tab.name.trim() || !['note','text','table','board'].includes(tab.kind) || typeof tab.body!=='string') throw new Error('The backup contains an invalid document tab.');
        if(tab.scene && (!Array.isArray(tab.scene.elements) || !tab.scene.appState || !tab.scene.files)) throw new Error('The backup contains an invalid whiteboard.');
        tabIds.add(tab.id);
      }
    }
    if(n.format !== undefined && n.format!=='text' && n.format!=='table') throw new Error('The backup contains an unknown document format.');
    if(n.order !== undefined && !Number.isFinite(n.order)) throw new Error('The backup contains an invalid note.');
    if(n.folderId !== undefined && (typeof n.folderId!=='string' || !(w.folders || []).some(f=>f.id===n.folderId && f.section===n.section))) throw new Error('A note points to an invalid folder.');
    ids.add(n.id);
  }
  const planIds = new Set<string>();
  for (const p of w.plans) {
    if (!p || typeof p.id !== 'string' || planIds.has(p.id) || !['task', 'interview', 'milestone', 'event'].includes(p.kind) || (p.space!==undefined && !spaceIds.has(p.space)) || !['title','date','time','company','round','notes','noteId'].every(key => typeof p[key as keyof Plan] === 'string') || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || localDate(new Date(`${p.date}T12:00:00`)) !== p.date || (p.time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)) || !Number.isFinite(p.duration) || p.duration <= 0 || typeof p.done !== 'boolean') throw new Error('The backup contains an invalid plan.');
    planIds.add(p.id);
  }
  if(w.uploads !== undefined && !Array.isArray(w.uploads)) throw new Error('The backup contains invalid uploaded files.');
  const uploadIds=new Set<string>();
  for(const u of w.uploads || []) {
    if(!u || typeof u.id!=='string' || !/^[A-Za-z0-9-]{1,64}$/.test(u.id) || uploadIds.has(u.id) || !knownSections.has(u.section) || typeof u.name!=='string' || !u.name || typeof u.type!=='string' || !Number.isFinite(u.size) || u.size<0 || !Number.isFinite(Date.parse(u.addedAt))) throw new Error('The backup contains invalid uploaded files.');
    uploadIds.add(u.id);
  }
  if (w.resume && (typeof w.resume.name !== 'string' || typeof w.resume.type !== 'string' || typeof w.resume.size !== 'number' || typeof w.resume.data !== 'string' || !/^data:[^,]*;base64,/.test(w.resume.data))) throw new Error('The backup contains an invalid resume.');
  return w;
}

export const emptyExperience = (): Experience => ({company:'', role:'', round:'', date:'', sourceUrl:''});
export const companyKey = (value: string) => value.trim().toLocaleLowerCase();
export function companyGroups(notes: Note[]) {
  const groups = new Map<string,{key:string;name:string;count:number}>();
  for(const n of notes.filter(n=>n.section==='experiences')) {
    const name=n.experience?.company.trim() || 'Unassigned';
    const key=companyKey(n.experience?.company || '');
    const group=groups.get(key);
    if(group) group.count++; else groups.set(key,{key,name,count:1});
  }
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
export const noteSortKeys = ['manual','updated','importance','title','length','ready','interview'] as const;
export type NoteSortKey = typeof noteSortKeys[number];
export type NoteSortDirection = 'asc' | 'desc';
export type NoteSort = {key: NoteSortKey; direction: NoteSortDirection};
export const defaultNoteSort: NoteSort = {key:'updated',direction:'desc'};
export function noteWordCount(note: Note) {
  const count=(text:string)=>text.trim() ? text.trim().split(/\s+/).length : 0;
  return (note.tabs || []).reduce((total,tab)=>total+count(tab.body),count(note.body));
}
const tabNames:Record<DocTabKind,string>={note:'Note',text:'Text',table:'Table',board:'Whiteboard'};
export const mainTabName=(note:Pick<Note,'tabName'|'format'>)=>note.tabName || tabNames[note.format || 'note'];
export function newDocTab(note:Note, kind:DocTabKind):DocTab {
  const taken=new Set([mainTabName(note),...(note.tabs || []).map(tab=>tab.name)].map(name=>name.toLocaleLowerCase()));
  let name=tabNames[kind];
  for(let n=2;taken.has(name.toLocaleLowerCase());n++) name=`${tabNames[kind]} ${n}`;
  return {id:crypto.randomUUID(),name,kind,body:kind==='table' ? STARTER_TABLE : ''};
}
/** Each criterion's value, or undefined for a note without one. Those notes stay last in either direction. */
function compareBy(key: NoteSortKey, a: Note, b: Note): number | undefined {
  switch(key) {
    case 'manual': return (a.order ?? -1)-(b.order ?? -1);
    case 'updated': return a.updatedAt.localeCompare(b.updatedAt);
    case 'length': return noteWordCount(a)-noteWordCount(b);
    case 'ready': return Number(a.ready)-Number(b.ready);
    case 'importance': return a.importance && b.importance ? a.importance-b.importance : undefined;
    case 'title': return a.title.trim() && b.title.trim() ? a.title.trim().localeCompare(b.title.trim(),undefined,{numeric:true,sensitivity:'base'}) : undefined;
    case 'interview': return a.experience?.date && b.experience?.date ? a.experience.date.localeCompare(b.experience.date) : undefined;
  }
}
function hasValue(key: NoteSortKey, note: Note) {
  if(key==='importance') return !!note.importance;
  if(key==='title') return !!note.title.trim();
  if(key==='interview') return !!note.experience?.date;
  return true;
}
/** Pinned notes always come first. Ties fall back to the most recently updated. */
export function sortNotes(notes: Note[], sort: NoteSort = defaultNoteSort) {
  return [...notes].sort((a,b)=>{
    const pinned=Number(!!b.pinned)-Number(!!a.pinned);
    if(pinned) return pinned;
    const missing=Number(hasValue(sort.key,b))-Number(hasValue(sort.key,a));
    if(missing) return missing;
    const order=compareBy(sort.key,a,b) || 0;
    return (sort.direction==='asc' || sort.key==='manual' ? order : -order) || b.updatedAt.localeCompare(a.updatedAt);
  });
}
/**
 * Puts notes next to a target, numbering the whole section from the order on screen so
 * filtered-out notes keep their places. Notes not yet placed sort first, so a new one is on top.
 * Returns the same workspace when nothing would change. Doesn't count as an edit, so updatedAt stays.
 */
export function reorderNotes(workspace:Workspace,ids:string[],targetId:string,after:boolean,sort:NoteSort): Workspace {
  const target=workspace.notes.find(n=>n.id===targetId);
  if(!target || ids.includes(targetId)) return workspace;
  const list=sortNotes(workspace.notes.filter(n=>n.section===target.section),sort);
  const rest=list.filter(n=>!ids.includes(n.id));
  const at=rest.indexOf(target)+(after ? 1 : 0);
  const next=[...rest.slice(0,at),...list.filter(n=>ids.includes(n.id)),...rest.slice(at)];
  if(next.every((n,i)=>n===list[i])) return workspace;
  const order=new Map(next.map((n,i)=>[n.id,i]));
  return {...workspace,notes:workspace.notes.map(n=>order.has(n.id) ? {...n,order:order.get(n.id)} : n)};
}
/** A section's folders in display order: placed ones first, then the rest alphabetically. */
export function foldersIn(folders:DocumentFolder[],section:Section) {
  return folders.filter(f=>f.section===section).sort((a,b)=>a.order!==undefined && b.order!==undefined ? a.order-b.order : a.order!==undefined ? -1 : b.order!==undefined ? 1 : a.name.localeCompare(b.name));
}
export function reorderFolders(workspace:Workspace,id:string,targetId:string,after:boolean): Workspace {
  const folders=workspace.folders || [];
  const moving=folders.find(f=>f.id===id),target=folders.find(f=>f.id===targetId);
  if(!moving || !target || id===targetId || moving.section!==target.section) return workspace;
  const rest=foldersIn(folders,target.section).filter(f=>f.id!==id);
  const at=rest.indexOf(target)+(after ? 1 : 0);
  const order=new Map([...rest.slice(0,at),moving,...rest.slice(at)].map((f,i)=>[f.id,i]));
  return {...workspace,folders:folders.map(f=>order.has(f.id) ? {...f,order:order.get(f.id)} : f)};
}
/** Title matches come first, then matches anywhere in the document. Without a query, the most recent. */
export function searchNotes(notes: Note[], query: string) {
  const term=query.trim().toLocaleLowerCase();
  const recent=[...notes].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  if(!term) return recent;
  const inTitle=(n:Note)=>n.title.toLocaleLowerCase().includes(term);
  return [...recent.filter(inTitle),...recent.filter(n=>!inTitle(n) && matchesNote(n,term))];
}
export function matchesNote(note: Note, query: string) {
  return [note.title,note.body,...(note.tabs || []).flatMap(tab=>[tab.name,tab.body]),...(note.tags || []),...Object.values(note.experience || {})].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}
export function addTag(tags: string[], value: string): string[] {
  const next=value.trim().replace(/^#+/,'').trim().slice(0,40);
  return !next || tags.some(t=>t.toLocaleLowerCase()===next.toLocaleLowerCase()) ? tags : [...tags,next];
}

export function saveFolder(workspace:Workspace, folder:DocumentFolder): Workspace {
  const name=folder.name.trim();
  if(!name) throw new Error('Give your folder a name.');
  if((workspace.folders || []).some(f=>f.id!==folder.id && f.section===folder.section && f.name.toLocaleLowerCase()===name.toLocaleLowerCase())) throw new Error('This section already has a folder with that name.');
  const folders=workspace.folders || [];
  return {...workspace,folders:folders.some(f=>f.id===folder.id) ? folders.map(f=>f.id===folder.id ? {...folder,name} : f) : [...folders,{...folder,name}]};
}
export function removeFolder(workspace:Workspace, id:string): Workspace {
  return {...workspace,folders:(workspace.folders || []).filter(f=>f.id!==id),notes:workspace.notes.map(n=>n.folderId===id ? {...n,folderId:undefined} : n)};
}

export const isBuiltInSection = (id: Section) => defaultSections.some(s=>s.id===id);
export function createSection(): SectionConfig {
  return {id:`section-${crypto.randomUUID()}`,name:'',short:'',description:'',color:'purple',icon:'book',template:'# New note\n\n## Summary\n\nWhat is this note about?\n\n## Details\n\nAdd the specifics worth remembering.\n\n## Next steps\n\n- [ ] Add a small next step.\n'};
}
export function saveSection(workspace:Workspace, section:SectionConfig): Workspace {
  const name=section.name.trim();
  if(!name) throw new Error('Give your section a title.');
  const current=workspaceSections(workspace);
  if(current.some(s=>s.id!==section.id && sectionSpace(s)===sectionSpace(section) && s.name.toLocaleLowerCase()===name.toLocaleLowerCase())) throw new Error('Another section in this workspace already has that title.');
  const next: SectionConfig={...section,name,short:section.short.trim(),description:section.description.trim()};
  // An untouched built-in template stays unset, which also keeps its original note title.
  if(next.template===templates[next.id]?.body) delete next.template;
  return {...workspace,sections:current.some(s=>s.id===next.id) ? current.map(s=>s.id===next.id ? next : s) : [...current,next]};
}
export function moveSection(workspace:Workspace, id:Section, delta:-1|1): Workspace {
  const list=[...workspaceSections(workspace)];
  const from=list.findIndex(s=>s.id===id);
  if(from<0) return workspace;
  // Sections from other workspaces can sit between these in the list, and don't count as neighbors.
  let to=from+delta;
  while(to>=0 && to<list.length && sectionSpace(list[to])!==sectionSpace(list[from])) to+=delta;
  if(to<0 || to>=list.length) return workspace;
  [list[from],list[to]]=[list[to],list[from]];
  return {...workspace,sections:list};
}
/** Brings back a deleted built-in section, with its original settings, at the end of the list. */
export function restoreSection(workspace:Workspace, id:Section): Workspace {
  return {...workspace,removedSections:workspace.removedSections?.filter(removed=>removed!==id)};
}
export function deleteSection(workspace:Workspace, id:Section, moveNotesTo?:Section): Workspace {
  const list=workspaceSections(workspace);
  const target=list.find(s=>s.id===id);
  if(target && list.filter(s=>sectionSpace(s)===sectionSpace(target)).length<=1) throw new Error('Keep at least one section.');
  const hasContent=workspace.notes.some(n=>n.section===id) || !!workspace.uploads?.some(u=>u.section===id);
  if(hasContent && (moveNotesTo===id || !list.some(s=>s.id===moveNotesTo))) throw new Error('Choose a section for this section’s notes.');
  return {...workspace,sections:list.filter(s=>s.id!==id),removedSections:isBuiltInSection(id) ? [...(workspace.removedSections || []),id] : workspace.removedSections,folders:workspace.folders?.filter(f=>f.section!==id),uploads:workspace.uploads?.map(u=>u.section===id ? {...u,section:moveNotesTo!} : u),notes:workspace.notes.map(n=>n.section===id ? {...n,section:moveNotesTo!,folderId:undefined} : n)};
}
