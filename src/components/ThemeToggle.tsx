import React, { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { getStoredTheme, toggleTheme, type ThemeMode } from '../utils/themeStorage';

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme());

  const handleToggle = () => {
    const nextTheme = toggleTheme();
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="p-2 rounded-xl border border-[#E5E5E5] bg-white text-[#111111] dark:bg-[#1F1F1F] dark:border-[#333333] dark:text-[#F5F5F5] min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer shadow-2xs"
      aria-label="Toggle Theme"
      title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
    >
      {theme === 'dark' ? (
        <Sun size={19} className="text-amber-400 shrink-0" />
      ) : (
        <Moon size={19} className="text-[#111111] dark:text-[#F5F5F5] shrink-0" />
      )}
    </button>
  );
};
