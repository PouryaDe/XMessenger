import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { api } from '../../services/api.js';
import { LanguageToggle } from '../common/LanguageToggle.js';
import { ThemeToggle } from '../common/ThemeToggle.js';
import { 
  X, 
  ShieldCheck, 
  User as UserIcon, 
  KeyRound, 
  Trash2, 
  LogOut
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const UserDrawer: React.FC<Props> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const { clearMessages } = useChatStore();

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleClearHistory = async () => {
    if (window.confirm(t('confirmClearChat'))) {
      try {
        await api.clearUserChat();
        clearMessages();
        onClose();
        alert(t('clearedSuccess'));
      } catch (err: any) {
        alert(err.message || 'Error clearing chat');
      }
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPwdMsg({ type: 'success', text: 'رمز عبور با موفقیت تغییر یافت' });
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setShowPasswordModal(false), 1500);
    } catch (err: any) {
      setPwdMsg({ type: 'error', text: err.message || 'خطا در تغییر رمز' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end rtl:justify-start">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer content */}
      <div className="relative w-full max-w-xs sm:max-w-sm h-full bg-white dark:bg-slate-900 border-x border-gray-200 dark:border-slate-800 shadow-2xl flex flex-col z-10 animate-message">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-500/10 dark:bg-primary-500/20 text-primary-500 flex items-center justify-center font-bold">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                {user?.username}
              </h3>
              <span className="text-[11px] text-primary-600 dark:text-primary-400 font-mono">
                {t('statusActive')}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Menu Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Privacy Security Box */}
          <div className="p-3.5 rounded-2xl bg-primary-50/50 dark:bg-primary-950/20 border border-primary-200/50 dark:border-primary-900/30">
            <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 font-medium text-xs mb-1.5">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>{t('security')}</span>
            </div>
            <p className="text-[11px] text-gray-600 dark:text-slate-400 leading-relaxed">
              {t('encryptionInfo')}
            </p>
          </div>

          {/* Quick Toggles */}
          <div className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/70 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">{t('language')}</span>
              <LanguageToggle />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">{t('theme')}</span>
              <ThemeToggle />
            </div>
          </div>

          {/* Password change option */}
          <button
            onClick={() => setShowPasswordModal(true)}
            className="w-full flex items-center gap-3 p-3 rounded-2xl text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <KeyRound className="w-4 h-4 text-primary-500" />
            <span>{t('changePassword')}</span>
          </button>

          {/* Wipe Entire Chat */}
          <button
            onClick={handleClearHistory}
            className="w-full flex items-center gap-3 p-3 rounded-2xl text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>{t('clearChat')}</span>
          </button>
        </div>

        {/* Footer Logout */}
        <div className="p-4 border-t border-gray-100 dark:border-slate-800">
          <button
            onClick={logout}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-red-500 hover:text-white dark:hover:bg-red-600 text-gray-700 dark:text-slate-300 text-xs font-medium transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h4 className="text-sm font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary-500" />
              <span>{t('changePassword')}</span>
            </h4>

            {pwdMsg && (
              <div className={`mb-3 p-2.5 rounded-xl text-xs ${pwdMsg.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'}`}>
                {pwdMsg.text}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">{t('currentPassword')}</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">{t('newPassword')}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-xs font-medium"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-primary-600 text-white text-xs font-medium hover:bg-primary-500"
                >
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
