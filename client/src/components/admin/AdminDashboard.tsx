import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { api, AdminUserItem, Message } from '../../services/api.js';
import { APP_VERSION } from '../../config/version.js';
import { AdminSidebar } from './AdminSidebar.js';
import { AdminSettingsModal } from './AdminSettingsModal.js';
import { MessageItem } from '../common/MessageItem.js';
import { DateSeparator } from '../common/DateSeparator.js';
import { formatLastSeen, isSameDay } from '../../utils/date.js';
import { getErrorMessage } from '../../utils/errors.js';
import { getAvatarPalette } from '../../utils/avatar.js';
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
  ChevronDown,
  Reply,
  Flame
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
    clearMessages, 
    onlineUsers, 
    lastSeenUsers,
    typingUsers,
    sendTyping,
    syncMessages,
    isLoadingMessages,
    toggleReaction
  } = useChatStore();

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNearBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const prevMessagesLengthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear replyingTo when switching active conversation or if message is deleted
  useEffect(() => {
    setReplyingTo(null);
  }, [activeUserId]);

  useEffect(() => {
    if (replyingTo && !messages.some((m) => m.id === replyingTo.id)) {
      setReplyingTo(null);
    }
  }, [messages, replyingTo]);

  const handleReply = useCallback((msg: Message) => {
    setReplyingTo(msg);
    setTimeout(() => messageInputRef.current?.focus(), 50);
  }, []);

  const handleScrollToMessage = useCallback((msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(msgId);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedMsgId(null);
      }, 1800);
    }
  }, []);

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

  // Re-sync admin users on socket reconnection
  useEffect(() => {
    const handleConnect = () => {
      refreshUsers();
    };
    window.addEventListener('socket:connect', handleConnect);
    return () => {
      window.removeEventListener('socket:connect', handleConnect);
    };
  }, []);

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
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
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
      requestAnimationFrame(() => scrollToBottom('auto'));
    } else if (hasNewMessages) {
      if (isOwnLastMsg || isNearBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom('smooth'));
      }
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
    const currentReplyId = replyingTo?.id || null;

    setInputText('');
    setReplyingTo(null);
    handleRemoveImage();
    sendTyping(false, activeUserId);

    try {
      if (currentImg) {
        setIsUploading(true);
        const uploadRes = await api.uploadChatImage(currentImg);
        const finalMessage = `[image:${uploadRes.url}]${text ? '\n' + text : ''}`;
        await sendMessage(finalMessage, activeUserId, undefined, currentReplyId);
      } else {
        await sendMessage(text, activeUserId, undefined, currentReplyId);
      }
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
    <div className="flex flex-1 h-full w-full bg-ambient-canvas overflow-hidden overflow-x-hidden overscroll-x-none select-none font-sans">
      {/* Left/Right Sidebar (Responsive: full width on mobile when no user selected) */}
      <div className={`${activeUserId ? 'hidden sm:flex' : 'flex'} w-full sm:w-auto h-full overflow-hidden overflow-x-hidden`}>
        <AdminSidebar
          onOpenSettings={() => setSettingsModalOpen(true)}
          onSelectUser={handleSelectUser}
        />
      </div>

      {/* Main Chat Area */}
      <div className={`${!activeUserId ? 'hidden sm:flex' : 'flex'} flex-1 flex-col h-full bg-transparent relative overflow-hidden overflow-x-hidden`}>
        {activeUser ? (
          <>
            {/* Top Chat Header with dynamic safe-area clearance for iOS status bar & Dynamic Island */}
            <header className="pt-safe pb-2.5 px-4 sm:px-6 flex items-center justify-between shrink-0 bg-transparent z-10 border-b border-black/[0.05] dark:border-white/[0.06]">
              <div className="flex items-center gap-3">
                {/* Back button for mobile */}
                <button
                  onClick={() => setActiveUserId(null)}
                  className="sm:hidden w-10 h-10 rounded-full bg-white dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 shadow-xs border border-black/5 dark:border-white/[0.09] flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                >
                  <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
                </button>

                <div className="relative">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs uppercase shadow-xs overflow-hidden shrink-0 ${
                    activeUser.avatarUrl
                      ? 'bg-stone-200/60 dark:bg-white/[0.08] border border-black/5 dark:border-white/10'
                      : getAvatarPalette(activeUser.username)
                  }`}>
                    {activeUser.avatarUrl ? (
                      <img src={activeUser.avatarUrl} alt={activeUser.username} className="w-full h-full object-cover" />
                    ) : (
                      <span className="select-none tracking-wider">{activeUser.username.substring(0, 2)}</span>
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
            <div className="relative flex-1 flex flex-col min-h-0 w-full overflow-hidden overflow-x-hidden">
              <main 
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none overscroll-y-contain touch-pan-y px-4 sm:px-6 py-3 relative w-full"
              >
                {isLoadingMessages && messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 select-none animate-fade-in">
                    <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-500 flex items-center justify-center mb-3 shadow-xs">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {t('loadingConversation')}
                    </p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 select-none">
                    <div className="w-16 h-16 rounded-full bg-white dark:bg-white/[0.07] backdrop-blur-md shadow-xs border border-black/5 dark:border-white/[0.08] flex items-center justify-center mb-4 text-amber-500 transition-transform hover:scale-105">
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
                  <>
                    {/* Ephemeral 24h Purge Notice at the beginning of chat stream (unpinned, scrolls naturally like date separators) */}
                    <div className="w-full flex justify-center my-3 select-none pointer-events-none animate-fade-in shrink-0">
                      <span className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] sm:text-xs font-medium tracking-tight bg-slate-900/40 dark:bg-black/50 text-amber-300/95 dark:text-amber-300/95 backdrop-blur-md border border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.12)] pointer-events-auto">
                        <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
                        <span>{t('chatTtlBanner')}</span>
                      </span>
                    </div>

                    {messages.map((msg, index) => {
                      const prevMsg = index > 0 ? messages[index - 1] : null;
                      const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
                      const showDateSeparator = !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt);

                      const isOwnMsg = (m: typeof msg | null) => !m ? false : (m.senderId === user?.id || m.isOwn === true);
                      const prevIsOwn = isOwnMsg(prevMsg);
                      const currIsOwn = isOwnMsg(msg);
                      const nextIsOwn = isOwnMsg(nextMsg);

                      const isFirstInGroup = showDateSeparator || !prevMsg || (prevIsOwn !== currIsOwn);
                      const isLastInGroup = !nextMsg || (nextIsOwn !== currIsOwn) || !isSameDay(msg.createdAt, nextMsg.createdAt);
                      const repliedMsg = msg.replyToId ? messages.find((m) => m.id === msg.replyToId) || null : null;
                      const repliedIsOwn = repliedMsg ? (repliedMsg.senderId === user?.id || repliedMsg.isOwn === true) : false;
                      const repliedSenderName = repliedMsg
                        ? (repliedIsOwn ? t('replyToSelf') : activeUser.username)
                        : '';

                      return (
                        <React.Fragment key={msg.id}>
                          {showDateSeparator && <DateSeparator date={msg.createdAt} />}
                          <MessageItem
                            message={msg}
                            isOwn={currIsOwn}
                            isFirstInGroup={isFirstInGroup}
                            isLastInGroup={isLastInGroup}
                            onDelete={deleteMessage}
                            onReply={handleReply}
                            onReact={toggleReaction}
                            currentUser={user}
                            repliedMessage={repliedMsg}
                            repliedSenderName={repliedSenderName}
                            onScrollToMessage={handleScrollToMessage}
                            isHighlighted={highlightedMsgId === msg.id}
                          />
                        </React.Fragment>
                      );
                    })}
                  </>
                )}
                <div ref={messagesEndRef} />
              </main>

              {/* Floating Scroll to Bottom Button - Fixed directly above the input bar on the right side */}
              {showScrollBottom && (
                <button
                  type="button"
                  onClick={() => scrollToBottom('smooth')}
                  className="absolute bottom-3.5 right-4 sm:right-8 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/95 dark:bg-[#1C222D]/95 text-slate-700 dark:text-slate-200 border border-black/[0.08] dark:border-white/[0.12] shadow-floating backdrop-blur-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all animate-fade-in cursor-pointer"
                  title={t('scrollToBottom')}
                >
                  <ChevronDown className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                </button>
              )}
            </div>

            {/* Bottom Docked Input Area with frosted glass spanning into safe-area */}
            <footer className="px-3 sm:px-6 pt-2 pb-safe shrink-0 bg-transparent border-t border-black/[0.05] dark:border-white/[0.06]">
              <form
                onSubmit={handleSend}
                className="max-w-3xl mx-auto"
              >
                {/* Active Reply Preview Banner */}
                {replyingTo && (() => {
                  const replyImgMatch = replyingTo.text.match(/^\[image:(.+?)\](?:\n([\s\S]*))?$/);
                  const replyImgUrl = replyImgMatch ? replyImgMatch[1] : null;
                  const replyPreviewText = replyImgMatch
                    ? ((replyImgMatch[2] || '').trim() || `📷 ${t('photo')}`)
                    : replyingTo.text;
                  const isReplyingSelf = replyingTo.senderId === user?.id || replyingTo.isOwn === true;

                  return (
                    <div className="mb-2 px-3.5 py-2 rounded-2xl bg-white/95 dark:bg-[#151922]/95 backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-3 shadow-sm animate-message">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                        <Reply className="w-4 h-4 text-amber-500 shrink-0" />
                        <div className="w-0.5 h-7 rounded-full bg-amber-500 shrink-0" />
                        {replyImgUrl && (
                          <img
                            src={replyImgUrl}
                            alt=""
                            className="w-8 h-8 rounded-lg object-cover border border-black/5 dark:border-white/10 shrink-0"
                          />
                        )}
                        <div className="min-w-0 flex-1 overflow-hidden text-xs">
                          <p className="font-bold text-[11px] text-amber-600 dark:text-amber-400 truncate leading-tight">
                            {t('replyingTo')} {isReplyingSelf ? t('replyToSelf') : activeUser.username}
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5">
                            {replyPreviewText}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyingTo(null)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0 cursor-pointer"
                        title={t('cancelReply')}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })()}

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
                    ref={messageInputRef}
                    type="text"
                    name="message"
                    enterKeyHint="send"
                    autoComplete="off"
                    autoCorrect="on"
                    autoCapitalize="sentences"
                    spellCheck={false}
                    dir={isInputRtl ? 'rtl' : 'ltr'}
                    value={inputText}
                    onChange={handleInputChange}
                    onPaste={handlePaste}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape' && replyingTo) {
                        setReplyingTo(null);
                      }
                    }}
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

            {/* Hidden File Input placed outside the form to suppress iOS WebKit multi-input accessory navigation arrows */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              tabIndex={-1}
              aria-hidden="true"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])}
            />
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
