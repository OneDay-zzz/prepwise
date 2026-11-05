import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDocumentMirror } from '../server/local-documents.mjs';
import { initialWorkspace, newNote } from '../src/model.ts';

function setup() {
  const base=mkdtempSync(path.join(tmpdir(),'mirror-'));
  const uploadsDirectory=path.join(base,'uploads');mkdirSync(uploadsDirectory);
  const directory=path.join(base,'documents');
  return {directory,uploadsDirectory,mirror:createDocumentMirror({directory,uploadsDirectory}),at:(...p)=>path.join(directory,...p)};
}
const workspaceWith=(...notes)=>({...initialWorkspace(),notes});
const note=(title,body='hello',extra={})=>({...newNote('leetcode',false),title,body,...extra});
const replaced=at=>{const dir=at('.replaced');if(!existsSync(dir))return [];return readdirSync(dir,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>readFileSync(path.join(e.parentPath,e.name),'utf8'));};

test('writes each note as a Markdown file in its section',async()=>{
  const {mirror,at}=setup();
  const result=await mirror.sync(workspaceWith(note('Heap','# Heap')));
  assert.equal(readFileSync(at('LeetCode notes','Heap.md'),'utf8'),'# Heap');
  assert.equal(result.written,1);
});
test('saving again without changes writes nothing',async()=>{
  const {mirror}=setup();
  const w=workspaceWith(note('Heap'));
  await mirror.sync(w);
  assert.equal((await mirror.sync(w)).written,0);
});
test('renaming or deleting a note does the same to its file, and removes an empty folder',async()=>{
  const {mirror,at}=setup();
  const n=note('Heap');
  await mirror.sync(workspaceWith(n));
  await mirror.sync(workspaceWith({...n,title:'Stack'}));
  assert.equal(existsSync(at('LeetCode notes','Heap.md')),false);
  assert.equal(existsSync(at('LeetCode notes','Stack.md')),true);
  await mirror.sync(workspaceWith());
  assert.equal(existsSync(at('LeetCode notes')),false);
});
test('a change of case in a title keeps the file',async()=>{
  const {mirror,at}=setup();
  const n=note('heap');
  await mirror.sync(workspaceWith(n));
  await mirror.sync(workspaceWith({...n,title:'Heap'}));
  assert.deepEqual(readdirSync(at('LeetCode notes')),['Heap.md']);
});
test('never removes a file it did not write',async()=>{
  const {mirror,at}=setup();
  await mirror.sync(workspaceWith(note('Heap')));
  writeFileSync(at('LeetCode notes','mine.txt'),'keep');
  await mirror.sync(workspaceWith());
  assert.equal(readFileSync(at('LeetCode notes','mine.txt'),'utf8'),'keep');
});
test('sets aside a file edited outside the app before replacing or removing it',async()=>{
  const {mirror,at}=setup();
  const n=note('Heap','one');
  await mirror.sync(workspaceWith(n));
  writeFileSync(at('LeetCode notes','Heap.md'),'edited by hand');
  const result=await mirror.sync(workspaceWith({...n,body:'two'}));
  assert.equal(result.setAside,1);
  assert.equal(readFileSync(at('LeetCode notes','Heap.md'),'utf8'),'two');
  assert.deepEqual(replaced(at),['edited by hand']);
  writeFileSync(at('LeetCode notes','Heap.md'),'edited again');
  await mirror.sync(workspaceWith());
  assert.deepEqual(replaced(at).sort(),['edited again','edited by hand']);
});
test('sets aside an existing file of its own that a new note would replace',async()=>{
  const {mirror,at}=setup();
  mkdirSync(at('LeetCode notes'),{recursive:true});
  writeFileSync(at('LeetCode notes','Heap.md'),'already here');
  await mirror.sync(workspaceWith(note('Heap','new')));
  assert.deepEqual(replaced(at),['already here']);
});
test('another browser address does not replace the files until asked',async()=>{
  const {mirror,at}=setup();
  await mirror.sync(workspaceWith(note('Real')),{owner:'http://localhost:5173'});
  const other=await mirror.sync(workspaceWith(note('Other')),{owner:'http://127.0.0.1:5173'});
  assert.equal(other.ignored,true);
  assert.equal(existsSync(at('LeetCode notes','Real.md')),true);
  assert.equal(existsSync(at('LeetCode notes','Other.md')),false);
  await mirror.sync(workspaceWith(note('Other')),{owner:'http://127.0.0.1:5173',takeOver:true});
  assert.equal(existsSync(at('LeetCode notes','Real.md')),false);
  assert.equal(existsSync(at('LeetCode notes','Other.md')),true);
});
test('copies gallery files, reports ones not available yet, and removes deleted ones',async()=>{
  const {mirror,at,uploadsDirectory}=setup();
  const upload={id:'file-1',section:'leetcode',name:'a.png',type:'image/png',size:1,addedAt:'2026-11-04T00:00:00.000Z'};
  const w={...workspaceWith(),uploads:[upload]};
  assert.equal((await mirror.sync(w)).waiting,1);
  writeFileSync(path.join(uploadsDirectory,'file-1'),'png');
  await mirror.sync(w);
  assert.equal(readFileSync(at('LeetCode notes','_gallery','a.png'),'utf8'),'png');
  await mirror.sync(workspaceWith());
  assert.equal(existsSync(at('LeetCode notes','_gallery','a.png')),false);
});
test('a drawing is saved next to its note',async()=>{
  const {mirror,at}=setup();
  await mirror.sync(workspaceWith(note('Heap','x',{scene:{elements:[{id:'a',type:'rectangle'}],appState:{},files:{}}})));
  assert.equal(existsSync(at('LeetCode notes','Heap.excalidraw')),true);
});
