import test from 'node:test';
import assert from 'node:assert/strict';
import {noteOutline} from '../src/note-outline.ts';
import {normalizeLayout} from '../src/layout-settings.ts';

const texts=body=>noteOutline(body).map(h=>h.text);

test('lists headings in order with their level, indented from the top level used',()=>{
  const outline=noteOutline('## One\n\ntext\n\n### Two\n\n## Three');
  assert.deepEqual(outline.map(h=>[h.text,h.depth,h.indent]),[['One',2,0],['Two',3,1],['Three',2,0]]);
});
test('ignores # inside code and ordinary text',()=>{
  assert.deepEqual(texts('# Real\n\n```bash\n# a comment\n```\n\n~~~\n## also code\n~~~\n\n    # indented code\n\nIssue #12 and\n#hashtag'),['Real']);
});
test('finds underlined headings and headings inside quotes and lists',()=>{
  assert.deepEqual(texts('Title\n=====\n\nSub\n---\n\n> ## Quoted\n\n- ### Listed'),['Title','Sub','Quoted','Listed']);
});
test('shows heading text without Markdown formatting',()=>{
  assert.deepEqual(texts('# **Bold** and `code` and [a link](http://x.test) ![pic](a.png)'),['Bold and code and a link pic']);
});
test('an empty heading is left out but still counts for finding the others on the page',()=>{
  assert.deepEqual(noteOutline('# One\n\n#\n\n# Three').map(h=>[h.text,h.index]),[['One',0],['Three',2]]);
});
test('points at the heading in the Markdown',()=>{
  const body='intro\n\n## Topic\n\nmore';
  const [heading]=noteOutline(body);
  assert.equal(body.slice(heading.start,heading.end),'## Topic');
});
test('a note with no headings has an empty outline',()=>{
  assert.deepEqual(noteOutline(''),[]);
  assert.deepEqual(noteOutline('just text'),[]);
});
test('the table of contents starts open and remembers being closed',()=>{
  assert.equal(normalizeLayout({}).outlineOpen,true);
  assert.equal(normalizeLayout({outlineOpen:false}).outlineOpen,false);
});

import {splitLevels,splitNote,suggestedSplitLevel} from '../src/note-outline.ts';
import {addNoteParts,initialWorkspace,newNote} from '../src/model.ts';
const guide='# Guide\n\n## Summary\n\nOverview text\n\n## Topics\n\n### Heap\n\nHeap text\n\n#### Detail\n\n```bash\n# not a heading\n```\n\n### Stack\n\nStack text\n\n## Themes\n\n### LRU\n\nLRU text\n';

