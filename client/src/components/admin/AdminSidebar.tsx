import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { AdminUserItem } from '../../services/api.js';
import { LanguageToggle } from '../common/LanguageToggle.js';
import { ThemeToggle } from '../common/ThemeToggle.js';
import { 
  Users, 
  Search, 
  Sliders, 
  LogOut
} from 'lucide-react';

interface Props {
  onOpenSettings: () => void;
  onSelectUser: (user: AdminUserItem) => void;
}

export const AdminSidebar: React.FC<Props> = ({ onOpenSettings, onSelectUser }) => {
  const { t } = useTranslation();
  const { logout } = useAuthStore();
  const { adminUsers, activeUserId, onlineUsers } = useChatStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'active' | 'banned'>('all');

  // Filter users
  const filteredUsers = useMemo(() => {
    return adminUsers.filter((u) => {
      const matchesSearch = u.username.toLowerCase().includes(searchTerm.toLowerCase().trim());
      if (!matchesSearch) return false;
      if (filterTab === 'all') return true;
      return u.status === filterTab;
    });
  }, [adminUsers, searchTerm, filterTab]);

  const pendingCount = useMemo(() => {
    return adminUsers.filter((u) => u.status === 'pending').length;
  }, [adminUsers]);

  return (
    <aside className="w-full sm:w-80 md:w-96 h-full bg-ambient-canvas border-r rtl:border-r-0 rtl:border-l border-stone-200/60 dark:border-slate-800 flex flex-col shrink-0 font-sans">
      {/* Top Header */}
      <div className="p-5 border-b border-stone-200/50 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-slate-800 text-slate-800 dark:text-amber-400 flex items-center justify-center font-bold shadow-soft border border-black/5 dark:border-white/10">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-sm text-slate-900 dark:text-white">
              {t('adminPanel')}
            </h2>
            <p className="text-[11px] text-slate-400">
              {t('adminSubHeader')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSettings}
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-soft border border-black/5 dark:border-white/10 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shrink-0"
            title={t('settings')}
          >
            <Sliders className="w-4 h-4 text-amber-500" />
          </button>
          <LanguageToggle />
          <ThemeToggle />
          <button
            onClick={logout}
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 text-slate-400 hover:text-red-500 shadow-soft border border-black/5 dark:border-white/10 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shrink-0"
            title={t('logout')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pill Search Input */}
      <div className="p-4 pb-2">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('searchUsers')}
            className="w-full ps-10 pe-4 py-2.5 rounded-full bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white shadow-none dark:shadow-soft border border-black/[0.05] dark:border-white/5 focus:outline-none focus:ring-0 focus:border-stone-400 dark:focus:border-slate-500 placeholder:text-slate-400 font-sans transition-colors"
          />
        </div>
      </div>

      {/* Filter Tabs Pills */}
      <div className="flex items-center gap-1.5 px-4 pb-3 border-b border-stone-200/40 dark:border-slate-800 overflow-x-auto">
        <button
          onClick={() => setFilterTab('all')}
          className={`inline-flex items-center justify-center h-7 px-3.5 rounded-full text-xs font-semibold leading-none transition-all shrink-0 ${
            filterTab === 'all'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
              : 'bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-white'
          }`}
        >
          {t('allUsers')} ({adminUsers.length})
        </button>

        <button
          onClick={() => setFilterTab('pending')}
          className={`inline-flex items-center justify-center gap-1.5 h-7 px-3.5 rounded-full text-xs font-semibold leading-none transition-all shrink-0 ${
            filterTab === 'pending'
              ? 'bg-amber-500 text-white shadow-xs'
              : 'bg-white/80 dark:bg-slate-800 text-slate-600 hover:text-amber-600 dark:text-slate-400'
          }`}
        >
          <span>{t('pendingUsers')}</span>
          {pendingCount > 0 && (
            <span className="inline-flex items-center justify-center px-1.5 h-4 rounded-full bg-white text-amber-600 text-[10px] font-bold font-mono leading-none">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setFilterTab('active')}
          className={`inline-flex items-center justify-center h-7 px-3.5 rounded-full text-xs font-semibold leading-none transition-all shrink-0 ${
            filterTab === 'active'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
              : 'bg-white/80 dark:bg-slate-800 text-slate-600 hover:text-emerald-600 dark:text-slate-400'
          }`}
        >
          {t('activeUsers')}
        </button>

        <button
          onClick={() => setFilterTab('banned')}
          className={`inline-flex items-center justify-center h-7 px-3.5 rounded-full text-xs font-semibold leading-none transition-all shrink-0 ${
            filterTab === 'banned'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
              : 'bg-white/80 dark:bg-slate-800 text-slate-600 hover:text-red-600 dark:text-slate-400'
          }`}
        >
          {t('bannedUsers')}
        </button>
      </div>

      {/* Users List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            {t('noUsersFound')}
          </div>
        ) : (
          filteredUsers.map((u) => {
            const isSelected = activeUserId === u.id;
            const isOnline = onlineUsers[u.id];

            return (
              <div
                key={u.id}
                onClick={() => onSelectUser(u)}
                className={`p-3.5 rounded-[22px] cursor-pointer transition-all flex items-center justify-between gap-3 shadow-soft ${
                  isSelected
                    ? 'bg-white dark:bg-slate-800 border-2 border-amber-400 shadow-floating scale-[1.01]'
                    : 'bg-white/90 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 border border-black/5 dark:border-white/5'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  {/* Avatar with status indicator */}
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 flex items-center justify-center font-bold text-xs uppercase font-mono shadow-xs border border-white dark:border-slate-600">
                      {u.username.substring(0, 2)}
                    </div>
                    <div
                      className={`absolute bottom-0 right-0 rtl:right-auto rtl:left-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 ${
                        isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    />
                  </div>

                  {/* Username & Last message snippet */}
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                        {u.username}
                      </span>
                      {u.status === 'pending' && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold">
                          {t('statusPending')}
                        </span>
                      )}
                      {u.status === 'banned' && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 font-bold">
                          {t('bannedUsers')}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 truncate mt-0.5 max-w-[160px]">
                      {u.lastMessage ? u.lastMessage.text : t('noPreviousMessage')}
                    </p>
                  </div>
                </div>

                {/* Unread badge & timestamp */}
                <div className="flex flex-col items-end shrink-0 gap-1 text-[10px]">
                  {u.unreadCount && u.unreadCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold font-mono text-[10px]">
                      {u.unreadCount}
                    </span>
                  ) : null}
                  {u.lastMessage && (
                    <span className="text-slate-400 font-sans text-[10px]">
                      {new Date(u.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
