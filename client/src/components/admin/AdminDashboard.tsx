import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { api, AdminUserItem } from '../../services/api.js';
import { APP_VERSION } from '../../config/version.js';
import { AdminSidebar } from './AdminSidebar.js';
import { AdminSettingsModal } from './AdminSettingsModal.js';
import { MessageItem } from '../common/MessageItem.js';
import { DateSeparator } from '../common/DateSeparator.js';
import { getSocket } from '../../services/socket.js';
import { formatLastSeen, isSameDay } from '../../utils/date.js';
import { getErrorMessage } from '../../utils/errors.js';
import { 
  Paperclip,
  CheckCircle, 
  Ban, 
  Trash2, 
  ArrowLeft, 
  UserX, 
  MessageSquare,
  X,
  Loader2,
  ChevronDown
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
    syncMessages,
    markMessagesReadByRecipient,
    syncReadUser
  } = useChatStore();

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const prevMessagesLengthRef = useRef(0);
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

    socket.on('messages:read', ({ readerId }: { readerId: string }) => {
      markMessagesReadByRecipient(readerId);
    });

    socket.on('conversation:read_sync', ({ userId }: { userId: string }) => {
      syncReadUser(userId);
    });

    return () => {
      socket.off('message:new');
      socket.off('message:sent');
      socket.off('message:deleted');
      socket.off('conversation:cleared');
      socket.off('presence:init');
      socket.off('user:online_status');
      socket.off('typing');
      socket.off('messages:read');
      socket.off('conversation:read_sync');
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

  // Reset scroll state when changing active chat user
  useEffect(() => {
    initialScrollDoneRef.current = false;
    prevMessagesLengthRef.current = 0;
    setShowScrollBottom(false);
  }, [activeUserId]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom <= 120;
    setShowScrollBottom(distanceFromBottom > 160);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
  };

  // Smart Auto-scroll (Preserves scroll position when reading history)
  useEffect(() => {
    if (!messages || messages.length === 0) {
      prevMessagesLengthRef.current = 0;
      return;
    }

    const isInitial = !initialScrollDoneRef.current;
    const prevLen = prevMessagesLengthRef.current;
    const hasNewMessages = messages.length > prevLen;
    const lastMsg = messages[messages.length - 1];
    const isOwnLastMsg = lastMsg?.senderId === user?.id || lastMsg?.isOwn === true;

    if (isInitial) {
      initialScrollDoneRef.current = true;
      scrollToBottom('auto');
    } else if (hasNewMessages && isOwnLastMsg) {
      scrollToBottom('smooth');
    } else if (isNearBottomRef.current) {
      scrollToBottom('smooth');
    }

    prevMessagesLengthRef.current = messages.length;
  }, [messages, user?.id]);

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
      setTimeout(() => scrollToBottom('smooth'), 50);
    } catch (err) {
      console.error('Failed to send:', err);
      alert(t('imageUploadFailed'));
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
      alert(getErrorMessage(err, 'errApproveUser'));
    }
  };

  const handleBanToggle = async () => {
    if (!activeUser) return;
    const nextStatus = activeUser.status === 'banned' ? 'active' : 'banned';
    try {
      await api.updateUserStatus(activeUser.id, nextStatus);
      refreshUsers();
    } catch (err: any) {
      alert(getErrorMessage(err, 'errBanUser'));
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
        alert(getErrorMessage(err, 'errClearChat'));
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
        alert(getErrorMessage(err, 'errDeleteUser'));
      }
    }
  };

  const isUserTyping = activeUserId ? typingUsers[activeUserId] : false;

  return (
    <div className="flex flex-1 h-full w-full bg-ambient-canvas overflow-hidden font-sans">
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
            <header className="px-6 py-4 pt-safe flex items-center justify-between shrink-0 bg-white/35 dark:bg-[#12161E]/60 backdrop-blur-xl z-10 border-b border-black/[0.05] dark:border-white/[0.07]">
              <div className="flex items-center gap-3">
                {/* Back button for mobile */}
                <button
                  onClick={() => setActiveUserId(null)}
                  className="sm:hidden w-10 h-10 rounded-full bg-white dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 shadow-xs border border-black/5 dark:border-white/[0.09] flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                >
                  <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
                </button>

                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-white/[0.08] text-slate-800 dark:text-slate-100 flex items-center justify-center font-bold text-xs uppercase shadow-xs border border-white dark:border-white/[0.08] overflow-hidden">
                    {activeUser.avatarUrl ? (
                      <img src={activeUser.avatarUrl} alt={activeUser.username} className="w-full h-full object-cover" />
                    ) : (
                      <span>{activeUser.username.substring(0, 2)}</span>
                    )}
                  </div>
                  <div
                    className={`absolute bottom-0 right-0 rtl:right-auto rtl:left-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#12161E] ${
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
                          Boolean(onlineUsers[activeUser.id])
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
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-all hover:scale-105 active:scale-95"
                    title={t('approve')}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{t('approve')}</span>
                  </button>
                )}

                <button
                  onClick={handleBanToggle}
                  className={`w-9 h-9 rounded-full bg-white dark:bg-white/[0.08] dark:hover:bg-white/[0.12] dark:backdrop-blur-md shadow-xs border border-black/5 dark:border-white/[0.09] flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
                    activeUser.status === 'banned'
                      ? 'text-amber-600 bg-amber-50 dark:bg-amber-500/20'
                      : 'text-slate-400 hover:text-amber-500 dark:text-slate-300 dark:hover:text-amber-400'
                  }`}
                  title={activeUser.status === 'banned' ? t('unban') : t('ban')}
                >
                  <Ban className="w-4 h-4" />
                </button>

                <button
                  onClick={handleWipeChat}
                  className="w-9 h-9 rounded-full bg-white dark:bg-white/[0.08] dark:hover:bg-white/[0.12] dark:backdrop-blur-md shadow-xs border border-black/5 dark:border-white/[0.09] text-slate-400 hover:text-red-500 dark:text-slate-300 dark:hover:text-red-400 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                  title={t('clearChat')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  onClick={handleDeleteUser}
                  className="w-9 h-9 rounded-full bg-white dark:bg-white/[0.08] dark:hover:bg-white/[0.12] dark:backdrop-blur-md shadow-xs border border-black/5 dark:border-white/[0.09] text-slate-400 hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                  title={t('deleteUser')}
                >
                  <UserX className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Messages Area */}
            <main 
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-6 py-3 space-y-1"
            >
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 select-none">
                  <div className="w-16 h-16 rounded-3xl bg-white dark:bg-white/[0.07] backdrop-blur-md shadow-xs border border-black/5 dark:border-white/[0.08] flex items-center justify-center mb-4 text-amber-500 transition-transform hover:scale-105">
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
                messages.map((msg, index) => {
                  const prevMsg = index > 0 ? messages[index - 1] : null;
                  const showDateSeparator = !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt);
                  return (
                    <React.Fragment key={msg.id}>
                      {showDateSeparator && <DateSeparator date={msg.createdAt} />}
                      <MessageItem
                        message={msg}
                        isOwn={msg.senderId === user?.id || msg.isOwn === true}
                        onDelete={deleteMessage}
                      />
                    </React.Fragment>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </main>

            {/* Floating Scroll to Bottom Button */}
            {showScrollBottom && (
              <button
                type="button"
                onClick={() => scrollToBottom('smooth')}
                className="absolute bottom-20 sm:bottom-24 end-6 sm:end-8 z-30 w-10 h-10 rounded-full bg-white/95 dark:bg-[#1C222D]/95 text-slate-700 dark:text-slate-200 border border-black/[0.08] dark:border-white/[0.12] shadow-floating backdrop-blur-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all animate-fade-in"
                title={t('scrollToBottom')}
              >
                <ChevronDown className="w-5 h-5 text-slate-700 dark:text-slate-200" />
              </button>
            )}

            {/* Bottom Floating Pill Input Area */}
            <footer className="px-3.5 sm:px-6 pt-2 pb-safe shrink-0">
              <form
                onSubmit={handleSend}
                className="max-w-3xl mx-auto"
              >
                {/* Selected Image Preview Chip */}
                {imagePreviewUrl && (
                  <div className="mb-2 p-2 rounded-2xl bg-white/95 dark:bg-[#151922]/95 backdrop-blur-xl border border-black/5 dark:border-white/[0.08] flex items-center justify-between gap-3 shadow-sm animate-message">
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
                  className="relative flex items-center h-12 px-1.5 rounded-full bg-white dark:bg-[#151922]/95 backdrop-blur-xl shadow-none border border-black/[0.06] dark:border-white/[0.08]"
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
                    className={`flex-1 h-full bg-transparent border-none text-xs text-slate-900 dark:text-slate-100 focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 font-sans px-3 ${
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
            <div className="w-16 h-16 rounded-3xl bg-white dark:bg-white/[0.07] backdrop-blur-md shadow-xs border border-black/5 dark:border-white/[0.08] text-amber-500 flex items-center justify-center mb-4 transition-transform hover:scale-105">
              <MessageSquare className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 tracking-tight">
              {t('selectConversation')}
            </h3>
            <p className="text-xs text-slate-400 max-w-[260px] mt-1.5 leading-relaxed">
              {t('selectConversationDesc')}
            </p>
            <div className="mt-4 px-3 py-1 rounded-full bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.05] dark:border-white/[0.06] text-[11px] text-slate-400 select-none">
              XMessenger v{APP_VERSION}
            </div>
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
