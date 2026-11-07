import React from 'react';
import { useTranslation } from 'react-i18next';
import { setAppLanguage } from '../../i18n/index.js';

export const LanguageToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'fa';

  const toggleLanguage = () => {
    const nextLang = currentLang === 'fa' ? 'en' : 'fa';
    setAppLanguage(nextLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className={`w-10 h-10 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-xs border border-black/5 dark:border-white/10 flex items-center justify-center hover:scale-105 active:scale-95 transition-all font-bold text-xs shrink-0 select-none ${className}`}
      title={t('changeLanguage')}
    >
      <span>{currentLang === 'fa' ? 'EN' : 'فا'}</span>
    </button>
  );
};
