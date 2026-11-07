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
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-gradient-to-b from-cream-50 via-cream-100 to-cream-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 font-sans">
      <div className="fixed top-5 right-5 rtl:right-auto rtl:left-5 flex items-center gap-2.5">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm sm:max-w-md bg-white/95 dark:bg-slate-900/95 border border-stone-200/60 dark:border-slate-800 rounded-[32px] p-8 text-center shadow-floating relative">
        <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-slate-800 border border-stone-200/50 dark:border-slate-700 text-amber-500 mx-auto flex items-center justify-center mb-5 shadow-soft animate-pulse">
          <Clock className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-extrabold mb-2 text-slate-900 dark:text-white">
          {t('pendingTitle')}
        </h2>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
          {t('pendingDesc')}
        </p>

        <div className="p-4 rounded-2xl bg-stone-50 dark:bg-slate-800/60 border border-stone-200/60 dark:border-slate-700/60 mb-6 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2 font-sans">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
          <span>نام کاربری: <strong className="text-slate-900 dark:text-white font-mono">{user?.username}</strong></span>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => checkAuth()}
            className="w-full py-3 px-4 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold transition-all shadow-md hover:scale-102 active:scale-98 flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{t('refreshStatus')}</span>
          </button>

          <button
            onClick={logout}
            className="w-full py-2.5 px-4 rounded-full bg-stone-100 dark:bg-slate-800 hover:bg-stone-200 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
