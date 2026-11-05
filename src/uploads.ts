import { del, get, set } from 'idb-keyval';

// Files live outside the workspace object: it is rewritten on every keystroke and pushed
// whole to workspace.json, which would make each commit as large as the whole gallery.
const key = (id: string) => `prepwise-upload-${id}`;
export const putUpload = (id: string, blob: Blob) => set(key(id), blob);
export const getUpload = (id: string) => get<Blob>(key(id));
export const deleteUpload = (id: string) => del(key(id));

export const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});
export const dataUrlToBlob = async (url: string) => (await fetch(url)).blob();
