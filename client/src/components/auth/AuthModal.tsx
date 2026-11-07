import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { api, AppMeta } from '../../services/api.js';
import { LanguageToggle } from '../common/LanguageToggle.js';
import { ThemeToggle } from '../common/ThemeToggle.js';
import { Shield, Lock, User as UserIcon, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { t } = useTranslation();
  const { login } = useAuthStore();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [appMeta, setAppMeta] = useState<AppMeta | null>(null);

  useEffect(() => {
    api.getMeta()
      .then(setAppMeta)
      .catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError(t('invalidCredentials'));
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        const res = await api.register(username.trim(), password);
        login(res.token, res.user);
      } else {
        const res = await api.login(username.trim(), password);
        login(res.token, res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      {/* Top action controls */}
      <div className="fixed top-4 right-4 rtl:right-auto rtl:left-4 flex items-center gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 relative overflow-hidden">
        {/* Glow decoration */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary-500/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />

        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary-500/10 dark:bg-primary-500/20 border border-primary-500/30 flex items-center justify-center mb-3 shadow-inner">
            <Shield className="w-8 h-8 text-primary-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {t('appName')}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
            {t('tagline')}
          </p>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('username')}
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                dir="ltr"
                placeholder="e.g. user101"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/80 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all font-mono"
              />
              <UserIcon className="w-4 h-4 text-gray-400 absolute right-3 rtl:right-auto rtl:left-3 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('password')}
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                dir="ltr"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/80 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              />
              <Lock className="w-4 h-4 text-gray-400 absolute right-3 rtl:right-auto rtl:left-3 top-3.5" />
            </div>
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('confirmPassword')}
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  dir="ltr"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/80 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                />
                <CheckCircle2 className="w-4 h-4 text-gray-400 absolute right-3 rtl:right-auto rtl:left-3 top-3.5" />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={Boolean(loading || (isRegister && appMeta && !appMeta.registrationEnabled))}
            className="w-full py-3 px-4 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium text-sm transition-all shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>{isRegister ? t('register') : t('login')}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </>
            )}
          </button>
        </form>

        {/* Toggle between Login and Register */}
        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-800 text-center">
          {isRegister ? (
            <button
              onClick={() => {
                setIsRegister(false);
                setError(null);
              }}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
            >
              {t('haveAccount')}
            </button>
          ) : (
            appMeta?.registrationEnabled !== false ? (
              <button
                onClick={() => {
                  setIsRegister(true);
                  setError(null);
                }}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                {t('noAccount')}
              </button>
            ) : (
              <p className="text-xs text-amber-500">
                {t('regDisabled')}
              </p>
            )
          )}
        </div>

        {/* Privacy badge */}
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-gray-400 dark:text-slate-500">
          <Shield className="w-3.5 h-3.5 text-primary-500" />
          <span>E2E & AES-256 Storage Protected</span>
        </div>
      </div>
    </div>
  );
};
