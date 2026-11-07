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
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950 text-white">
      <div className="fixed top-4 right-4 rtl:right-auto rtl:left-4 flex items-center gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl relative">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center mb-5 animate-pulse">
          <Clock className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-bold mb-2 text-white">
          {t('pendingTitle')}
        </h2>

        <p className="text-sm text-slate-400 leading-relaxed mb-6">
          {t('pendingDesc')}
        </p>

        <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 mb-6 text-xs text-slate-300 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
          <span>نام کاربری: <strong className="text-white font-mono">{user?.username}</strong></span>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => checkAuth()}
            className="w-full py-2.5 px-4 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{t('refreshStatus')}</span>
          </button>

          <button
            onClick={logout}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
