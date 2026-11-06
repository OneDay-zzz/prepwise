import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkspace,newNote,validateWorkspace,saveFolder,removeFolder,companyGroups,sortNotes,matchesNote,addTag,emptyExperience,workspaceSections,defaultSections,saveSection,moveSection,deleteSection,createSection,templates} from '../src/model.ts';
import {normalizeDisplay} from '../src/useDisplaySettings.ts';
import {noteToMarkdown,readNoteMarkdown} from '../src/note-files.ts';

test('old browser workspaces and backups remain valid without new fields',()=>{
  const old=initialWorkspace();
  assert.equal(validateWorkspace(old),old);
  assert.equal(old.notes.length,4);
  assert.equal(old.folders,undefined);
});
test('folders are scoped to a section and duplicate names are rejected',()=>{
  let w=saveFolder(initialWorkspace(),{id:'one',section:'projects',name:'  Architecture  '});
  assert.equal(w.folders[0].name,'Architecture');
  assert.throws(()=>saveFolder(w,{id:'two',section:'projects',name:'architecture'}),/already has/);
  w=saveFolder(w,{id:'two',section:'reflections',name:'Architecture'});
  assert.equal(w.folders.length,2);
});
test('renaming a folder keeps its documents attached',()=>{
  let w=saveFolder(initialWorkspace(),{id:'one',section:'projects',name:'Old name'});
  const note=w.notes.find(n=>n.section==='projects');note.folderId='one';
  w=saveFolder(w,{id:'one',section:'projects',name:'New name'});
  assert.equal(w.notes.find(n=>n.id===note.id).folderId,'one');
  assert.equal(validateWorkspace(w).folders[0].name,'New name');
});
test('deleting a folder preserves documents, diagrams, labels, and plans',()=>{
  let w=saveFolder(initialWorkspace(),{id:'one',section:'projects',name:'Projects'});
  const note=w.notes.find(n=>n.section==='projects');note.folderId='one';note.tags=['distributed systems'];note.pinned=true;
  const originalCount=w.notes.length;
  w=removeFolder(w,'one');
  assert.equal(w.notes.length,originalCount);
  const retained=w.notes.find(n=>n.id===note.id);
  assert.equal(retained.folderId,undefined);
  assert.deepEqual(retained.tags,['distributed systems']);
  assert.equal(retained.pinned,true);
  assert.equal(w.folders.length,0);
});
test('backup validation rejects cross-section folders and malformed labels',()=>{
  const w=saveFolder(initialWorkspace(),{id:'one',section:'projects',name:'Projects'});
  w.notes.find(n=>n.section==='resume').folderId='one';
  assert.throws(()=>validateWorkspace(w),/invalid folder/);
  const bad=initialWorkspace();bad.notes[0].tags=[123];
  assert.throws(()=>validateWorkspace(bad),/invalid document labels/);
});
test('company grouping ignores case and outer whitespace',()=>{
  const a=newNote('experiences');a.experience={...emptyExperience(),company:'Google'};
  const b=newNote('experiences');b.experience={...emptyExperience(),company:' google '};
  const c=newNote('experiences');
  assert.deepEqual(companyGroups([a,b,c]),[{key:'google',name:'Google',count:2},{key:'',name:'Unassigned',count:1}]);
});
test('pinning sorts older documents ahead of recent unpinned documents without mutation',()=>{
  const older={...newNote('reflections'),pinned:true,updatedAt:'2026-01-01T00:00:00Z'};
  const recent={...newNote('reflections'),updatedAt:'2026-11-01T00:00:00Z'};
  const input=[recent,older];
  assert.equal(sortNotes(input)[0].id,older.id);
  assert.equal(input[0].id,recent.id);
});
test('tags are normalized, deduplicated, and searchable',()=>{
  assert.deepEqual(addTag(['Backend'],' #backend '),['Backend']);
  assert.deepEqual(addTag([], ' #System design '),['System design']);
  assert.deepEqual(addTag([], '   '),[]);
  const note=newNote('reflections');note.tags=['System design'];
  assert.equal(matchesNote(note,'SYSTEM DESIGN'),true);
  assert.equal(matchesNote(note,'no such tag'),false);
});
test('Markdown preserves company details, tags, pins, bookmarks, title, and section',()=>{
  const note={...newNote('experiences'),title:'面经: "第一轮"',body:'# Notes\n\nHello\n',pinned:true,marked:true,tags:['算法','system design'],experience:{company:'Example Co',role:'Backend',round:'Onsite',date:'2026-11-04',sourceUrl:'https://example.com/interviews'}};
  const restored=readNoteMarkdown(noteToMarkdown(note),newNote('projects',false));
  for(const key of ['title','body','section','pinned','marked','tags','experience'])assert.deepEqual(restored[key],note[key]);
});
test('unrelated frontmatter and ordinary Markdown remain untouched',()=>{
  const body='---\ntitle: A normal note\n---\n# Content';
  const note=newNote('reflections',false);note.body=body;
  assert.equal(noteToMarkdown(note),body);
  assert.equal(readNoteMarkdown(body,newNote('projects',false)).body,body);
});
test('malformed imported metadata is rejected instead of silently discarding it',()=>{
  assert.throws(()=>readNoteMarkdown('---\nprepwise: 1\ntags: [123]\n---\nBody',newNote('projects',false)),/invalid/);
});
test('folders and new collections survive full workspace backup restoration',()=>{
  let w=saveFolder(initialWorkspace(),{id:'journal',section:'reflections',name:'Lessons learned'});
  w.notes.push({...newNote('reflections'),folderId:'journal',tags:['growth'],marked:true});
  w.notes.push({...newNote('experiences'),experience:{...emptyExperience(),company:'Example Co'}});
  const restored=validateWorkspace(JSON.parse(JSON.stringify(w)));
  assert.equal(restored.folders[0].name,'Lessons learned');
  assert.equal(restored.notes.at(-2).folderId,'journal');
  assert.equal(restored.notes.at(-1).experience.company,'Example Co');
});
test('sections are unset until customized and old notes keep validating',()=>{
  const w=initialWorkspace();
  assert.equal(w.sections,undefined);
  assert.deepEqual(workspaceSections(w).map(s=>s.id),defaultSections.map(s=>s.id));
});
test('customizing a built-in section keeps its notes and survives backup restore',()=>{
  const start=initialWorkspace();
  const projects=workspaceSections(start).find(s=>s.id==='projects');
  const w=saveSection(start,{...projects,name:'  Case studies ',icon:'rocket',color:'green',description:'Mine'});
  const restored=validateWorkspace(JSON.parse(JSON.stringify(w)));
  const saved=workspaceSections(restored).find(s=>s.id==='projects');
  assert.equal(saved.name,'Case studies');
  assert.equal(saved.icon,'rocket');
  assert.equal(restored.notes.filter(n=>n.section==='projects').length,1);
});
test('section titles are required and unique',()=>{
  const w=initialWorkspace();
  assert.throws(()=>saveSection(w,{...createSection(),name:'  '}),/title/);
  assert.throws(()=>saveSection(w,{...createSection(),name:'resume'}),/already/);
});
test('custom sections hold notes, use their template, and are rejected when unknown',()=>{
  const section={...createSection(),name:'System design',template:'# Design doc\n\nBody'};
  const w=saveSection(initialWorkspace(),section);
  const note=newNote(section.id,true,workspaceSections(w).find(s=>s.id===section.id));
  assert.equal(note.title,'Design doc');
  assert.equal(note.body,'# Design doc\n\nBody');
  w.notes.push(note);
  assert.equal(validateWorkspace(w),w);
  assert.throws(()=>validateWorkspace({...w,sections:undefined}),/invalid note/);
});
test('an unchanged built-in template stays unset so its note title is preserved',()=>{
  const start=initialWorkspace();
  const projects=workspaceSections(start).find(s=>s.id==='projects');
  const w=saveSection(start,{...projects,template:templates.projects.body});
  const saved=workspaceSections(w).find(s=>s.id==='projects');
  assert.equal(saved.template,undefined);
  assert.equal(newNote('projects',true,saved).title,templates.projects.title);
});
test('sections reorder within bounds',()=>{
  const start=initialWorkspace();
  const w=moveSection(start,'behavioral',-1);
  assert.deepEqual(workspaceSections(w).slice(0,2).map(s=>s.id),['behavioral','resume']);
  assert.equal(moveSection(w,'behavioral',-1),w);
});
test('deleting a custom section moves its notes and removes its folders',()=>{
  const section={...createSection(),name:'Temp'};
  let w=saveSection(initialWorkspace(),section);
  w=saveFolder(w,{id:'f',section:section.id,name:'Sub'});
  const note={...newNote(section.id,false),folderId:'f'};
  w.notes.push(note);
  assert.throws(()=>deleteSection(w,section.id),/Choose/);
  assert.throws(()=>deleteSection(w,section.id,section.id),/Choose/);
  const next=deleteSection(w,section.id,'reflections');
  const moved=next.notes.find(n=>n.id===note.id);
  assert.equal(moved.section,'reflections');
  assert.equal(moved.folderId,undefined);
  assert.equal(next.folders.length,0);
  assert.equal(validateWorkspace(next),next);
});
test('backup validation rejects malformed and route-colliding sections',()=>{
  const good=workspaceSections(initialWorkspace())[0];
  for(const bad of [[{...good,id:'overview'}],[good,good],[{...good,name:''}],[{...good,color:'url(x)'}],'nope'])
    assert.throws(()=>validateWorkspace({...initialWorkspace(),sections:bad}),/invalid sections/);
});
test('a section added in a later version still appears for saved layouts',()=>{
  const only=[workspaceSections(initialWorkspace()).find(s=>s.id==='leetcode')];
  assert.equal(workspaceSections({sections:only}).length,defaultSections.length);
  assert.equal(workspaceSections({sections:only})[0].id,'leetcode');
});
test('Markdown reopened into a custom section stays valid and keeps its section',()=>{
  const section={...createSection(),name:'System design'};
  const known=workspaceSections(saveSection(initialWorkspace(),section));
  const note={...newNote(section.id,false),body:'x',pinned:true};
  assert.equal(readNoteMarkdown(noteToMarkdown(note),newNote('projects',false),known).section,section.id);
  assert.equal(readNoteMarkdown('---\nprepwise: 1\npinned: true\n---\nBody',newNote(section.id,false),known).section,section.id);
});
test('display settings fall back and clamp',()=>{
  assert.deepEqual(normalizeDisplay(null),{interface:100,document:100});
  assert.deepEqual(normalizeDisplay({interface:9999,document:1}),{interface:150,document:80});
  assert.deepEqual(normalizeDisplay({interface:'big',document:NaN}),{interface:100,document:100});
});
test('gallery files validate, follow a deleted section, and old workspaces need none',()=>{
  const section={...createSection(),name:'Temp'};
  const base=saveSection(initialWorkspace(),section);
  const file={id:'abc-1',section:section.id,name:'a.pdf',type:'application/pdf',size:3,addedAt:'2026-11-04T00:00:00Z'};
  const w={...base,uploads:[file]};
  assert.equal(validateWorkspace(w),w);
  assert.throws(()=>deleteSection(w,section.id),/Choose/);
  assert.equal(deleteSection(w,section.id,'projects').uploads[0].section,'projects');
  for(const bad of [{...file,id:'../x'},{...file,section:'gone'},{...file,name:''},{...file,size:-1},'x'])
    assert.throws(()=>validateWorkspace({...base,uploads:[bad]}),/invalid uploaded files/);
  assert.throws(()=>validateWorkspace({...base,uploads:[file,file]}),/invalid uploaded files/);
});

