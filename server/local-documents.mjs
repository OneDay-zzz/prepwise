import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateWorkspace } from '../src/model.ts';
import { DOCUMENTS_DIR, uploadPaths, workspaceFiles } from './workspace-files.mjs';

const MANIFEST = '.prepwise-manifest.json';
const REPLACED = '.replaced';
const fingerprint = bytes => createHash('sha256').update(bytes).digest('hex');
const readOrNull = file => readFile(file).catch(() => null);

/**
 * Keeps ordinary files on disk matching the workspace. The manifest records what this wrote,
 * so it only ever removes its own files, and a file edited outside the app is set aside first.
 */
export function createDocumentMirror({ directory, uploadsDirectory }) {
    const root = path.resolve(directory);
    const inside = relative => {
        const target = path.resolve(root, relative);
        if (!target.startsWith(root + path.sep))
            throw new Error('A document path left the documents folder.');
        return target;
    };
    const writeAtomically = async (target, bytes) => {
        await mkdir(path.dirname(target), { recursive: true });
        const temp = `${target}.${process.pid}.pending`;
        await writeFile(temp, bytes);
        await rename(temp, target);
    };
    async function run(value, { owner, takeOver = false } = {}) {
        const workspace = validateWorkspace(value);
        const previous = JSON.parse((await readOrNull(path.join(root, MANIFEST)))?.toString() || '{"files":{}}');
        // Each browser address has its own workspace, so a second one mustn't replace these files.
        if (previous.owner && owner && previous.owner !== owner && !takeOver)
            return { ignored: true, owner: previous.owner, path: root };
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        let setAside = 0, written = 0, removed = 0;
        const keepEdit = async (relative, bytes) => {
            await writeAtomically(path.join(root, REPLACED, stamp, relative), bytes);
            setAside++;
        };
        const editedOutside = (entry, disk) => disk && !entry?.upload && fingerprint(disk) !== entry?.sha;

        const uploadAt = new Map([...uploadPaths(workspace)].map(([id, file]) => [file, id]));
        const wanted = new Map(workspaceFiles(workspace).map(file => [file.path.slice(DOCUMENTS_DIR.length + 1), file]));

        // Removing first means a change of only upper or lower case can't delete the new file.
        for (const [relative, entry] of Object.entries(previous.files)) {
            if (wanted.has(relative))
                continue;
            const target = inside(relative);
            const disk = await readOrNull(target);
            if (!disk)
                continue;
            if (editedOutside(entry, disk))
                await keepEdit(relative, disk);
            await unlink(target);
            removed++;
            for (let parent = path.dirname(target); parent !== root; parent = path.dirname(parent))
                if (!await rmdir(parent).then(() => true, () => false))
                    break;
        }
        const files = {};
        let waiting = 0;
        for (const [relative, file] of wanted) {
            const target = inside(relative);
            const entry = previous.files[relative];
            const uploadId = uploadAt.get(file.path);
            if (uploadId) {
                // Gallery files never change under the same id, so they're only copied once.
                if (entry?.upload === uploadId && await readOrNull(target)) {
                    files[relative] = entry;
                    continue;
                }
                const bytes = await readOrNull(path.join(uploadsDirectory, uploadId));
                if (!bytes) {
                    waiting++;
                    continue;
                }
                await writeAtomically(target, bytes);
                written++;
                files[relative] = { upload: uploadId };
                continue;
            }
            const sha = fingerprint(file.bytes);
            files[relative] = { sha };
            const disk = await readOrNull(target);
            if (disk && fingerprint(disk) === sha)
                continue;
            if (editedOutside(entry, disk))
                await keepEdit(relative, disk);
            await writeAtomically(target, file.bytes);
            written++;
        }
        await writeAtomically(path.join(root, MANIFEST), JSON.stringify({ owner: owner || previous.owner || null, files }, null, 1));
        return { path: root, files: Object.keys(files).length, written, removed, setAside, waiting, savedAt: new Date().toISOString() };
    }
    // Saves run one at a time, in order, so an older one can't finish last.
    let queue = Promise.resolve();
    return { sync(workspace, options) { const result = queue.then(() => run(workspace, options)); queue = result.catch(() => { }); return result; } };
}
