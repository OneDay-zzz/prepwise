import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpace, DEFAULT_SPACE, defaultSections, deleteSection, deleteSpace, initialWorkspace, matchesNote, moveSection, newDocTab, newNote, noteWordCount, saveSection, searchNotes, saveSpace, spaceSections, validateWorkspace, workspaceSections, workspaceSpaces } from '../src/model.ts';
import { noteExtension, noteToMarkdown } from '../src/note-files.ts';
import { applyChatChange, chatWorkspace, undoChatChange } from '../src/doc-chat-model.ts';
import { importedDocument, parseCsv, pasteCells, squareRows, toCsv } from '../src/doc-formats.ts';
import { documentFolders, uploadPaths, workspaceFiles } from '../server/workspace-files.mjs';

const plan=(extra={})=>({id:crypto.randomUUID(),kind:'task',title:'A',date:'2026-11-05',time:'09:00',duration:60,company:'',round:'',notes:'',noteId:'',done:false,...extra});

test('a workspace from before this feature is unchanged and opens as the original one', () => {
  const old=initialWorkspace();
  const before=JSON.stringify(old);
  assert.equal(JSON.stringify(validateWorkspace(old)),before);
  assert.deepEqual(workspaceSpaces(old).map(s=>s.id),[DEFAULT_SPACE]);
  assert.equal(spaceSections(old,DEFAULT_SPACE).length,defaultSections.length);
});

test('existing document paths stay the same when a workspace is added', () => {
  const old=initialWorkspace();
  const paths=w=>workspaceFiles(w).filter(f=>w===old || old.notes.some(n=>n.id===f.noteId)).map(f=>f.path).sort();
  const {workspace}=createSpace(old,'Gym','green','fitness');
  assert.deepEqual(paths(workspace),paths(old));
});

test('a new workspace gets its own sections, starter documents, and folder', () => {
  const {workspace,id,section}=createSpace(initialWorkspace(),'Gym','green','fitness');
  validateWorkspace(workspace);
  const mine=spaceSections(workspace,id);
  assert.deepEqual(mine.map(s=>s.name),['Training plan','Diet','Progress']);
  assert.equal(section,mine[0].id);
  assert.equal(spaceSections(workspace,DEFAULT_SPACE).length,defaultSections.length);
  const files=workspaceFiles(workspace).map(f=>f.path);
  assert.ok(files.includes('documents/Gym/Training plan/Weekly split.csv'),files.join('\n'));
  assert.ok(files.includes('documents/Gym/Progress/Log.csv'));
  assert.equal(documentFolders(workspace).get('Gym/Diet').section,mine[1].id);
});

test('a workspace named like a top-level section can’t share its folder', () => {
  const {workspace,id}=createSpace(initialWorkspace(),'Resume','green','blank');
  const dirs=[...documentFolders(workspace).keys()];
  const mine=[...documentFolders(workspace)].find(([,p])=>p.section===spaceSections(workspace,id)[0].id)[0];
  assert.notEqual(mine.split('/')[0],spaceSections(workspace,DEFAULT_SPACE)[0].name.split('/')[0]+'x');
  assert.equal(new Set(dirs.map(d=>d.toLowerCase())).size,dirs.length);
  assert.ok(!dirs.includes('Resume'));
});

test('sections can share a name across workspaces, but not within one', () => {
  const {workspace,id}=createSpace(initialWorkspace(),'Gym','green','fitness');
  const shared=saveSection(workspace,{...spaceSections(workspace,id)[1],name:'Resume'});
  assert.ok(spaceSections(shared,id).some(s=>s.name==='Resume'));
  assert.throws(()=>saveSection(shared,{...spaceSections(shared,id)[0],name:'Resume'}),/already has that title/);
});

test('moving a section skips over other workspaces', () => {
  const a=createSpace(initialWorkspace(),'Gym','green','fitness');
  const b=createSpace(a.workspace,'Trips','blue','travel');
  const last=spaceSections(b.workspace,DEFAULT_SPACE).at(-1);
  assert.equal(moveSection(b.workspace,last.id,1),b.workspace);
  const [first,second]=spaceSections(b.workspace,a.id);
  assert.deepEqual(spaceSections(moveSection(b.workspace,second.id,-1),a.id).slice(0,2).map(s=>s.id),[second.id,first.id]);
});

test('a workspace keeps at least one section', () => {
  const {workspace,id}=createSpace(initialWorkspace(),'Notes','blue','blank');
  assert.throws(()=>deleteSection(workspace,spaceSections(workspace,id)[0].id),/at least one/);
});