test('splits at a level, using grouping headings as folders and keeping headings with text as documents',()=>{
  assert.deepEqual(splitNote(guide,3,'Fallback').map(p=>[p.title,p.group]),[['Summary',undefined],['Heap','Topics'],['Stack','Topics'],['LRU','Themes']]);
});
test('moves headings up so each document starts at the top, leaving code alone',()=>{
  const heap=splitNote(guide,3,'x').find(p=>p.title==='Heap');
  assert.equal(heap.body,'# Heap\n\nHeap text\n\n## Detail\n\n```bash\n# not a heading\n```\n');
});
test('loses no text, whichever level is used',()=>{
  const words=['Overview text','Heap text','not a heading','Stack text','LRU text'];
  for(const depth of [2,3]) {
    const all=splitNote(guide,depth,'x').map(p=>p.body).join('\n');
    for(const word of words) assert.ok(all.includes(word),`${word} at level ${depth}`);
  }
});
test('text before the first heading becomes its own document under the note title',()=>{
  assert.deepEqual(splitNote('intro\n\n## A\n\na\n\n## B\n\nb',2,'My note').map(p=>p.title),['My note','A','B']);
});
test('a reference link keeps working when its definition was in another part',()=>{
  const parts=splitNote('## A\n\nsee [docs][ref]\n\n## B\n\nb\n\n[ref]: http://x.test\n',2,'x');
  assert.ok(parts[0].body.includes('[ref]: http://x.test'));
});
test('offers levels giving at least two documents and suggests the one holding the topics',()=>{
  assert.deepEqual(splitLevels(guide),[2,3,4]);
  assert.equal(suggestedSplitLevel(guide),3);
  assert.equal(suggestedSplitLevel('# T\n\n## A\n\na\n\n### a1\n\nx\n\n## B\n\nb'),2);
  assert.deepEqual(splitLevels('# Only\n\ntext'),[]);
});
test('adds the parts after the note, in new or existing folders, and keeps the original',()=>{
  const note={...newNote('leetcode',false),title:'Guide',body:guide,tags:['dsa'],importance:4,pinned:true,ready:true,scene:{elements:[{id:'a'}],appState:{},files:{}}};
  const start={...initialWorkspace(),notes:[note],folders:[{id:'f1',section:'leetcode',name:'topics'},{id:'f2',section:'projects',name:'Themes'}]};
  const next=addNoteParts(start,note.id,splitNote(guide,3,'x'));
  assert.equal(next.notes[0].id,note.id);
  assert.equal(next.notes[0].body,guide);
  assert.deepEqual(next.notes.slice(1).map(n=>n.title),['Summary','Heap','Stack','LRU']);
  const byName=Object.fromEntries(next.notes.slice(1).map(n=>[n.title,n]));
  assert.equal(byName.Heap.folderId,'f1');
  const themes=next.folders.find(f=>f.section==='leetcode' && f.name==='Themes');
  assert.equal(byName.LRU.folderId,themes.id);
  assert.equal(byName.Summary.folderId,undefined);
  assert.deepEqual(byName.Heap.tags,['dsa']);
  assert.equal(byName.Heap.importance,4);
  assert.equal(byName.Heap.scene,undefined);
  assert.equal(byName.Heap.pinned,undefined);
  assert.equal(byName.Heap.ready,false);
  assert.equal(new Set(next.notes.map(n=>n.id)).size,5);
});
test('fills an empty document with the same name, and never changes one with text',()=>{
  const note={...newNote('leetcode',false),title:'Guide',body:guide};
  const heap={...newNote('leetcode',false),title:'heap',body:'  ',tags:['mine']};
  const stack={...newNote('leetcode',false),title:'Stack',body:'# Stack\n\nStack text\n\nand my extra line'};
  const lru={...newNote('leetcode',false),title:'LRU',body:'my own rewrite'};
  const elsewhere={...newNote('projects',false),title:'Summary',body:'other section'};
  const start={...initialWorkspace(),notes:[note,heap,stack,lru,elsewhere]};
  const next=addNoteParts(start,note.id,splitNote(guide,3,'x'));
  const get=id=>next.notes.find(n=>n.id===id);
  assert.ok(get(heap.id).body.includes('Heap text'));
  assert.deepEqual(get(heap.id).tags,['mine']);
  assert.equal(next.folders.find(f=>f.id===get(heap.id).folderId).name,'Topics');
  assert.equal(get(stack.id).body,stack.body);
  assert.equal(get(stack.id).updatedAt,stack.updatedAt);
  assert.equal(next.folders.find(f=>f.id===get(stack.id).folderId).name,'Topics');
  assert.deepEqual(get(lru.id),lru);
  assert.deepEqual(get(elsewhere.id),elsewhere);
  assert.equal(next.notes.filter(n=>n.title==='LRU').length,2);
  assert.equal(next.notes.filter(n=>n.title.toLowerCase()==='heap').length,1);
  assert.equal(next.notes.filter(n=>n.title==='Summary' && n.section==='leetcode').length,1);
});
test('remembers each note\'s view and the table of contents width, ignoring bad saved values',()=>{
  const saved=normalizeLayout({noteViews:{a:'board',b:'live',c:'zoom',d:7},lastView:'edit',outlineWidth:9999});
  assert.deepEqual(saved.noteViews,{a:'board',b:'live'});
  assert.equal(saved.lastView,'edit');
  assert.equal(saved.outlineWidth,480);
  assert.equal(normalizeLayout({lastView:'zoom'}).lastView,'preview');
  assert.equal(normalizeLayout({outlineWidth:10}).outlineWidth,120);
  const many=Object.fromEntries(Array.from({length:600},(_,i)=>[`n${i}`,'edit']));
  assert.equal(Object.keys(normalizeLayout({noteViews:many}).noteViews).length,500);
});
