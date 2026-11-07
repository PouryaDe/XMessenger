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
      setMsg(t('settingsSaved'));
      setTimeout(() => {
        setMsg(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setMsg(t('pwdChangeError') + ': ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs font-sans">
      <div className="w-full max-w-lg bg-ambient-canvas border border-stone-200/60 dark:border-slate-800 rounded-[32px] p-6 sm:p-8 shadow-floating relative animate-message">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-200/50 dark:border-slate-800 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-slate-800 text-amber-500 flex items-center justify-center shadow-soft border border-black/5 dark:border-white/10">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                {t('settings')} - {t('adminPanel')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {t('settingsSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-soft border border-black/5 dark:border-white/10 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {msg && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* 1. Registration Switch */}
          <div className="flex items-start justify-between p-4 rounded-[24px] bg-white dark:bg-slate-800/90 shadow-soft border border-black/5 dark:border-white/5">
            <div>
              <label className="text-xs font-bold text-slate-900 dark:text-white cursor-pointer block">
                {t('allowRegistration')}
              </label>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {t('allowRegistrationDesc')}
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.registrationEnabled}
              onChange={(e) => setSettings({ ...settings, registrationEnabled: e.target.checked })}
              className="w-5 h-5 accent-slate-900 dark:accent-amber-400 rounded cursor-pointer mt-1"
            />
          </div>

          {/* 2. Manual Approval Switch */}
          <div className="flex items-start justify-between p-4 rounded-[24px] bg-white dark:bg-slate-800/90 shadow-soft border border-black/5 dark:border-white/5">
            <div>
              <label className="text-xs font-bold text-slate-900 dark:text-white cursor-pointer block">
                {t('registrationApproval')}
              </label>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {t('registrationApprovalDesc')}
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.requireApproval}
              onChange={(e) => setSettings({ ...settings, requireApproval: e.target.checked })}
              className="w-5 h-5 accent-slate-900 dark:accent-amber-400 rounded cursor-pointer mt-1"
            />
          </div>

          {/* 3. Disappearing TTL (In Minutes, Integer Input) */}
          <div className="p-4 rounded-[24px] bg-white dark:bg-slate-800/90 shadow-soft border border-black/5 dark:border-white/5">
            <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between mb-1">
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span>{t('defaultTtl')}</span>
              </span>
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
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
                className="w-full pl-5 pr-20 rtl:pr-5 rtl:pl-20 py-3 rounded-full border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-0 focus:border-stone-400 dark:focus:border-slate-500 shadow-none transition-colors"
                placeholder="1440"
              />
              <span className="absolute end-4 rtl:left-4 rtl:right-auto ltr:right-4 ltr:left-auto text-xs text-slate-400 font-semibold pointer-events-none">
                {t('minutesUnit')}
              </span>
            </div>

            {/* Quick Presets Chips */}
            <div className="flex items-center flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-stone-100 dark:border-slate-700/50">
              <span className="text-[10px] text-slate-400 w-full mb-0.5">
                {t('quickPresets')}
              </span>
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
                        : 'bg-stone-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {preset.min} {t('minutesUnit')} ({preset.label})
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-stone-200/50 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800 transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-6 py-2.5 rounded-full text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md hover:scale-102 active:scale-98 disabled:opacity-40 transition-all"
          >
            {loading ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
};
