import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { api, AdminUserItem } from '../../services/api.js';
import { AdminSidebar } from './AdminSidebar.js';
import { AdminSettingsModal } from './AdminSettingsModal.js';
import { MessageItem } from '../common/MessageItem.js';
import { getSocket } from '../../services/socket.js';
import { 
  Send, 
  CheckCircle, 
  Ban, 
  Trash2, 
  ArrowLeft, 
  UserX,
  MessageSquare
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { 
    messages, 
    activeUserId, 
    setActiveUserId, 
    adminUsers, 
    setAdminUsers, 
    sendMessage, 
    deleteMessage, 
    addMessage, 
    removeMessage, 
    clearMessages, 
    onlineUsers, 
    setOnlineStatus,
    typingUsers,
    setTyping,
    sendTyping
  } = useChatStore();

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [selectedTtl, setSelectedTtl] = useState<number | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load all users
  const refreshUsers = async () => {
    try {
      const res = await api.getAdminUsers();
      setAdminUsers(res.users);
    } catch (err) {
      console.error('Failed to load admin users:', err);
    }
  };

  useEffect(() => {
    refreshUsers();
  }, []);

  // Socket events for Admin
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('message:new', (msg) => {
      if (activeUserId && (msg.senderId === activeUserId || msg.recipientId === activeUserId)) {
        addMessage({ ...msg, isOwn: false });
      }
      refreshUsers();
    });

    socket.on('message:sent', (msg) => {
      if (activeUserId && (msg.senderId === activeUserId || msg.recipientId === activeUserId)) {
        addMessage({ ...msg, isOwn: true });
      }
      refreshUsers();
    });

    socket.on('message:deleted', ({ messageId }) => {
      removeMessage(messageId);
      refreshUsers();
    });

    socket.on('conversation:cleared', ({ userId }) => {
      if (activeUserId === userId) {
        clearMessages();
      }
      refreshUsers();
    });

    socket.on('user:online_status', ({ userId, isOnline }) => {
      setOnlineStatus(userId, isOnline);
    });

    socket.on('typing', ({ userId, isTyping }) => {
      setTyping(userId, isTyping);
    });

    return () => {
      socket.off('message:new');
      socket.off('message:sent');
      socket.off('message:deleted');
      socket.off('conversation:cleared');
      socket.off('user:online_status');
      socket.off('typing');
    };
  }, [activeUserId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const activeUser = adminUsers.find((u) => u.id === activeUserId);

  const handleSelectUser = (targetUser: AdminUserItem) => {
    setActiveUserId(targetUser.id);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !activeUserId) return;

    const text = inputText;
    setInputText('');
    sendTyping(false, activeUserId);

    try {
      await sendMessage(text, activeUserId, selectedTtl);
    } catch (err) {
      console.error('Failed to send:', err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (!activeUserId) return;

    sendTyping(true, activeUserId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(false, activeUserId);
    }, 2000);
  };

  const handleApproveUser = async () => {
    if (!activeUserId) return;
    try {
      await api.updateUserStatus(activeUserId, 'active');
      refreshUsers();
    } catch (err: any) {
      alert(err.message || 'Error approving user');
    }
  };

  const handleBanToggle = async () => {
    if (!activeUser) return;
    const nextStatus = activeUser.status === 'banned' ? 'active' : 'banned';
    try {
      await api.updateUserStatus(activeUser.id, nextStatus);
      refreshUsers();
    } catch (err: any) {
      alert(err.message || 'Error changing ban status');
    }
  };

  const handleWipeChat = async () => {
    if (!activeUserId) return;
    if (window.confirm(t('confirmClearChat'))) {
      try {
        await api.clearAdminConversation(activeUserId);
        clearMessages();
        refreshUsers();
      } catch (err: any) {
        alert(err.message || 'Error wiping chat');
      }
    }
  };

  const handleDeleteUser = async () => {
    if (!activeUserId) return;
    if (window.confirm('آیا از حذف این کاربر و تمام سوابق آن اطمینان دارید؟')) {
      try {
        await api.deleteUser(activeUserId);
        setActiveUserId(null);
        refreshUsers();
      } catch (err: any) {
        alert(err.message || 'Error deleting user');
      }
    }
  };

  const isUserTyping = activeUserId ? typingUsers[activeUserId] : false;

  return (
    <div className="flex h-full w-full bg-gray-50 dark:bg-slate-950 overflow-hidden">
      {/* Left/Right Sidebar (Responsive: full width on mobile when no user selected) */}
      <div className={`${activeUserId ? 'hidden sm:flex' : 'flex'} w-full sm:w-auto h-full`}>
        <AdminSidebar
          onOpenSettings={() => setSettingsModalOpen(true)}
          onSelectUser={handleSelectUser}
        />
      </div>

      {/* Main Chat Area */}
      <div className={`${!activeUserId ? 'hidden sm:flex' : 'flex'} flex-1 flex-col h-full bg-white dark:bg-slate-950 relative overflow-hidden`}>
        {activeUser ? (
          <>
            {/* Top Chat Header */}
            <header className="h-16 px-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-gray-200 dark:border-slate-800 flex items-center justify-between shrink-0 z-20">
              <div className="flex items-center gap-3">
                {/* Back button for mobile */}
                <button
                  onClick={() => setActiveUserId(null)}
                  className="sm:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
                >
                  <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
                </button>

                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 flex items-center justify-center font-bold font-mono text-sm uppercase">
                    {activeUser.username.substring(0, 2)}
                  </div>
                  <div
                    className={`absolute bottom-0 right-0 rtl:right-auto rtl:left-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
                      onlineUsers[activeUser.id] ? 'bg-emerald-500' : 'bg-gray-400'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                      {activeUser.username}
                    </h3>
                    {activeUser.status === 'pending' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-medium">
                        در انتظار تایید
                      </span>
                    )}
                    {activeUser.status === 'banned' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 font-medium">
                        مسدود شده
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-slate-400">
                    {isUserTyping ? (
                      <span className="text-primary-500 font-medium animate-pulse">{t('typing')}</span>
                    ) : onlineUsers[activeUser.id] ? (
                      <span className="text-emerald-500">{t('online')}</span>
                    ) : (
                      <span>{t('offline')}</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Action Buttons for this user */}
              <div className="flex items-center gap-1.5">
                {activeUser.status === 'pending' && (
                  <button
                    onClick={handleApproveUser}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm transition-colors"
                    title={t('approve')}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{t('approve')}</span>
                  </button>
                )}

                <button
                  onClick={handleBanToggle}
                  className={`p-2 rounded-xl text-xs transition-colors ${
                    activeUser.status === 'banned'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                      : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                  }`}
                  title={activeUser.status === 'banned' ? t('unban') : t('ban')}
                >
                  <Ban className="w-4 h-4" />
                </button>

                <button
                  onClick={handleWipeChat}
                  className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  title={t('clearChat')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  onClick={handleDeleteUser}
                  className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  title={t('deleteUser')}
                >
                  <UserX className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Messages Area */}
            <main className="flex-1 overflow-y-auto p-4 space-y-1 bg-gray-50/50 dark:bg-slate-950">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400 dark:text-slate-500">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 flex items-center justify-center mb-3 text-primary-500">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                    هیچ پیامی در این گفتگو وجود ندارد
                  </p>
                  <p className="text-xs max-w-xs mt-1">
                    پیام‌ها پس از ارسال بر اساس زمان انقضا به طور خودکار از هر دو طرف پاک می‌شوند.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    isOwn={msg.isOwn ?? (msg.senderId === user?.id)}
                    onDelete={deleteMessage}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </main>

            {/* Bottom Input Area */}
            <footer className="p-3 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 shrink-0">
              <form onSubmit={handleSend} className="flex items-center gap-2">
                {/* Fast TTL selector dropdown for Admin */}
                <select
                  value={selectedTtl || ''}
                  onChange={(e) => setSelectedTtl(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                  className="px-2.5 py-3 rounded-2xl bg-gray-100 dark:bg-slate-800 border-none text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  title="تایمر انقضای این پیام"
                >
                  <option value="">پیش‌فرض</option>
                  <option value="900">۱۵ دقیقه</option>
                  <option value="3600">۱ ساعت</option>
                  <option value="21600">۶ ساعت</option>
                  <option value="86400">۲۴ ساعت</option>
                  <option value="172800">۲ روز</option>
                </select>

                <input
                  type="text"
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder={t('typeMessage')}
                  className="flex-1 px-4 py-3 rounded-2xl bg-gray-100 dark:bg-slate-800 border-none text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all placeholder:text-gray-400"
                />

                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="p-3 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-primary-500/20 shrink-0"
                  title={t('send')}
                >
                  <Send className="w-5 h-5 rtl:rotate-180" />
                </button>
              </form>
            </footer>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400 dark:text-slate-500">
            <div className="w-16 h-16 rounded-3xl bg-primary-500/10 border border-primary-500/20 text-primary-500 flex items-center justify-center mb-3">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 dark:text-slate-200">
              یک گفتگو را انتخاب کنید
            </h3>
            <p className="text-xs text-gray-400 dark:text-slate-500 max-w-xs mt-1">
              از نوار کناری کاربری را انتخاب کنید تا تاریخچه پیام‌ها بارگذاری شده و بتوانید پاسخ دهید.
            </p>
          </div>
        )}
      </div>

      {/* Admin Settings Modal */}
      <AdminSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />
    </div>
  );
};
