import { defaultSections, validateWorkspace, type Note, type Section, type SectionConfig } from './model.ts';

// YAML-compatible JSON scalar values make metadata portable and safely escapable.
// Only parse our explicitly marked frontmatter; unrelated Markdown stays untouched.
export function noteToMarkdown(note: Note): string {
  if (!note.experience && !note.pinned && !note.marked && !note.tags?.length && !note.importance) return note.body;
  const fields: Record<string, unknown> = {section:note.section, title:note.title, pinned:!!note.pinned, marked:!!note.marked, tags:note.tags || []};
  if(note.importance) fields.importance=note.importance;
  if(note.experience) fields.experience=note.experience;
  return '---\nprepwise: 1\n' + Object.entries(fields).map(([key,value])=>`${key}: ${JSON.stringify(value)}`).join('\n') + '\n---\n' + note.body;
}
/** The note's text without its metadata block, or null when that block is broken. */
export function markdownBody(text: string): string|null {
  if(!text.startsWith('---\nprepwise: 1\n') && !text.startsWith('---\r\nprepwise: 1\r\n')) return text;
  const match=text.match(/^---\r?\nprepwise: 1\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match ? text.slice(match[0].length) : null;
}
export function readNoteMarkdown(text: string, base: Note, sections: SectionConfig[] = defaultSections): Note {
  if(!text.startsWith('---\nprepwise: 1\n') && !text.startsWith('---\r\nprepwise: 1\r\n')) return {...base,body:text};
  const match=text.match(/^---\r?\nprepwise: 1\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if(!match) throw new Error('The Prepwise document metadata is incomplete. No changes were made.');
  const data: Record<string,unknown>={};
  try {
    for(const line of match[1].split(/\r?\n/)) {
      const split=line.indexOf(':');
      if(split===-1) continue;
      const key=line.slice(0,split);
      if(['section','title','pinned','marked','tags','importance','experience'].includes(key)) data[key]=JSON.parse(line.slice(split+1).trim());
    }
    const note={...base,...data,section:sections.some(s=>s.id===data.section) ? data.section as Section : base.section,body:text.slice(match[0].length)};
    return validateWorkspace({version:1,sections,notes:[note],plans:[]}).notes[0];
  } catch {throw new Error('The Prepwise document metadata is invalid. No changes were made.');}
}