test('layout settings fall back safely and keep the windows in range', async () => {
  const { clampRatio, defaultLayout, normalizeLayout } = await import('../src/layout-settings.ts');
  assert.deepEqual(normalizeLayout(null), defaultLayout);
  assert.deepEqual(normalizeLayout({docs:'grid',ratio:'wide',second:{id:7,mode:'zoom'}}), defaultLayout);
  const saved = normalizeLayout({sidebarCollapsed:true,listCollapsed:true,docs:'rows',ratio:.9,second:{id:'n1',mode:'board'}});
  assert.deepEqual(saved, {space:'default',sidebarCollapsed:true,listCollapsed:true,detailsOpen:false,outlineOpen:true,outlineWidth:null,chatOpen:{first:false,second:false,workspace:false},chatWidth:null,docs:'rows',ratio:.75,sidebarWidth:null,listWidth:null,second:{id:'n1',mode:'board'},noteSort:defaultLayout.noteSort,noteViews:{},lastView:'preview'});
  assert.deepEqual(normalizeLayout({noteSort:{key:'colour',direction:'asc'}}).noteSort,defaultLayout.noteSort);
  assert.deepEqual(normalizeLayout({noteSort:{key:'title',direction:'asc'}}).noteSort,{key:'title',direction:'asc'});
  assert.equal(clampRatio(.1), .25);
  assert.equal(normalizeLayout({sidebarWidth:20,listWidth:9999}).sidebarWidth,180);
  assert.equal(normalizeLayout({sidebarWidth:20,listWidth:9999}).listWidth,560);
  assert.equal(normalizeLayout({sidebarWidth:'wide'}).sidebarWidth,null);
});

