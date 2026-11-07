import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api, AdminSettings } from '../../services/api.js';
import { X, Sliders, Clock, Check } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminSettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      api.getAdminSettings().then(setSettings).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen || !settings) return null;

  const handleSave = async () => {
    setLoading(true);
    setMsg(null);
    try {
      await api.updateAdminSettings(settings);
      setMsg('تنظیمات با موفقیت ذخیره شد');
      setTimeout(() => {
        setMsg(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setMsg('خطا در ذخیره تنظیمات: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl relative animate-message">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary-500/10 text-primary-500">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-gray-900 dark:text-white">
                {t('settings')} - {t('adminPanel')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                پیکربندی امنیت، عضویت و حذف خودکار پیام‌ها
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {msg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        <div className="space-y-5">
          {/* 1. Registration Switch */}
          <div className="flex items-start justify-between p-3.5 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/70 dark:border-slate-800">
            <div>
              <label className="text-sm font-semibold text-gray-900 dark:text-white cursor-pointer block">
                {t('allowRegistration')}
              </label>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                {t('allowRegistrationDesc')}
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.registrationEnabled}
              onChange={(e) => setSettings({ ...settings, registrationEnabled: e.target.checked })}
              className="w-5 h-5 accent-primary-600 rounded cursor-pointer mt-1"
            />
          </div>

          {/* 2. Manual Approval Switch */}
          <div className="flex items-start justify-between p-3.5 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/70 dark:border-slate-800">
            <div>
              <label className="text-sm font-semibold text-gray-900 dark:text-white cursor-pointer block">
                {t('registrationApproval')}
              </label>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                {t('registrationApprovalDesc')}
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.requireApproval}
              onChange={(e) => setSettings({ ...settings, requireApproval: e.target.checked })}
              className="w-5 h-5 accent-primary-600 rounded cursor-pointer mt-1"
            />
          </div>

          {/* 3. Disappearing TTL */}
          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/70 dark:border-slate-800">
            <label className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>{t('defaultTtl')}</span>
            </label>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
              مدت زمان باقی‌ماندن پیام‌ها قبل از پاکسازی قطعی از دیتابیس
            </p>
            <select
              value={settings.defaultTtlSeconds}
              onChange={(e) => setSettings({ ...settings, defaultTtlSeconds: parseInt(e.target.value, 10) })}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-sans"
            >
              <option value={900}>{t('ttl15m')}</option>
              <option value={3600}>{t('ttl1h')}</option>
              <option value={21600}>{t('ttl6h')}</option>
              <option value={86400}>{t('ttl24h')}</option>
              <option value={172800}>{t('ttl2d')}</option>
              <option value={604800}>{t('ttl7d')}</option>
            </select>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-5 py-2 rounded-xl text-xs font-medium bg-primary-600 hover:bg-primary-500 text-white shadow-md shadow-primary-500/20 disabled:opacity-50"
          >
            {loading ? 'در حال ذخیره...' : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
};
