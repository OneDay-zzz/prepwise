import { useEffect, useState } from 'react';
export type Theme = 'light' | 'dark';
export default function useTheme() {
  const [theme,setTheme]=useState<Theme>(()=>{
    try {const saved=localStorage.getItem('prepwise-theme');if(saved==='light'||saved==='dark')return saved;}catch { /* Private browsing may restrict storage. */ }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    document.documentElement.style.colorScheme=theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#16171d':'#f6f7f9');
    try{localStorage.setItem('prepwise-theme',theme);}catch { /* The in-memory theme still works. */ }
  },[theme]);
  return [theme,()=>setTheme(value=>value==='dark'?'light':'dark')] as const;
}