test('dragging a tab arranges the document windows', async () => {
  const { arrangeDrop, dropZoneAt, withoutView } = await import('../src/layout-settings.ts');
  const box = {left:100,top:100,width:400,height:400};
  assert.equal(dropZoneAt(110,300,box),'left');
  assert.equal(dropZoneAt(490,300,box),'right');
  assert.equal(dropZoneAt(300,110,box),'top');
  assert.equal(dropZoneAt(300,490,box),'bottom');
  assert.equal(dropZoneAt(300,300,box),'center');
  assert.equal(withoutView('split','preview'),'edit');
  assert.equal(withoutView('board','board'),'preview');

  const a = {id:'a',mode:'edit'};
  const single = {target:0,from:0,docs:'one',first:a,second:null};
  assert.deepEqual(arrangeDrop({...single,zone:'right',view:{id:'a',mode:'board'}}),{docs:'columns',first:a,second:{id:'a',mode:'board'},focused:1});
  assert.deepEqual(arrangeDrop({...single,zone:'top',view:{id:'a',mode:'board'}}),{docs:'rows',first:{id:'a',mode:'board'},second:a,focused:0});
  // Pulling out the view a window was showing leaves that window with a different one.
  assert.deepEqual(arrangeDrop({...single,zone:'right',view:{id:'a',mode:'edit'}}).first,{id:'a',mode:'preview'});
  assert.deepEqual(arrangeDrop({...single,first:{id:'a',mode:'split'},zone:'left',view:{id:'a',mode:'preview'}}),{docs:'columns',first:{id:'a',mode:'preview'},second:{id:'a',mode:'edit'},focused:0});
  assert.deepEqual(arrangeDrop({...single,zone:'center',view:{id:'a',mode:'board'}}),{docs:'one',first:{id:'a',mode:'board'},second:null,focused:0});

  const b = {id:'b',mode:'preview'};
  const double = {docs:'columns',first:a,second:b};
  // Docking moves the dragged window and leaves the other document untouched.
  assert.deepEqual(arrangeDrop({...double,from:0,target:0,zone:'right',view:{id:'a',mode:'edit'}}),{docs:'columns',first:b,second:{id:'a',mode:'edit'},focused:1});
  assert.deepEqual(arrangeDrop({...double,from:1,target:1,zone:'top',view:{id:'b',mode:'board'}}),{docs:'rows',first:{id:'b',mode:'board'},second:a,focused:0});
  // Dragging a view the other window already shows trades them instead of losing the whiteboard.
  assert.deepEqual(arrangeDrop({docs:'rows',first:{id:'a',mode:'board'},second:{id:'a',mode:'preview'},from:0,target:0,zone:'left',view:{id:'a',mode:'preview'}}),{docs:'columns',first:{id:'a',mode:'preview'},second:{id:'a',mode:'board'},focused:0});
  // A whiteboard moved to the other window leaves the first one, so it is not open twice.
  const boards = {docs:'columns',first:{id:'a',mode:'board'},second:b};
  assert.deepEqual(arrangeDrop({...boards,from:0,target:1,zone:'center',view:{id:'a',mode:'board'}}),{docs:'columns',first:{id:'a',mode:'preview'},second:{id:'a',mode:'board'},focused:1});
});

