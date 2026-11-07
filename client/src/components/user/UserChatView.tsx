import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { MessageItem } from '../common/MessageItem.js';
import { UserDrawer } from './UserDrawer.js';
import { getSocket } from '../../services/socket.js';
import { 
  Send, 
  Menu, 
  ShieldCheck, 
  Flame,
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

  const [inputText, setInputText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
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
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto bg-gray-50 dark:bg-slate-950 sm:border-x border-gray-200 dark:border-slate-800 shadow-xl overflow-hidden relative">
      {/* Top Header */}
      <header className="h-16 px-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-gray-200 dark:border-slate-800 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          {/* Admin Avatar */}
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary-600 to-emerald-400 text-white flex items-center justify-center font-bold shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div
              className={`absolute bottom-0 right-0 rtl:right-auto rtl:left-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                isAdminOnline ? 'bg-emerald-500' : 'bg-gray-400'
              }`}
            />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold text-sm text-gray-900 dark:text-white">
                {t('chatWithAdmin')}
              </h2>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-500/10 text-primary-600 dark:text-primary-400 font-medium">
                Admin
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1">
              {isOpponentTyping ? (
                <span className="text-primary-500 font-medium animate-pulse">{t('typing')}</span>
              ) : isAdminOnline ? (
                <span className="text-emerald-500">{t('online')}</span>
              ) : (
                <span>{t('offline')}</span>
              )}
            </p>
          </div>
        </div>

        {/* Right action button */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 rounded-xl text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          title="منوی تنظیمات و پروفایل"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Ephemeral Warning Banner */}
      <div className="bg-amber-500/10 dark:bg-amber-500/5 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-center gap-2 text-[11px] text-amber-700 dark:text-amber-400 shrink-0">
        <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span className="truncate">{t('ephemeralNotice')}</span>
      </div>

      {/* Message Stream */}
      <main className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400 dark:text-slate-500">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 flex items-center justify-center mb-3 text-primary-500">
              <Lock className="w-7 h-7" />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
              گفتگوی کاملاً امن و محرمانه با ادمین
            </p>
            <p className="text-xs max-w-xs mt-1">
              پیام‌های ارسالی شما مستقیماً برای مدیر سیستم ارسال شده و طبق زمان تعیین شده به طور خودکار حذف می‌شوند.
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
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder={t('typeMessage')}
            className="flex-1 px-4 py-3 rounded-2xl bg-gray-100 dark:bg-slate-800 border-none text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500"
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

      {/* User Settings Drawer */}
      <UserDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
};
