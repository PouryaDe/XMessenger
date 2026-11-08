import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { getSocket } from '../../services/socket.js';
import { LanguageToggle } from '../common/LanguageToggle.js';
import { ThemeToggle } from '../common/ThemeToggle.js';
import { Clock, ShieldAlert, LogOut, RefreshCw } from 'lucide-react';

export const PendingApprovalScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user, setUser, logout, checkAuth } = useAuthStore();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleStatusChange = (data: { status: 'active' | 'pending' | 'banned' }) => {
      if (user && data.status) {
        setUser({ ...user, status: data.status });
      }
    };

    socket.on('user:status_changed', handleStatusChange);
    return () => {
      socket.off('user:status_changed', handleStatusChange);
    };
  }, [user, setUser]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 py-6 sm:py-8 bg-ambient-canvas font-sans overflow-y-auto overscroll-none">
      <div className="fixed top-[max(1.25rem,calc(env(safe-area-inset-top,0px)+0.85rem))] end-4 z-50 flex items-center gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[360px] sm:max-w-[400px] bg-white/95 dark:bg-[#0E1218]/95 backdrop-blur-2xl border border-black/[0.06] dark:border-white/[0.08] rounded-[28px] p-6 sm:p-8 text-center shadow-floating relative my-auto">
        <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-white/[0.08] border border-stone-200/50 dark:border-white/[0.09] text-amber-500 mx-auto flex items-center justify-center mb-5 shadow-xs animate-pulse">
          <Clock className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-extrabold mb-2 text-slate-900 dark:text-white">
          {t('pendingTitle')}
        </h2>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
          {t('pendingDesc')}
        </p>

        <div className="p-4 rounded-2xl bg-stone-50 dark:bg-white/[0.04] border border-stone-200/60 dark:border-white/[0.06] mb-6 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2 font-sans">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
          <span>{t('usernameLabel')}<strong className="text-slate-900 dark:text-white font-bold">{user?.username}</strong></span>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => checkAuth()}
            className="w-full py-3 px-4 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold transition-all shadow-xs hover:scale-102 active:scale-98 flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{t('refreshStatus')}</span>
          </button>

          <button
            onClick={logout}
            className="w-full py-2.5 px-4 rounded-full bg-stone-100 dark:bg-white/[0.08] hover:bg-stone-200 dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