test('notes sort by each criterion, keeping pins first and missing values last', async () => {
  const note=(id,fields)=>({...newNote('projects'),id,title:id,body:'',updatedAt:'2026-01-01T00:00:00.000Z',ready:false,...fields});
  const order=(notes,key,direction)=>sortNotes(notes,{key,direction}).map(n=>n.id).join(' ');
  const levels=[note('a',{importance:2}),note('b',{importance:5}),note('none'),note('c',{importance:1})];
  assert.equal(order(levels,'importance','desc'),'b a c none');
  assert.equal(order(levels,'importance','asc'),'c a b none');
  assert.equal(order([...levels,note('top',{pinned:true,importance:1})],'importance','desc'),'top b a c none');
  assert.equal(order([note('note 10'),note('Note 2'),note('',{title:''}),note('apple')],'title','asc').trim(),'apple Note 2 note 10');
  assert.equal(order([note('short',{body:'one'}),note('long',{body:'one two three'})],'length','desc'),'long short');
  assert.equal(order([note('no'),note('yes',{ready:true})],'ready','desc'),'yes no');
  const dated=[note('later',{experience:{...emptyExperience(),date:'2026-05-01'}}),note('undated'),note('sooner',{experience:{...emptyExperience(),date:'2026-02-01'}})];
  assert.equal(order(dated,'interview','asc'),'sooner later undated');
  // Equal values fall back to the most recently updated.
  assert.equal(order([note('old',{importance:3}),note('new',{importance:3,updatedAt:'2026-03-01T00:00:00.000Z'})],'importance','asc'),'new old');
  assert.equal(sortNotes([note('old'),note('new',{updatedAt:'2026-03-01T00:00:00.000Z'})])[0].id,'new');
});

