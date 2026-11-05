import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateWorkspace } from '../src/model.ts';
import { DOCUMENTS_DIR, uploadPaths, workspaceFiles } from './workspace-files.mjs';
const MAX_BYTES = 30 * 1024 * 1024;
const REPO_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
// Small text goes inside the tree request: each blob request counts against GitHub's content-creation limit.
const INLINE_FILE_BYTES = 256 * 1024;
const INLINE_TOTAL_BYTES = 8 * 1024 * 1024;
const UPLOAD_ID = /^[A-Za-z0-9-]{1,64}$/;
export const gitBlobSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
export class CheckpointError extends Error {
    status;
    constructor(message, status = 400) { super(message); this.status = status; }
}
export function createCheckpointService(config, dependencies = {}) {
    const request = dependencies.fetch || fetch;
    let running = false;
    const configured = !!config.repo && REPO_PATTERN.test(config.repo) && !!config.token;
    const base = `https://api.github.com/repos/${config.repo}`;
    const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${config.token || ''}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };
    async function api(url, options = {}) {
        let response;
        try {
            response = await request(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(options.method ? 60000 : 20000) });
        }
        catch {
            throw new CheckpointError('GitHub could not be reached. Your browser data and local checkpoint remain available.', 503);
        }
        if (response.status === 401 || response.status === 403)
            throw new CheckpointError('GitHub access was denied. Check the token and its Contents read/write permission for this repository.', 403);
        if (response.status === 429)
            throw new CheckpointError('GitHub is rate limiting requests. Try again later.', 429);
        return response;
    }
    async function repository() {
        if (!configured)
            throw new CheckpointError('Set PREPWISE_GITHUB_REPO and PREPWISE_GITHUB_TOKEN in .env.local, then restart the app.', 503);
        const response = await api(base);
        if (!response.ok)
            throw new CheckpointError('The configured GitHub repository could not be opened. Check its name and your access.', response.status === 404 ? 404 : 502);
        const repo = await response.json();
        if (repo.private !== true)
            throw new CheckpointError('Checkpointing requires a private GitHub repository. Nothing was uploaded.', 403);
        if (repo.archived)
            throw new CheckpointError('This repository is archived. Choose an active private repository.', 403);
        if (typeof repo.default_branch !== 'string')
            throw new CheckpointError('GitHub returned an invalid repository response.', 502);
        return { branch: repo.default_branch, url: `https://github.com/${config.repo}` };
    }
    async function remoteFile(branch) {
        const response = await api(`${base}/contents/workspace.json?ref=${encodeURIComponent(branch)}`);
        if (response.status === 404)
            return null;
        if (!response.ok)
            throw new CheckpointError('The latest GitHub checkpoint could not be read.', 502);
        const data = await response.json();
        if (typeof data.sha !== 'string' || data.type !== 'file')
            throw new CheckpointError('workspace.json is not a regular file in this repository.', 409);
        return { sha: data.sha };
    }
    const uploadsDirectory = path.join(config.directory, 'uploads');
    const uploadFile = id => {
        if (typeof id !== 'string' || !UPLOAD_ID.test(id))
            throw new CheckpointError('Invalid uploaded file.');
        return path.join(uploadsDirectory, id);
    };
    const gitFailure = () => new CheckpointError('GitHub could not save the checkpoint. The local copy is safe.', 502);
    async function json(response) {
        if (!response.ok)
            throw gitFailure();
        return response.json();
    }
    const post = (url, body, method = 'POST') => api(url, { method, body: JSON.stringify(body) });
    async function branchHead(branch) {
        const response = await api(`${base}/git/ref/heads/${encodeURI(branch)}`);
        // GitHub answers 409 for a repository with no commits, and its git endpoints do not work until one exists.
        if (response.status === 404 || response.status === 409)
            return null;
        return (await json(response)).object?.sha || null;
    }
    // One commit for the whole checkpoint, so the repository never holds a half-written set of files.
    // Returns the new commit's sha, or null when GitHub already has exactly these files.
    async function writeFiles(repo, files, message) {
        let head = await branchHead(repo.branch);
        if (!head) {
            const first = files.find(file => file.path === 'workspace.json');
            const created = await post(`${base}/contents/workspace.json`, { message, content: first.bytes.toString('base64') }, 'PUT');
            if (created.status === 409 || created.status === 422)
                throw new CheckpointError('GitHub changed during the upload or rejected the update. Refresh checkpoint status before retrying.', 409);
            await json(created);
            head = await branchHead(repo.branch);
            if (!head)
                throw gitFailure();
        }
        const parent = await json(await api(`${base}/git/commits/${head}`));
        const remoteTree = await json(await api(`${base}/git/trees/${parent.tree.sha}?recursive=1`));
        if (remoteTree.truncated)
            throw new CheckpointError('This repository has too many files to compare. Nothing was uploaded.', 413);
        const remote = new Map(remoteTree.tree.filter(entry => entry.type === 'blob').map(entry => [entry.path, entry.sha]));
        const wanted = new Set(files.map(file => file.path));
        const entries = [...remote.keys()].filter(path => path.startsWith(`${DOCUMENTS_DIR}/`) && !wanted.has(path)).map(path => ({ path, mode: '100644', type: 'blob', sha: null }));
        let inlineBytes = 0;
        for (const file of files) {
            if (remote.get(file.path) === gitBlobSha(file.bytes))
                continue;
            const text = file.bytes.toString('utf8');
            const inline = file.bytes.length <= INLINE_FILE_BYTES && inlineBytes + file.bytes.length <= INLINE_TOTAL_BYTES && Buffer.from(text).equals(file.bytes);
            if (inline) {
                inlineBytes += file.bytes.length;
                entries.push({ path: file.path, mode: '100644', type: 'blob', content: text });
            }
            else {
                const blob = await json(await post(`${base}/git/blobs`, { content: file.bytes.toString('base64'), encoding: 'base64' }));
                entries.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
            }
        }
        if (!entries.length)
            return null;
        const tree = await json(await post(`${base}/git/trees`, { base_tree: parent.tree.sha, tree: entries }));
        const commit = await json(await post(`${base}/git/commits`, { message, tree: tree.sha, parents: [head] }));
        const moved = await post(`${base}/git/refs/heads/${encodeURI(repo.branch)}`, { sha: commit.sha, force: false }, 'PATCH');
        if (moved.status === 409 || moved.status === 422)
            throw new CheckpointError('GitHub changed during the upload or rejected the update. Refresh checkpoint status before retrying.', 409);
        await json(moved);
        return commit.sha;
    }
    async function localStatus() {
        try {
            const value = JSON.parse(await readFile(path.join(config.directory, 'status.json'), 'utf8'));
            return { localAt: typeof value.savedAt === 'string' ? value.savedAt : null };
        }
        catch {
            return { localAt: null };
        }
    }
    async function saveLocal(workspace) {
        const json = JSON.stringify(workspace, null, 2) + '\n';
        if (Buffer.byteLength(json) > MAX_BYTES)
            throw new CheckpointError('This workspace exceeds the 30 MB checkpoint limit. Export a manual backup or reduce large attachments.', 413);
        await mkdir(config.directory, { recursive: true, mode: 0o700 });
        const savedAt = new Date().toISOString();
        const digest = createHash('sha256').update(json).digest('hex');
        try {
            const previous=JSON.parse(await readFile(path.join(config.directory,'status.json'),'utf8'));
            if(previous.digest===digest) return {json,savedAt:previous.savedAt,digest};
        } catch {}
        const name = `${savedAt.replace(/[:.]/g, '-')}-${digest.slice(0, 12)}.json`;
        const temp = path.join(config.directory, `.pending-${randomUUID()}`);
        await writeFile(temp, json, { mode: 0o600 });
        await rename(temp, path.join(config.directory, name));
        const latestTemp = path.join(config.directory, `.latest-${randomUUID()}`);
        await writeFile(latestTemp, json, { mode: 0o600 });
        await rename(latestTemp, path.join(config.directory, 'latest.json'));
        const statusTemp = path.join(config.directory, `.status-${randomUUID()}`);
        await writeFile(statusTemp, JSON.stringify({ savedAt, name, digest }), { mode: 0o600 });
        await rename(statusTemp, path.join(config.directory, 'status.json'));
        const snapshots=(await readdir(config.directory)).filter(name=>/^\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9]{12}\.json$/.test(name)).sort();
        for(const old of snapshots.slice(0,-20)) await unlink(path.join(config.directory,old)).catch(()=>{});
        return { json, savedAt, digest };
    }
    return {
        async status() {
            const local = await localStatus();
            if (!configured)
                return { configured: false, repo: config.repo || null, ...local };
            const repo = await repository();
            const remote = await remoteFile(repo.branch);
            return { configured: true, repo: config.repo, url: repo.url, sha: remote?.sha || null, ...local };
        },
        async checkpoint(value, expectedSha) {
            if (running)
                throw new CheckpointError('Another checkpoint is still running. Try again shortly.', 409);
            if (expectedSha !== null && typeof expectedSha !== 'string')
                throw new CheckpointError('A valid checkpoint revision is required.');
            const workspace = validateWorkspace(value);
            running = true;
            try {
                // Preserve a local recovery copy even if authentication or the network fails.
                const local = await saveLocal(workspace);
                const repo = await repository();
                const current = await remoteFile(repo.branch);
                if ((current?.sha || null) !== expectedSha)
                    throw new CheckpointError('The GitHub checkpoint has changed. Restore the latest version or explicitly replace it from the checkpoint panel.', 409);
                const message = `Checkpoint interview workspace · ${local.savedAt}`;
                const json = Buffer.from(local.json);
                const uploads = new Map();
                for (const upload of workspace.uploads || []) {
                    try {
                        uploads.set(upload.id, await readFile(uploadFile(upload.id)));
                    }
                    catch {
                        throw new CheckpointError(`“${upload.name}” has not reached the local checkpoint service. Try again.`, 409);
                    }
                }
                const commit = await writeFiles(repo, [{ path: 'workspace.json', bytes: json }, ...workspaceFiles(workspace, uploads)], message);
                for (const name of await readdir(uploadsDirectory).catch(() => []))
                    if (!uploads.has(name))
                        await unlink(path.join(uploadsDirectory, name)).catch(() => { });
                return { sha: gitBlobSha(json), savedAt: local.savedAt, url: repo.url, commitUrl: commit ? `${repo.url}/commit/${commit}` : repo.url };
            }
            finally {
                running = false;
            }
        },
        async restore() {
            const repo = await repository();
            const remote = await remoteFile(repo.branch);
            if (!remote)
                throw new CheckpointError('There is no GitHub checkpoint to restore yet.', 404);
            // Fetch the immutable blob to keep the restored data paired with its revision.
            const response = await api(`${base}/git/blobs/${encodeURIComponent(remote.sha)}`);
            if (!response.ok)
                throw new CheckpointError('The checkpoint could not be downloaded.', 502);
            const blob = await response.json();
            if (blob.encoding !== 'base64' || typeof blob.content !== 'string' || blob.size > MAX_BYTES)
                throw new CheckpointError('The remote checkpoint format or size is unsupported.', 413);
            let workspace;
            try {
                workspace = validateWorkspace(JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8')));
            }
            catch {
                throw new CheckpointError('The remote file is not a valid Prepwise workspace.', 422);
            }
            const uploadData = {};
            let missingUploads = 0;
            if (workspace.uploads?.length) {
                const head = await branchHead(repo.branch);
                const parent = await json(await api(`${base}/git/commits/${head}`));
                const tree = await json(await api(`${base}/git/trees/${parent.tree.sha}?recursive=1`));
                const shas = new Map(tree.tree.map(entry => [entry.path, entry.sha]));
                for (const [id, filePath] of uploadPaths(workspace)) {
                    if (!shas.has(filePath)) {
                        missingUploads++;
                        continue;
                    }
                    const file = await json(await api(`${base}/git/blobs/${shas.get(filePath)}`));
                    uploadData[id] = String(file.content).replace(/\s/g, '');
                }
            }
            return { workspace, sha: remote.sha, repo: config.repo, uploadData, missingUploads };
        },
        async missingUploads(ids) {
            if (!Array.isArray(ids))
                throw new CheckpointError('Invalid uploaded file list.');
            const missing = [];
            for (const id of ids)
                await readFile(uploadFile(id)).catch(() => missing.push(id));
            return { missing };
        },
        async stageUpload(id, data) {
            if (typeof data !== 'string')
                throw new CheckpointError('Invalid uploaded file.');
            const target = uploadFile(id);
            await mkdir(uploadsDirectory, { recursive: true, mode: 0o700 });
            const temp = `${target}.${randomUUID()}.pending`;
            await writeFile(temp, Buffer.from(data, 'base64'), { mode: 0o600 });
            await rename(temp, target);
            return { saved: true };
        },
        async preserve(value) { await saveLocal(validateWorkspace(value)); return { saved: true }; },
    };
}
export function isLocalRequest(request) {
    const host = request.headers.host;
    if (!host)
        return false;
    let hostname;
    try {
        hostname = new URL(`http://${host}`).hostname;
    }
    catch {
        return false;
    }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname))
        return false;
    const origin = request.headers.origin;
    if (origin && origin !== `http://${host}` && origin !== `https://${host}`)
        return false;
    return request.method === 'GET' || (request.method === 'POST' && !!origin && request.headers['x-prepwise-checkpoint'] === '1' && request.headers['content-type']?.startsWith('application/json'));
}
export function checkpointMiddleware(service, documents) {
    return async (req, res, next) => {
        const endpoint = req.url?.split('?')[0];
        if (!endpoint?.startsWith('/api/checkpoints/'))
            return next();
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/json');
        const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
        if (!isLocalRequest(req))
            return send(403, { error: 'Checkpoint requests must come from the local Prepwise app.' });
        try {
            if (req.method === 'GET' && endpoint === '/api/checkpoints/status')
                return send(200, await service.status());
            if (req.method === 'GET' && endpoint === '/api/checkpoints/latest')
                return send(200, await service.restore());
            if (req.method !== 'POST' || !['/api/checkpoints/save', '/api/checkpoints/preserve', '/api/checkpoints/missing-uploads', '/api/checkpoints/stage-upload', '/api/checkpoints/local-documents'].includes(endpoint))
                return send(404, { error: 'Unknown checkpoint endpoint.' });
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
                const bytes = Buffer.from(chunk);
                size += bytes.length;
                if (size > MAX_BYTES + 1024 * 1024)
                    throw new CheckpointError('Checkpoint request is too large.', 413);
                chunks.push(bytes);
            }
            let body;
            try {
                body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            }
            catch {
                throw new CheckpointError('Invalid checkpoint request.');
            }
            if (endpoint === '/api/checkpoints/missing-uploads')
                return send(200, await service.missingUploads(body.ids));
            if (endpoint === '/api/checkpoints/stage-upload')
                return send(200, await service.stageUpload(body.id, body.data));
            if (endpoint === '/api/checkpoints/local-documents')
                return send(200, await documents.sync(body.workspace, { owner: req.headers.origin, takeOver: body.takeOver === true }));
            if (endpoint === '/api/checkpoints/preserve')
                return send(200, await service.preserve(body.workspace));
            return send(200, await service.checkpoint(body.workspace, body.expectedSha));
        }
        catch (error) {
            send(error instanceof CheckpointError ? error.status : 500, { error: error instanceof CheckpointError ? error.message : 'The checkpoint operation failed. Your browser workspace has not been changed.' });
        }
    };
}
