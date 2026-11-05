import { useEffect, useState } from 'react';

export type DisplaySettings = {interface:number; document:number};
export const defaultDisplay: DisplaySettings = {interface:100,document:100};
export const displayLimits = {interface:{min:80,max:150},document:{min:80,max:200}} as const;
const KEY='prepwise-display';

function clamp(value:unknown,{min,max}:{min:number;max:number},fallback:number) {
  return typeof value==='number' && Number.isFinite(value) ? Math.min(max,Math.max(min,Math.round(value))) : fallback;
}
export function normalizeDisplay(value:unknown): DisplaySettings {
  const v=(value && typeof value==='object' ? value : {}) as Record<string,unknown>;
  return {interface:clamp(v.interface,displayLimits.interface,100),document:clamp(v.document,displayLimits.document,100)};
}
export default function useDisplaySettings() {
  const [display,setDisplay]=useState<DisplaySettings>(()=>{
    try {return normalizeDisplay(JSON.parse(localStorage.getItem(KEY) || '{}'));}catch {return defaultDisplay;}
  });
  useEffect(()=>{
    const root=document.documentElement.style;
    root.setProperty('--font-scale',String(display.interface/100));
    root.setProperty('--doc-font-scale',String(display.document/100));
    try{localStorage.setItem(KEY,JSON.stringify(display));}catch { /* The in-memory setting still works. */ }
  },[display]);
  return [display,setDisplay] as const;
}