test('importance is validated and survives a Markdown round trip', async () => {
  const { noteToMarkdown, readNoteMarkdown } = await import('../src/note-files.ts');
  const note={...newNote('projects'),title:'Kafka',body:'Text',importance:4};
  assert.equal(readNoteMarkdown(noteToMarkdown(note),{...note,importance:undefined}).importance,4);
  assert.equal(validateWorkspace({...initialWorkspace(),notes:[note]}).notes[0].importance,4);
  for(const importance of [0,6,2.5,'3']) assert.throws(()=>validateWorkspace({...initialWorkspace(),notes:[{...note,importance}]}),/importance/);
});

test('image paths with spaces become standard Markdown for the Live editor', async () => {
  const { bracketImagePaths, linkNoteImages } = await import('../src/note-images.ts');
  assert.equal(bracketImagePaths('![pic](a/my pic.png) and ![ok](b.png)'),'![pic](<a/my pic.png>) and ![ok](b.png)');
  assert.equal(bracketImagePaths('![pic](my pic (1).png "Title")'),'![pic](<my pic (1).png> "Title")');
  assert.equal(bracketImagePaths('![pic](<a b.png>)'),'![pic](<a b.png>)');
  const literal='`![pic](a b.png)`\n```\n![pic](a b.png)\n```';
  assert.equal(bracketImagePaths(literal),literal);
  const upload={id:'u1',section:'projects',name:'my pic.png',type:'image/png',size:1,addedAt:''};
  assert.equal(linkNoteImages('![p](<a/my pic.png>)','projects',[upload]),'![p](prepwise-upload:u1)');
});

