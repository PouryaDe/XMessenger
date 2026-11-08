import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { MessageItem } from '../common/MessageItem.js';
import { DateSeparator } from '../common/DateSeparator.js';
import { ChangePasswordModal } from '../common/ChangePasswordModal.js';
import { UserDrawer } from './UserDrawer.js';
import { getSocket } from '../../services/socket.js';
import { formatLastSeen, isSameDay } from '../../utils/date.js';
import { api, Message } from '../../services/api.js';
import { 
  isPushSupported, 
  isIosRequiringPwa, 
  getCurrentSubscription, 
  subscribeToPush 
} from '../../services/push.js';
import { 
  ShieldCheck, 
  Flame, 
  Paperclip, 
  LayoutGrid, 
  Lock,
  X,
  Loader2,
  ChevronDown,
  Reply,
  Bell
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
    sendTyping,
    markConversationAsRead,
    markMessagesReadByRecipient,
    toggleReaction,
    updateMessageReactions
  } = useChatStore();

  const [inputText, setInputText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [isSubscribingPrompt, setIsSubscribingPrompt] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNearBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const prevMessagesLengthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear replyingTo if the referenced message was deleted
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

  // Load initial messages and mark read
  useEffect(() => {
    loadMessages().then(() => {
      if (adminInfo?.id) {
        markConversationAsRead(adminInfo.id);
      }
    });

    // Check if user should be prompted to enable push notifications
    if (typeof window !== 'undefined') {
      const isDismissed = localStorage.getItem('xmessenger_dismiss_push_prompt') === 'true';
      if (!isDismissed) {
        if (isPushSupported()) {
          if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
            getCurrentSubscription().then((sub) => {
              if (!sub) setShowPushPrompt(true);
            }).catch(() => {});
          }
        } else if (isIosRequiringPwa()) {
          setShowPushPrompt(true);
        }
      }
    }
  }, [adminInfo?.id]);

  const handleEnablePushFromPrompt = async () => {
    setIsSubscribingPrompt(true);
    try {
      const res = await subscribeToPush();
      if (res.success) {
        setShowPushPrompt(false);
        localStorage.setItem('xmessenger_dismiss_push_prompt', 'true');
      } else {
        if (res.error === 'IOS_PWA_REQUIRED') {
          alert(t('pushIosTip'));
        } else if (res.error === 'PERMISSION_DENIED') {
          alert(t('pushPermissionDenied'));
          setShowPushPrompt(false);
        } else {
          alert(t('pushUnsupported'));
          setShowPushPrompt(false);
        }
      }
    } catch {
      setShowPushPrompt(false);
    } finally {
      setIsSubscribingPrompt(false);
    }
  };

  const handleDismissPushPrompt = () => {
    setShowPushPrompt(false);
    localStorage.setItem('xmessenger_dismiss_push_prompt', 'true');
  };

  // Socket event listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('message:new', (msg) => {
      addMessage({ ...msg, isOwn: msg.senderId === user?.id });
      // Mark as read immediately since user is actively viewing this chat
      if (msg.senderId) {
        markConversationAsRead(msg.senderId);
      }
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

    socket.on('messages:read', ({ readerId }: { readerId: string }) => {
      markMessagesReadByRecipient(readerId);
    });

    socket.on('message:reaction', ({ messageId, reactions }: { messageId: string; reactions: any[] }) => {
      updateMessageReactions(messageId, reactions);
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
      socket.off('messages:read');
      socket.off('message:reaction');
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

  // Handle scroll to track whether user is reading past messages or watching the bottom
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Considered near bottom if within 120px
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

  // Smart Auto scroll (Preserves scroll position when reading history)
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
    // Only scroll when new messages are added, never on read status updates or background sync

    prevMessagesLengthRef.current = messages.length;
  }, [messages, user?.id]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !selectedImage) return;

    const text = inputText.trim();
    const currentImg = selectedImage;
    const currentReplyId = replyingTo?.id || null;

    setInputText('');
    setReplyingTo(null);
    handleRemoveImage();
    sendTyping(false);

    try {
      if (currentImg) {
        setIsUploading(true);
        const uploadRes = await api.uploadChatImage(currentImg);
        const finalMessage = `[image:${uploadRes.url}]${text ? '\n' + text : ''}`;
        await sendMessage(finalMessage, undefined, undefined, currentReplyId);
      } else {
        await sendMessage(text, undefined, undefined, currentReplyId);
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

    // Send typing event
    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(false);
    }, 2000);
  };

  const isOpponentTyping = adminInfo ? typingUsers[adminInfo.id] : false;

  return (
    <div className="relative flex flex-col flex-1 h-full min-h-0 w-full max-w-md md:max-w-xl mx-auto bg-ambient-canvas sm:border-x border-black/[0.06] dark:border-white/[0.08] sm:shadow-floating shadow-none overflow-hidden font-sans">
      
      {/* Top Header */}
      <header className="h-16 px-4 sm:px-5 flex items-center justify-between shrink-0 bg-white/45 dark:bg-[#12161E]/70 backdrop-blur-xl border-b border-black/[0.05] dark:border-white/[0.08] z-10">
        {/* Admin Avatar & Live Status */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-amber-500/15 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold shadow-xs overflow-hidden">
              {adminInfo?.avatarUrl ? (
                <img src={adminInfo.avatarUrl} alt="Admin" className="w-full h-full object-cover" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-amber-500" />
              )}
            </div>
            <div
              className={`absolute bottom-0 right-0 rtl:right-auto rtl:left-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#12161E] transition-colors ${
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
                <span>{formatLastSeen(adminLastSeen || adminInfo?.lastSeen, isAdminOnline)}</span>
              )}
            </p>
          </div>
        </div>

        {/* Circular Menu Button (Opens Drawer for Theme, Language, Password, Logout) */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 rounded-full bg-white dark:bg-white/[0.08] dark:hover:bg-white/[0.12] dark:backdrop-blur-md text-slate-700 dark:text-slate-200 shadow-xs border border-black/5 dark:border-white/[0.09] flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
          title={t('menuAndSettings')}
        >
          <LayoutGrid className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
      </header>

      {/* Push Notification Suggestion Banner */}
      {showPushPrompt && (
        <div className="px-4 pt-2.5 pb-1 flex justify-center shrink-0 select-none animate-fade-in z-20">
          <div className="w-full max-w-lg p-3 rounded-2xl bg-white/85 dark:bg-[#151922]/90 backdrop-blur-xl border border-amber-500/30 dark:border-amber-400/25 shadow-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 animate-bounce" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  {t('pushPromptTitle')}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {t('pushPromptDesc')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleEnablePushFromPrompt}
                disabled={isSubscribingPrompt}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isSubscribingPrompt ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>{t('pushPromptEnable')}</span>
                )}
              </button>
              <button
                onClick={handleDismissPushPrompt}
                className="w-7 h-7 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                title={t('pushPromptDismiss')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ephemeral Flame Tag Banner in Rounded Pill Card */}
      <div className="px-4 pt-3 pb-1.5 flex justify-center shrink-0 select-none">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/70 dark:bg-white/[0.08] backdrop-blur-md border border-black/[0.06] dark:border-white/10 shadow-xs text-[11px] font-medium text-amber-700 dark:text-amber-300/90 font-sans">
          <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-pulse" />
          <span>{t('chatTtlBanner')}</span>
        </div>
      </div>

      {/* Messages Stream with Ambient Gradient Fades */}
      <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="pointer-events-none absolute top-0 inset-x-0 h-6 bg-gradient-to-b from-[#DFDDD6]/90 via-[#DFDDD6]/35 to-transparent dark:from-[#0E1218]/90 dark:via-[#0E1218]/35 z-10" />

        <main 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 chat-fade-mask relative"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 select-none">
              <div className="w-16 h-16 rounded-3xl bg-white dark:bg-white/[0.07] backdrop-blur-md shadow-xs border border-black/5 dark:border-white/[0.08] flex items-center justify-center mb-3 text-amber-500">
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
            messages.map((msg, index) => {
              const prevMsg = index > 0 ? messages[index - 1] : null;
              const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
              const showDateSeparator = !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt);
              const isFirstInGroup = showDateSeparator || !prevMsg || (prevMsg.senderId !== msg.senderId);
              const isLastInGroup = !nextMsg || (nextMsg.senderId !== msg.senderId) || !isSameDay(msg.createdAt, nextMsg.createdAt);
              const repliedMsg = msg.replyToId ? messages.find((m) => m.id === msg.replyToId) || null : null;
              const repliedIsOwn = repliedMsg ? (repliedMsg.senderId === user?.id || repliedMsg.isOwn === true) : false;
              const repliedSenderName = repliedMsg
                ? (repliedIsOwn ? t('replyToSelf') : t('chatWithAdmin'))
                : '';

              return (
                <React.Fragment key={msg.id}>
                  {showDateSeparator && <DateSeparator date={msg.createdAt} />}
                  <MessageItem
                    message={msg}
                    isOwn={msg.senderId === user?.id || msg.isOwn === true}
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
            })
          )}
          <div ref={messagesEndRef} />
        </main>

        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-[#DFDDD6]/90 via-[#DFDDD6]/35 to-transparent dark:from-[#0E1218]/90 dark:via-[#0E1218]/35 z-10" />

        {/* Floating Scroll to Bottom Button - Fixed directly above the input bar */}
        {showScrollBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-3 end-4 sm:end-6 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/95 dark:bg-[#1C222D]/95 text-slate-700 dark:text-slate-200 border border-black/[0.08] dark:border-white/[0.12] shadow-floating backdrop-blur-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all animate-fade-in cursor-pointer"
            title={t('scrollToBottom')}
          >
            <ChevronDown className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          </button>
        )}
      </div>

      {/* Floating Pill Input Bar with Telegram Send Button INSIDE the Pill */}
      <footer className="px-3 sm:px-6 pt-1.5 pb-safe shrink-0">
        <form onSubmit={handleSend} className="max-w-xl mx-auto">
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
                      {t('replyingTo')} {isReplyingSelf ? t('replyToSelf') : t('chatWithAdmin')}
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

            {/* Input Field with Auto-Direction & Paste Support */}
            <input
              ref={messageInputRef}
              type="text"
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

      {/* Slide-out User Profile / Settings Drawer */}
      <UserDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
      />

      {/* Change Password Modal (centered, independent of drawer) */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
};
