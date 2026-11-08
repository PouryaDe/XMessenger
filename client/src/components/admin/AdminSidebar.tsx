import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { api, AdminUserItem } from '../../services/api.js';
import { APP_VERSION } from '../../config/version.js';
import { LanguageToggle } from '../common/LanguageToggle.js';
import { ThemeToggle } from '../common/ThemeToggle.js';
import { 
  Users, 
  Search, 
  Sliders, 
  LogOut,
  X
} from 'lucide-react';

interface Props {
  onOpenSettings: () => void;
  onSelectUser: (user: AdminUserItem) => void;
}

export const AdminSidebar: React.FC<Props> = ({ onOpenSettings, onSelectUser }) => {
  const { t, i18n } = useTranslation();
  const { logout } = useAuthStore();
  const { adminUsers, activeUserId, onlineUsers } = useChatStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'active' | 'banned'>('all');
  const [appName, setAppName] = useState<string>('XMessenger');

  useEffect(() => {
    api.getMeta().then((meta) => {
      if (meta?.appName) setAppName(meta.appName);
    }).catch(() => {});
  }, []);

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
    <aside className="w-full sm:w-80 md:w-96 h-full bg-white/45 dark:bg-[#0E1218]/50 backdrop-blur-2xl border-r rtl:border-r-0 rtl:border-l border-black/[0.06] dark:border-white/[0.08] shadow-[1px_0_3px_rgba(0,0,0,0.03)] rtl:shadow-[-1px_0_3px_rgba(0,0,0,0.03)] flex flex-col shrink-0 font-sans z-20">
      {/* Top Header with dynamic safe-area clearance for iOS status bar & Dynamic Island */}
      <div className="pt-[max(0.75rem,calc(env(safe-area-inset-top,0px)+0.6rem))] pb-2.5 px-4 sm:px-5 border-b border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between shrink-0 bg-transparent">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-white/[0.08] text-slate-800 dark:text-amber-400 flex items-center justify-center font-bold shadow-xs border border-black/5 dark:border-white/[0.09] shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <h2 className="font-extrabold text-sm text-slate-900 dark:text-white leading-none flex items-center">
            {t('adminPanel')}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onOpenSettings}
            className="w-8 h-8 rounded-full bg-white dark:bg-white/[0.08] dark:hover:bg-white/[0.12] dark:backdrop-blur-md text-slate-700 dark:text-slate-200 shadow-xs border border-black/5 dark:border-white/[0.09] flex items-center justify-center hover:scale-105 active:scale-95 transition-all shrink-0"
            title={t('settings')}
          >
            <Sliders className="w-3.5 h-3.5 text-amber-500" />
          </button>
          <LanguageToggle size="sm" />
          <ThemeToggle size="sm" />
          <button
            onClick={logout}
            className="w-8 h-8 rounded-full bg-white dark:bg-white/[0.08] dark:hover:bg-white/[0.12] dark:backdrop-blur-md text-slate-400 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 shadow-xs border border-black/5 dark:border-white/[0.09] flex items-center justify-center hover:scale-105 active:scale-95 transition-all shrink-0"
            title={t('logout')}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Modern Search & Segmented Filter Bar */}
      <div className="px-4 pt-3 pb-3 space-y-2.5 border-b border-black/[0.04] dark:border-white/[0.06]">
        {/* Search Bar with Quick Clear Button */}
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('searchUsers')}
            className="w-full h-10 ps-10 pe-9 rounded-2xl bg-black/[0.035] dark:bg-white/[0.05] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] focus:bg-white dark:focus:bg-[#12161E] text-xs text-slate-900 dark:text-white border border-black/[0.05] dark:border-white/[0.08] focus:border-amber-500/50 dark:focus:border-amber-400/50 focus:outline-none transition-all placeholder:text-slate-400 font-sans shadow-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 absolute end-2 top-1/2 -translate-y-1/2 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Modern iOS / Telegram Segmented Control */}
        <div className="grid grid-cols-4 p-1 rounded-2xl bg-black/[0.035] dark:bg-black/40 border border-black/[0.04] dark:border-white/[0.06] select-none">
          <button
            onClick={() => setFilterTab('all')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-xs transition-all ${
              filterTab === 'all'
                ? 'bg-white dark:bg-white/[0.14] text-slate-900 dark:text-white shadow-xs font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
            }`}
          >
            <span>{t('allUsers')}</span>
            <span className="text-[10px] opacity-60">({adminUsers.length})</span>
          </button>

          <button
            onClick={() => setFilterTab('pending')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-xs transition-all ${
              filterTab === 'pending'
                ? 'bg-white dark:bg-white/[0.14] text-amber-600 dark:text-amber-400 shadow-xs font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 font-medium'
            }`}
          >
            <span>{t('pendingUsers')}</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setFilterTab('active')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-xs transition-all ${
              filterTab === 'active'
                ? 'bg-white dark:bg-white/[0.14] text-emerald-600 dark:text-emerald-400 shadow-xs font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium'
            }`}
          >
            <span>{t('activeUsers')}</span>
          </button>

          <button
            onClick={() => setFilterTab('banned')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-xs transition-all ${
              filterTab === 'banned'
                ? 'bg-white dark:bg-white/[0.14] text-red-600 dark:text-red-400 shadow-xs font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 font-medium'
            }`}
          >
            <span>{t('bannedUsers')}</span>
          </button>
        </div>
      </div>

      {/* Users List - Scrollbar on Right in Persian, on Left in English */}
      <div 
        dir={i18n.language === 'fa' ? 'ltr' : 'rtl'}
        className="flex-1 overflow-y-auto"
      >
        <div 
          dir={i18n.language === 'fa' ? 'rtl' : 'ltr'} 
          className="p-2.5 space-y-1"
        >
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
                  className={`px-3 py-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-white dark:bg-white/[0.12] border border-black/10 dark:border-amber-400/35 shadow-xs backdrop-blur-md'
                      : 'bg-white/50 dark:bg-white/[0.03] hover:bg-white/80 dark:hover:bg-white/[0.07] border border-black/[0.04] dark:border-white/[0.06] backdrop-blur-xs'
                  }`}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    {/* Avatar with status indicator */}
                    <div className="relative shrink-0">
                      <div className="w-9 h-9 rounded-full bg-stone-100 dark:bg-white/[0.08] text-slate-800 dark:text-slate-200 flex items-center justify-center font-bold text-xs uppercase shadow-xs border border-white dark:border-white/[0.08] overflow-hidden">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt={u.username} className="w-full h-full object-cover" />
                        ) : (
                          <span>{u.username.substring(0, 2)}</span>
                        )}
                      </div>
                      <div
                        className={`absolute bottom-0 right-0 rtl:right-auto rtl:left-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#0E1218] ${
                          isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      />
                    </div>

                    {/* Username & Last message snippet */}
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                          {u.username}
                        </span>
                        {u.status === 'pending' && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold">
                            {t('statusPending')}
                          </span>
                        )}
                        {u.status === 'banned' && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 font-bold">
                            {t('bannedUsers')}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 truncate mt-0.5 max-w-[160px]">
                        {u.lastMessage ? (
                          (() => {
                            const imgMatch = u.lastMessage.text.match(/^\[image:(.+?)\](?:\n([\s\S]*))?$/);
                            if (imgMatch) {
                              const cap = imgMatch[2] ? imgMatch[2].trim() : '';
                              return `📷 ${t('photo')}${cap ? `: ${cap}` : ''}`;
                            }
                            return u.lastMessage.text;
                          })()
                        ) : (
                          t('noPreviousMessage')
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Unread badge & timestamp */}
                  <div className="flex flex-col items-end shrink-0 gap-1 text-[10px]">
                    {u.unreadCount && u.unreadCount > 0 ? (
                      <span className="px-1.5 py-0.2 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-[9px]">
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
      </div>

      {/* Sidebar Footer with Version */}
      <div className="h-12 px-4 border-t border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 select-none shrink-0 bg-transparent">
        <span className="font-semibold tracking-tight text-slate-600 dark:text-slate-400 leading-none flex items-center">
          {appName}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 font-bold leading-none inline-flex items-center justify-center">
          v{APP_VERSION}
        </span>
      </div>
    </aside>
  );
};
