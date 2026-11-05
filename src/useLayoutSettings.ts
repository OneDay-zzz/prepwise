import { useCallback, useEffect, useState } from 'react';
import { defaultLayout, normalizeLayout, type LayoutSettings } from './layout-settings';

const KEY='prepwise-layout';

export default function useLayoutSettings() {
  const [layout,setLayout]=useState<LayoutSettings>(()=>{
    try {return normalizeLayout(JSON.parse(localStorage.getItem(KEY) || '{}'));}catch {return defaultLayout;}
  });
  useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(layout));}catch { /* The in-memory layout still works. */ }},[layout]);
  const patchLayout=useCallback((patch:Partial<LayoutSettings>)=>setLayout(current=>({...current,...patch})),[]);
  return [layout,patchLayout] as const;
}
