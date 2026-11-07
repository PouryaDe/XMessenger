import React from 'react';
import { useAuthStore } from '../../stores/authStore.js';
import { Sun, Moon } from 'lucide-react';

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { theme, toggleTheme } = useAuthStore();

  return (
    <button
      onClick={toggleTheme}
      className={`p-2 rounded-lg text-gray-700 dark:text-gray-200 bg-gray-200/70 hover:bg-gray-300 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors border border-transparent dark:border-slate-700 ${className}`}
      title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4 text-amber-400" />
      ) : (
        <Moon className="w-4 h-4 text-slate-600" />
      )}
    </button>
  );
};
