import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { MessageItem } from '../common/MessageItem.js';
import { UserDrawer } from './UserDrawer.js';
import { getSocket } from '../../services/socket.js';
import { 
  Send, 
  ArrowLeft, 
  MoreHorizontal, 
  Search, 
  PenSquare, 
  ShieldCheck, 
  Flame, 
  Paperclip, 
  Bell, 
  LayoutGrid, 
  ChevronRight,
  Sparkles,
  Lock
} from 'lucide-react';

export const UserChatView: React.FC = () => {
  const { t } = useTranslation();
  const { user, adminInfo } = useAuthStore();
  const { 
    messages, 
    loadMessages, 
    sendMessage, 
    deleteMessage, 
    addMessage, 
    removeMessage,
    clearMessages,
    isAdminOnline,
    setAdminOnline,
    typingUsers,
    setTyping,
    sendTyping
  } = useChatStore();

  const [viewMode, setViewMode] = useState<'home' | 'chat'>('home');
  const [inputText, setInputText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial messages
  useEffect(() => {
    loadMessages();
  }, []);

  // Socket event listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('message:new', (msg) => {
      addMessage({ ...msg, isOwn: false });
    });

    socket.on('message:sent', (msg) => {
      addMessage({ ...msg, isOwn: true });
    });

    socket.on('message:deleted', ({ messageId }) => {
      removeMessage(messageId);
    });

    socket.on('conversation:cleared', () => {
      clearMessages();
    });

    socket.on('admin:online_status', ({ isOnline }) => {
      setAdminOnline(isOnline);
    });

    socket.on('typing', ({ username, isTyping }) => {
      if (adminInfo && (username === adminInfo.username || username === 'admin')) {
        setTyping(adminInfo.id, isTyping);
      }
    });

    return () => {
      socket.off('message:new');
      socket.off('message:sent');
      socket.off('message:deleted');
      socket.off('conversation:cleared');
      socket.off('admin:online_status');
      socket.off('typing');
    };
  }, [adminInfo]);

  // Auto scroll
  useEffect(() => {
    if (viewMode === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, viewMode]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const text = inputText;
    setInputText('');
    sendTyping(false);

    try {
      await sendMessage(text);
      if (viewMode === 'home') {
        setViewMode('chat');
      }
    } catch (err) {
      console.error('Failed to send:', err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    // Send typing event
    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(false);
    }, 2000);
  };

  const isOpponentTyping = adminInfo ? typingUsers[adminInfo.id] : false;
  const lastMessage = messages[messages.length - 1];

  // Filter messages for search
  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  return (
    <div className="relative flex flex-col h-full w-full max-w-md md:max-w-xl mx-auto bg-gradient-to-b from-cream-50 via-cream-100 to-cream-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:border-x border-stone-200/60 dark:border-slate-800 shadow-2xl overflow-hidden font-sans">
      
      {/* =========================================================================
          VIEW MODE 1: HOME / DASHBOARD SCREEN (Screen 1 in Concept)
         ========================================================================= */}
      {viewMode === 'home' && (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Top Bar */}
          <header className="px-6 pt-6 pb-2 flex items-center justify-between shrink-0">
            {/* User Profile Avatar */}
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white flex items-center justify-center font-bold text-xs uppercase shadow-soft border border-white/60 dark:border-slate-600">
                {user?.username.substring(0, 2)}
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">{t('welcome')}</p>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{user?.username}</h3>
              </div>
            </div>

            {/* Circular Action Buttons */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setDrawerOpen(true)}
                className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-soft border border-black/5 dark:border-white/10 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                title={t('notificationsAndStatus')}
              >
                <Bell className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </button>

              <button
                onClick={() => setDrawerOpen(true)}
                className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-soft border border-black/5 dark:border-white/10 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                title={t('menuAndSettings')}
              >
                <LayoutGrid className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </button>
            </div>
          </header>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 py-3 space-y-5">
            {/* Editorial Heading */}
            <div className="pt-2">
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                {t('secureCommsWithAdmin')}
              </h1>
            </div>

            {/* Pill Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-4 rtl:right-auto rtl:left-4 top-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchMessages')}
                className="w-full pl-11 pr-11 py-3 rounded-full bg-white dark:bg-slate-800/90 text-xs text-slate-800 dark:text-white shadow-soft border border-black/5 dark:border-white/5 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-slate-400 font-sans"
              />
            </div>

            {/* Quick Action Feature Cards (2 Column Grid as in concept) */}
            <div className="grid grid-cols-2 gap-3.5">
              {/* Card 1: Start/Go to Chat */}
              <div 
                onClick={() => setViewMode('chat')}
                className="bg-white dark:bg-slate-800/90 rounded-[26px] p-5 shadow-soft border border-black/5 dark:border-white/5 flex flex-col justify-between cursor-pointer hover:shadow-floating hover:-translate-y-0.5 transition-all group"
              >
                <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-slate-700/60 text-slate-800 dark:text-amber-300 flex items-center justify-center mb-5 shadow-xs">
                  <PenSquare className="w-5 h-5 text-slate-800 dark:text-amber-300" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">
                    {t('onlineChat')}
                  </h3>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-slate-400">{t('enterChat')}</span>
                    <span className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 group-hover:bg-slate-900 group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-slate-900 transition-colors">
                      <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Ephemeral TTL Info */}
              <div 
                onClick={() => setDrawerOpen(true)}
                className="bg-white dark:bg-slate-800/90 rounded-[26px] p-5 shadow-soft border border-black/5 dark:border-white/5 flex flex-col justify-between cursor-pointer hover:shadow-floating hover:-translate-y-0.5 transition-all group"
              >
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-slate-700/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-5 shadow-xs">
                  <Flame className="w-5 h-5 text-amber-500 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">
                    {t('disappearingMessages')}
                  </h3>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">{t('delete24h')}</span>
                    <span className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 group-hover:bg-slate-900 group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-slate-900 transition-colors">
                      <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activities Section */}
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">
                  {t('recentActivities')}
                </h4>
                <button 
                  onClick={() => setViewMode('chat')}
                  className="text-[11px] font-medium text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                >
                  {t('seeAll')}
                </button>
              </div>

              <div className="space-y-2.5">
                {/* Activity Item 1: Last Conversation Thread */}
                <div 
                  onClick={() => setViewMode('chat')}
                  className="bg-white dark:bg-slate-800/90 rounded-2xl p-4 shadow-soft border border-black/5 dark:border-white/5 flex items-center justify-between cursor-pointer hover:bg-white/80 transition-all"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-slate-700/50 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="overflow-hidden">
                      <h5 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                        {t('chatWithAdminFull')}
                      </h5>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {lastMessage ? lastMessage.text : t('noMessagesYet')}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 rtl:rotate-180 shrink-0" />
                </div>

                {/* Activity Item 2: Security & At-Rest Encryption */}
                <div 
                  onClick={() => setDrawerOpen(true)}
                  className="bg-white dark:bg-slate-800/90 rounded-2xl p-4 shadow-soft border border-black/5 dark:border-white/5 flex items-center justify-between cursor-pointer hover:bg-white/80 transition-all"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-slate-700/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="overflow-hidden">
                      <h5 className="font-bold text-xs text-slate-900 dark:text-white">
                        {t('aesSecurityTitle')}
                      </h5>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {t('aesSecurityDesc')}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 rtl:rotate-180 shrink-0" />
                </div>
              </div>
            </div>
          </div>

          {/* Floating Pill Input Bar on Home (Bottom as in concept) */}
          <footer className="p-4 shrink-0">
            <form onSubmit={handleSend} className="flex items-center gap-2.5">
              <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-full bg-white dark:bg-slate-800 shadow-floating border border-black/5 dark:border-white/5">
                <span className="text-slate-400 text-sm font-light">+</span>
                <input
                  type="text"
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder={t('typeQuickMessage')}
                  className="flex-1 bg-transparent border-none text-xs text-slate-900 dark:text-white focus:outline-none placeholder:text-slate-400 font-sans"
                />
              </div>

              {/* Circular Primary Action Button */}
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="w-12 h-12 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                title={t('sendMessage')}
              >
                <Send className="w-4 h-4 rtl:rotate-180" />
              </button>
            </form>
          </footer>
        </div>
      )}

      {/* =========================================================================
          VIEW MODE 2: DIRECT CHAT VIEW (Screen 2 in Concept)
         ========================================================================= */}
      {viewMode === 'chat' && (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Concept Top Navigation Bar */}
          <header className="px-5 py-4 flex items-center justify-between shrink-0 bg-transparent z-10">
            {/* Circular Back Button */}
            <button
              onClick={() => setViewMode('home')}
              className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-soft border border-black/5 dark:border-white/10 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
              title={t('backToHome')}
            >
              <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
            </button>

            {/* Centered Chat Title & Status */}
            <div className="text-center">
              <h2 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                {t('chatWithAdmin')}
              </h2>
              <p className="text-[10px] text-slate-400 flex items-center justify-center gap-1 mt-0.5">
                {isOpponentTyping ? (
                  <span className="text-amber-500 font-medium animate-pulse">{t('typing')}</span>
                ) : isAdminOnline ? (
                  <span className="text-emerald-500 font-medium">{t('online')}</span>
                ) : (
                  <span>{t('offline')}</span>
                )}
              </p>
            </div>

            {/* Circular More Options Button */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-soft border border-black/5 dark:border-white/10 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
              title={t('chatSettings')}
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </header>

          {/* Ephemeral Flame Tag Indicator */}
          <div className="px-5 py-1 flex items-center justify-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 shrink-0">
            <Flame className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            <span className="font-sans">{t('chatTtlBanner')}</span>
          </div>

          {/* Messages Stream */}
          <main className="flex-1 overflow-y-auto px-5 py-2 space-y-1">
            {filteredMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <div className="w-16 h-16 rounded-3xl bg-white dark:bg-slate-800 shadow-soft border border-black/5 dark:border-white/5 flex items-center justify-center mb-3 text-amber-500">
                  <Lock className="w-7 h-7" />
                </div>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                  {t('secureChatNoticeTitle')}
                </h4>
                <p className="text-xs max-w-xs mt-1 text-slate-400 leading-relaxed">
                  {t('secureChatNoticeDesc')}
                </p>
              </div>
            ) : (
              filteredMessages.map((msg) => (
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

          {/* Floating Pill Input Bar (Exact Right Screen in Concept) */}
          <footer className="p-4 shrink-0">
            <form onSubmit={handleSend} className="flex items-center gap-2.5">
              {/* Inner White Pill Input */}
              <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-full bg-white dark:bg-slate-800 shadow-floating border border-black/5 dark:border-white/5">
                <button
                  type="button"
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  title={t('attachFile')}
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder={t('typeMessage')}
                  className="flex-1 bg-transparent border-none text-xs text-slate-900 dark:text-white focus:outline-none placeholder:text-slate-400 font-sans"
                />

                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors"
                >
                  <Send className="w-4 h-4 rtl:rotate-180" />
                </button>
              </div>

              {/* Distinct Circular Dark Action Button (as shown in concept image) */}
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="w-12 h-12 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                title={t('send')}
              >
                <Send className="w-4 h-4 rtl:rotate-180" />
              </button>
            </form>
          </footer>
        </div>
      )}

      {/* User Settings Drawer */}
      <UserDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
};
