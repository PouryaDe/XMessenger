import React from 'react';
import { useAuthStore } from '../../stores/authStore.js';
import { Sun, Moon } from 'lucide-react';

interface Props {
  className?: string;
  size?: 'sm' | 'md';
}

export const ThemeToggle: React.FC<Props> = ({ className = '', size = 'md' }) => {
  const { theme, toggleTheme } = useAuthStore();

  const sizeClasses = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
  const iconClasses = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <button
      onClick={toggleTheme}
      className={`${sizeClasses} rounded-full bg-white dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 shadow-xs border border-black/5 dark:border-white/[0.09] flex items-center justify-center hover:scale-105 active:scale-95 transition-all shrink-0 cursor-pointer ${className}`}
      title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
    >
      {theme === 'dark' ? (
        <Sun className={`${iconClasses} text-amber-400`} />
      ) : (
        <Moon className={`${iconClasses} text-slate-600`} />
      )}
    </button>
  );
};
