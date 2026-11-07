import React from 'react';
import { useTranslation } from 'react-i18next';
import { setAppLanguage } from '../../i18n/index.js';
import { Globe } from 'lucide-react';

export const LanguageToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { i18n } = useTranslation();
  const currentLang = i18n.language || 'fa';

  const toggleLanguage = () => {
    const nextLang = currentLang === 'fa' ? 'en' : 'fa';
    setAppLanguage(nextLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 
        bg-gray-200/70 hover:bg-gray-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 border border-transparent dark:border-slate-700 ${className}`}
      title="تغییر زبان / Change Language"
    >
      <Globe className="w-4 h-4 text-primary-500" />
      <span>{currentLang === 'fa' ? 'EN' : 'فا'}</span>
    </button>
  );
};
