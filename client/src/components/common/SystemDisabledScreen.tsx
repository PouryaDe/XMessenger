import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wrench, RefreshCw, LogOut, Shield } from 'lucide-react';

interface Props {
  onRetry: () => Promise<void> | void;
  onLogout: () => void;
}

export const SystemDisabledScreen: React.FC<Props> = ({ onRetry, onLogout }) => {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);

  const handleRetry = async () => {
    setChecking(true);
    try {
      await onRetry();
    } finally {
      setTimeout(() => setChecking(false), 500);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-ambient-canvas text-slate-800 dark:text-white select-none">
      <div className="w-full max-w-sm rounded-[28px] bg-white/90 dark:bg-[#121620]/90 backdrop-blur-2xl border border-black/10 dark:border-white/10 p-6 sm:p-7 text-center shadow-floating animate-message">
        {/* Animated Maintenance Icon */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 mx-auto flex items-center justify-center mb-4 shadow-xs">
          <Wrench className="w-8 h-8 animate-pulse" />
        </div>

        {/* Status Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-[11px] font-bold mb-3">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          <span>{t('systemDisabled')}</span>
        </div>

        {/* Title & Description */}
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
          {t('systemDisabledTitle')}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
          {t('systemDisabledDesc')}
        </p>

        {/* Actions */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleRetry}
            disabled={checking}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 active:scale-98 disabled:opacity-75 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>{t('refreshStatus')}</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="w-full py-2.5 px-4 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.10] text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all border border-black/5 dark:border-white/5 flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t('logout')}</span>
          </button>
        </div>

        {/* Footer brand snippet */}
        <div className="mt-6 pt-4 border-t border-black/5 dark:border-white/5 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
          <Shield className="w-3 h-3 text-amber-500" />
          <span>XMessenger Secure Core</span>
        </div>
      </div>
    </div>
  );
};

