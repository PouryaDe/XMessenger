import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { MessageItem } from '../common/MessageItem.js';
import { DateSeparator } from '../common/DateSeparator.js';
import { ChangePasswordModal } from '../common/ChangePasswordModal.js';
import { UserDrawer } from './UserDrawer.js';
import { ChannelView } from '../channel/ChannelView.js';
import { formatLastSeen, isSameDay } from '../../utils/date.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatFileSize, decodeMojibake } from '../../utils/formatters.js';
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
  Menu, 
  Lock,
  X,
  Loader2,
  ChevronDown,
  Reply,
  Bell,
  Megaphone,
  FileText
} from 'lucide-react';

const FORBIDDEN_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.vbs', '.js', '.jse', '.wsf',
  '.msi', '.msp', '.com', '.scr', '.pif', '.hta', '.jar', '.php', '.phtml',
  '.php3', '.php4', '.php5', '.phps', '.cgi', '.pl', '.py', '.rb', '.asp',
  '.aspx', '.jsp', '.jspx', '.war', '.dll', '.so', '.dylib', '.ps1', '.psm1', '.psd1'
]);
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

interface SelectedAttachment {
  file: File;
  isImage: boolean;
  previewUrl?: string;
}

export const UserChatView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user, adminInfo } = useAuthStore();
  const { 
    messages, 
    loadMessages, 
    sendMessage, 
    deleteMessage, 
    isAdminOnline,
    adminLastSeen,
    syncMessages,
    typingUsers,
    sendTyping,
    markConversationAsRead,
    toggleReaction,
    channelUnreadCount,
    channelMeta,
    loadChannelPosts,
    loadChannelMeta
  } = useChatStore();

  const [activeTab, setActiveTab] = useState<'chat' | 'channel'>(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('tab=channel')) {
      return 'channel';
    }
    return 'chat';
  });

  useEffect(() => {
    loadChannelMeta();
    loadChannelPosts();
  }, []);

  const [inputText, setInputText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [selectedAttachment, setSelectedAttachment] = useState<SelectedAttachment | null>(null);
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

  const handleSelectedFile = (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      alert(t('errFileTooLarge'));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const cleanName = file.name.trim().replace(/[.\s\r\n\t]+$/, '');
    const ext = '.' + (cleanName.split('.').pop() || '').toLowerCase();
    if (FORBIDDEN_EXTENSIONS.has(ext)) {
      alert(t('errForbiddenFileType'));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const isImg = file.type.startsWith('image/');
    let previewUrl: string | undefined;
    if (isImg) {
      previewUrl = URL.createObjectURL(file);
    }

    if (selectedAttachment?.previewUrl) {
      URL.revokeObjectURL(selectedAttachment.previewUrl);
    }

    setSelectedAttachment({
      file,
      isImage: isImg,
      previewUrl
    });
  };

  const handleRemoveAttachment = () => {
    if (selectedAttachment?.previewUrl) {
      URL.revokeObjectURL(selectedAttachment.previewUrl);
    }
    setSelectedAttachment(null);
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
            handleSelectedFile(file);
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

  // Re-sync messages on socket reconnection
  useEffect(() => {
    const handleConnect = () => {
      syncMessages();
    };
    window.addEventListener('socket:connect', handleConnect);
    return () => {
      window.removeEventListener('socket:connect', handleConnect);
    };
  }, [syncMessages]);

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
    if (!inputText.trim() && !selectedAttachment) return;

    const text = inputText.trim();
    const currentAttachment = selectedAttachment;
    const currentReplyId = replyingTo?.id || null;

    setInputText('');
    setReplyingTo(null);
    handleRemoveAttachment();
    sendTyping(false);

    try {
      if (currentAttachment) {
        setIsUploading(true);
        let uploadRes;
        try {
          uploadRes = await api.uploadChatAttachment(currentAttachment.file);
        } catch (uploadErr) {
          console.error('Failed to upload attachment:', uploadErr);
          alert(getErrorMessage(uploadErr, currentAttachment.isImage ? 'imageUploadFailed' : 'fileUploadFailed'));
          return;
        }

        let finalMessage: string;
        if (uploadRes.isImage) {
          finalMessage = `[image:${uploadRes.url}]${text ? '\n' + text : ''}`;
        } else {
          // Prefer pristine UTF-8 filename from browser File object over server response
          const rawFileName = currentAttachment.file.name || uploadRes.filename || 'file';
          const cleanFileName = rawFileName.replace(/[|\[\]\r\n\t]/g, '_').trim() || 'file';
          finalMessage = `[file:${uploadRes.url}|${cleanFileName}|${uploadRes.size}]${text ? '\n' + text : ''}`;
        }

        await sendMessage(finalMessage, undefined, undefined, currentReplyId);
      } else {
        await sendMessage(text, undefined, undefined, currentReplyId);
      }
    } catch (err: any) {
      console.error('Failed to send:', err);
      alert(getErrorMessage(err, 'errSendMessage'));
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
    <div className="relative flex flex-col flex-1 h-full min-h-0 w-full max-w-md md:max-w-xl mx-auto bg-ambient-canvas sm:border-x border-black/[0.06] dark:border-white/[0.08] sm:shadow-floating shadow-none overflow-hidden overflow-x-hidden overscroll-x-none select-none font-sans">
      
      {/* Top Header with dynamic safe-area clearance for iOS status bar & Dynamic Island */}
      <header className="pt-safe pb-2.5 px-4 sm:px-5 flex items-center justify-between shrink-0 bg-transparent border-b border-black/[0.05] dark:border-white/[0.06] z-10">
        {activeTab === 'channel' ? (
          /* Channel Avatar & Info */
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 text-white flex items-center justify-center shadow-xs shrink-0">
              <Megaphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                  {channelMeta?.title || t('channelTitle')}
                </h2>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {channelMeta?.subscribersCount || 1} {t('subscribers')}
              </p>
            </div>
          </div>
        ) : (
          /* Admin Avatar & Live Status */
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold shadow-xs overflow-hidden">
                {adminInfo?.avatarUrl ? (
                  <img src={adminInfo.avatarUrl} alt="Admin" className="w-full h-full object-cover" />
                ) : (
                  <ShieldCheck className="w-5 h-5 text-amber-500" />
                )}
              </div>
              {adminInfo?.showPresence !== false && (
                <div
                  className={`absolute bottom-0 right-0 rtl:right-auto rtl:left-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#12161E] transition-colors ${
                    isAdminOnline ? 'bg-emerald-500' : 'bg-slate-400'
                  }`}
                />
              )}
            </div>

            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                {t('chatWithAdmin')}
              </h2>
              <p className="text-[11px] text-slate-400">
                {isOpponentTyping ? (
                  <span className="text-amber-500 font-medium animate-pulse">{t('typing')}</span>
                ) : adminInfo?.showPresence === false ? (
                  <span>{t('lastSeenRecently')}</span>
                ) : isAdminOnline ? (
                  <span className="text-emerald-500 font-medium">{t('online')}</span>
                ) : (
                  <span>{formatLastSeen(adminLastSeen || adminInfo?.lastSeen, isAdminOnline)}</span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Hamburger Menu Button (Opens Drawer for Theme, Language, Password, Logout) */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 rounded-full bg-white dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 shadow-xs border border-black/5 dark:border-white/[0.09] flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer"
          title={t('menuAndSettings')}
        >
          <Menu className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
      </header>

      {/* Top Segmented Navigation Switcher: Direct Chat vs Announcement Channel */}
      <div className="px-4 py-2 border-b border-black/[0.04] dark:border-white/[0.05] bg-black/[0.015] dark:bg-white/[0.01] shrink-0">
        <div className="grid grid-cols-2 p-1 rounded-2xl bg-black/[0.04] dark:bg-black/40 border border-black/[0.04] dark:border-white/[0.06] select-none">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl text-xs transition-all cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-white dark:bg-white/[0.14] text-slate-900 dark:text-white shadow-xs font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
            <span>{t('directChat')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('channel')}
            className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl text-xs transition-all cursor-pointer relative ${
              activeTab === 'channel'
                ? 'bg-white dark:bg-white/[0.14] text-amber-600 dark:text-amber-400 shadow-xs font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 font-medium'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5 text-amber-500" />
            <span>{t('channelFeed')}</span>
            {channelUnreadCount > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9.5px] font-bold inline-flex items-center justify-center leading-none shadow-xs shrink-0 animate-pulse">
                {channelUnreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'channel' ? (
        <ChannelView
          isAdmin={false}
          hideHeader={true}
          onSwitchToSupportChat={() => setActiveTab('chat')}
        />
      ) : (
        <>
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

      {/* Messages Stream */}
      <div className="relative flex-1 flex flex-col min-h-0 w-full overflow-hidden overflow-x-hidden">
        <main 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none overscroll-y-contain touch-pan-y px-2 sm:px-4 py-2 relative w-full"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 select-none">
              <div className="w-16 h-16 rounded-full bg-white dark:bg-white/[0.07] backdrop-blur-md shadow-xs border border-black/5 dark:border-white/[0.08] flex items-center justify-center mb-3 text-amber-500">
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
                  ? (repliedIsOwn ? t('replyToSelf') : t('chatWithAdmin'))
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
            className="absolute bottom-3.5 right-4 sm:right-6 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/95 dark:bg-[#1C222D]/95 text-slate-700 dark:text-slate-200 border border-black/[0.08] dark:border-white/[0.12] shadow-floating backdrop-blur-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all animate-fade-in cursor-pointer"
            title={t('scrollToBottom')}
          >
            <ChevronDown className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          </button>
        )}
      </div>

      {/* Docked Telegram-style Input Bar with frosted glass spanning into safe-area */}
      <footer className="px-3 sm:px-6 pt-2 pb-safe shrink-0 bg-transparent border-t border-black/[0.05] dark:border-white/[0.06]">
        <form onSubmit={handleSend} className="max-w-xl mx-auto">
          {/* Active Reply Preview Banner */}
          {replyingTo && (() => {
            const replyImgMatch = replyingTo.text.match(/^\[image:(.+?)\](?:\n([\s\S]*))?$/);
            const replyImgUrl = replyImgMatch ? replyImgMatch[1] : null;
            const replyFileMatch = replyingTo.text.match(/^\[file:(.+?)\|(.+?)\|(\d+?)\](?:\n([\s\S]*))?$/);
            const replyFileName = replyFileMatch ? decodeMojibake(replyFileMatch[2]) : '';
            const replyCaption = replyImgMatch
              ? decodeMojibake((replyImgMatch[2] || '').trim())
              : replyFileMatch
              ? decodeMojibake((replyFileMatch[4] || '').trim())
              : decodeMojibake(replyingTo.text);
            const replyPreviewText = replyImgMatch
              ? (replyCaption || `📷 ${t('photo')}`)
              : replyFileMatch
              ? (`📎 ${replyFileName || t('file')}` + (replyCaption ? ` — ${replyCaption}` : ''))
              : replyCaption;
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

          {/* Selected Attachment Preview Chip */}
          {selectedAttachment && (
            <div className="mb-2 p-2 rounded-2xl bg-white/95 dark:bg-[#151922]/95 backdrop-blur-xl border border-black/5 dark:border-white/[0.08] flex items-center justify-between gap-3 shadow-sm animate-message">
              <div className="flex items-center gap-3 overflow-hidden min-w-0">
                {selectedAttachment.isImage && selectedAttachment.previewUrl ? (
                  <img
                    src={selectedAttachment.previewUrl}
                    alt="preview"
                    className="w-12 h-12 rounded-xl object-cover border border-black/5 dark:border-white/10 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20 flex items-center justify-center shrink-0 text-amber-500">
                    <FileText className="w-6 h-6" />
                  </div>
                )}
                <div className="text-xs text-slate-700 dark:text-slate-200 truncate min-w-0">
                  <p className="font-semibold truncate">{selectedAttachment.file.name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {formatFileSize(selectedAttachment.file.size)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRemoveAttachment}
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0 cursor-pointer"
                title={t('removeAttachment')}
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

            {/* Input Field with Auto-Direction, iOS keyboard optimization & Paste Support */}
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
              placeholder={
                selectedAttachment
                  ? selectedAttachment.isImage
                    ? t('imageCaptionPlaceholder')
                    : t('attachmentCaptionPlaceholder')
                  : t('typeMessage')
              }
              className={`flex-1 h-full bg-transparent border-none text-xs text-slate-900 dark:text-slate-100 focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 font-sans px-3 ${
                isInputRtl ? 'text-right' : 'text-left'
              }`}
            />

            {/* Direct Send Icon Button WITHOUT Background */}
            <button
              type="submit"
              disabled={(!inputText.trim() && !selectedAttachment) || isUploading}
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
      )}

      {/* Hidden File Input placed outside the form to suppress iOS WebKit multi-input accessory navigation arrows */}
      <input
        type="file"
        ref={fileInputRef}
        tabIndex={-1}
        aria-hidden="true"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && handleSelectedFile(e.target.files[0])}
      />

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
