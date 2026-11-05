import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import type { ExtraProps } from 'react-markdown';
import { UPLOAD_URL_PREFIX } from './note-images';
import { getUpload } from './uploads';

export default function NoteImage({node:_node,src,alt,...props}: ImgHTMLAttributes<HTMLImageElement> & ExtraProps) {
  const uploadId=typeof src==='string' && src.startsWith(UPLOAD_URL_PREFIX) ? src.slice(UPLOAD_URL_PREFIX.length) : '';
  const [url,setUrl]=useState<string|null>(null);
  const [missing,setMissing]=useState(false);
  useEffect(()=>{
    if(!uploadId)return;
    let cancelled=false,created='';
    setUrl(null);setMissing(false);
    getUpload(uploadId).then(blob=>{
      if(cancelled)return;
      if(!blob){setMissing(true);return;}
      created=URL.createObjectURL(blob);
      setUrl(created);
    }).catch(()=>{if(!cancelled)setMissing(true);});
    return ()=>{cancelled=true;if(created)URL.revokeObjectURL(created);};
  },[uploadId]);
  if(!uploadId)return <img {...props} src={src} alt={alt}/>;
  if(missing)return <span className="note-image-missing">Image not found in the gallery{alt ? `: ${alt}` : ''}</span>;
  return url ? <img {...props} src={url} alt={alt}/> : null;
}
