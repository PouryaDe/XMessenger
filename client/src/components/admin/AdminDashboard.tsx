import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { api, AdminUserItem } from '../../services/api.js';
import { AdminSidebar } from './AdminSidebar.js';
import { AdminSettingsModal } from './AdminSettingsModal.js';
import { MessageItem } from '../common/MessageItem.js';
import { getSocket } from '../../services/socket.js';
import { formatLastSeen } from '../../utils/date.js';
import { 
  Paperclip,
  CheckCircle, 
  Ban, 
  Trash2, 
  ArrowLeft, 
  UserX, 
  MessageSquare,
  X,
  Loader2
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
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
    lastSeenUsers,
    setOnlineStatus,
    typingUsers,
    setTyping,
    sendTyping,
    syncMessages
  } = useChatStore();

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      return;
    }
    setSelectedImage(file);
    const url = URL.createObjectURL(file);
    setImagePreviewUrl(url);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleImageFile(file);
            e.preventDefault();
            break;
          }
        }
      }
    }
  };

  // Dynamic text direction detection (RTL for Persian, LTR for English)
  const isInputRtl = !inputText.trim()
    ? (i18n.language === 'fa')
    : /^[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(inputText.trim());

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
        addMessage({ ...msg, isOwn: msg.senderId === user?.id });
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

    socket.on('presence:init', ({ onlineUserIds }: { onlineUserIds: string[] }) => {
      onlineUserIds.forEach((id) => setOnlineStatus(id, true));
    });

    socket.on('user:online_status', ({ userId, isOnline, lastSeen }) => {
      setOnlineStatus(userId, isOnline, lastSeen);
    });

    socket.on('typing', ({ userId, isTyping }) => {
      setTyping(userId, isTyping);
    });

    return () => {
      socket.off('message:new');
      socket.off('message:sent');
      socket.off('message:deleted');
      socket.off('conversation:cleared');
      socket.off('presence:init');
      socket.off('user:online_status');
      socket.off('typing');
    };
  }, [activeUserId, user?.id]);

  // Periodic heartbeat message sync to guarantee zero missed messages
  useEffect(() => {
    if (!activeUserId) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        syncMessages();
      }
    }, 6000);
    return () => clearInterval(interval);
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
    if ((!inputText.trim() && !selectedImage) || !activeUserId) return;

    const text = inputText.trim();
    const currentImg = selectedImage;

    setInputText('');
    handleRemoveImage();
    sendTyping(false, activeUserId);

    try {
      if (currentImg) {
        setIsUploading(true);
        const uploadRes = await api.uploadChatImage(currentImg);
        const finalMessage = `[image:${uploadRes.url}]${text ? '\n' + text : ''}`;
        await sendMessage(finalMessage, activeUserId);
      } else {
        await sendMessage(text, activeUserId);
      }
    } catch (err) {
      console.error('Failed to send:', err);
      alert(t('imageUploadFailed') || 'خطا در ارسال تصویر');
    } finally {
      setIsUploading(false);
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
    if (window.confirm(t('confirmDeleteUser'))) {
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
    <div className="flex h-full w-full bg-ambient-canvas overflow-hidden font-sans">
      {/* Left/Right Sidebar (Responsive: full width on mobile when no user selected) */}
      <div className={`${activeUserId ? 'hidden sm:flex' : 'flex'} w-full sm:w-auto h-full`}>
        <AdminSidebar
          onOpenSettings={() => setSettingsModalOpen(true)}
          onSelectUser={handleSelectUser}
        />
      </div>

      {/* Main Chat Area */}
      <div className={`${!activeUserId ? 'hidden sm:flex' : 'flex'} flex-1 flex-col h-full bg-transparent relative overflow-hidden`}>
        {activeUser ? (
          <>
            {/* Top Chat Header */}
            <header className="px-6 py-4 pt-safe flex items-center justify-between shrink-0 bg-white/35 dark:bg-slate-900/35 backdrop-blur-xl z-10 border-b border-black/[0.05] dark:border-white/10">
              <div className="flex items-center gap-3">
                {/* Back button for mobile */}
                <button
                  onClick={() => setActiveUserId(null)}
                  className="sm:hidden w-10 h-10 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-soft border border-black/5 dark:border-white/10 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                >
                  <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
                </button>

                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 flex items-center justify-center font-bold font-mono text-xs uppercase shadow-soft border border-white dark:border-slate-600 overflow-hidden">
                    {activeUser.avatarUrl ? (
                      <img src={activeUser.avatarUrl} alt={activeUser.username} className="w-full h-full object-cover" />
                    ) : (
                      <span>{activeUser.username.substring(0, 2)}</span>
                    )}
                  </div>
                  <div
                    className={`absolute bottom-0 right-0 rtl:right-auto rtl:left-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
                      onlineUsers[activeUser.id] ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      {activeUser.username}
                    </h3>
                    {activeUser.status === 'pending' && (
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold">
                        {t('statusPending')}
                      </span>
                    )}
                    {activeUser.status === 'banned' && (
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 font-bold">
                        {t('statusBanned')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {isUserTyping ? (
                      <span className="text-amber-500 font-medium animate-pulse">{t('typing')}</span>
                    ) : onlineUsers[activeUser.id] ? (
                      <span className="text-emerald-500 font-medium">{t('online')}</span>
                    ) : (
                      <span>
                        {formatLastSeen(
                          lastSeenUsers[activeUser.id] || activeUser.last_seen,
                          Boolean(onlineUsers[activeUser.id]),
                          i18n.language || 'fa'
                        )}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Action Buttons for this user */}
              <div className="flex items-center gap-2">
                {activeUser.status === 'pending' && (
                  <button
                    onClick={handleApproveUser}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-soft transition-all hover:scale-105 active:scale-95"
                    title={t('approve')}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{t('approve')}</span>
                  </button>
                )}

                <button
                  onClick={handleBanToggle}
                  className={`w-9 h-9 rounded-full bg-white dark:bg-slate-800 shadow-soft border border-black/5 dark:border-white/10 flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
                    activeUser.status === 'banned'
                      ? 'text-amber-600 bg-amber-50'
                      : 'text-slate-400 hover:text-amber-500'
                  }`}
                  title={activeUser.status === 'banned' ? t('unban') : t('ban')}
                >
                  <Ban className="w-4 h-4" />
                </button>

                <button
                  onClick={handleWipeChat}
                  className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 shadow-soft border border-black/5 dark:border-white/10 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                  title={t('clearChat')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  onClick={handleDeleteUser}
                  className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 shadow-soft border border-black/5 dark:border-white/10 text-slate-400 hover:text-red-600 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                  title={t('deleteUser')}
                >
                  <UserX className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Messages Area */}
            <main className="flex-1 overflow-y-auto px-6 py-3 space-y-1">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 select-none">
                  <div className="w-16 h-16 rounded-3xl bg-white dark:bg-slate-800 shadow-soft border border-black/5 dark:border-white/10 flex items-center justify-center mb-4 text-amber-500 transition-transform hover:scale-105">
                    <MessageSquare className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {t('noMessagesInChat')}
                  </p>
                  <p className="text-xs max-w-[260px] mt-1.5 leading-relaxed text-slate-400">
                    {t('messagesTtlNotice')}
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

            {/* Bottom Floating Pill Input Area */}
            <footer className="p-4 pb-safe shrink-0">
              <form
                onSubmit={handleSend}
                className="max-w-3xl mx-auto"
              >
                {/* Selected Image Preview Chip */}
                {imagePreviewUrl && (
                  <div className="mb-2 p-2 rounded-2xl bg-white/95 dark:bg-slate-800/95 border border-black/5 dark:border-white/10 flex items-center justify-between gap-3 shadow-sm animate-message">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <img
                        src={imagePreviewUrl}
                        alt="preview"
                        className="w-12 h-12 rounded-xl object-cover border border-black/5 dark:border-white/10 shrink-0"
                      />
                      <div className="text-xs text-slate-700 dark:text-slate-200 truncate">
                        <p className="font-semibold truncate">{selectedImage?.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {selectedImage ? `${(selectedImage.size / 1024).toFixed(0)} KB` : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
                      title={t('removeImage')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])}
                />

                <div
                  data-input-pill
                  dir={i18n.language === 'fa' ? 'rtl' : 'ltr'}
                  className="relative flex items-center h-12 px-1.5 rounded-full bg-white dark:bg-slate-800 shadow-none border border-black/[0.06] dark:border-white/10"
                >
                  {/* Attachment Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0 ms-1"
                    title={t('attachFile')}
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <input
                    type="text"
                    dir={isInputRtl ? 'rtl' : 'ltr'}
                    value={inputText}
                    onChange={handleInputChange}
                    onPaste={handlePaste}
                    placeholder={selectedImage ? t('imageCaptionPlaceholder') : t('typeMessage')}
                    className={`flex-1 h-full bg-transparent border-none text-xs text-slate-900 dark:text-white focus:outline-none placeholder:text-slate-400 font-sans px-3 ${
                      isInputRtl ? 'text-right' : 'text-left'
                    }`}
                  />

                  {/* Direct Send Icon Button WITHOUT Background */}
                  <button
                    type="submit"
                    disabled={(!inputText.trim() && !selectedImage) || isUploading}
                    className="w-9 h-9 flex items-center justify-center text-[#2AABEE] hover:text-[#1d98d6] transition-all hover:scale-110 active:scale-95 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:scale-100 disabled:cursor-not-allowed shrink-0 mx-1 bg-transparent border-none outline-none"
                    title={t('send')}
                  >
                    {isUploading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[#2AABEE]" />
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className={`w-6 h-6 transition-transform ${
                          i18n.language === 'fa' ? '-scale-x-100' : ''
                        }`}
                      >
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </form>
            </footer>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 select-none">
            <div className="w-16 h-16 rounded-3xl bg-white dark:bg-slate-800 shadow-soft border border-black/5 dark:border-white/10 text-amber-500 flex items-center justify-center mb-4 transition-transform hover:scale-105">
              <MessageSquare className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 tracking-tight">
              {t('selectConversation')}
            </h3>
            <p className="text-xs text-slate-400 max-w-[260px] mt-1.5 leading-relaxed">
              {t('selectConversationDesc')}
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
