import { Moon, Sun } from 'lucide-react';
import type { Theme } from './useTheme';

export default function ThemeToggle({theme, onToggle}: {theme: Theme; onToggle: () => void}) {
  const dark = theme === 'dark';
  return <div className="theme-control">
    <span className={!dark ? 'current' : ''} aria-hidden="true"><Sun size={14}/><span>Light</span></span>
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={`Switch to ${dark ? 'light' : 'dark'} mode`}
      className="theme-mode-switch"
      onClick={onToggle}
    ><span className="theme-mode-thumb"/></button>
    <span className={dark ? 'current' : ''} aria-hidden="true"><Moon size={14}/><span>Dark</span></span>
  </div>;
}
