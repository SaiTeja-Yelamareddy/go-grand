import React, { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { getStoredTheme, toggleTheme, type ThemeMode } from '../utils/themeStorage';

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme());

  React.useEffect(() => {
    const handleThemeChange = (e: any) => {
      if (e?.detail) {
        setTheme(e.detail);
      } else {
        setTheme(getStoredTheme());
      }
    };
    window.addEventListener('themechange', handleThemeChange);
    window.addEventListener('storage', handleThemeChange);
    return () => {
      window.removeEventListener('themechange', handleThemeChange);
      window.removeEventListener('storage', handleThemeChange);
    };
  }, []);

  const handleToggle = () => {
    const nextTheme = toggleTheme();
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`p-2 rounded-xl border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:bg-[#1A1A1A] dark:border-[#2E2E2E] dark:text-neutral-100 dark:hover:bg-[#252525] min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center cursor-pointer shadow-2xs transition-all active:scale-95 ${className}`}
      aria-label="Toggle Theme"
      title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
    >
      {theme === 'dark' ? (
        <Sun size={19} className="text-amber-400 shrink-0 transition-transform duration-200 rotate-0" />
      ) : (
        <Moon size={19} className="text-slate-800 shrink-0 transition-transform duration-200 rotate-0" />
      )}
    </button>
  );
};
