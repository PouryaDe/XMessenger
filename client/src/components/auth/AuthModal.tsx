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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ambient-canvas font-sans">
      {/* Top action controls */}
      <div className="fixed top-5 right-5 rtl:right-auto rtl:left-5 flex items-center gap-2.5">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm sm:max-w-md bg-white/95 dark:bg-slate-900/95 border border-stone-200/60 dark:border-slate-800 rounded-[32px] shadow-floating p-7 sm:p-9 relative overflow-hidden">
        {/* Soft Ambient Glow */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-amber-300/20 dark:bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-emerald-300/20 dark:bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-slate-800 border border-stone-200/50 dark:border-slate-700 flex items-center justify-center mb-4 shadow-soft">
            <Shield className="w-8 h-8 text-slate-800 dark:text-amber-400" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {t('appName')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
            {t('tagline')}
          </p>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 px-1 rtl:text-right ltr:text-left">
              {t('username')}
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                dir="ltr"
                placeholder="e.g. user101"
                className="w-full pl-11 pr-4 py-3 rounded-full border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white text-xs text-left focus:outline-none focus:ring-0 focus:border-stone-400 dark:focus:border-slate-500 font-mono shadow-none placeholder:text-slate-400 placeholder:text-left transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 px-1 rtl:text-right ltr:text-left">
              {t('password')}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                dir="ltr"
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3 rounded-full border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white text-xs text-left focus:outline-none focus:ring-0 focus:border-stone-400 dark:focus:border-slate-500 shadow-none placeholder:text-slate-400 placeholder:text-left transition-colors"
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 px-1 rtl:text-right ltr:text-left">
                {t('confirmPassword')}
              </label>
              <div className="relative">
                <CheckCircle2 className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  dir="ltr"
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 rounded-full border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white text-xs text-left focus:outline-none focus:ring-0 focus:border-stone-400 dark:focus:border-slate-500 shadow-none placeholder:text-slate-400 placeholder:text-left transition-colors"
                />
              </div>
            </div>
          )}

          {/* Black Primary Action Button */}
          <button
            type="submit"
            disabled={Boolean(loading || (isRegister && appMeta && !appMeta.registrationEnabled))}
            className="w-full py-3.5 px-5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-xs transition-all shadow-md hover:scale-102 active:scale-98 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed mt-3"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white dark:border-slate-900/40 dark:border-t-slate-900 rounded-full animate-spin" />
            ) : (
              <>
                <span>{isRegister ? t('register') : t('login')}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </>
            )}
          </button>
        </form>

        {/* Toggle between Login and Register */}
        <div className="mt-6 pt-4 border-t border-stone-100 dark:border-slate-800 text-center">
          {isRegister ? (
            <button
              onClick={() => {
                setIsRegister(false);
                setError(null);
              }}
              className="text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 font-semibold"
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
                className="text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 font-semibold"
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
      </div>
    </div>
  );
};
