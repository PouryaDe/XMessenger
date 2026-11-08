import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { api } from '../../services/api.js';
import { APP_VERSION } from '../../config/version.js';
import { LanguageToggle } from '../common/LanguageToggle.js';
import { ThemeToggle } from '../common/ThemeToggle.js';
import { getErrorMessage } from '../../utils/errors.js';
import { 
  getCurrentSubscription, 
  subscribeToPush, 
  unsubscribeFromPush, 
  sendTestNotification
} from '../../services/push.js';
import { 
  X, 
  ShieldCheck, 
  KeyRound, 
  Trash2, 
  LogOut,
  Camera,
  RefreshCw,
  Bell,
  BellRing,
  Send,
  Loader2
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenChangePassword?: () => void;
}

export const UserDrawer: React.FC<Props> = ({ isOpen, onClose, onOpenChangePassword }) => {
  const { t, i18n } = useTranslation();
  const { user, logout, updateUserAvatar } = useAuthStore();
  const { clearMessages } = useChatStore();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUpdatingApp, setIsUpdatingApp] = useState(false);
  const [updateStepText, setUpdateStepText] = useState<string | null>(null);

  // Push Notifications state
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [pushErrorMsg, setPushErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPushErrorMsg(null);
      getCurrentSubscription().then((sub) => {
        setIsPushSubscribed(Boolean(sub));
      });
    }
  }, [isOpen]);

  const handleTogglePush = async () => {
    setIsPushLoading(true);
    setPushErrorMsg(null);
    try {
      if (isPushSubscribed) {
        await unsubscribeFromPush();
        setIsPushSubscribed(false);
      } else {
        const res = await subscribeToPush();
        if (res.success) {
          setIsPushSubscribed(true);
        } else {
          if (res.error === 'IOS_PWA_REQUIRED') {
            setPushErrorMsg(t('pushIosTip'));
          } else if (res.error === 'PERMISSION_DENIED') {
            setPushErrorMsg(t('pushPermissionDenied'));
          } else {
            setPushErrorMsg(t('pushUnsupported'));
          }
        }
      }
    } catch (e: any) {
      setPushErrorMsg(getErrorMessage(e, 'pushUnsupported'));
    } finally {
      setIsPushLoading(false);
    }
  };

  const handleSendTestPush = async () => {
    setIsSendingTest(true);
    try {
      const ok = await sendTestNotification();
      alert(ok ? t('pushTestSent') : t('pushTestFailed'));
    } catch {
      alert(t('pushTestFailed'));
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleForceUpdateApp = async () => {
    setIsUpdatingApp(true);
    setUpdateStepText(t('clearingCache'));
    // Signal global smooth updating transition so UI doesn't jump or flash
    window.dispatchEvent(new CustomEvent('app:updating', { detail: { reason: 'manual' } }));

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
          reg.active?.postMessage({ type: 'PURGE_CACHE' });
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      console.warn('Force update purge error:', e);
    }

    setUpdateStepText(t('loadingLatest'));
    setTimeout(() => {
      window.location.reload();
    }, 450);
  };

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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer content */}
      <div className={`relative w-[88vw] max-w-xs sm:max-w-sm h-full bg-white/95 dark:bg-[#0E1218]/95 backdrop-blur-2xl border-x border-black/[0.06] dark:border-white/[0.08] shadow-2xl flex flex-col z-10 font-sans ${i18n.language === 'fa' ? 'animate-drawer-left' : 'animate-drawer-right'}`}>
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
                className="w-12 h-12 rounded-full bg-white dark:bg-white/[0.08] text-slate-800 dark:text-white flex items-center justify-center font-bold shadow-xs border border-black/5 dark:border-white/[0.09] text-sm uppercase overflow-hidden relative group/avatar focus:outline-none"
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

          {/* Web Push Notifications Card */}
          <div className="p-3.5 sm:p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06] space-y-2.5 overflow-hidden">
            <div className="flex items-center justify-between gap-2.5 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  isPushSubscribed 
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' 
                    : 'bg-stone-100 dark:bg-white/[0.06] text-slate-400'
                }`}>
                  {isPushSubscribed ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1 overflow-hidden text-start">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate">
                    {t('pushNotifications')}
                  </p>
                  <p className="text-[10px] text-slate-400 font-normal mt-0.5 truncate">
                    {isPushSubscribed ? t('pushEnabled') : t('pushDisabled')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTogglePush}
                disabled={isPushLoading}
                className={`min-w-[5.25rem] px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all shadow-xs shrink-0 cursor-pointer flex items-center justify-center gap-1.5 ${
                  isPushSubscribed
                    ? 'bg-stone-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30'
                    : 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold'
                } disabled:opacity-75 disabled:cursor-not-allowed`}
              >
                {isPushLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>{t('pushSubscribingShort')}</span>
                  </>
                ) : (
                  <span>{isPushSubscribed ? t('disablePush') : t('enablePush')}</span>
                )}
              </button>
            </div>

            {pushErrorMsg && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed font-sans break-words overflow-hidden">
                {pushErrorMsg}
              </div>
            )}

            {isPushSubscribed && (
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={handleSendTestPush}
                  disabled={isSendingTest}
                  className="text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isSendingTest ? (
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  ) : (
                    <Send className="w-3 h-3 shrink-0" />
                  )}
                  <span>{isSendingTest ? t('pushSendingTest') : t('pushSendTest')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Password change option */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenChangePassword?.();
            }}
            className="w-full flex items-center gap-3 p-4 rounded-[22px] bg-white dark:bg-white/[0.04] dark:hover:bg-white/[0.08] shadow-xs border border-black/[0.06] dark:border-white/[0.06] text-xs font-semibold text-slate-800 dark:text-slate-200 transition-all cursor-pointer"
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

          {/* Update PWA / Force Refresh App */}
          <div className="p-3.5 sm:p-4 rounded-[22px] bg-white dark:bg-white/[0.04] shadow-xs border border-black/[0.06] dark:border-white/[0.06] transition-all overflow-hidden">
            <div className="flex items-center justify-between gap-2.5 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <RefreshCw className={`w-4 h-4 ${isUpdatingApp ? 'animate-spin' : ''}`} />
                </div>
                <div className="min-w-0 flex-1 text-start overflow-hidden">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate">
                    {t('updateApp')}
                  </p>
                  <p className="text-[10px] text-slate-400 font-normal mt-0.5 truncate">
                    {t('updateAppDesc')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleForceUpdateApp}
                disabled={isUpdatingApp}
                className="px-2.5 py-1.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold shrink-0 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-80 disabled:cursor-not-allowed"
              >
                {isUpdatingApp ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    <span>{t('updatingApp')}</span>
                  </>
                ) : (
                  <span>v{APP_VERSION}</span>
                )}
              </button>
            </div>

            {isUpdatingApp && (
              <div className="mt-2.5 pt-2 border-t border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                <span className="truncate">{updateStepText || t('updatingAppDesc')}</span>
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 ms-2" />
              </div>
            )}
          </div>
        </div>

        {/* Footer Logout & App Version */}
        <div className="p-5 pb-safe border-t border-stone-200/50 dark:border-white/[0.06]">
          <button
            onClick={logout}
            className="w-full py-3 px-4 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold transition-all shadow-xs hover:scale-102 active:scale-98 flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('logout')}</span>
          </button>
          <div className="text-center text-[10px] text-slate-400 dark:text-slate-500 mt-3 select-none">
            XMessenger v{APP_VERSION}
          </div>
        </div>
      </div>
    </div>
  );
};
