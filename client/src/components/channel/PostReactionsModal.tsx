import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ChannelReactionItem } from '../../services/api.js';
import { getAvatarPalette } from '../../utils/avatar.js';
import { formatLastSeen, formatMessageTime } from '../../utils/date.js';
import { 
  X, 
  Search, 
  ThumbsUp, 
  Users, 
  Loader2 
} from 'lucide-react';

interface Props {
  postId: string;
  initialEmoji?: string;
  initialReactions?: ChannelReactionItem[];
  onClose: () => void;
}

export const PostReactionsModal: React.FC<Props> = ({ 
  postId, 
  initialEmoji, 
  initialReactions, 
  onClose 
}) => {
  const { t } = useTranslation();
  const [reactions, setReactions] = useState<ChannelReactionItem[]>(initialReactions || []);
  const [isLoading, setIsLoading] = useState(!initialReactions || initialReactions.length === 0);
  const [selectedEmoji, setSelectedEmoji] = useState<string>(initialEmoji || 'ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.getChannelPostReactions(postId)
      .then((data) => {
        if (mounted) {
          setReactions(data.reactions || []);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          if (!initialReactions || initialReactions.length === 0) {
            setError(err.message || 'Failed to load reactions');
          }
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [postId]);

  // Count by emoji for tabs
  const emojiCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reactions) {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    }
    return counts;
  }, [reactions]);

  const availableEmojis = useMemo(() => {
    const set = new Set<string>();
    reactions.forEach((r) => set.add(r.emoji));
    return Array.from(set).sort((a, b) => {
      if (a === '👍') return -1;
      if (b === '👍') return 1;
      return 0;
    });
  }, [reactions]);

  const filteredReactions = useMemo(() => {
    let list = reactions;
    if (selectedEmoji !== 'ALL') {
      list = list.filter((r) => r.emoji === selectedEmoji);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter((r) => r.username.toLowerCase().includes(term));
    }
    return list;
  }, [reactions, selectedEmoji, searchTerm]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md bg-white dark:bg-[#121620]/95 border border-black/10 dark:border-white/10 rounded-[28px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30">
              <ThumbsUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span>{t('postReactions')}</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-mono font-bold">
                  {reactions.length}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('postReactionsDesc')}
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

        {/* Filter Tabs by Emoji */}
        {availableEmojis.length > 0 && (
          <div className="px-4 pt-3 pb-2 border-b border-black/[0.04] dark:border-white/[0.05] flex items-center gap-1.5 overflow-x-auto shrink-0 select-none">
            {/* All Tab */}
            <button
              type="button"
              onClick={() => setSelectedEmoji('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedEmoji === 'ALL'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                  : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-black/[0.07] dark:hover:bg-white/[0.10]'
              }`}
            >
              <span>{t('allReactions')}</span>
              <span className="font-mono text-[11px] opacity-80">{reactions.length}</span>
            </button>

            {/* Individual Emoji Tabs */}
            {availableEmojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setSelectedEmoji(emoji)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedEmoji === emoji
                    ? emoji === '❤️'
                      ? 'bg-rose-500 text-white shadow-xs'
                      : 'bg-[#2AABEE] text-white shadow-xs'
                    : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-black/[0.07] dark:hover:bg-white/[0.10]'
                }`}
              >
                <span className="text-[13px] leading-none drop-shadow-xs">{emoji}</span>
                <span className="font-mono text-[11px] opacity-90">{emojiCounts[emoji] || 0}</span>
              </button>
            ))}
          </div>
        )}

        {/* Search Bar */}
        {reactions.length > 5 && (
          <div className="px-4 pt-3 pb-1 shrink-0">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('searchReactions')}
                className="w-full h-9 ps-9 pe-3 rounded-xl bg-black/[0.035] dark:bg-white/[0.05] text-xs text-slate-800 dark:text-slate-200 border border-black/5 dark:border-white/5 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>
        )}

        {/* Reactions List Stream */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-2">
          {isLoading && reactions.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              <span className="text-xs">{t('loadingConversation')}</span>
            </div>
          ) : error && reactions.length === 0 ? (
            <div className="py-10 text-center text-xs text-red-500">
              {error}
            </div>
          ) : filteredReactions.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-xs">{t('noReactionsYet')}</p>
            </div>
          ) : (
            filteredReactions.map((item, idx) => {
              const palette = getAvatarPalette(item.username);
              const formattedDate = formatLastSeen(item.createdAt);
              const exactTime = formatMessageTime(item.createdAt);

              return (
                <div
                  key={`${item.userId}-${item.emoji}-${idx}`}
                  className="p-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border border-black/[0.04] dark:border-white/[0.05] flex items-center justify-between gap-3 transition-colors select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* User Avatar with Reaction Emoji Badge */}
                    <div className="relative shrink-0">
                      {item.avatarUrl ? (
                        <img
                          src={item.avatarUrl}
                          alt={item.username}
                          className="w-10 h-10 rounded-full object-cover shrink-0 border border-black/10 dark:border-white/10"
                        />
                      ) : (
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-xs ${palette}`}
                        >
                          {item.username.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      {/* Telegram-style Floating Emoji Badge on Avatar */}
                      <span className="absolute -bottom-1 -end-1 w-5 h-5 rounded-full bg-white dark:bg-[#1a202c] border border-black/10 dark:border-white/15 flex items-center justify-center text-[11px] shadow-xs">
                        {item.emoji}
                      </span>
                    </div>

                    {/* Username & Category */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 truncate">
                          {item.username}
                        </span>
                        {item.category && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold shrink-0">
                            {item.category === 'vip' 
                              ? t('categoryVip') 
                              : item.category === 'friends' 
                              ? t('categoryFriends') 
                              : item.category === 'temporary' 
                              ? t('categoryTemporary') 
                              : item.category}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        {formattedDate} ({exactTime})
                      </p>
                    </div>
                  </div>

                  {/* Big Emoji Tag */}
                  <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.04] dark:border-white/[0.06]">
                    <span className="text-base leading-none drop-shadow-xs">{item.emoji}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