test('deleting a workspace removes only what is in it, and clears links to it', () => {
  const {workspace,id,section}=createSpace(initialWorkspace(),'Gym','green','fitness');
  const mine=newNote(section,false);
  const start={...workspace,notes:[mine,...workspace.notes],folders:[{id:'f',section,name:'Old'}],uploads:[{id:'u',section,name:'a.png',type:'image/png',size:1,addedAt:new Date().toISOString()}],plans:[plan({space:id}),plan({noteId:mine.id}),plan()]};
  const next=deleteSpace(start,id);
  validateWorkspace(next);
  assert.deepEqual(workspaceSpaces(next).map(s=>s.id),[DEFAULT_SPACE]);
  assert.equal(next.notes.length,initialWorkspace().notes.length);
  assert.equal(next.plans.length,2);
  assert.equal(next.plans[0].noteId,'');
  assert.equal(next.folders.length,0);
  assert.equal(next.uploads.length,0);
  assert.throws(()=>deleteSpace(next,DEFAULT_SPACE),/renamed/);
});

test('the original workspace can be renamed, and a name can’t be used twice', () => {
  const renamed=saveSpace(initialWorkspace(),{...workspaceSpaces(initialWorkspace())[0],name:'Job hunt'});
  assert.equal(workspaceSpaces(renamed)[0].name,'Job hunt');
  assert.equal(workspaceSpaces(renamed).length,1);
  validateWorkspace(renamed);
  assert.throws(()=>createSpace(renamed,'job hunt','green','blank'),/already has that name/);
  assert.throws(()=>createSpace(renamed,'  ','green','blank'),/name/);
});

test('backups reject broken workspaces', () => {
  const base=initialWorkspace();
  assert.throws(()=>validateWorkspace({...base,spaces:[{id:'x',name:'',color:'green',icon:'book'}]}),/invalid workspaces/);
  assert.throws(()=>validateWorkspace({...base,sections:[{...defaultSections[0],space:'nope'}]}),/doesn’t exist/);
  assert.throws(()=>validateWorkspace({...base,plans:[plan({space:'nope'})]}));
  assert.throws(()=>validateWorkspace({...base,notes:[{...base.notes[0],format:'xlsx'}]}),/format/);
  validateWorkspace({...base,plans:[plan({kind:'event'})]});
});

test('text and table documents save as themselves, with no metadata', () => {
  const note={...newNote('resume',false),title:'Log',body:'a,b\n',format:'table',pinned:true,tags:['x']};
  assert.equal(noteExtension(note),'.csv');
  assert.equal(noteToMarkdown(note),'a,b\n');
  assert.equal(noteExtension({format:'text'}),'.txt');
  assert.equal(noteExtension({}),'.md');
  const files=workspaceFiles({...initialWorkspace(),notes:[note]});
  assert.ok(files.some(f=>f.path==='documents/Resume/Log.csv' && f.noteId===note.id));
  assert.equal(uploadPaths(initialWorkspace()).size,0);
});

test('CSV survives quotes, commas, newlines, and Chinese', () => {
  const rows=[['Name','Note'],['a,b','say "hi"'],['line\nbreak','中文'],['  padded','']];
  assert.deepEqual(parseCsv(toCsv(rows)),rows);
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'),[['a','b'],['1','2']]);
  assert.deepEqual(parseCsv('﻿a,b'),[['a','b']]);
  assert.deepEqual(parseCsv(''),[]);
  assert.deepEqual(parseCsv('a,\n,b'),[['a',''],['','b']]);
});

test('table helpers keep every row the same width', () => {
  assert.deepEqual(squareRows([['a'],['b','c']]),[['a',''],['b','c']]);
  assert.deepEqual(squareRows([]),[['']]);
  assert.deepEqual(pasteCells([['a','b']],0,1,[['1','2'],['3','4']]),[['a','1','2'],['','3','4']]);
});

test('importing picks the format from the file type', () => {
  assert.deepEqual(importedDocument('plan.md','# Hi'),{title:'plan',body:'# Hi'});
  assert.deepEqual(importedDocument('notes.TXT','x'),{title:'notes',format:'text',body:'x'});
  assert.deepEqual(importedDocument('lifts.csv','a,b\n'),{title:'lifts',format:'table',body:'a,b\n'});
  assert.deepEqual(importedDocument('lifts.tsv','a\tb,c\n'),{title:'lifts',format:'table',body:'a,"b,c"'});
  assert.equal(importedDocument('deck.pptx','x'),null);
  assert.equal(workspaceSections(initialWorkspace()).length,defaultSections.length);
});

