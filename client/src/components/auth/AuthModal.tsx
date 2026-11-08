import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { api, AppMeta } from '../../services/api.js';
import { APP_VERSION } from '../../config/version.js';
import { LanguageToggle } from '../common/LanguageToggle.js';
import { ThemeToggle } from '../common/ThemeToggle.js';
import { getErrorMessage } from '../../utils/errors.js';
import { Lock, User as UserIcon, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

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

    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setError(t('errRequiredFields'));
      return;
    }

    if (isRegister) {
      if (cleanUsername.includes('@') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanUsername)) {
        setError(t('errUsernameEmailNotAllowed'));
        return;
      }

      if (/^[\d\u0660-\u0669\u06F0-\u06F9]+$/.test(cleanUsername)) {
        setError(t('errUsernameAllNumericNotAllowed'));
        return;
      }

      if (cleanUsername.length < 3 || cleanUsername.length > 32) {
        setError(t('errUsernameLength'));
        return;
      }

      if (password !== confirmPassword) {
        setError(t('passwordsDoNotMatch'));
        return;
      }
    }

    setLoading(true);
    try {
      if (isRegister) {
        const res = await api.register(cleanUsername, password);
        login(res.token, res.user);
      } else {
        const res = await api.login(cleanUsername, password);
        login(res.token, res.user);
      }
    } catch (err: any) {
      setError(getErrorMessage(err, isRegister ? 'errRegisterFailed' : 'invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-ambient-canvas font-sans overflow-y-auto overscroll-none py-6 sm:py-8">
      {/* Top action controls respecting iOS notch and Dynamic Island */}
      <div className="fixed top-[max(1.25rem,calc(env(safe-area-inset-top,0px)+0.85rem))] end-4 z-50 flex items-center gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[360px] sm:max-w-[400px] bg-white/95 dark:bg-[#0E1218]/95 backdrop-blur-2xl border border-black/[0.06] dark:border-white/[0.08] rounded-[28px] shadow-floating p-6 sm:p-7 relative my-auto">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="relative mb-3.5 group shrink-0">
            {/* Ambient soft glow underneath */}
            <div className="absolute -inset-1 rounded-[18px] sm:rounded-[20px] bg-gradient-to-tr from-amber-500/20 via-amber-400/10 to-blue-500/20 blur-md opacity-60 dark:opacity-30 group-hover:opacity-90 transition-opacity" />
            <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-[16px] sm:rounded-[18px] overflow-hidden border border-black/[0.06] dark:border-white/[0.10] shadow-md dark:shadow-[0_6px_16px_rgba(0,0,0,0.45)] bg-[#0E1218] flex items-center justify-center shrink-0">
              <img 
                src={appMeta?.pwaIconUrl || `/icon-192.png?v=${APP_VERSION}`} 
                alt={appMeta?.appName || 'XMessenger'} 
                className="w-full h-full object-cover shrink-0" 
              />
            </div>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {appMeta?.appName || 'XMessenger'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs leading-relaxed">
            {t('tagline')}
          </p>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center gap-2 text-xs sm:text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4">
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 px-1 rtl:text-right ltr:text-left">
              {t('username')}
            </label>
            <div className="relative">
              <UserIcon className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                dir="ltr"
                placeholder="e.g. user101"
                className="w-full pl-12 pr-4 py-3.5 sm:py-3.5 rounded-full border-0 bg-stone-100/90 dark:bg-white/[0.05] focus:bg-stone-200/70 dark:focus:bg-white/[0.08] text-slate-900 dark:text-white text-sm sm:text-base text-left focus:outline-none focus:ring-0 shadow-none placeholder:text-slate-400 placeholder:text-left transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 px-1 rtl:text-right ltr:text-left">
              {t('password')}
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                dir="ltr"
                placeholder="••••••••"
                className="w-full pl-12 pr-4 py-3.5 sm:py-3.5 rounded-full border-0 bg-stone-100/90 dark:bg-white/[0.05] focus:bg-stone-200/70 dark:focus:bg-white/[0.08] text-slate-900 dark:text-white text-sm sm:text-base text-left focus:outline-none focus:ring-0 shadow-none placeholder:text-slate-400 placeholder:text-left transition-all"
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 px-1 rtl:text-right ltr:text-left">
                {t('confirmPassword')}
              </label>
              <div className="relative">
                <CheckCircle2 className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  dir="ltr"
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-3.5 sm:py-3.5 rounded-full border-0 bg-stone-100/90 dark:bg-white/[0.05] focus:bg-stone-200/70 dark:focus:bg-white/[0.08] text-slate-900 dark:text-white text-sm sm:text-base text-left focus:outline-none focus:ring-0 shadow-none placeholder:text-slate-400 placeholder:text-left transition-all"
                />
              </div>
            </div>
          )}

          {/* Black Primary Action Button */}
          <button
            type="submit"
            disabled={Boolean(loading || (isRegister && appMeta && !appMeta.registrationEnabled))}
            className="w-full h-12 sm:h-13 px-5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-sm sm:text-base transition-all shadow-xs hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed mt-4 sm:mt-5 select-none"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/40 border-t-white dark:border-slate-900/40 dark:border-t-slate-900 rounded-full animate-spin" />
            ) : (
              <div className="inline-flex items-center justify-center gap-2 leading-none">
                <span className="translate-y-[-0.5px]">{isRegister ? t('register') : t('login')}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180 translate-y-[1px] shrink-0" />
              </div>
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
              className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-semibold transition-colors"
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
                className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-semibold transition-colors"
              >
                {t('noAccount')}
              </button>
            ) : (
              <p className="text-xs sm:text-sm text-amber-500">
                {t('regDisabled')}
              </p>
            )
          )}
        </div>

        {/* Footer Version */}
        <div className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4 select-none">
          XMessenger v{appMeta?.version || APP_VERSION}
        </div>
      </div>
    </div>
  );
};
