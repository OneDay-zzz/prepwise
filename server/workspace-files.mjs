import { DEFAULT_SPACE, sectionSpace, workspaceSections, workspaceSpaces } from '../src/model.ts';
import { noteExtension, noteToMarkdown, tabExtension } from '../src/note-files.ts';
import { drawingText, safeFilename } from '../src/local-files.ts';

// Everything under this folder is generated and is replaced on each checkpoint.
export const DOCUMENTS_DIR = 'documents';

// A folder ending in ".md" could otherwise clash with a note file of the same name.
const directoryName = name => safeFilename(name).replace(/\.(md|txt|csv|excalidraw)$/i, '-$1');

// Names are compared without case because macOS and Windows clones are case-insensitive.
// Only colliding items get an id suffix, and it never depends on their order, so paths stay stable.
function uniqueNames(items, clean, rename = (name, tag) => `${name}-${tag}`) {
    const seen = new Map();
    for (const item of items) {
        const key = clean(item.name).toLocaleLowerCase();
        seen.set(key, (seen.get(key) || 0) + 1);
    }
    return new Map(items.map(item => {
        const name = clean(item.name);
        return [item.id, seen.get(name.toLocaleLowerCase()) > 1 ? rename(name, item.id.slice(-8)) : name];
    }));
}

/**
 * The original workspace's sections stay at the top level, so their paths never change.
 * Each other workspace is one folder holding its sections.
 */
function sectionDirectories(workspace) {
    const sections = workspaceSections(workspace);
    const others = workspaceSpaces(workspace).filter(space => space.id !== DEFAULT_SPACE);
    const top = uniqueNames([...sections.filter(s => sectionSpace(s) === DEFAULT_SPACE), ...others], directoryName);
    const dirs = new Map(sections.filter(s => sectionSpace(s) === DEFAULT_SPACE).map(s => [s.id, top.get(s.id)]));
    for (const space of others) {
        const inside = sections.filter(s => sectionSpace(s) === space.id);
        const names = uniqueNames(inside, directoryName);
        for (const section of inside) dirs.set(section.id, `${top.get(space.id)}/${names.get(section.id)}`);
    }
    return dirs;
}
const beforeExtension = (name, tag) => name.replace(/(\.[^.]*)?$/, `-${tag}$1`);
// Gallery files sit in their section's folder, so a checkpoint and a restore agree on each path.
export function uploadPaths(workspace) {
    const sections = workspaceSections(workspace);
    const sectionDirs = sectionDirectories(workspace);
    const paths = new Map();
    for (const section of sections) {
        const uploads = (workspace.uploads || []).filter(u => u.section === section.id);
        const names = uniqueNames(uploads, safeFilename, beforeExtension);
        for (const upload of uploads)
            paths.set(upload.id, `${DOCUMENTS_DIR}/${sectionDirs.get(section.id)}/_gallery/${names.get(upload.id)}`);
    }
    return paths;
}
/** Where each section and folder lives under documents/, so a file added there can find its place. */
export function documentFolders(workspace) {
    const places = new Map();
    const sections = workspaceSections(workspace);
    const sectionDirs = sectionDirectories(workspace);
    for (const section of sections) {
        places.set(sectionDirs.get(section.id), { section: section.id });
        const folders = (workspace.folders || []).filter(f => f.section === section.id);
        const folderDirs = uniqueNames(folders, directoryName);
        for (const folder of folders)
            places.set(`${sectionDirs.get(section.id)}/${folderDirs.get(folder.id)}`, { section: section.id, folderId: folder.id });
    }
    return places;
}
export function workspaceFiles(workspace, uploads = new Map()) {
    const files = [];
    const add = (path, bytes, noteId, tabId) => files.push({ path: `${DOCUMENTS_DIR}/${path}`, bytes, ...(noteId ? { noteId } : {}), ...(tabId ? { tabId } : {}) });
    const sections = workspaceSections(workspace);
    const sectionDirs = sectionDirectories(workspace);
    for (const section of sections) {
        const folders = (workspace.folders || []).filter(f => f.section === section.id);
        const folderDirs = uniqueNames(folders, directoryName);
        const groups = new Map();
        for (const note of workspace.notes.filter(n => n.section === section.id)) {
            const dir = note.folderId ? `${sectionDirs.get(section.id)}/${folderDirs.get(note.folderId)}` : sectionDirs.get(section.id);
            groups.set(dir, [...(groups.get(dir) || []), note]);
        }
        for (const [dir, notes] of groups) {
            const stems = uniqueNames(notes.map(n => ({ id: n.id, name: n.title || 'Untitled note' })), safeFilename);
            const usedStems = new Set([...stems.values()].map(stem => stem.toLocaleLowerCase()));
            for (const note of notes) {
                const stem = `${dir}/${stems.get(note.id)}`;
                const hasDrawing = !!note.scene?.elements?.length;
                const markdown = noteToMarkdown(note);
                if (markdown || !hasDrawing) add(`${stem}${noteExtension(note)}`, Buffer.from(markdown), note.id);
                if (hasDrawing) add(`${stem}.excalidraw`, Buffer.from(drawingText(note)));
                // A document's other tabs sit beside it as files of their own type.
                for (const tab of note.tabs || []) {
                    let name = `${stems.get(note.id)} - ${safeFilename(tab.name)}`;
                    if (usedStems.has(name.toLocaleLowerCase())) name = `${name}-${tab.id.slice(-8)}`;
                    usedStems.add(name.toLocaleLowerCase());
                    if (tab.kind !== 'board') add(`${dir}/${name}${tabExtension(tab)}`, Buffer.from(tab.body), note.id, tab.id);
                    else if (tab.scene?.elements?.length) add(`${dir}/${name}.excalidraw`, Buffer.from(drawingText({ ...note, scene: tab.scene })));
                }
            }
        }
    }
    if (workspace.resume) add(`_resume/${safeFilename(workspace.resume.name)}`, Buffer.from(workspace.resume.data.slice(workspace.resume.data.indexOf(',') + 1), 'base64'));
    for (const [id, filePath] of uploadPaths(workspace))
        files.push({ path: filePath, bytes: uploads.get(id) });
    return files;
}