test('built-in sections can be deleted and brought back', async () => {
  const { restoreSection } = await import('../src/model.ts');
  const w={...initialWorkspace(),notes:[{...newNote('resume'),id:'r',folderId:'f'},newNote('projects')],folders:[{id:'f',section:'resume',name:'Old'}]};
  assert.throws(()=>deleteSection(w,'resume'),/Choose/);
  const next=deleteSection(w,'resume','projects');
  assert.ok(!workspaceSections(next).some(s=>s.id==='resume'));
  assert.equal(next.notes.find(n=>n.id==='r').section,'projects');
  assert.equal(next.notes.find(n=>n.id==='r').folderId,undefined);
  assert.equal(next.folders.length,0);
  // A saved list leaves it out, so the deleted section has to stay deleted through a reload and a backup.
  assert.ok(!workspaceSections(validateWorkspace(JSON.parse(JSON.stringify(next)))).some(s=>s.id==='resume'));
  assert.throws(()=>validateWorkspace({...next,removedSections:'resume'}),/sections/);
  assert.equal(workspaceSections(restoreSection(next,'resume')).at(-1).id,'resume');
  // The last remaining section can't be deleted.
  let only={...initialWorkspace(),notes:[]};
  for(const s of defaultSections.slice(1)) only=deleteSection(only,s.id);
  assert.equal(workspaceSections(only).length,1);
  assert.throws(()=>deleteSection(only,defaultSections[0].id),/at least one/);
});

test('documents move and copy across sections', async () => {
  const { copyNoteToSection, moveNoteToSection } = await import('../src/model.ts');
  const note={...newNote('projects'),id:'n',title:'Kafka',folderId:'old',tags:['a'],importance:4,scene:{elements:[{id:'e'}],appState:{},files:{}}};
  const w={...initialWorkspace(),notes:[note],folders:[{id:'old',section:'projects',name:'Old'},{id:'new',section:'leetcode',name:'New'}],plans:[{id:'p',noteId:'n'}]};
  const moved=moveNoteToSection(w,'n','leetcode','new').notes[0];
  assert.equal(moved.section,'leetcode');
  assert.equal(moved.folderId,'new');
  assert.equal(moved.updatedAt,note.updatedAt);
  // A folder from another section can't come along.
  assert.equal(moveNoteToSection(w,'n','leetcode','old').notes[0].folderId,undefined);
  assert.equal(moveNoteToSection(w,'n','leetcode').notes[0].folderId,undefined);

  const copied=copyNoteToSection(w,'n','leetcode');
  assert.equal(copied.notes.length,2);
  assert.equal(copied.notes[1],note);
  const copy=copied.notes[0];
  assert.notEqual(copy.id,'n');
  assert.deepEqual([copy.section,copy.title,copy.importance,copy.tags],['leetcode','Kafka',4,['a']]);
  assert.notEqual(copy.scene.elements,note.scene.elements);
  assert.deepEqual(copy.scene.elements,note.scene.elements);
  assert.equal(copied.plans[0].noteId,'n');
  assert.equal(copyNoteToSection(w,'n','projects').notes[0].title,'Kafka (copy)');
  assert.equal(copyNoteToSection(w,'missing','projects'),w);
});

