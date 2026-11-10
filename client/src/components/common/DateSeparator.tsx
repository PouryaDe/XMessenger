import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatChatDateSeparator } from '../../utils/date.js';

interface Props {
  date: string;
}

export const DateSeparator: React.FC<Props> = ({ date }) => {
  const { i18n } = useTranslation();
  const label = formatChatDateSeparator(date, i18n.language);

  if (!label) return null;

  return (
    <div className="w-full flex justify-center my-3 sm:my-3.5 select-none pointer-events-none animate-fade-in">
      <span
        dir={i18n.language === 'fa' ? 'rtl' : 'ltr'}
        className="inline-flex items-center justify-center px-3.5 py-1 rounded-full text-[11px] sm:text-xs font-medium tracking-tight bg-white/80 dark:bg-black/50 text-slate-700 dark:text-white/95 backdrop-blur-md border border-black/[0.06] dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.12)] pointer-events-auto"
      >
        {label}
      </span>
    </div>
  );
};
