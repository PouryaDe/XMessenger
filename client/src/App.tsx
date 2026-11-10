import React, { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore.js';
import { api } from './services/api.js';
import { syncPushSubscription } from './services/push.js';
import { AuthModal } from './components/auth/AuthModal.js';
import { PendingApprovalScreen } from './components/auth/PendingApprovalScreen.js';
import { SystemDisabledScreen } from './components/common/SystemDisabledScreen.js';
import { UserChatView } from './components/user/UserChatView.js';
import { AdminDashboard } from './components/admin/AdminDashboard.js';
import { Shield, ShieldAlert, LogOut, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { setOriginalDocumentTitle } from './utils/notifications.js';

export const App: React.FC = () => {
  const { t } = useTranslation();
  const { user, token, isLoading, systemEnabled, checkAuth, logout, theme, setAppName } = useAuthStore();
  const [isAppUpdating, setIsAppUpdating] = useState(false);

  useEffect(() => {
    const onAppUpdating = () => setIsAppUpdating(true);
    window.addEventListener('app:updating', onAppUpdating);
    return () => window.removeEventListener('app:updating', onAppUpdating);
  }, []);

  useEffect(() => {
    // If cache-busting _v query parameter is present after force update, clean it up silently from address bar
    if (typeof window !== 'undefined' && window.location.search.includes('_v=')) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState(null, '', cleanUrl);
    }

    checkAuth();
    // Load app metadata (custom title & PWA icon)
    api.getMeta().then((meta) => {
      if (meta.appName) {
        document.title = meta.appName;
        setOriginalDocumentTitle(meta.appName);
        setAppName(meta.appName);
      }
      if (meta.pwaIconUrl) {
        const linkIcon = document.querySelector('link[rel="icon"]');
        if (linkIcon) linkIcon.setAttribute('href', meta.pwaIconUrl);
        const linkApple = document.querySelector('link[rel="apple-touch-icon"]');
        if (linkApple) linkApple.setAttribute('href', meta.pwaIconUrl);
      }
      // Check for remote build updates and prompt service worker refresh
      if (meta.buildVersion) {
        const storedBuild = localStorage.getItem('xmessenger_app_build');
        if (storedBuild && storedBuild !== meta.buildVersion) {
          console.log('[PWA] Server build version updated to:', meta.buildVersion);
          localStorage.setItem('xmessenger_app_build', meta.buildVersion);
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then((reg) => {
              reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
              reg?.update().catch(() => {});
            });
          }
        } else if (!storedBuild) {
          localStorage.setItem('xmessenger_app_build', meta.buildVersion);
        }
      }
    }).catch(console.error);
  }, []);

  // Synchronize theme with DOM documentElement and PWA theme-color meta tag
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#0E1218' : '#DFDDD6');
    }
  }, [theme]);

  // Synchronize Push Notifications subscription with backend on active session
  useEffect(() => {
    if (token && user && user.status === 'active') {
      syncPushSubscription().catch(() => {});
    }
  }, [token, user]);

  // 1. Loading state (smooth ambient canvas theme, no pitch-black flash)
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-ambient-canvas text-slate-800 dark:text-white transition-opacity duration-300">
        <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-4 animate-pulse">
          <Shield className="w-8 h-8" />
        </div>
        <p className="text-sm font-medium tracking-wide text-slate-600 dark:text-slate-300">
          {t('loadingSecure')}
        </p>
      </div>
    );
  }

  // 2. Not logged in
  if (!token || !user) {
    return (
      <>
        <AuthModal />
        {isAppUpdating && renderUpdatingOverlay()}
      </>
    );
  }

  // 3. User is Banned
  if (user.status === 'banned') {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-4 bg-ambient-canvas text-slate-800 dark:text-white select-none">
        <div className="w-full max-w-sm rounded-[28px] bg-white/90 dark:bg-[#121620]/90 backdrop-blur-2xl border border-red-500/20 dark:border-red-500/20 p-6 sm:p-7 text-center shadow-floating animate-message">
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-500 mx-auto flex items-center justify-center mb-4 shadow-xs">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/25 text-[11px] font-bold mb-3">
            <span>{t('statusBanned')}</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
            {t('accessBlocked')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            {t('bannedDesc')}
          </p>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => checkAuth()}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t('refreshStatus')}</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="w-full py-2.5 px-4 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.10] text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all border border-black/5 dark:border-white/5 flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('logout')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderUpdatingOverlay() {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ambient-canvas/95 backdrop-blur-md text-slate-800 dark:text-white animate-fade-in select-none">
        <div className="w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 dark:text-amber-400 mb-4 animate-spin shadow-sm">
          <RefreshCw className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-sm sm:text-base mb-1.5 text-slate-900 dark:text-white">
          {t('updatingApp')}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t('loadingLatest')}
        </p>
      </div>
    );
  }

  return (
    <>
      {user.role === 'user' && user.status === 'pending' ? (
        <PendingApprovalScreen />
      ) : user.role === 'user' && !systemEnabled ? (
        <SystemDisabledScreen onRetry={checkAuth} onLogout={logout} />
      ) : user.role === 'admin' ? (
        <AdminDashboard />
      ) : (
        <UserChatView />
      )}

      {/* Smooth PWA / App Updating Transition Overlay */}
      {isAppUpdating && renderUpdatingOverlay()}
    </>
  );
};

export default App;
