import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCheckpointService, gitBlobSha } from '../server/github-checkpoints.mjs';
import { uploadPaths, workspaceFiles } from '../server/workspace-files.mjs';
import { createSection, initialWorkspace, newNote, saveFolder, saveSection } from '../src/model.ts';
import { readNoteMarkdown } from '../src/note-files.ts';
import { parseDrawing } from '../src/local-files.ts';

function fakeGitHub({files={},moveConflict=false}={}) {
  const state={files:new Map(Object.entries(files).map(([k,v])=>[k,Buffer.from(v)])),commits:0,blobRequests:0,blobs:new Map(),trees:new Map(),moveConflict};
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
  const empty=()=>state.files.size===0;
  const treeId=m=>{const id=`tree${state.trees.size}`;state.trees.set(id,m);return id;};
  const fetch=async(url,options={})=>{
    const route=url.replace('https://api.github.com/repos/o/r','');
    const method=options.method||'GET';
    const body=options.body?JSON.parse(options.body):{};
    if(route==='')return reply({private:true,archived:false,default_branch:'main'});
    if(route.startsWith('/contents/workspace.json')&&method==='GET')return state.files.has('workspace.json')?reply({type:'file',sha:gitBlobSha(state.files.get('workspace.json'))}):reply({},404);
    if(route==='/contents/workspace.json'&&method==='PUT'){assert.equal(body.branch,undefined);state.files.set('workspace.json',Buffer.from(body.content,'base64'));state.commits++;return reply({content:{}});}
    if(route==='/git/ref/heads/main')return empty()?reply({},409):reply({object:{sha:'head'}});
    if(route==='/git/commits/head')return reply({tree:{sha:treeId(new Map(state.files))}});
    if(route.startsWith('/git/trees/')&&method==='GET'){const m=state.trees.get(route.split('/')[3].split('?')[0]);return reply({truncated:false,tree:[...m].map(([p,b])=>({path:p,type:'blob',sha:gitBlobSha(b)}))});}
    if(route==='/git/blobs'){state.blobRequests++;const bytes=Buffer.from(body.content,'base64');const sha=gitBlobSha(bytes);state.blobs.set(sha,bytes);return reply({sha},201);}
    if(route==='/git/trees'){const m=new Map(state.trees.get(body.base_tree));for(const e of body.tree){if(e.sha===null)m.delete(e.path);else m.set(e.path,e.content!==undefined?Buffer.from(e.content):state.blobs.get(e.sha));}return reply({sha:treeId(m)},201);}
    if(route==='/git/commits'&&method==='POST'){assert.deepEqual(body.parents,['head']);return reply({sha:`commit:${body.tree}`},201);}
    if(route==='/git/refs/heads/main'&&method==='PATCH'){if(state.moveConflict)return reply({},422);assert.equal(body.force,false);state.files=state.trees.get(body.sha.split(':')[1]);state.commits++;return reply({});}
    throw new Error(`Unexpected ${method} ${route}`);
  };
  return {state,service:createCheckpointService({repo:'o/r',token:'t',directory:mkdtempSync(path.join(tmpdir(),'prepwise-'))},{fetch})};
}
const paths=state=>[...state.files.keys()].sort();

