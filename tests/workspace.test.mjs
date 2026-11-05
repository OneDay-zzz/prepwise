import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace, validateWorkspace, calendarDays, localDate, newNote } from '../src/model.ts';
import { listLocalFiles, openLocalNote, saveLocalNote, safeFilename, parseDrawing } from '../src/local-files.ts';

function directory(name, files = {}) {
  const entries = new Map();
  const root = {
    name, kind: 'directory', entries,
    async *values() { yield* entries.values(); },
    async getFileHandle(name, options) {
      if (!entries.has(name)) {
        if (!options?.create) throw new DOMException('Missing file', 'NotFoundError');
        entries.set(name, file(name, ''));
      }
      return entries.get(name);
    },
  };
  for (const [name, text] of Object.entries(files)) entries.set(name, file(name, text));
  return root;
}
function file(name, initial) {
  return {
    name, kind: 'file', text: initial, writes: 0,
    async getFile() { return new File([this.text], name); },
    async createWritable() {
      let pending;
      return { write: async content => { pending = content; }, close: async () => { this.text = pending; this.writes++; }, abort: async () => {} };
    },
  };
}
const drawing = JSON.stringify({ type:'excalidraw', version:2, elements:[], appState:{viewBackgroundColor:'#fff'}, files:{} });

test('workspace backup round-trips all four collections', () => {
  const workspace = initialWorkspace();
  assert.equal(validateWorkspace(JSON.parse(JSON.stringify(workspace))).notes.length,4);
});
test('backup rejects duplicate IDs and malformed plans', () => {
  const workspace = initialWorkspace();
  workspace.notes.push(workspace.notes[0]);
  assert.throws(() => validateWorkspace(workspace), /invalid note/);
  const invalid = initialWorkspace();
  invalid.plans.push({id:'x',kind:'interview',title:'Round one',date:'2026-02-30',time:'25:00',duration:60,company:'',round:'',notes:'',noteId:'',done:false});
  assert.throws(() => validateWorkspace(invalid), /invalid plan/);
});
test('calendar is a continuous Monday-first 42-day grid across year boundaries', () => {
  const days = calendarDays(2027,0);
  assert.equal(days.length,42);
  assert.equal(days[0].getDay(),1);
  assert.equal(localDate(days[0]),'2026-12-28');
  assert.equal(localDate(days.at(-1)),'2027-02-07');
  assert.equal(new Set(days.map(localDate)).size,42);
});
test('folder scan includes nested notes but excludes hidden files and dependencies', async () => {
  const root = directory('notes',{'a.md':'# A','b.excalidraw':drawing,'resume.pdf':'binary','.hidden.md':'hidden'});
  root.entries.set('projects',directory('projects',{'c.md':'C'}));
  root.entries.set('node_modules',directory('node_modules',{'ignore.md':'ignore'}));
  assert.deepEqual((await listLocalFiles(root)).map(x=>x.path),['a.md','b.excalidraw','projects/c.md']);
});
test('opening a note pairs Markdown with its sibling drawing', async () => {
  const root = directory('notes',{'Architecture.md':'# Diagram','Architecture.excalidraw':drawing});
  const entries = await listLocalFiles(root);
  const {note,binding} = await openLocalNote(root,entries[0],entries,'projects');
  assert.equal(note.body,'# Diagram');
  assert.equal(note.title,'Architecture');
  assert.ok(note.scene);
  assert.ok(binding.markdown);
  assert.ok(binding.drawing);
});
test('saving writes edits back to the original files and does not rename them', async () => {
  const root=directory('notes',{'Story.md':'old','Story.excalidraw':drawing});
  const entries=await listLocalFiles(root);
  const {note,binding}=await openLocalNote(root,entries[0],entries,'behavioral');
  note.body='new';note.title='Renamed display title';
  const next=await saveLocalNote(note,root,binding);
  assert.equal(root.entries.get('Story.md').text,'new');
  assert.equal(next.markdown.baseline,'new');
  assert.equal(root.entries.has('Renamed display title.md'),false);
});
test('external edits stop the entire save before any file is written', async () => {
  const root=directory('notes',{'Story.md':'old','Story.excalidraw':drawing});
  const entries=await listLocalFiles(root);
  const {note,binding}=await openLocalNote(root,entries[0],entries,'behavioral');
  note.body='edited in app';
  root.entries.get('Story.excalidraw').text='externally changed';
  await assert.rejects(saveLocalNote(note,root,binding),/changed outside/);
  assert.equal(root.entries.get('Story.md').text,'old');
  assert.equal(root.entries.get('Story.md').writes,0);
});
test('new notes do not overwrite existing filenames', async () => {
  const root=directory('notes',{'My note.md':'existing'});
  const note=newNote('projects',false);note.title='My note';note.body='new';
  await assert.rejects(saveLocalNote(note,root),/already exists/);
  assert.equal(root.entries.get('My note.md').text,'existing');
});
test('new notes create usable Markdown and native Excalidraw files', async () => {
  const root=directory('notes');
  const note=newNote('projects',false);note.title='Architecture';note.body='# System';note.scene=parseDrawing(drawing);
  const binding=await saveLocalNote(note,root);
  assert.equal(binding.markdown.entry.path,'Architecture.md');
  assert.equal(root.entries.get('Architecture.md').text,'# System');
  assert.equal(JSON.parse(root.entries.get('Architecture.excalidraw').text).type,'excalidraw');
});
test('saving a drawing-only edit does not create an empty Markdown companion', async () => {
  const root=directory('notes',{'Only.excalidraw':drawing});
  const entries=await listLocalFiles(root);
  const {note,binding}=await openLocalNote(root,entries[0],entries,'projects');
  await saveLocalNote(note,root,binding);
  assert.equal(root.entries.has('Only.md'),false);
});
test('invalid drawings are rejected and filenames cannot traverse directories', () => {
  assert.throws(()=>parseDrawing('{"type":"excalidraw","elements":[null]}'),/valid Excalidraw/);
  assert.equal(safeFilename('../../some/file'),'-..-some-file');
});
