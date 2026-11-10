import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../stores/chatStore.js';
import { api, ChannelPost } from '../../services/api.js';
import { getAvatarPalette } from '../../utils/avatar.js';
import { 
  X, 
  Search, 
  Forward, 
  Users, 
  Loader2, 
  CheckCircle2 
} from 'lucide-react';

interface Props {
  post: ChannelPost;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ForwardPostModal: React.FC<Props> = ({ post, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const { adminUsers } = useChatStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter users by active status and search
  const availableUsers = useMemo(() => {
    return adminUsers.filter((u) => {
      if (u.status !== 'active') return false;
      if (!searchTerm.trim()) return true;
      return u.username.toLowerCase().includes(searchTerm.toLowerCase().trim());
    });
  }, [adminUsers, searchTerm]);

  const handleForward = async () => {
    if (!selectedUserId || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await api.forwardChannelPost(post.id, selectedUserId);
      setSuccess(true);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message || 'Failed to forward post');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none">
      <div 
        className="w-full max-w-md bg-white/95 dark:bg-[#121620]/95 backdrop-blur-2xl border border-black/10 dark:border-white/10 rounded-[28px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Forward className="w-5 h-5 rtl:scale-x-[-1]" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                {t('forwardPostTitle')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('selectRecipient')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-1 shrink-0">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('searchRecipient')}
              className="w-full h-9 ps-9 pe-3 rounded-xl bg-black/[0.035] dark:bg-white/[0.05] text-xs text-slate-800 dark:text-slate-200 border border-black/5 dark:border-white/5 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>

        {/* User Selection List */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-2">
          {error && (
            <div className="p-2.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold">
              {error}
            </div>
          )}

          {success ? (
            <div className="py-12 flex flex-col items-center justify-center text-emerald-500 gap-2">
              <CheckCircle2 className="w-10 h-10 animate-bounce" />
              <span className="text-xs font-bold">{t('forwardSuccess')}</span>
            </div>
          ) : availableUsers.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-xs">{t('noUsersFound')}</p>
            </div>
          ) : (
            availableUsers.map((u) => {
              const isSelected = selectedUserId === u.id;
              const palette = getAvatarPalette(u.username);

              return (
                <div
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className={`p-2.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500/40 text-slate-900 dark:text-white shadow-xs'
                      : 'bg-black/[0.02] dark:bg-white/[0.03] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border-black/[0.04] dark:border-white/[0.05]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {u.avatarUrl ? (
                      <img
                        src={u.avatarUrl}
                        alt={u.username}
                        className="w-9 h-9 rounded-full object-cover shrink-0 border border-black/10 dark:border-white/10"
                      />
                    ) : (
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-xs ${palette}`}
                      >
                        {u.username.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-xs sm:text-sm truncate">
                        {u.username}
                      </div>
                      {u.category && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                          {u.category}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                    isSelected 
                      ? 'bg-amber-500 border-amber-500 text-white' 
                      : 'border-slate-300 dark:border-slate-600'
                  }`}>
                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-black/[0.02] dark:bg-white/[0.02] border-t border-black/[0.05] dark:border-white/[0.05] flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.10] text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all cursor-pointer"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={!selectedUserId || isSubmitting || success}
            onClick={handleForward}
            className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-98 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Forward className="w-3.5 h-3.5 rtl:scale-x-[-1]" />
                <span>{t('forward')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
