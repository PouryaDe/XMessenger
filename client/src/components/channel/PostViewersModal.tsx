import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ChannelViewer } from '../../services/api.js';
import { getAvatarPalette } from '../../utils/avatar.js';
import { formatLastSeen, formatMessageTime } from '../../utils/date.js';
import { 
  X, 
  Search, 
  Eye, 
  Users, 
  Clock, 
  Loader2 
} from 'lucide-react';

interface Props {
  postId: string;
  onClose: () => void;
}

export const PostViewersModal: React.FC<Props> = ({ postId, onClose }) => {
  const { t } = useTranslation();
  const [viewers, setViewers] = useState<ChannelViewer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    api.getChannelPostViewers(postId)
      .then((data) => {
        if (mounted) {
          setViewers(data.viewers || []);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message || 'Failed to load viewers');
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [postId]);

  const filteredViewers = useMemo(() => {
    if (!searchTerm.trim()) return viewers;
    const term = searchTerm.toLowerCase().trim();
    return viewers.filter((v) => v.username.toLowerCase().includes(term));
  }, [viewers, searchTerm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none">
      <div 
        className="w-full max-w-md bg-white dark:bg-[#121620]/95 border border-black/10 dark:border-white/10 rounded-[28px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span>{t('postViewers')}</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-mono font-bold">
                  {viewers.length}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('postViewersDesc')}
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

        {/* Search Bar */}
        {viewers.length > 5 && (
          <div className="px-4 pt-3 pb-1 shrink-0">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('searchViewers')}
                className="w-full h-9 ps-9 pe-3 rounded-xl bg-black/[0.035] dark:bg-white/[0.05] text-xs text-slate-800 dark:text-slate-200 border border-black/5 dark:border-white/5 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>
        )}

        {/* Viewers List Stream */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-2">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              <span className="text-xs">{t('loadingConversation')}</span>
            </div>
          ) : error ? (
            <div className="py-10 text-center text-xs text-red-500">
              {error}
            </div>
          ) : filteredViewers.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-xs">{t('noViewersYet')}</p>
            </div>
          ) : (
            filteredViewers.map((viewer) => {
              const palette = getAvatarPalette(viewer.username);
              const formattedDate = formatLastSeen(viewer.viewedAt);
              const exactTime = formatMessageTime(viewer.viewedAt);

              return (
                <div
                  key={viewer.userId}
                  className="p-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border border-black/[0.04] dark:border-white/[0.05] flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* User Avatar */}
                    {viewer.avatarUrl ? (
                      <img
                        src={viewer.avatarUrl}
                        alt={viewer.username}
                        className="w-10 h-10 rounded-full object-cover shrink-0 border border-black/10 dark:border-white/10"
                      />
                    ) : (
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-xs ${palette}`}
                      >
                        {viewer.username.substring(0, 2).toUpperCase()}
                      </div>
                    )}

                    {/* Username & Category */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 truncate">
                          {viewer.username}
                        </span>
                        {viewer.category && (
                          <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-semibold shrink-0">
                            {viewer.category}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{formattedDate}</span>
                        <span className="text-[10px] opacity-75">({exactTime})</span>
                      </div>
                    </div>
                  </div>

                  {/* Viewed Checkmark Badge */}
                  <div className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold flex items-center gap-1 shrink-0">
                    <Eye className="w-3 h-3" />
                    <span>{t('views')}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-black/[0.02] dark:bg-white/[0.02] border-t border-black/[0.05] dark:border-white/[0.05] text-center">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
