import React from 'react';
import { useTranslation } from 'react-i18next';
import { setAppLanguage } from '../../i18n/index.js';

interface Props {
  className?: string;
  size?: 'sm' | 'md';
}

export const LanguageToggle: React.FC<Props> = ({ className = '', size = 'md' }) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'fa';

  const toggleLanguage = () => {
    const nextLang = currentLang === 'fa' ? 'en' : 'fa';
    setAppLanguage(nextLang);
  };

  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-xs';

  return (
    <button
      onClick={toggleLanguage}
      className={`${sizeClasses} p-0 m-0 rounded-full bg-white dark:bg-white/[0.08] dark:hover:bg-white/[0.12] dark:backdrop-blur-md text-slate-700 dark:text-slate-200 shadow-xs border border-black/5 dark:border-white/[0.09] flex items-center justify-center hover:scale-105 active:scale-95 transition-all font-bold shrink-0 select-none overflow-hidden leading-none ${className}`}
      title={t('changeLanguage')}
    >
      <span className="inline-flex items-center justify-center leading-none text-center font-sans tracking-tight pt-[1px]">
        {currentLang === 'fa' ? 'EN' : 'فا'}
      </span>
    </button>
  );
};