test('search across sections ranks title matches first', async () => {
  const { searchNotes } = await import('../src/model.ts');
  const note=(id,title,body,updatedAt)=>({...newNote('projects'),id,title,body,updatedAt});
  const notes=[note('a','Pipeline','about kafka','2026-03-01'),note('b','Kafka basics','','2026-01-01'),note('c','Other','','2026-02-01')];
  assert.deepEqual(searchNotes(notes,'KAFKA').map(n=>n.id),['b','a']);
  assert.deepEqual(searchNotes(notes,'  ').map(n=>n.id),['a','c','b']);
  assert.deepEqual(searchNotes(notes,'missing'),[]);
});

test('gallery PDFs are recognized by type, or by name when the type is unknown', async () => {
  const { formatFileSize, isPdfFile } = await import('../src/model.ts');
  assert.ok(isPdfFile({name:'paper',type:'application/pdf'}));
  assert.ok(isPdfFile({name:'Paper.PDF',type:''}));
  assert.ok(isPdfFile({name:'paper.pdf',type:'application/octet-stream'}));
  assert.ok(!isPdfFile({name:'page.pdf',type:'text/html'}));
  assert.ok(!isPdfFile({name:'photo.png',type:'image/png'}));
  assert.equal(formatFileSize(2048),'2 KB');
  assert.equal(formatFileSize(3*1024*1024),'3.0 MB');
});

test('reordering notes keeps others in place, leaves updatedAt alone, and survives validation',async()=>{
  const {reorderNotes}=await import('../src/model.ts');
  const make=(id,extra={})=>({...newNote('leetcode',false),id,title:id,updatedAt:`2026-01-0${id.charCodeAt(0)-96}T00:00:00.000Z`,...extra});
  const w={...initialWorkspace(),notes:[make('a'),make('b'),make('c',{folderId:undefined}),make('d'),{...newNote('resume',false),id:'other'}]};
  const updated={key:'updated',direction:'desc'},manual={key:'manual',direction:'asc'};
  const shown=x=>sortNotes(x.notes.filter(n=>n.section==='leetcode'),manual).map(n=>n.id).join('');
  // On screen by last updated: d c b a. Seeds My order from what the user sees.
  const moved=reorderNotes(w,['a'],'d',false,updated);
  assert.equal(shown(moved),'adcb');
  assert.equal(moved.notes.find(n=>n.id==='a').updatedAt,w.notes.find(n=>n.id==='a').updatedAt);
  assert.equal(moved.notes.find(n=>n.id==='other').order,undefined,'other sections are not numbered');
  assert.doesNotThrow(()=>validateWorkspace(moved));
  assert.equal(shown(reorderNotes(moved,['d','b'],'a',false,manual)),'dbac','several notes move together, in display order');
  assert.equal(shown(reorderNotes(moved,['b'],'c',true,manual)),'adcb','no-op');
  assert.equal(reorderNotes(moved,['b'],'c',true,manual),moved,'a drop that changes nothing returns the same workspace');
  assert.equal(reorderNotes(moved,['a'],'a',false,manual),moved,'dropping on itself changes nothing');
  // A new note has no order, so it is on top. Pins still come first.
  const withNew={...moved,notes:[...moved.notes,make('e')]};
  assert.equal(shown(withNew),'eadcb');
  const pinned={...moved,notes:moved.notes.map(n=>n.id==='c'?{...n,pinned:true}:n)};
  assert.equal(shown(pinned),'cadb');
  assert.throws(()=>validateWorkspace({...moved,notes:moved.notes.map(n=>n.id==='a'?{...n,order:'x'}:n)}),/invalid note/);
});
test('folders stay alphabetical until reordered, and new ones go last',async()=>{
  const {foldersIn,reorderFolders,moveNoteToSection:move}=await import('../src/model.ts');
  const folders=[{id:'z',section:'leetcode',name:'Zebra'},{id:'a',section:'leetcode',name:'Apple'},{id:'m',section:'leetcode',name:'Mango'},{id:'x',section:'resume',name:'Other'}];
  const w={...initialWorkspace(),folders};
  const names=x=>foldersIn(x.folders,'leetcode').map(f=>f.id).join('');
  assert.equal(names(w),'amz');
  const moved=reorderFolders(w,'z','a',false);
  assert.equal(names(moved),'zam');
  assert.deepEqual(moved.folders.map(f=>f.id),['z','a','m','x'],'stored order is untouched, so generated file paths stay stable');
  assert.equal(moved.folders.find(f=>f.id==='x').order,undefined);
  assert.equal(names(reorderFolders(moved,'z','m',true)),'amz');
  assert.equal(reorderFolders(moved,'z','x',false),moved,'folders cannot cross sections');
  const added={...moved,folders:[...moved.folders,{id:'b',section:'leetcode',name:'Banana'}]};
  assert.equal(names(added),'zamb');
  assert.doesNotThrow(()=>validateWorkspace(added));
  assert.throws(()=>validateWorkspace({...w,folders:[{...folders[0],order:'1'}]}),/invalid folders/);
  const note={...newNote('leetcode',false),id:'n',order:3};
  assert.equal(move({...w,notes:[note]},'n','resume').notes[0].order,undefined,'a note starts fresh in a new section');
});

