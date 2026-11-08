import React, { useState } from 'react';
import { KeyRound, X, Eye, EyeOff, Check, AlertCircle, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api.js';
import { getErrorMessage } from '../../utils/errors.js';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);

    if (newPassword.length < 6) {
      setPwdMsg({ type: 'error', text: t('errPasswordLength') });
      return;
    }

    setIsSubmitting(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPwdMsg({ type: 'success', text: t('pwdChangedSuccess') });
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => {
        onClose();
        setPwdMsg(null);
      }, 1500);
    } catch (err: any) {
      setPwdMsg({ type: 'error', text: getErrorMessage(err, 'errCurrentPasswordWrong') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setPwdMsg(null);
    setCurrentPassword('');
    setNewPassword('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in font-sans">
      {/* Backdrop click outside to close */}
      <div className="fixed inset-0" onClick={handleClose} />

      {/* Modal Card */}
      <div className="relative w-full max-w-sm bg-white dark:bg-[#12161E] border border-black/[0.08] dark:border-white/[0.1] rounded-[28px] p-6 shadow-floating z-10 font-sans">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20 shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                {t('changePassword')}
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {t('changePasswordDesc')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Alert */}
        {pwdMsg && (
          <div
            className={`mb-4 p-3 rounded-2xl text-xs flex items-center gap-2 ${
              pwdMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-500/20'
            }`}
          >
            {pwdMsg.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="leading-snug">{pwdMsg.text}</span>
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 px-1">
              {t('currentPassword')}
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={isSubmitting}
                autoComplete="current-password"
                dir="ltr"
                placeholder="••••••••"
                className="w-full pl-11 pr-11 py-3 rounded-full border border-stone-200 dark:border-white/[0.08] bg-stone-50 dark:bg-white/[0.05] text-xs sm:text-sm text-slate-900 dark:text-white text-left focus:outline-none focus:ring-0 focus:border-stone-400 dark:focus:border-white/20 shadow-none placeholder:text-slate-400 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 px-1">
              {t('newPassword')}
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={isSubmitting}
                autoComplete="new-password"
                dir="ltr"
                placeholder="••••••••"
                className="w-full pl-11 pr-11 py-3 rounded-full border border-stone-200 dark:border-white/[0.08] bg-stone-50 dark:bg-white/[0.05] text-xs sm:text-sm text-slate-900 dark:text-white text-left focus:outline-none focus:ring-0 focus:border-stone-400 dark:focus:border-white/20 shadow-none placeholder:text-slate-400 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 py-3 rounded-full bg-stone-100 dark:bg-white/[0.08] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-stone-200 dark:hover:bg-white/[0.12] transition-colors cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-semibold shadow-xs hover:opacity-90 active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? t('saving') : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
