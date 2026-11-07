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
    <aside className="w-full sm:w-80 md:w-96 h-full bg-white dark:bg-slate-900 border-r rtl:border-r-0 rtl:border-l border-gray-200 dark:border-slate-800 flex flex-col shrink-0">
      {/* Top Header */}
      <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary-500/10 text-primary-500 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-gray-900 dark:text-white">
              {t('adminPanel')}
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-slate-400">
              مدیریت اعضا و گفتگوها
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            title={t('settings')}
          >
            <Sliders className="w-4 h-4 text-primary-500" />
          </button>
          <LanguageToggle className="p-1.5" />
          <ThemeToggle className="p-1.5" />
          <button
            onClick={logout}
            className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            title={t('logout')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 rtl:right-auto rtl:left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('searchUsers')}
            className="w-full pl-3 pr-9 rtl:pr-3 rtl:pl-9 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 border-none text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 px-3 pb-2 border-b border-gray-100 dark:border-slate-800 text-[11px] font-medium overflow-x-auto">
        <button
          onClick={() => setFilterTab('all')}
          className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
            filterTab === 'all'
              ? 'bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 font-bold'
              : 'text-gray-500 hover:text-gray-800 dark:text-slate-400'
          }`}
        >
          {t('allUsers')} ({adminUsers.length})
        </button>

        <button
          onClick={() => setFilterTab('pending')}
          className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 shrink-0 ${
            filterTab === 'pending'
              ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 font-bold'
              : 'text-gray-500 hover:text-amber-600 dark:text-slate-400'
          }`}
        >
          <span>{t('pendingUsers')}</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-mono animate-bounce">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setFilterTab('active')}
          className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
            filterTab === 'active'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-gray-500 hover:text-emerald-600 dark:text-slate-400'
          }`}
        >
          {t('activeUsers')}
        </button>

        <button
          onClick={() => setFilterTab('banned')}
          className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
            filterTab === 'banned'
              ? 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 font-bold'
              : 'text-gray-500 hover:text-red-600 dark:text-slate-400'
          }`}
        >
          {t('bannedUsers')}
        </button>
      </div>

      {/* Users List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400 dark:text-slate-500">
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
                className={`p-3 rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-primary-500/10 dark:bg-primary-500/15 border border-primary-500/30'
                    : 'hover:bg-gray-100/70 dark:hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  {/* Avatar with status indicator */}
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs uppercase font-mono">
                      {u.username.substring(0, 2)}
                    </div>
                    <div
                      className={`absolute bottom-0 right-0 rtl:right-auto rtl:left-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
                        isOnline ? 'bg-emerald-500' : 'bg-gray-400'
                      }`}
                    />
                  </div>

                  {/* Username & Last message snippet */}
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-gray-900 dark:text-white truncate">
                        {u.username}
                      </span>
                      {u.status === 'pending' && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">
                          تایید نشده
                        </span>
                      )}
                      {u.status === 'banned' && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 font-medium">
                          مسدود
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate mt-0.5 max-w-[160px]">
                      {u.lastMessage ? u.lastMessage.text : 'بدون پیام قبلی'}
                    </p>
                  </div>
                </div>

                {/* Unread badge & timestamp */}
                <div className="flex flex-col items-end shrink-0 gap-1 text-[10px]">
                  {u.unreadCount && u.unreadCount > 0 ? (
                    <span className="px-1.5 py-0.5 rounded-full bg-primary-600 text-white font-bold font-mono">
                      {u.unreadCount}
                    </span>
                  ) : null}
                  {u.lastMessage && (
                    <span className="text-gray-400 dark:text-slate-500 font-sans text-[10px]">
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