test('blob hashes match git',()=>{assert.equal(gitBlobSha(Buffer.from('hello\n')),'ce013625030ba8dba906f756967f9e9ca394464a');});
test('workspace files follow sections and folders and keep drawings beside notes',()=>{
  let w=saveFolder(initialWorkspace(),{id:'arch',section:'projects',name:'Architecture'});
  w.notes.push({...newNote('projects',false),title:'Payments',body:'# Pay',folderId:'arch',scene:{elements:[{id:'a'}],appState:{},files:{}}});
  const listed=workspaceFiles(w).map(f=>f.path);
  assert.ok(listed.includes('documents/Project deep dives/Architecture/Payments.md'));
  assert.ok(listed.includes('documents/Project deep dives/Architecture/Payments.excalidraw'));
  assert.ok(listed.includes('documents/Resume/My resume talking points.md'));
});
test('exported files open again with their metadata and drawing',()=>{
  const w=initialWorkspace();
  const note={...newNote('reflections',false),title:'面经: "第一轮"',body:'Hello',tags:['算法'],pinned:true,scene:{elements:[{id:'a',type:'rectangle'}],appState:{},files:{}}};
  w.notes.push(note);
  const files=workspaceFiles(w);
  const md=files.find(f=>f.path.startsWith('documents/Reflections/')&&f.path.endsWith('.md'));
  assert.equal(md.path,'documents/Reflections/面经- -第一轮-.md');
  const restored=readNoteMarkdown(md.bytes.toString(),newNote('projects',false));
  assert.deepEqual(restored.tags,['算法']);
  assert.equal(restored.title,note.title);
  assert.equal(parseDrawing(files.find(f=>f.path.endsWith('.excalidraw')).bytes.toString()).elements.length,1);
});
test('titles differing only by case get stable, order-independent names',()=>{
  const a={...newNote('reflections',false),title:'Same',body:'a'},b={...newNote('reflections',false),title:'same',body:'b'};
  const list=order=>workspaceFiles({...initialWorkspace(),notes:order}).map(f=>f.path).sort();
  assert.deepEqual(list([a,b]),list([b,a]));
  assert.equal(new Set(list([a,b]).map(p=>p.toLowerCase())).size,2);
  assert.ok(list([a,b]).includes(`documents/Reflections/Same-${a.id.slice(-8)}.md`));
});
test('custom sections and blank titled notes export; a drawing-only note writes no empty Markdown',()=>{
  const section={...createSection(),name:'System / design'};
  const w=saveSection(initialWorkspace(),section);
  w.notes=[{...newNote(section.id,false),title:'',body:''},{...newNote(section.id,false),title:'Board',body:'',scene:{elements:[{id:'a'}],appState:{},files:{}}}];
  assert.deepEqual(workspaceFiles(w).map(f=>f.path),['documents/System - design/Untitled note.md','documents/System - design/Board.excalidraw']);
});
test('the first checkpoint works on an empty repository and returns the workspace.json hash',async()=>{
  const {state,service}=fakeGitHub();
  const result=await service.checkpoint(initialWorkspace(),null);
  assert.equal(result.sha,gitBlobSha(state.files.get('workspace.json')));
  assert.ok(paths(state).includes('documents/LeetCode notes/Two pointers pattern.md'));
  assert.deepEqual((await service.status()).sha,result.sha);
});
test('an unchanged workspace creates no commit',async()=>{
  const {state,service}=fakeGitHub();
  const w=initialWorkspace();
  const first=await service.checkpoint(w,null);
  const commits=state.commits;
  const second=await service.checkpoint(w,first.sha);
  assert.equal(second.sha,first.sha);
  assert.equal(state.commits,commits);
});
test('renaming and deleting notes removes old files but leaves files outside documents',async()=>{
  const {state,service}=fakeGitHub({files:{'README.md':'mine','notes/keep.md':'mine'}});
  const w=initialWorkspace();
  const first=await service.checkpoint(w,null);
  const note=w.notes.find(n=>n.section==='projects');
  const next={...w,notes:w.notes.filter(n=>n.section!=='leetcode').map(n=>n.id===note.id?{...n,title:'Renamed'}:n)};
  await service.checkpoint(next,first.sha);
  const after=paths(state);
  assert.ok(after.includes('documents/Project deep dives/Renamed.md'));
  assert.ok(!after.includes(`documents/Project deep dives/${note.title}.md`));
  assert.ok(!after.some(p=>p.startsWith('documents/LeetCode notes/')));
  assert.ok(after.includes('README.md'));
  assert.ok(after.includes('notes/keep.md'));
});
test('a binary resume uploads byte for byte through the blob endpoint',async()=>{
  const {state,service}=fakeGitHub();
  const bytes=Buffer.from([0x25,0x50,0x44,0x46,0xff,0xfe,0x00,0x80]);
  const w={...initialWorkspace(),resume:{name:'cv.pdf',type:'application/pdf',size:bytes.length,data:`data:application/pdf;base64,${bytes.toString('base64')}`}};
  await service.checkpoint(w,null);
  assert.deepEqual(state.files.get('documents/_resume/cv.pdf'),bytes);
  assert.equal(state.blobRequests>=1,true);
});
test('ordinary text uses no per-file blob requests',async()=>{
  const {state,service}=fakeGitHub({files:{'README.md':'x'}});
  const w=initialWorkspace();
  const smallEnough=Array.from({length:150},(_,i)=>({...newNote('reflections',false),title:`Note ${i}`,body:'text'}));
  await service.checkpoint({...w,notes:[...w.notes,...smallEnough]},null);
  assert.equal(state.blobRequests,0);
  assert.equal(paths(state).filter(p=>p.startsWith('documents/Reflections/')).length,150);
});
test('stale revisions and a moved branch are reported as conflicts without changing files',async()=>{
  const github=fakeGitHub();
  const first=await github.service.checkpoint(initialWorkspace(),null);
  await assert.rejects(github.service.checkpoint(initialWorkspace(),'stale'),e=>e.status===409);
  const before=paths(github.state);
  github.state.moveConflict=true;
  const w=initialWorkspace();w.notes[0].title='Changed';
  await assert.rejects(github.service.checkpoint(w,first.sha),e=>e.status===409);
  assert.deepEqual(paths(github.state),before);
});
test('gallery files are pushed by section, kept out of workspace.json, and restored',async()=>{
  const {state,service}=fakeGitHub();
  const bytes=Buffer.from([1,2,3,0xff,0xfe]);
  const id='1234567890-abc';
  const w={...initialWorkspace(),uploads:[{id,section:'projects',name:'diagram.png',type:'image/png',size:5,addedAt:'2026-11-04T00:00:00Z'}]};
  assert.deepEqual(await service.missingUploads([id]),{missing:[id]});
  await assert.rejects(service.checkpoint(w,null),e=>e.status===409);
  await service.stageUpload(id,bytes.toString('base64'));
  assert.deepEqual(await service.missingUploads([id]),{missing:[]});
  const first=await service.checkpoint(w,null);
  assert.deepEqual(state.files.get('documents/Project deep dives/_gallery/diagram.png'),bytes);
  assert.ok(!state.files.get('workspace.json').toString().includes(bytes.toString('base64')));
  const before=state.commits;
  await service.checkpoint(w,first.sha);
  assert.equal(state.commits,before);
  await service.checkpoint({...w,uploads:[]},first.sha);
  assert.ok(!paths(state).some(p=>p.includes('_gallery')));
});
test('same-named gallery files keep their extension and upload ids cannot escape the folder',async()=>{
  const {service}=fakeGitHub();
  const file=(id,name)=>({id,section:'projects',name,type:'',size:1,addedAt:'2026-11-04T00:00:00Z'});
  const names=[...uploadPaths({uploads:[file('aaaaaaaa-11111111','a.pdf'),file('aaaaaaaa-22222222','A.pdf')]}).values()];
  assert.deepEqual(names,['documents/Project deep dives/_gallery/a-11111111.pdf','documents/Project deep dives/_gallery/A-22222222.pdf']);
  await assert.rejects(service.stageUpload('../../evil','aa'),/Invalid/);
  await assert.rejects(service.missingUploads(['../x']),/Invalid/);
});
