import type { Note, Section, UploadedFile, Workspace } from './model.ts';

type BoardElement = {id:string; containerId?:string|null; frameId?:string|null};

/** What exporting a selection should include: a shape's own label and a frame's contents count as part of it. */
export function boardSelection<T extends BoardElement>(elements: readonly T[], selected: Record<string,unknown>): T[] {
  const picked=(id?:string|null)=>!!id && !!selected[id];
  return elements.filter(element=>picked(element.id) || picked(element.containerId) || picked(element.frameId));
}
/** A filename that doesn't need escaping in Markdown, and is new to the section. Links match by name, case aside. */
export function drawingFileName(title: string, section: Section, uploads: UploadedFile[] = []) {
  const base=title.trim().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,60) || 'whiteboard';
  const taken=new Set(uploads.filter(u=>u.section===section).map(u=>u.name.normalize('NFC').toLocaleLowerCase()));
  for(let n=1;;n++) {
    const name=`${base}-drawing${n>1 ? `-${n}` : ''}.svg`;
    if(!taken.has(name.normalize('NFC').toLocaleLowerCase())) return name;
  }
}
/**
 * Adds the picture to the section's gallery and links it at the end of the note. The path is where the
 * local copy of the file sits, so the link also works in other Markdown editors. The app matches it by name.
 */
export function addDrawing(workspace: Workspace, noteId: string, upload: UploadedFile, now = new Date().toISOString()): Workspace {
  const note=workspace.notes.find(n=>n.id===noteId);
  if(!note) return workspace;
  const link=`![Drawing](${note.folderId ? '../' : ''}_gallery/${upload.name})`;
  const body=note.body.trimEnd() ? `${note.body.trimEnd()}\n\n${link}\n` : `${link}\n`;
  const updated:Note={...note,body,updatedAt:now};
  return {...workspace,uploads:[...(workspace.uploads || []),upload],notes:workspace.notes.map(n=>n===note ? updated : n)};
}