test('adding a whiteboard picture to a document',async()=>{
  const {addDrawing,boardSelection,drawingFileName}=await import('../src/whiteboard-export.ts');
  const {findNoteUpload}=await import('../src/note-images.ts');
  const elements=[{id:'box'},{id:'label',containerId:'box'},{id:'frame'},{id:'inside',frameId:'frame'},{id:'other'}];
  assert.deepEqual(boardSelection(elements,{box:true}).map(e=>e.id),['box','label'],'a shape keeps its label');
  assert.deepEqual(boardSelection(elements,{frame:true}).map(e=>e.id),['frame','inside'],'a frame keeps its contents');
  assert.deepEqual(boardSelection(elements,{}),[]);
  const upload=name=>({id:'drawing-1',section:'leetcode',name,type:'image/svg+xml',size:1,addedAt:'2026-01-01T00:00:00.000Z'});
  assert.equal(drawingFileName('Two pointers: part (1)!','leetcode',[]),'Two-pointers-part-1-drawing.svg');
  assert.equal(drawingFileName('算法 笔记','leetcode',[]),'算法-笔记-drawing.svg');
  assert.equal(drawingFileName('','leetcode',[]),'whiteboard-drawing.svg');
  assert.equal(drawingFileName('Heap','leetcode',[upload('HEAP-drawing.svg'),upload('Heap-drawing-2.svg')]),'Heap-drawing-3.svg');
  assert.equal(drawingFileName('Heap','resume',[upload('Heap-drawing.svg')]),'Heap-drawing.svg','each section has its own names');
  const note={...newNote('leetcode',false),id:'n',body:'# Heap\n\ntext\n\n',updatedAt:'2020-01-01T00:00:00.000Z'};
  const inFolder={...newNote('leetcode',false),id:'f',body:'',folderId:'x'};
  const w={...initialWorkspace(),notes:[note,inFolder],folders:[{id:'x',section:'leetcode',name:'X'}]};
  const file=upload('Heap-drawing.svg');
  const next=addDrawing(w,'n',file,'2026-01-01T00:00:00.000Z');
  assert.equal(next.notes[0].body,'# Heap\n\ntext\n\n![Drawing](_gallery/Heap-drawing.svg)\n');
  assert.equal(next.notes[0].updatedAt,'2026-01-01T00:00:00.000Z');
  assert.deepEqual(next.uploads,[file]);
  assert.doesNotThrow(()=>validateWorkspace(next));
  assert.equal(findNoteUpload('_gallery/Heap-drawing.svg','leetcode',next.uploads),file,'the app finds it by name');
  assert.equal(addDrawing(w,'f',file).notes[1].body,'![Drawing](../_gallery/Heap-drawing.svg)\n','a note in a folder links up one level');
  assert.equal(addDrawing(w,'gone',file),w);
});
