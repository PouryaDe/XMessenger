import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { MessageItem } from '../common/MessageItem.js';
import { UserDrawer } from './UserDrawer.js';
import { getSocket } from '../../services/socket.js';
import { formatLastSeen } from '../../utils/date.js';
import { 
  ShieldCheck, 
  Flame, 
  Paperclip, 
  LayoutGrid, 
  Lock
} from 'lucide-react';

export const UserChatView: React.FC = () => {
  const { t, i18n } = useTranslation();
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
    adminLastSeen,
    setAdminOnline,
    setAdminLastSeen,
    syncMessages,
    typingUsers,
    setTyping,
    sendTyping
  } = useChatStore();

  const [inputText, setInputText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Dynamic text direction detection (RTL for Persian, LTR for English)
  const isInputRtl = !inputText.trim()
    ? (i18n.language === 'fa')
    : /^[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(inputText.trim());

  // Load initial messages
  useEffect(() => {
    loadMessages();
  }, []);

  // Socket event listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('message:new', (msg) => {
      addMessage({ ...msg, isOwn: msg.senderId === user?.id });
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

    socket.on('admin:online_status', ({ isOnline, lastSeen }) => {
      setAdminOnline(isOnline);
      if (lastSeen) setAdminLastSeen(lastSeen);
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
  }, [adminInfo, user?.id]);

  // Periodic heartbeat sync to ensure zero missed messages
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        syncMessages();
      }
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const text = inputText;
    setInputText('');
    sendTyping(false);

    try {
      await sendMessage(text);
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

  return (
    <div className="relative flex flex-col h-full w-full max-w-md md:max-w-xl mx-auto bg-ambient-canvas sm:border-x border-black/[0.06] dark:border-slate-800 shadow-2xl overflow-hidden font-sans">
      
      {/* Top Header */}
      <header className="px-5 py-3.5 pt-safe flex items-center justify-between shrink-0 bg-white/45 dark:bg-slate-900/45 backdrop-blur-xl border-b border-black/[0.05] dark:border-white/10 z-10">
        {/* Admin Avatar & Live Status */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-amber-500/15 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold shadow-soft">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
            </div>
            <div
              className={`absolute bottom-0 right-0 rtl:right-auto rtl:left-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 transition-colors ${
                isAdminOnline ? 'bg-emerald-500' : 'bg-slate-400'
              }`}
            />
          </div>

          <div>
            <h2 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
              {t('chatWithAdmin')}
            </h2>
            <p className="text-[11px] text-slate-400">
              {isOpponentTyping ? (
                <span className="text-amber-500 font-medium animate-pulse">{t('typing')}</span>
              ) : isAdminOnline ? (
                <span className="text-emerald-500 font-medium">{t('online')}</span>
              ) : (
                <span>{formatLastSeen(adminLastSeen || adminInfo?.lastSeen, isAdminOnline, i18n.language || 'fa')}</span>
              )}
            </p>
          </div>
        </div>

        {/* Circular Menu Button (Opens Drawer for Theme, Language, Password, Logout) */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-soft border border-black/5 dark:border-white/10 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
          title={t('menuAndSettings')}
        >
          <LayoutGrid className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
      </header>

      {/* Ephemeral Flame Tag Indicator */}
      <div className="px-5 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 shrink-0">
        <Flame className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
        <span className="font-sans">{t('chatTtlBanner')}</span>
      </div>

      {/* Messages Stream */}
      <main className="flex-1 overflow-y-auto px-5 py-2 space-y-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 select-none">
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
          messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              isOwn={msg.senderId === user?.id || msg.isOwn === true}
              onDelete={deleteMessage}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Floating Pill Input Bar with Telegram Send Button INSIDE the Pill */}
      <footer className="p-4 pb-safe shrink-0">
        <form onSubmit={handleSend} className="max-w-xl mx-auto">
          <div
            data-input-pill
            dir={i18n.language === 'fa' ? 'rtl' : 'ltr'}
            className="relative flex items-center h-12 px-1.5 rounded-full bg-white dark:bg-slate-800 shadow-none dark:shadow-floating border border-black/[0.06] dark:border-white/10 transition-all focus-within:border-stone-400 dark:focus-within:border-slate-500"
          >
            {/* Attachment Button */}
            <button
              type="button"
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0 ms-1"
              title={t('attachFile')}
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Input Field with Auto-Direction */}
            <input
              type="text"
              dir={isInputRtl ? 'rtl' : 'ltr'}
              value={inputText}
              onChange={handleInputChange}
              placeholder={t('typeMessage')}
              className={`flex-1 h-full bg-transparent border-none text-xs text-slate-900 dark:text-white focus:outline-none placeholder:text-slate-400 font-sans px-3 ${
                isInputRtl ? 'text-right' : 'text-left'
              }`}
            />

            {/* Direct Send Icon Button WITHOUT Background (matching Image 2) */}
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="w-9 h-9 flex items-center justify-center text-[#2AABEE] hover:text-[#1d98d6] transition-all hover:scale-110 active:scale-95 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:scale-100 disabled:cursor-not-allowed shrink-0 mx-1 bg-transparent border-none outline-none"
              title={t('send')}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className={`w-6 h-6 transition-transform ${
                  i18n.language === 'fa' ? '-scale-x-100' : ''
                }`}
              >
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </form>
      </footer>

      {/* Slide-out User Profile / Settings Drawer */}
      <UserDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
};