test('a document with no extra tabs is stored as before, and its tabs save as files beside it', () => {
  const base=newNote('resume',false);
  assert.deepEqual(Object.keys(base).includes('tabs'),false);
  const table=newDocTab({...base,title:'Plan'},'table');
  assert.equal(table.name,'Table');
  const note={...base,title:'Plan',body:'# Plan',tabs:[table,{id:'b1',name:'Sketch',kind:'board',body:'',scene:{elements:[{type:'text',text:'hi'}],appState:{},files:{}}},{id:'t1',name:'A/B',kind:'text',body:'x'}]};
  validateWorkspace({...initialWorkspace(),notes:[note]});
  const files=workspaceFiles({...initialWorkspace(),notes:[note]}).map(f=>[f.path,f.tabId]);
  assert.ok(files.some(([p,id])=>p==='documents/Resume/Plan.md' && !id));
  assert.ok(files.some(([p,id])=>p==='documents/Resume/Plan - Table.csv' && id===table.id));
  assert.ok(files.some(([p])=>p==='documents/Resume/Plan - Sketch.excalidraw'));
  assert.ok(files.some(([p,id])=>/Plan - A.B\.txt$/.test(p) && id==='t1'));
});

test('tab names don’t repeat, and a new tab can’t collide with a document of that name', () => {
  const note={...newNote('resume',false),title:'Plan',tabs:[{id:'a',name:'Table',kind:'table',body:''}]};
  assert.equal(newDocTab(note,'table').name,'Table 2');
  assert.equal(newDocTab(note,'note').name,'Note 2');
  assert.equal(newDocTab({...note,tabName:'Overview'},'note').name,'Note');
  const clash={...newNote('resume',false),title:'Plan - Table',body:'other'};
  const paths=workspaceFiles({...initialWorkspace(),notes:[note,clash]}).map(f=>f.path);
  assert.equal(new Set(paths.map(p=>p.toLowerCase())).size,paths.length);
});

test('search and word counts include every tab', () => {
  const note={...newNote('resume',false),title:'Plan',body:'one two',tabs:[{id:'a',name:'Lifts',kind:'table',body:'squat,100\n'},{id:'b',name:'Sketch',kind:'board',body:''}]};
  assert.equal(noteWordCount(note),3);
  assert.ok(matchesNote(note,'squat'));
  assert.equal(searchNotes([note],'squat').length,1);
});

test('backups reject broken tabs', () => {
  const base=initialWorkspace();
  const bad=tabs=>({...base,notes:[{...base.notes[0],tabs}]});
  assert.throws(()=>validateWorkspace(bad('x')),/tab/);
  assert.throws(()=>validateWorkspace(bad([{id:'a',name:'',kind:'note',body:''}])),/tab/);
  assert.throws(()=>validateWorkspace(bad([{id:'a',name:'A',kind:'pdf',body:''}])),/tab/);
  assert.throws(()=>validateWorkspace(bad([{id:'a',name:'A',kind:'note',body:''},{id:'a',name:'B',kind:'note',body:''}])),/tab/);
});

test('chat changes to a tab apply, conflict, and undo on that tab alone', () => {
  const note={...newNote('resume',false),id:'n',body:'main',tabs:[{id:'a',name:'Lifts',kind:'table',body:'x\n'}]};
  const start={...initialWorkspace(),notes:[note]};
  const change={kind:'edit',noteId:'n',tabId:'a',title:'t',before:'x\n',after:'y\n'};
  const done=applyChatChange(start,change);
  assert.equal(done.status,'applied');
  assert.equal(done.workspace.notes[0].tabs[0].body,'y\n');
  assert.equal(done.workspace.notes[0].body,'main');
  assert.equal(undoChatChange(done.workspace,change).workspace.notes[0].tabs[0].body,'x\n');
  const edited={...start,notes:[{...note,tabs:[{...note.tabs[0],body:'mine'}]}]};
  assert.equal(applyChatChange(edited,change).status,'conflict');
  assert.equal(applyChatChange({...start,notes:[{...note,tabs:[]}]},change).status,'missing');
});

test('chat is sent tab text but not drawings', () => {
  const note={...newNote('resume',false),id:'n',tabs:[{id:'b',name:'S',kind:'board',body:'',scene:{elements:[{type:'text',text:'written'}],appState:{},files:{}}}]};
  const {workspace,boards}=chatWorkspace({...initialWorkspace(),notes:[note]});
  assert.equal(boards.n,'written');
  assert.equal(workspace.notes[0].tabs[0].scene,undefined);
});
