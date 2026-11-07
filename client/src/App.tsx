import React, { useEffect } from 'react';
import { useAuthStore } from './stores/authStore.js';
import { AuthModal } from './components/auth/AuthModal.js';
import { PendingApprovalScreen } from './components/auth/PendingApprovalScreen.js';
import { UserChatView } from './components/user/UserChatView.js';
import { AdminDashboard } from './components/admin/AdminDashboard.js';
import { Shield, ShieldAlert, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const App: React.FC = () => {
  const { t } = useTranslation();
  const { user, token, isLoading, checkAuth, logout } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  // 1. Loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-950 text-white">
        <div className="w-16 h-16 rounded-3xl bg-primary-500/20 border border-primary-500/40 flex items-center justify-center text-primary-500 mb-4 animate-pulse">
          <Shield className="w-8 h-8" />
        </div>
        <p className="text-sm font-medium tracking-wide text-slate-300">
          {t('loadingSecure')}
        </p>
      </div>
    );
  }

  // 2. Not logged in
  if (!token || !user) {
    return <AuthModal />;
  }

  // 3. User is Banned
  if (user.status === 'banned') {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-4 bg-slate-950 text-white">
        <div className="w-full max-w-sm bg-slate-900 border border-red-900/60 rounded-3xl p-6 text-center shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-red-500/20 border border-red-500/40 text-red-500 mx-auto flex items-center justify-center mb-4">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-red-400 mb-2">
            {t('accessBlocked')}
          </h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            {t('bannedDesc')}
          </p>
          <button
            onClick={logout}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </div>
    );
  }

  // 4. Regular User Pending Approval
  if (user.role === 'user' && user.status === 'pending') {
    return <PendingApprovalScreen />;
  }

  // 5. Admin Panel
  if (user.role === 'admin') {
    return <AdminDashboard />;
  }

  // 6. Regular Active User Chat
  return <UserChatView />;
};

export default App;
