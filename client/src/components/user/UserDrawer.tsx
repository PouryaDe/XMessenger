import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { api } from '../../services/api.js';
import { LanguageToggle } from '../common/LanguageToggle.js';
import { ThemeToggle } from '../common/ThemeToggle.js';
import { getErrorMessage } from '../../utils/errors.js';
import { 
  X, 
  ShieldCheck, 
  KeyRound, 
  Trash2, 
  LogOut,
  Camera
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const UserDrawer: React.FC<Props> = ({ isOpen, onClose }) => {
  const { t, i18n } = useTranslation();
  const { user, logout, updateUserAvatar } = useAuthStore();
  const { clearMessages } = useChatStore();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      const res = await api.uploadAvatar(file);
      updateUserAvatar(res.avatarUrl);
    } catch (err: any) {
      alert(getErrorMessage(err, 'imageUploadFailed'));
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleClearHistory = async () => {
    if (window.confirm(t('confirmClearChat'))) {
      try {
        await api.clearUserChat();
        clearMessages();
        onClose();
        alert(t('clearedSuccess'));
      } catch (err: any) {
        alert(getErrorMessage(err, 'errClearChat'));
      }
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPwdMsg({ type: 'success', text: t('pwdChangedSuccess') });
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setShowPasswordModal(false), 1500);
    } catch (err: any) {
      setPwdMsg({ type: 'error', text: getErrorMessage(err, 'errCurrentPasswordWrong') });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer content */}
      <div className={`relative w-full max-w-xs sm:max-w-sm h-full bg-white/95 dark:bg-[#0E121A]/95 backdrop-blur-2xl border-x border-black/[0.06] dark:border-white/[0.08] shadow-2xl flex flex-col z-10 font-sans ${i18n.language === 'fa' ? 'animate-drawer-left' : 'animate-drawer-right'}`}>
        {/* Header */}
        <div className="p-6 pt-safe border-b border-stone-200/50 dark:border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Clickable Profile Avatar with Upload Camera */}
            <div className="relative group">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="w-12 h-12 rounded-full bg-white dark:bg-white/[0.08] text-slate-800 dark:text-white flex items-center justify-center font-bold shadow-xs border border-black/5 dark:border-white/[0.09] text-sm font-mono uppercase overflow-hidden relative group/avatar focus:outline-none"
                title={t('uploadAvatar')}
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  <span>{user?.username.substring(0, 2)}</span>
                )}
                {/* Camera Overlay on Hover */}
                <div className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                  <Camera className="w-4 h-4" />
                </div>
              </button>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                {user?.username}
              </h3>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                {t('statusActive')}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 shadow-xs border border-black/5 dark:border-white/[0.09] flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Menu Items */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
          {/* Privacy Security Box */}
          <div className="p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06]">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs mb-1.5">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>{t('security')}</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('encryptionInfo')}
            </p>
          </div>

          {/* Quick Toggles in Rounded Card */}
          <div className="p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-800 dark:text-slate-300 font-medium">{t('language')}</span>
              <LanguageToggle />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-800 dark:text-slate-300 font-medium">{t('theme')}</span>
              <ThemeToggle />
            </div>
          </div>

          {/* Password change option */}
          <button
            onClick={() => setShowPasswordModal(true)}
            className="w-full flex items-center gap-3 p-4 rounded-[22px] bg-white dark:bg-white/[0.04] dark:hover:bg-white/[0.08] shadow-xs border border-black/[0.06] dark:border-white/[0.06] text-xs font-semibold text-slate-800 dark:text-slate-200 transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-white/[0.06] flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <span>{t('changePassword')}</span>
          </button>

          {/* Wipe Entire Chat */}
          <button
            onClick={handleClearHistory}
            className="w-full flex items-center gap-3 p-4 rounded-[22px] bg-white dark:bg-white/[0.04] dark:hover:bg-red-950/20 shadow-xs border border-black/[0.06] dark:border-white/[0.06] text-xs font-semibold text-red-600 dark:text-red-400 transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-500/15 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <span>{t('clearChat')}</span>
          </button>
        </div>

        {/* Footer Logout */}
        <div className="p-5 pb-safe border-t border-stone-200/50 dark:border-white/[0.06]">
          <button
            onClick={logout}
            className="w-full py-3 px-4 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold transition-all shadow-xs hover:scale-102 active:scale-98 flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-[#12161E] border border-stone-200/70 dark:border-white/[0.08] rounded-[28px] p-6 shadow-floating">
            <h4 className="text-sm font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-500" />
              <span>{t('changePassword')}</span>
            </h4>

            {pwdMsg && (
              <div className={`mb-3 p-2.5 rounded-xl text-xs ${pwdMsg.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'}`}>
                {pwdMsg.text}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-3 font-sans">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t('currentPassword')}</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  dir="ltr"
                  className="w-full px-4 py-2.5 rounded-full border border-stone-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] text-xs text-slate-900 dark:text-white text-left focus:outline-none focus:ring-0 focus:border-stone-400 dark:focus:border-white/20 shadow-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t('newPassword')}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  dir="ltr"
                  className="w-full px-4 py-2.5 rounded-full border border-stone-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] text-xs text-slate-900 dark:text-white text-left focus:outline-none focus:ring-0 focus:border-stone-400 dark:focus:border-white/20 shadow-none transition-colors"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-2.5 rounded-full bg-stone-100 dark:bg-white/[0.08] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-stone-200 dark:hover:bg-white/[0.12] transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-semibold shadow-xs"
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
