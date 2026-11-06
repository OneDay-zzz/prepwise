import { noteExtension, noteToMarkdown, readNoteMarkdown } from './note-files.ts';
import { newNote, type Note, type Section, type SectionConfig } from './model.ts';

// Structural types keep this API optional on browsers that do not implement it.
export interface LocalFile {
  kind: 'file'; name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
}
export interface LocalDirectory {
  kind: 'directory'; name: string;
  values(): AsyncIterable<LocalFile | LocalDirectory>;
  getFileHandle(name: string, options?: {create: boolean}): Promise<LocalFile>;
  getDirectoryHandle(name: string, options?: {create: boolean}): Promise<LocalDirectory>;
}
export type LocalEntry = { path: string; handle: LocalFile; parent: LocalDirectory };
export type FileBinding = { folder: LocalDirectory; markdown?: {entry: LocalEntry; baseline: string}; drawing?: {entry: LocalEntry; baseline: string} };
type PickerWindow = Window & { showDirectoryPicker?: (options: {mode: 'readwrite'; id: string}) => Promise<LocalDirectory> };
export const supportsLocalFolders = () => typeof window !== 'undefined' && !!(window as PickerWindow).showDirectoryPicker;
export async function chooseFolder() {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error('Local folders need Chrome or Edge on desktop. You can still use workspace backup export/import in this browser.');
  return picker.call(window, {mode:'readwrite', id:'prepwise-vault'});
}
export async function listLocalFiles(root: LocalDirectory): Promise<LocalEntry[]> {
  const entries: LocalEntry[] = [];
  let scanned = 0;
  async function walk(directory: LocalDirectory, prefix: string, depth: number) {
    if(depth > 10) return;
    for await(const handle of directory.values()) {
      if(++scanned > 10000) throw new Error('This folder is too large. Choose a dedicated notes folder.');
      if(handle.name.startsWith('.') || ['node_modules','dist','build'].includes(handle.name)) continue;
      const path = prefix + handle.name;
      if(handle.kind === 'directory') await walk(handle, path+'/', depth+1);
      else if(/\.(md|excalidraw)$/i.test(handle.name)) entries.push({path, handle, parent:directory});
    }
  }
  await walk(root,'',0);
  return entries.sort((a,b) => a.path.localeCompare(b.path));
}
export function parseDrawing(text: string): NonNullable<Note['scene']> {
  const data = JSON.parse(text);
  if(data?.type !== 'excalidraw' || !Array.isArray(data.elements) || !data.elements.every((e: unknown) => e && typeof e === 'object' && typeof (e as {id?: unknown}).id === 'string' && typeof (e as {type?:unknown}).type === 'string')) throw new Error('This file is not a valid Excalidraw drawing.');
  return {elements:data.elements, appState:data.appState || {}, files:data.files || {}};
}
export function drawingText(note: Note): string {
  return JSON.stringify({type:'excalidraw',version:2,source:'prepwise',elements:note.scene?.elements || [],appState:note.scene?.appState || {viewBackgroundColor:'#ffffff'},files:note.scene?.files || {}},null,2)+'\n';
}
async function read(entry: LocalEntry) {
  const file = await entry.handle.getFile();
  if(file.size > 50*1024*1024) throw new Error(`${entry.path} is larger than 50 MB.`);
  return file.text();
}
export async function openLocalNote(folder: LocalDirectory, entry: LocalEntry, entries: LocalEntry[], section: Section, sections?: SectionConfig[]): Promise<{note: Note; binding: FileBinding}> {
  const stem = entry.path.replace(/\.(md|excalidraw)$/i,'');
  const md = entries.find(e => e.path.toLowerCase() === `${stem}.md`.toLowerCase());
  const drawing = entries.find(e => e.path.toLowerCase() === `${stem}.excalidraw`.toLowerCase());
  let note = newNote(section,false);
  note.title = entry.handle.name.replace(/\.(md|excalidraw)$/i,'');
  const binding: FileBinding = {folder};
  if(md) {const text=await read(md); note=readNoteMarkdown(text,note,sections);binding.markdown={entry:md,baseline:text};}
  if(drawing) {const text=await read(drawing);note.scene=parseDrawing(text);binding.drawing={entry:drawing,baseline:text};}
  return {note,binding};
}
export function safeFilename(title: string) {return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/^\.+|[. ]+$/g,'').trim().slice(0,100) || 'Untitled note';}
export async function saveLocalNote(note: Note, folder: LocalDirectory, binding?: FileBinding): Promise<FileBinding> {
  if(binding && binding.folder !== folder) throw new Error('Reconnect the original folder before saving this note.');
  const result: FileBinding = binding ? {...binding} : {folder};
  const parent=binding?.markdown?.entry.parent || binding?.drawing?.entry.parent || folder;
  const sourcePath=binding?.markdown?.entry.path || binding?.drawing?.entry.path;
  const base=sourcePath ? sourcePath.replace(/\.(md|txt|csv|excalidraw)$/i,'') : safeFilename(note.title);
  const basename=base.split('/').at(-1)!;
  const changes: {key:'markdown'|'drawing'; text:string; name:string; path:string; existing?: FileBinding['markdown']}[] = [];
  if(binding?.markdown || note.body || !binding?.drawing) changes.push({key:'markdown',text:noteToMarkdown(note),name:basename+noteExtension(note),path:base+noteExtension(note),existing:binding?.markdown});
  if(note.scene) changes.push({key:'drawing',text:drawingText(note),name:basename+'.excalidraw',path:base+'.excalidraw',existing:binding?.drawing});
  // Preflight every target before writing any file. Never silently overwrite external edits.
  for(const change of changes) {
    if(change.existing) {
      if(await read(change.existing.entry) !== change.existing.baseline) throw new Error(`${change.existing.entry.path} changed outside Prepwise. Reopen the file to load those changes, or export your note before continuing.`);
    } else {
      try {await parent.getFileHandle(change.name);throw new Error(`${change.path} already exists. Open that file first, or use a different note title.`);}catch(error) {if(!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;}
    }
  }
  for(const change of changes) {
    if(change.existing?.baseline === change.text) continue;
    const handle=change.existing?.entry.handle || await parent.getFileHandle(change.name,{create:true});
    const writable=await handle.createWritable();
    try {await writable.write(change.text);await writable.close();}catch(error) {await writable.abort().catch(() => {});throw error;}
    const entry={path:change.path,handle,parent};
    result[change.key]={entry,baseline:change.text};
    // Preserve successful per-file baselines if a later write fails.
    if(binding) binding[change.key]=result[change.key];
  }
  return result;
}
