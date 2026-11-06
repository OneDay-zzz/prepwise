import { Moon, Sun } from 'lucide-react';
import type { Theme } from './useTheme';

export default function ThemeToggle({theme, onToggle}: {theme: Theme; onToggle: () => void}) {
  const dark = theme === 'dark';
  const label = `Switch to ${dark ? 'light' : 'dark'} mode`;
  return <button type="button" className="icon-button theme-toggle" aria-label={label} title={label} onClick={onToggle}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button>;
}
