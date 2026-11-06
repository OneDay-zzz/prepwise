import type { Section, UploadedFile } from './model.ts';

export const UPLOAD_URL_PREFIX = 'prepwise-upload:';

const fileName = (source: string) => {
  const clean = source.trim().replace(/[?#].*$/, '');
  let decoded = clean;
  try { decoded = decodeURI(clean); } catch { /* A literal % in a filename is not an escape. */ }
  return decoded.slice(decoded.replace(/\\/g, '/').lastIndexOf('/') + 1).normalize('NFC').toLocaleLowerCase();
};

// Inline code is matched first so that an example of the syntax is left alone. The path allows
// spaces and one level of parentheses, which is how screenshot filenames often look.
const IMAGE_SYNTAX = /`[^`\n]*`|!\[([^\]\n]*)\]\(\s*<?((?:[^()\n]|\([^()\n]*\))*?)>?(?:\s+"[^"\n]*")?\s*\)|<img\b[^>\n]*>/g;
const htmlAttribute = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))?.slice(1).find(value => value !== undefined);

/** The gallery file an image link refers to: the same filename, preferring the note's own section. */
export function findNoteUpload(source: string, section: Section, uploads: UploadedFile[] = []) {
  if (/^(https?:|data:|blob:)/i.test(source.trim())) return undefined;
  const name = fileName(source);
  const matches = uploads.filter(upload => upload.type.startsWith('image/') && upload.name.normalize('NFC').toLocaleLowerCase() === name);
  return matches.find(upload => upload.section === section) || matches[0];
}

function replaceImageSyntax(body: string, replace: (match: string, alt: string | undefined, source: string | undefined) => string) {
  let fenced = false;
  return body.split('\n').map(line => {
    if (/^ {0,3}(```|~~~)/.test(line)) { fenced = !fenced; return line; }
    if (fenced) return line;
    return line.replace(IMAGE_SYNTAX, (match, alt: string | undefined, source: string | undefined) => match.startsWith('`') ? match : replace(match, alt, source));
  }).join('\n');
}

// Standard Markdown only allows spaces in an image path inside <...>. This app accepts them without,
// but a Markdown editor would read that as plain text and save it with the syntax escaped.
export function bracketImagePaths(body: string): string {
  return replaceImageSyntax(body, (match, _alt, source) => {
    const path = source?.trim();
    return !path || !/\s/.test(path) || match.includes(`(<`) ? match : match.replace(path, `<${path}>`);
  });
}

// Points image links at gallery files with the same filename, for rendering only: the note's own
// text stays as written, so saved and exported Markdown still works in other editors.
export function linkNoteImages(body: string, section: Section, uploads: UploadedFile[] = []): string {
  if (!uploads.some(upload => upload.type.startsWith('image/'))) return body;
  return replaceImageSyntax(body, (match, alt, source) => {
      const html = match.startsWith('<');
      const upload = findNoteUpload((html ? htmlAttribute(match, 'src') : source) || '', section, uploads);
      if (!upload) return match;
      const text = (html ? htmlAttribute(match, 'alt') : alt) || '';
      return `![${text.replace(/[[\]]/g, '')}](${UPLOAD_URL_PREFIX}${upload.id})`;
  });
}

export type SavedPicture = {alt:string; src:string; upload:UploadedFile};
// Browsers can't display these, so they'd save fine and then show as a broken image.
export const isPicture = (file: Pick<File,'type'>) => file.type.startsWith('image/') && !/hei[cf]|tiff/i.test(file.type);
/** A filename that doesn't need escaping in Markdown, and is new to the section. Links match by name, case aside. */
export function pictureFileName(name: string, section: Section, uploads: UploadedFile[] = []) {
  const dot=name.lastIndexOf('.');
  const extension=dot>0 ? name.slice(dot).replace(/[^\p{L}\p{N}.]/gu,'').toLowerCase() : '';
  const base=(dot>0 ? name.slice(0,dot) : name).trim().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,60) || 'picture';
  const taken=new Set(uploads.filter(u=>u.section===section).map(u=>u.name.normalize('NFC').toLocaleLowerCase()));
  for(let n=1;;n++) {
    const candidate=`${base}${n>1 ? `-${n}` : ''}${extension}`;
    if(!taken.has(candidate.normalize('NFC').toLocaleLowerCase())) return candidate;
  }
}
/** Puts Markdown between two points as its own paragraph. Returns the text, and where the cursor belongs after it. */
export function insertPictures(body: string, start: number, end: number, pictures: Pick<SavedPicture,'alt'|'src'>[]) {
  const before=body.slice(0,start),after=body.slice(end);
  const links=pictures.map(p=>`![${p.alt}](${p.src})`).join('\n\n');
  const lead=!before.trim() ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail=!after.trim() ? (after ? '' : '\n') : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const head=before+lead+links+trail;
  return {body:head+after,caret:head.length};
}
