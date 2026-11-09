import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminUserItem, api } from '../../services/api.js';
import { useChatStore } from '../../stores/chatStore.js';
import { getAvatarPalette } from '../../utils/avatar.js';
import { formatLastSeen, formatMessageTime } from '../../utils/date.js';
import { 
  X, 
  Lock, 
  Tag, 
  ShieldCheck, 
  Calendar, 
  Clock, 
  Save, 
  Loader2, 
  Trash2, 
  Check, 
  UserCircle,
  Star,
  Users,
  Briefcase,
  Hourglass
} from 'lucide-react';

interface Props {
  user: AdminUserItem | null;
  isOpen: boolean;
  onClose: () => void;
  isOnline?: boolean;
  lastSeen?: string;
}

const CATEGORY_PRESETS = [
  { id: 'vip', labelKey: 'categoryVip', icon: Star, color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' },
  { id: 'friends', labelKey: 'categoryFriends', icon: Users, color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/30' },
  { id: 'temporary', labelKey: 'categoryTemporary', icon: Hourglass, color: 'text-rose-500 bg-rose-500/10 border-rose-500/30' },
  { id: 'work', labelKey: 'categoryWork', icon: Briefcase, color: 'text-sky-500 bg-sky-500/10 border-sky-500/30' }
] as const;

export const UserProfileModal: React.FC<Props> = ({ user, isOpen, onClose, isOnline, lastSeen }) => {
  const { t } = useTranslation();
  const updateAdminUserCategory = useChatStore((s) => s.updateAdminUserCategory);

  const [notes, setNotes] = useState('');
  const [notesUpdatedAt, setNotesUpdatedAt] = useState<string | null>(null);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setCurrentCategory(user.category || null);
      setCustomCategoryInput(
        user.category && !CATEGORY_PRESETS.some((p) => p.id === user.category) ? user.category : ''
      );
      setSaveSuccess(false);
      setIsLoadingNotes(true);
      api.getUserNotes(user.id)
        .then((res) => {
          setNotes(res.notes || '');
          setNotesUpdatedAt(res.updatedAt);
        })
        .catch((err) => {
          console.error('Failed to load notes:', err);
        })
        .finally(() => {
          setIsLoadingNotes(false);
        });
    }
  }, [isOpen, user?.id]);

  if (!isOpen || !user) return null;

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    setSaveSuccess(false);
    try {
      const res = await api.updateUserNotes(user.id, notes);
      setNotesUpdatedAt(res.updatedAt);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to save notes:', err);
      alert(t('errSaveNotes') || 'Failed to save notes');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleSelectCategory = async (cat: string | null) => {
    setIsUpdatingCategory(true);
    try {
      await api.updateUserCategory(user.id, cat);
      setCurrentCategory(cat);
      updateAdminUserCategory(user.id, cat);
    } catch (err) {
      console.error('Failed to update category:', err);
    } finally {
      setIsUpdatingCategory(false);
    }
  };

  const handleCustomCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customCategoryInput.trim();
    handleSelectCategory(trimmed || null);
  };

  const handleClearNotes = async () => {
    if (!notes.trim()) return;
    if (window.confirm(t('confirmClearNotes') || 'Clear all notes for this user?')) {
      setNotes('');
      setIsSavingNotes(true);
      try {
        await api.updateUserNotes(user.id, '');
        setNotesUpdatedAt(null);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } catch (err) {
        console.error('Failed to clear notes:', err);
      } finally {
        setIsSavingNotes(false);
      }
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-md animate-fade-in select-none font-sans"
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-[28px] bg-ambient-canvas dark:bg-[#121620] border border-black/10 dark:border-white/10 shadow-floating p-5 sm:p-6 text-slate-800 dark:text-slate-100 flex flex-col max-h-[90vh] overflow-hidden animate-message"
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shadow-xs">
              <UserCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white leading-tight">
                {t('userProfileAndNotes')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {user.username}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-slate-600 dark:text-slate-300 shadow-xs border border-black/5 dark:border-white/[0.09] flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {/* User Profile Card */}
          <div className="p-4 rounded-2xl bg-white dark:bg-white/[0.04] backdrop-blur-md border border-black/[0.06] dark:border-white/[0.06] flex items-center gap-3.5 shadow-xs">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-base uppercase shadow-xs overflow-hidden shrink-0 ${
              user.avatarUrl
                ? 'bg-stone-200/60 dark:bg-white/[0.08] border border-black/5 dark:border-white/10'
                : getAvatarPalette(user.username)
            }`}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                <span>{user.username.substring(0, 2)}</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  {user.username}
                </h4>
                {user.status === 'active' && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold">
                    {t('activeUsers')}
                  </span>
                )}
                {user.status === 'pending' && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold">
                    {t('statusPending')}
                  </span>
                )}
                {user.status === 'banned' && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 font-bold">
                    {t('bannedUsers')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    {isOnline ? (
                      <span className="text-emerald-500 font-bold">{t('online')}</span>
                    ) : (
                      formatLastSeen(lastSeen || user.last_seen, false)
                    )}
                  </span>
                </span>
                {user.created_at && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{t('registrationDate')}: {formatMessageTime(user.created_at)}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* User Categorization Section */}
          <div className="p-4 rounded-2xl bg-white dark:bg-white/[0.04] backdrop-blur-md border border-black/[0.06] dark:border-white/[0.06] shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-500" />
                <span>{t('userCategoryLabel')}</span>
              </label>
              {isUpdatingCategory && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {t('userCategoryDesc')}
            </p>

            {/* Presets Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => handleSelectCategory(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  !currentCategory
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs scale-102'
                    : 'bg-stone-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 border-black/5 dark:border-white/5 hover:bg-stone-200 dark:hover:bg-white/[0.10]'
                }`}
              >
                {t('categoryNone')}
              </button>

              {CATEGORY_PRESETS.map((preset) => {
                const IconComponent = preset.icon;
                const isSelected = currentCategory === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectCategory(preset.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? `${preset.color} ring-2 ring-amber-500/30 shadow-xs scale-102`
                        : 'bg-stone-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 border-black/5 dark:border-white/5 hover:bg-stone-200 dark:hover:bg-white/[0.10]'
                    }`}
                  >
                    <IconComponent className="w-3.5 h-3.5 shrink-0" />
                    <span>{t(preset.labelKey)}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Category Input Form */}
            <form onSubmit={handleCustomCategorySubmit} className="flex items-center gap-2 pt-2">
              <input
                type="text"
                value={customCategoryInput}
                onChange={(e) => setCustomCategoryInput(e.target.value)}
                placeholder={t('customCategoryPlaceholder')}
                className="flex-1 px-3.5 py-1.5 rounded-xl border border-stone-200 dark:border-white/[0.08] bg-stone-50 dark:bg-white/[0.04] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-stone-400 dark:focus:border-white/20 transition-colors"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
              >
                {t('apply')}
              </button>
            </form>
          </div>

          {/* Admin Private Encrypted Notes Section */}
          <div className="p-4 rounded-2xl bg-white dark:bg-white/[0.04] backdrop-blur-md border border-black/[0.06] dark:border-white/[0.06] shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-500" />
                <span>{t('adminNotesTitle')}</span>
              </label>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500" />
                <span>{t('encryptedBadge')}</span>
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              {t('adminNotesDesc')}
            </p>

            <div className="relative">
              {isLoadingNotes ? (
                <div className="h-32 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-500 mb-2" />
                  <span className="text-xs">{t('loadingConversation')}</span>
                </div>
              ) : (
                <textarea
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('adminNotesPlaceholder')}
                  className="w-full p-3.5 rounded-xl border border-stone-200 dark:border-white/[0.08] bg-stone-50 dark:bg-white/[0.04] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-stone-400 dark:focus:border-white/20 transition-colors resize-none font-sans leading-relaxed"
                />
              )}
            </div>

            {/* Notes Footer & Actions */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-slate-400">
                {notesUpdatedAt ? (
                  `${t('lastUpdated')}: ${formatMessageTime(notesUpdatedAt)}`
                ) : (
                  t('notesNotSavedYet')
                )}
              </span>

              <div className="flex items-center gap-2">
                {notes.trim() && (
                  <button
                    type="button"
                    onClick={handleClearNotes}
                    disabled={isSavingNotes}
                    className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                    title={t('clearNotes')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={isSavingNotes || isLoadingNotes}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer ${
                    saveSuccess
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900'
                  } disabled:opacity-50`}
                >
                  {isSavingNotes ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('saving')}</span>
                    </>
                  ) : saveSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{t('notesSaved')}</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>{t('saveNotes')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
