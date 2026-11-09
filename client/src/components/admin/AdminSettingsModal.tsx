import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, AdminSettings } from '../../services/api.js';
import { useAuthStore } from '../../stores/authStore.js';
import { getErrorMessage } from '../../utils/errors.js';
import { APP_VERSION } from '../../config/version.js';
import { 
  X, 
  Sliders, 
  Clock, 
  Check, 
  Database, 
  Download, 
  Upload, 
  Smartphone, 
  Camera, 
  Trash2, 
  AlertTriangle, 
  RefreshCw,
  Bell,
  BellRing,
  Send,
  KeyRound,
  Loader2,
  Eye
} from 'lucide-react';
import { ChangePasswordModal } from '../common/ChangePasswordModal.js';
import { 
  getCurrentSubscription, 
  subscribeToPush, 
  unsubscribeFromPush, 
  sendTestNotification 
} from '../../services/push.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'general' | 'notifications' | 'branding' | 'backup';

export const AdminSettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { user, updateUserAvatar, updateAdminAvatar } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Backup & Restore states
  const [isDownloading, setIsDownloading] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // File upload refs
  const pwaIconInputRef = useRef<HTMLInputElement>(null);
  const adminAvatarInputRef = useRef<HTMLInputElement>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  // Push Notifications states
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [pushErrorMsg, setPushErrorMsg] = useState<string | null>(null);
  const [activeDevicesCount, setActiveDevicesCount] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      api.getAdminSettings().then(setSettings).catch(console.error);
      getCurrentSubscription().then(sub => setIsPushSubscribed(Boolean(sub)));
      api.getPushStatus().then(status => setActiveDevicesCount(status.activeDevices)).catch(() => {});
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
          api.getPushStatus().then(status => setActiveDevicesCount(status.activeDevices)).catch(() => {});
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

  if (!isOpen || !settings) return null;

  const handleSave = async () => {
    setLoading(true);
    setMsg(null);
    try {
      await api.updateAdminSettings(settings);
      setMsg({ type: 'success', text: t('settingsSaved') });
      setTimeout(() => {
        setMsg(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setMsg({ type: 'error', text: getErrorMessage(err, 'errGeneral') });
    } finally {
      setLoading(false);
    }
  };

  // Upload PWA Icon
  const handlePwaIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMsg(null);
    try {
      const res = await api.uploadPwaIcon(file);
      setSettings(prev => prev ? { ...prev, pwaIconUrl: res.pwaIconUrl } : null);
      setMsg({ type: 'success', text: t('settingsSaved') });
      // Update dynamic DOM icon if present
      const linkIcon = document.querySelector('link[rel="icon"]');
      if (linkIcon) linkIcon.setAttribute('href', res.pwaIconUrl);
    } catch (err: any) {
      setMsg({ type: 'error', text: getErrorMessage(err, 'imageUploadFailed') });
    } finally {
      setLoading(false);
      if (pwaIconInputRef.current) pwaIconInputRef.current.value = '';
    }
  };

  // Reset PWA Icon
  const handleResetPwaIcon = async () => {
    setLoading(true);
    try {
      await api.deletePwaIcon();
      setSettings(prev => prev ? { ...prev, pwaIconUrl: '' } : null);
      setMsg({ type: 'success', text: t('settingsSaved') });
      const linkIcon = document.querySelector('link[rel="icon"]');
      if (linkIcon) linkIcon.setAttribute('href', '/icon-192.png');
    } catch (err: any) {
      setMsg({ type: 'error', text: getErrorMessage(err, 'errGeneral') });
    } finally {
      setLoading(false);
    }
  };

  // Upload Admin Avatar
  const handleAdminAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMsg(null);
    try {
      const res = await api.uploadAvatar(file);
      setSettings(prev => prev ? { ...prev, adminAvatarUrl: res.avatarUrl } : null);
      updateUserAvatar(res.avatarUrl);
      updateAdminAvatar(res.avatarUrl);
      setMsg({ type: 'success', text: t('settingsSaved') });
    } catch (err: any) {
      setMsg({ type: 'error', text: getErrorMessage(err, 'imageUploadFailed') });
    } finally {
      setLoading(false);
      if (adminAvatarInputRef.current) adminAvatarInputRef.current.value = '';
    }
  };

  // Remove Admin Avatar
  const handleRemoveAdminAvatar = async () => {
    setLoading(true);
    try {
      await api.deleteAvatar();
      setSettings(prev => prev ? { ...prev, adminAvatarUrl: '' } : null);
      updateUserAvatar(undefined);
      updateAdminAvatar(undefined);
      setMsg({ type: 'success', text: t('settingsSaved') });
    } catch (err: any) {
      setMsg({ type: 'error', text: getErrorMessage(err, 'errGeneral') });
    } finally {
      setLoading(false);
    }
  };

  // Download Backup
  const handleDownloadBackup = async () => {
    setIsDownloading(true);
    setMsg(null);
    try {
      await api.downloadBackup();
      setMsg({ type: 'success', text: t('backupTitle') + ': ' + t('clearedSuccess') });
    } catch (err: any) {
      setMsg({ type: 'error', text: getErrorMessage(err, 'errDownloadFailed') });
    } finally {
      setIsDownloading(false);
    }
  };

  // Trigger Database Restore
  const handleExecuteRestore = async () => {
    if (!restoreFile) return;

    setIsRestoring(true);
    setShowRestoreConfirm(false);
    setMsg(null);
    try {
      await api.restoreBackup(restoreFile);
      setMsg({ type: 'success', text: t('restoreSuccessMsg') });
      setRestoreFile(null);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setMsg({ type: 'error', text: getErrorMessage(err, 'errRestoreFailed') });
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/40 backdrop-blur-xs font-sans">
      <div className="w-full max-w-xl bg-white/95 dark:bg-[#0E1218]/95 backdrop-blur-2xl border border-black/[0.06] dark:border-white/[0.08] rounded-[32px] p-5 sm:p-7 shadow-floating relative animate-message flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200/50 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-white/[0.08] text-amber-500 flex items-center justify-center shadow-xs border border-black/5 dark:border-white/[0.09]">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white leading-none">
                  {t('settings')} - {t('adminPanel')}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {t('settingsSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 shadow-xs border border-black/5 dark:border-white/[0.09] flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4 Modern Segmented Tabs (Fully Responsive 2-col on mobile, 4-col on tablet/desktop) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 my-3 bg-stone-100 dark:bg-black/30 rounded-2xl border border-black/5 dark:border-white/5">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`w-full py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'general'
                ? 'bg-white dark:bg-white/[0.14] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('generalTab')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`w-full py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'notifications'
                ? 'bg-white dark:bg-white/[0.14] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('notificationsTab')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('branding')}
            className={`w-full py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'branding'
                ? 'bg-white dark:bg-white/[0.14] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('brandingTab')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`w-full py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'backup'
                ? 'bg-white dark:bg-white/[0.14] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('backupTab')}</span>
          </button>
        </div>

        {/* Feedback Message Banner */}
        {msg && (
          <div className={`mb-3 p-3 rounded-2xl text-xs flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
              : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'
          }`}>
            {msg.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}

        {/* Tab Body Content */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 rtl:pr-0 rtl:pl-1">
          
          {/* TAB 1: GENERAL & TTL */}
          {activeTab === 'general' && (
            <>
              {/* System Version Card */}
              <div className="flex items-center justify-between p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06]">
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block select-none">
                    {t('systemVersion')}
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5 select-none">
                    {t('systemVersionDesc')}
                  </p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  v{APP_VERSION}
                </span>
              </div>

              {/* System Active / Maintenance Mode Toggle */}
              <div 
                onClick={() => setSettings({ ...settings, systemEnabled: settings.systemEnabled === false ? true : false })}
                className="flex items-start justify-between p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06] cursor-pointer group transition-all"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-900 dark:text-white cursor-pointer block select-none">
                      {t('systemEnabledLabel')}
                    </label>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      settings.systemEnabled !== false
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
                        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25'
                    }`}>
                      {settings.systemEnabled !== false ? t('systemActive') : t('systemDisabled')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 select-none">
                    {t('systemEnabledDesc')}
                  </p>
                </div>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={settings.systemEnabled !== false}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSettings({ ...settings, systemEnabled: settings.systemEnabled === false ? true : false });
                  }}
                  className={`w-6 h-6 rounded-[8px] flex items-center justify-center transition-all duration-200 mt-0.5 shrink-0 border ${
                    settings.systemEnabled !== false
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                      : 'bg-stone-100 dark:bg-white/[0.06] border-black/15 dark:border-white/15 text-transparent hover:border-black/30 dark:hover:border-white/30'
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 stroke-[3] transition-transform duration-150 ${settings.systemEnabled !== false ? 'scale-100' : 'scale-0'}`} />
                </button>
              </div>

              {/* 1. Registration Switch */}
              <div 
                onClick={() => setSettings({ ...settings, registrationEnabled: !settings.registrationEnabled })}
                className="flex items-start justify-between p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06] cursor-pointer group transition-all"
              >
                <div>
                  <label className="text-xs font-bold text-slate-900 dark:text-white cursor-pointer block select-none">
                    {t('allowRegistration')}
                  </label>
                  <p className="text-[11px] text-slate-400 mt-0.5 select-none">
                    {t('allowRegistrationDesc')}
                  </p>
                </div>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={settings.registrationEnabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSettings({ ...settings, registrationEnabled: !settings.registrationEnabled });
                  }}
                  className={`w-6 h-6 rounded-[8px] flex items-center justify-center transition-all duration-200 mt-0.5 shrink-0 border ${
                    settings.registrationEnabled
                      ? 'bg-slate-900 dark:bg-amber-400 border-slate-900 dark:border-amber-400 text-white dark:text-slate-950 shadow-xs'
                      : 'bg-stone-100 dark:bg-white/[0.06] border-black/15 dark:border-white/15 text-transparent hover:border-black/30 dark:hover:border-white/30'
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 stroke-[3] transition-transform duration-150 ${settings.registrationEnabled ? 'scale-100' : 'scale-0'}`} />
                </button>
              </div>

              {/* 2. Manual Approval Switch */}
              <div 
                onClick={() => setSettings({ ...settings, requireApproval: !settings.requireApproval })}
                className="flex items-start justify-between p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06] cursor-pointer group transition-all"
              >
                <div>
                  <label className="text-xs font-bold text-slate-900 dark:text-white cursor-pointer block select-none">
                    {t('registrationApproval')}
                  </label>
                  <p className="text-[11px] text-slate-400 mt-0.5 select-none">
                    {t('registrationApprovalDesc')}
                  </p>
                </div>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={settings.requireApproval}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSettings({ ...settings, requireApproval: !settings.requireApproval });
                  }}
                  className={`w-6 h-6 rounded-[8px] flex items-center justify-center transition-all duration-200 mt-0.5 shrink-0 border ${
                    settings.requireApproval
                      ? 'bg-slate-900 dark:bg-amber-400 border-slate-900 dark:border-amber-400 text-white dark:text-slate-950 shadow-xs'
                      : 'bg-stone-100 dark:bg-white/[0.06] border-black/15 dark:border-white/15 text-transparent hover:border-black/30 dark:hover:border-white/30'
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 stroke-[3] transition-transform duration-150 ${settings.requireApproval ? 'scale-100' : 'scale-0'}`} />
                </button>
              </div>

              {/* 3. Show Admin Presence (Online / Offline & Last Seen) */}
              <div 
                onClick={() => setSettings({ ...settings, showAdminPresence: settings.showAdminPresence === false ? true : false })}
                className="flex items-start justify-between p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06] cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border mt-0.5 ${
                    settings.showAdminPresence !== false
                      ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-stone-100 dark:bg-white/[0.06] text-slate-400 border-black/5 dark:border-white/5'
                  }`}>
                    <Eye className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block select-none">
                      {t('showAdminPresenceLabel')}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5 select-none leading-relaxed">
                      {t('showAdminPresenceDesc')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="checkbox"
                  aria-checked={settings.showAdminPresence !== false}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSettings({ ...settings, showAdminPresence: settings.showAdminPresence === false ? true : false });
                  }}
                  className={`w-6 h-6 rounded-[8px] flex items-center justify-center transition-all duration-200 mt-0.5 shrink-0 border ${
                    settings.showAdminPresence !== false
                      ? 'bg-slate-900 dark:bg-amber-400 border-slate-900 dark:border-amber-400 text-white dark:text-slate-950 shadow-xs'
                      : 'bg-stone-100 dark:bg-white/[0.06] border-black/15 dark:border-white/15 text-transparent hover:border-black/30 dark:hover:border-white/30'
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 stroke-[3] transition-transform duration-150 ${settings.showAdminPresence !== false ? 'scale-100' : 'scale-0'}`} />
                </button>
              </div>

              {/* 3. Disappearing TTL */}
              <div className="p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06]">
                <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between mb-1">
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span>{t('defaultTtl')}</span>
                  </span>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                    {Math.round(settings.defaultTtlSeconds / 60)} {t('minutesUnit')}
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 mb-2.5">
                  {t('ttlSubtitle')}
                </p>

                {/* Integer input */}
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={Math.round(settings.defaultTtlSeconds / 60)}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setSettings({
                        ...settings,
                        defaultTtlSeconds: isNaN(val) ? 60 : Math.max(1, val) * 60
                      });
                    }}
                    className="w-full pl-5 pr-20 rtl:pr-5 rtl:pl-20 py-2.5 rounded-full border border-stone-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-stone-400 dark:focus:border-white/20 shadow-none transition-colors"
                    placeholder="1440"
                  />
                  <span className="absolute end-4 text-xs text-slate-400 font-semibold pointer-events-none">
                    {t('minutesUnit')}
                  </span>
                </div>

                {/* Quick Presets Chips */}
                <div className="flex items-center flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-stone-100 dark:border-white/[0.06]">
                  {[
                    { min: 15, label: '15m' },
                    { min: 60, label: '1h' },
                    { min: 360, label: '6h' },
                    { min: 1440, label: '24h' },
                    { min: 2880, label: '2d' },
                    { min: 10080, label: '7d' },
                  ].map((preset) => {
                    const isSelected = Math.round(settings.defaultTtlSeconds / 60) === preset.min;
                    return (
                      <button
                        key={preset.min}
                        type="button"
                        onClick={() => setSettings({ ...settings, defaultTtlSeconds: preset.min * 60 })}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                          isSelected
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs scale-102'
                            : 'bg-stone-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-white/[0.10]'
                        }`}
                      >
                        {preset.min} {t('minutesUnit')} ({preset.label})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Admin Account Password Change */}
              <div className="flex items-center justify-between p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06]">
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block select-none">
                    {t('changePassword')}
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5 select-none">
                    {t('changePasswordDesc')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(true)}
                  className="px-3.5 py-2 rounded-full text-xs font-semibold bg-stone-100 dark:bg-white/[0.08] text-slate-700 dark:text-slate-200 hover:bg-stone-200 dark:hover:bg-white/[0.12] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                  <span>{t('changePassword')}</span>
                </button>
              </div>
            </>
          )}

          {/* TAB 2: NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <>
              {/* Push Status Card */}
              <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06] space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                      isPushSubscribed 
                        ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20' 
                        : 'bg-stone-100 dark:bg-white/[0.06] text-slate-400 border-black/5 dark:border-white/5'
                    }`}>
                      {isPushSubscribed ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 flex-1 text-start overflow-hidden">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {t('pushNotifications')}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed truncate">
                        {t('pushNotificationsDesc')}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleTogglePush}
                    disabled={isPushLoading}
                    className={`min-w-[5.25rem] px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all shadow-xs shrink-0 cursor-pointer flex items-center justify-center gap-1.5 ${
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
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 leading-relaxed font-sans break-words overflow-hidden">
                    {pushErrorMsg}
                  </div>
                )}

                {isPushSubscribed && (
                  <div className="pt-2 border-t border-stone-100 dark:border-white/[0.06] flex items-center justify-between">
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      {t('pushEnabled')}
                    </span>

                    <button
                      type="button"
                      onClick={handleSendTestPush}
                      disabled={isSendingTest}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
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

              {/* Devices & System Info Card */}
              <div className="p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {t('activeDevicesLabel')}
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.08] text-slate-700 dark:text-slate-300 font-bold">
                    {t('activeDevicesCount', { count: activeDevicesCount })}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  {t('pushSystemInfo')}
                </p>
              </div>
            </>
          )}

          {/* TAB 3: PWA & BRANDING */}
          {activeTab === 'branding' && (
            <>
              {/* Application Name */}
              <div className="p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06] space-y-1.5">
                <label className="text-xs font-bold text-slate-900 dark:text-white block">
                  {t('appNameLabel')}
                </label>
                <p className="text-[11px] text-slate-400">
                  {t('appNameDesc')}
                </p>
                <input
                  type="text"
                  value={settings.appName || ''}
                  onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                  placeholder="XMessenger"
                  className="w-full px-4 py-2.5 rounded-full border border-stone-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] text-xs text-slate-900 dark:text-white font-sans focus:outline-none focus:border-stone-400 dark:focus:border-white/20 shadow-none transition-colors"
                />
              </div>

              {/* PWA Short Name */}
              <div className="p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06] space-y-1.5">
                <label className="text-xs font-bold text-slate-900 dark:text-white block">
                  {t('pwaShortNameLabel')}
                </label>
                <p className="text-[11px] text-slate-400">
                  {t('pwaShortNameDesc')}
                </p>
                <input
                  type="text"
                  value={settings.pwaShortName || ''}
                  onChange={(e) => setSettings({ ...settings, pwaShortName: e.target.value })}
                  placeholder="XMessenger"
                  className="w-full px-4 py-2.5 rounded-full border border-stone-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] text-xs text-slate-900 dark:text-white font-sans focus:outline-none focus:border-stone-400 dark:focus:border-white/20 shadow-none transition-colors"
                />
              </div>

              {/* PWA Icon Upload */}
              <div className="p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-900 dark:text-white block">
                      {t('pwaIconLabel')}
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {t('pwaIconDesc')}
                    </p>
                  </div>
                  {/* Current Icon Preview */}
                  <div className="w-14 h-14 rounded-2xl bg-stone-100 dark:bg-white/[0.08] overflow-hidden shrink-0 border border-black/10 dark:border-white/10 flex items-center justify-center shadow-xs">
                    {settings.pwaIconUrl ? (
                      <img src={settings.pwaIconUrl} alt="PWA Icon" className="w-full h-full object-cover" />
                    ) : (
                      <img src={`/icon-192.png?v=${APP_VERSION}`} alt="PWA Icon Default" className="w-full h-full object-cover" />
                    )}
                  </div>
                </div>

                {/* Allowed Formats & Size Spec */}
                <div className="mt-3 p-2.5 rounded-xl bg-stone-100 dark:bg-white/[0.04] text-[11px] text-slate-500 dark:text-slate-400 border border-black/5 dark:border-white/5 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span>{t('iconSpecsLabel')}</span>
                </div>

                {/* Default Icon Presets (X, F, G, R, M, S) */}
                <div className="mt-3.5">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-2 select-none">
                    {t('defaultIconsTitle')}
                  </span>
                  <div className="grid grid-cols-6 gap-2">
                    {[
                      { id: 'X', url: '/icons/preset-x.svg', label: 'X' },
                      { id: 'F', url: '/icons/preset-f.svg', label: 'F' },
                      { id: 'G', url: '/icons/preset-g.svg', label: 'G' },
                      { id: 'R', url: '/icons/preset-r.svg', label: 'R' },
                      { id: 'M', url: '/icons/preset-m.svg', label: 'M' },
                      { id: 'S', url: '/icons/preset-s.svg', label: 'S' }
                    ].map((icon) => (
                      <button
                        key={icon.id}
                        type="button"
                        onClick={() => {
                          setSettings(prev => prev ? { ...prev, pwaIconUrl: icon.url } : null);
                          const linkIcon = document.querySelector('link[rel="icon"]');
                          if (linkIcon) linkIcon.setAttribute('href', icon.url);
                        }}
                        className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all p-0.5 hover:scale-105 active:scale-95 cursor-pointer shadow-xs ${
                          settings.pwaIconUrl === icon.url
                            ? 'border-amber-500 ring-2 ring-amber-500/30'
                            : 'border-black/10 dark:border-white/10 hover:border-black/30'
                        }`}
                        title={`Preset ${icon.label}`}
                      >
                        <img src={icon.url} alt={icon.label} className="w-full h-full object-cover rounded-[8px]" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-white/[0.06]">
                  <input
                    ref={pwaIconInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handlePwaIconChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => pwaIconInputRef.current?.click()}
                    disabled={loading}
                    className="px-4 py-2 rounded-full text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs hover:scale-102 active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{t('uploadNewIcon')}</span>
                  </button>

                  {settings.pwaIconUrl && (
                    <button
                      type="button"
                      onClick={handleResetPwaIcon}
                      disabled={loading}
                      className="px-3.5 py-2 rounded-full text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t('resetToDefaultIcon')}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Admin Profile Picture Upload */}
              <div className="p-4 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-900 dark:text-white block">
                      {t('adminAvatarLabel')}
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {t('adminAvatarDesc')}
                    </p>
                  </div>
                  {/* Current Admin Avatar Preview */}
                  <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden shrink-0 border border-black/10 dark:border-white/10 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-base shadow-xs">
                    {settings.adminAvatarUrl ? (
                      <img src={settings.adminAvatarUrl} alt="Admin Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span>{user?.username.substring(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                </div>

                {/* Default Admin Avatar Presets */}
                <div className="mt-3.5">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-2 select-none">
                    {t('defaultAvatarsTitle')}
                  </span>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {[
                      { id: 'shield', url: '/avatars/admin-shield.svg', label: 'Shield' },
                      { id: 'support', url: '/avatars/admin-support.svg', label: 'Support' },
                      { id: 'crown', url: '/avatars/admin-crown.svg', label: 'Crown' },
                      { id: 'star', url: '/avatars/admin-star.svg', label: 'Star' },
                      { id: 'minimal', url: '/avatars/admin-minimal.svg', label: 'Minimal' }
                    ].map((av) => (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => {
                          setSettings(prev => prev ? { ...prev, adminAvatarUrl: av.url } : null);
                          updateAdminAvatar(av.url);
                        }}
                        className={`w-11 h-11 rounded-full overflow-hidden border-2 transition-all p-0.5 hover:scale-110 active:scale-95 cursor-pointer shadow-xs ${
                          settings.adminAvatarUrl === av.url
                            ? 'border-amber-500 ring-2 ring-amber-500/30'
                            : 'border-black/10 dark:border-white/10 hover:border-black/30'
                        }`}
                        title={av.label}
                      >
                        <img src={av.url} alt={av.label} className="w-full h-full object-cover rounded-full" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-white/[0.06]">
                  <input
                    ref={adminAvatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleAdminAvatarChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => adminAvatarInputRef.current?.click()}
                    disabled={loading}
                    className="px-4 py-2 rounded-full text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs hover:scale-102 active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{t('uploadAvatar')}</span>
                  </button>

                  {settings.adminAvatarUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveAdminAvatar}
                      disabled={loading}
                      className="px-3.5 py-2 rounded-full text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t('removeAvatar')}</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB 3: DATABASE BACKUP & RESTORE */}
          {activeTab === 'backup' && (
            <>
              {/* 1. Download Backup Card */}
              <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06] space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/10">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      {t('backupTitle')}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      {t('backupDesc')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  disabled={isDownloading}
                  className="w-full py-2.5 px-4 rounded-full text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm hover:scale-101 active:scale-99 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDownloading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{t('downloadingBackup')}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>{t('downloadBackupBtn')}</span>
                    </>
                  )}
                </button>
              </div>

              {/* 2. Restore Backup Card */}
              <div className="p-4 sm:p-5 rounded-[24px] bg-white dark:bg-white/[0.04] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.06] space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/10">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      {t('restoreTitle')}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      {t('restoreDesc')}
                    </p>
                  </div>
                </div>

                {/* Warning Alert */}
                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] flex items-start gap-2 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>{t('restoreWarning')}</span>
                </div>

                {/* File selector input */}
                <input
                  ref={restoreFileInputRef}
                  type="file"
                  accept=".db,.sqlite,.sqlite3"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setRestoreFile(f);
                  }}
                  className="hidden"
                />

                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <button
                    type="button"
                    onClick={() => restoreFileInputRef.current?.click()}
                    disabled={isRestoring}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-full text-xs font-bold bg-stone-100 dark:bg-white/[0.08] text-slate-700 dark:text-slate-200 hover:bg-stone-200 dark:hover:bg-white/[0.12] transition-colors flex items-center justify-center gap-2 shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{restoreFile ? restoreFile.name : t('selectBackupFile')}</span>
                  </button>

                  {restoreFile && (
                    <button
                      type="button"
                      onClick={() => setShowRestoreConfirm(true)}
                      disabled={isRestoring}
                      className="w-full sm:flex-1 py-2.5 px-4 rounded-full text-xs font-bold bg-red-600 text-white shadow-sm hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                      <span>{t('restoreBtn')}</span>
                    </button>
                  )}
                </div>

                {/* Confirmation Dialog */}
                {showRestoreConfirm && (
                  <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-500/20 space-y-2.5 animate-message">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{t('confirmRestoreTitle')}</span>
                    </div>
                    <p className="text-[11px] text-red-700 dark:text-red-300 leading-relaxed">
                      {t('confirmRestoreText')}
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowRestoreConfirm(false)}
                        className="px-3.5 py-1.5 rounded-full text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      >
                        {t('cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={handleExecuteRestore}
                        disabled={isRestoring}
                        className="px-4 py-1.5 rounded-full text-xs font-bold bg-red-600 text-white shadow-sm hover:bg-red-700 transition-colors"
                      >
                        {isRestoring ? t('restoringDatabase') : t('restoreBtn')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 mt-4 pt-3 border-t border-stone-200/50 dark:border-white/[0.06] shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-white/[0.08] transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={loading || isRestoring}
            className="px-6 py-2.5 rounded-full text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs hover:scale-102 active:scale-98 disabled:opacity-40 transition-all"
          >
            {loading ? t('saving') : t('save')}
          </button>
        </div>

        {/* Change Admin Password Modal */}
        <ChangePasswordModal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
        />
      </div>
    </div>
  );
};
