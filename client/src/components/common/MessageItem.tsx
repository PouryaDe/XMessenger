import React, { useState, useEffect, useRef } from 'react';
import { Message, User } from '../../services/api.js';
import { useTranslation } from 'react-i18next';
import { FormattedMessageText } from './FormattedMessageText.js';
import { 
  Trash2, 
  Check, 
  CheckCheck, 
  Flame, 
  Copy, 
  X, 
  Download, 
  Reply,
  Clock
} from 'lucide-react';

interface Props {
  message: Message;
  isOwn: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  onDelete: (id: string) => void;
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, emoji?: string) => void;
  currentUser?: User | null;
  repliedMessage?: Message | null;
  repliedSenderName?: string;
  onScrollToMessage?: (id: string) => void;
  isHighlighted?: boolean;
}

const MessageItemComponent: React.FC<Props> = ({
  message,
  isOwn,
  isFirstInGroup = true,
  isLastInGroup = true,
  onDelete,
  onReply,
  onReact,
  currentUser,
  repliedMessage,
  repliedSenderName,
  onScrollToMessage,
  isHighlighted = false
}) => {
  const { t } = useTranslation();
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuDirection, setMenuDirection] = useState<'up' | 'down'>('up');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [showReactionAnim, setShowReactionAnim] = useState(false);
  const lastTapRef = useRef<number>(0);
  const lastTriggerLikeRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const isPending = message.status === 'sending' || message.id.startsWith('temp_');
  // Only play entrance animation if newly created or sending, avoiding 50 simultaneous animations on load
  const shouldAnimate = useRef(
    isPending || (Date.now() - new Date(message.createdAt).getTime() < 3000)
  );

  // Parse potential image attachment [image:url]\ncaption
  const imageMatch = message.text.match(/^\[image:(.+?)\](?:\n([\s\S]*))?$/);
  const imageUrl = imageMatch ? imageMatch[1] : null;
  const caption = imageMatch ? (imageMatch[2] || '').trim() : message.text;

  // Parse replied message preview if present
  const repliedImageMatch = repliedMessage?.text.match(/^\[image:(.+?)\](?:\n([\s\S]*))?$/);
  const repliedImageUrl = repliedImageMatch ? repliedImageMatch[1] : null;
  const repliedTextSnippet = repliedMessage
    ? (repliedImageMatch
        ? ((repliedImageMatch[2] || '').trim() || `📷 ${t('photo')}`)
        : repliedMessage.text)
    : '';

  // Close context menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  // Calculate remaining TTL
  useEffect(() => {
    function updateTimer() {
      const now = new Date().getTime();
      const expiry = new Date(message.expiresAt).getTime();
      const diffSec = Math.max(0, Math.floor((expiry - now) / 1000));

      if (diffSec <= 0) {
        setTimeLeft('0s');
        return;
      }

      if (diffSec < 60) {
        setTimeLeft(`${diffSec}s`);
      } else if (diffSec < 3600) {
        setTimeLeft(`${Math.floor(diffSec / 60)}m`);
      } else if (diffSec < 86400) {
        setTimeLeft(`${Math.floor(diffSec / 3600)}h`);
      } else {
        setTimeLeft(`${Math.floor(diffSec / 86400)}d`);
      }
    }

    updateTimer();
    const interval = setInterval(updateTimer, 5000);
    return () => clearInterval(interval);
  }, [message.expiresAt]);

  const handleReplyClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowMenu(false);
    onReply?.(message);
  };

  const handleCopy = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(caption || message.text);
    setCopied(true);
    setShowMenu(false);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowMenu(false);
    if (window.confirm(t('confirmDeleteMessage'))) {
      onDelete(message.id);
    }
  };

  const calculateMenuDirection = () => {
    if (bubbleRef.current) {
      const rect = bubbleRef.current.getBoundingClientRect();
      const scrollParent = bubbleRef.current.closest('main');
      const parentRect = scrollParent ? scrollParent.getBoundingClientRect() : null;

      // Top boundary of visible scroll container (<main>), fallback to top banner/header offset (~170px)
      const topBoundary = parentRect ? parentRect.top : 170;
      const bottomBoundary = parentRect ? parentRect.bottom : (window.innerHeight - 80);

      // Available space above and below the message bubble
      const spaceAbove = rect.top - topBoundary;
      const spaceBelow = bottomBoundary - rect.bottom;

      // Context menu with 3 actions is ~135px tall with padding and margins.
      if (spaceAbove < 145) {
        setMenuDirection('down');
      } else if (spaceBelow < 145) {
        setMenuDirection('up');
      } else {
        setMenuDirection(spaceAbove >= spaceBelow ? 'up' : 'down');
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    calculateMenuDirection();
    setShowMenu(true);
  };

  const handleBubbleClick = () => {
    // If text was selected or highlighted, don't open/close the context menu
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      return;
    }
    if (!showMenu) {
      calculateMenuDirection();
      setShowMenu(true);
    } else {
      setShowMenu(false);
    }
  };

  // Mobile Touch Swipe-to-Reply Gesture
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!onReply || e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || !onReply) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;

    // Only trigger horizontal swipe if movement is predominantly horizontal
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      // Allow swiping towards the center of the chat
      const clamped = Math.max(-56, Math.min(56, dx * 0.65));
      setSwipeOffset(clamped);
    }
  };

  const triggerLike = () => {
    const now = Date.now();
    // Guard against duplicate triggers on mobile touch (touchend + synthetic dblclick)
    if (now - lastTriggerLikeRef.current < 450) {
      return;
    }
    lastTriggerLikeRef.current = now;
    setShowMenu(false);
    setShowReactionAnim(true);
    setTimeout(() => setShowReactionAnim(false), 700);
    onReact?.(message.id, '👍');
  };

  const handleTouchEnd = () => {
    if (Math.abs(swipeOffset) >= 38 && onReply) {
      onReply(message);
    } else if (Math.abs(swipeOffset) < 10) {
      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        // Double tap on mobile triggers like!
        triggerLike();
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
    setSwipeOffset(0);
    touchStartRef.current = null;
  };

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  const reactions = message.reactions || [];
  const hasLiked = reactions.some((r) => r.userId === currentUser?.id);

  // Telegram corner radii: intermediate messages are uniformly rounded; last message in streak has the tail corner
  const cornerRadiusClass = isOwn
    ? (isLastInGroup
        ? 'rounded-[18px] rounded-br-[4px]'
        : 'rounded-[18px]')
    : (isLastInGroup
        ? 'rounded-[18px] rounded-bl-[4px]'
        : 'rounded-[18px]');

  const verticalSpacing = isFirstInGroup ? 'mt-3.5 sm:mt-4 mb-1' : 'mt-1 mb-1';

  return (
    <div
      id={`msg-${message.id}`}
      dir="ltr"
      className={`w-full flex ${verticalSpacing} px-3 select-none ${shouldAnimate.current ? 'animate-message' : ''} ${isOwn ? 'justify-end' : 'justify-start'} ${showMenu ? 'relative z-40' : 'relative z-0'}`}
    >
      <div
        className="relative max-w-[76%] sm:max-w-[70%] md:max-w-[65%] transition-transform duration-150 ease-out"
        style={swipeOffset ? { transform: `translateX(${swipeOffset}px)` } : undefined}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Swipe-to-Reply visual indicator */}
        {Math.abs(swipeOffset) > 18 && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 ${
              swipeOffset > 0 ? '-left-9' : '-right-9'
            } w-7 h-7 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center transition-opacity`}
          >
            <Reply className="w-3.5 h-3.5" />
          </div>
        )}

        {/* Message Bubble Card with Telegram Styling */}
        <div
          ref={bubbleRef}
          onContextMenu={handleContextMenu}
          onClick={handleBubbleClick}
          onDoubleClick={(e) => {
            e.stopPropagation();
            triggerLike();
          }}
          className={`relative px-3.5 sm:px-4 ${reactions.length > 0 ? 'pb-3.5' : 'pb-2'} pt-2 transition-all cursor-pointer text-sm leading-relaxed shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-none border ${cornerRadiusClass} ${
            isOwn
              ? 'bg-[#EDE8E0] text-slate-900 border-black/[0.06] dark:bg-[#232936] dark:text-white dark:border-white/[0.08]'
              : 'bg-white text-slate-900 border-black/[0.04] dark:bg-[#161B24] dark:text-slate-100 dark:border-white/[0.06]'
          } ${
            isHighlighted
              ? 'ring-2 ring-amber-500 dark:ring-amber-400 scale-[1.02]'
              : ''
          }`}
        >
          {/* Telegram Outgoing Bubble Tail (Bottom-Right) */}
          {isLastInGroup && isOwn && (
            <svg
              viewBox="0 0 11 20"
              className="absolute -bottom-[0.5px] -right-[7px] w-[9px] h-[16px] pointer-events-none fill-[#EDE8E0] dark:fill-[#232936]"
            >
              <path d="M0 0 C0 8 3 16 11 20 L0 20 Z" />
            </svg>
          )}

          {/* Telegram Incoming Bubble Tail (Bottom-Left) */}
          {isLastInGroup && !isOwn && (
            <svg
              viewBox="0 0 11 20"
              className="absolute -bottom-[0.5px] -left-[7px] w-[9px] h-[16px] pointer-events-none fill-white dark:fill-[#161B24] -scale-x-100"
            >
              <path d="M0 0 C0 8 3 16 11 20 L0 20 Z" />
            </svg>
          )}

          {/* Lightweight animated reaction burst on double-tap */}
          {showReactionAnim && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
              <div className="animate-like-burst select-none text-3xl sm:text-4xl filter drop-shadow-[0_2px_10px_rgba(42,171,238,0.5)]">
                👍
              </div>
            </div>
          )}

          {/* Replied Message Quote Block */}
          {message.replyToId && (
            <div
              dir="auto"
              onClick={(e) => {
                e.stopPropagation();
                if (repliedMessage && onScrollToMessage) {
                  onScrollToMessage(repliedMessage.id);
                }
              }}
              className={`mb-2 px-3 py-1.5 rounded-xl border-s-[3px] border-amber-500 dark:border-amber-400 flex items-center gap-2.5 text-xs transition-colors ${
                repliedMessage ? 'cursor-pointer' : 'cursor-default opacity-75'
              } ${
                isOwn
                  ? 'bg-black/[0.05] hover:bg-black/[0.08] dark:bg-white/[0.07] dark:hover:bg-white/[0.11]'
                  : 'bg-stone-100/90 hover:bg-stone-200/70 dark:bg-white/[0.05] dark:hover:bg-white/[0.09]'
              }`}
            >
              {repliedImageUrl && (
                <img
                  src={repliedImageUrl}
                  alt=""
                  className="w-8 h-8 rounded-lg object-cover shrink-0 border border-black/5 dark:border-white/10"
                />
              )}
              <div className="min-w-0 flex-1 overflow-hidden">
                {repliedMessage ? (
                  <>
                    <div className="font-bold text-[11px] text-amber-600 dark:text-amber-400 truncate leading-tight">
                      {repliedSenderName || t('reply')}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5 leading-snug">
                      {repliedTextSnippet}
                    </div>
                  </>
                ) : (
                  <div className="italic text-[11px] text-slate-400 dark:text-slate-500 py-0.5">
                    {t('deletedMessage')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Image attachment if present */}
          {imageUrl && (
            <div className="relative mb-2 -mx-2 -mt-1 overflow-hidden rounded-2xl bg-black/5 dark:bg-black/20">
              <img
                src={imageUrl}
                alt="attachment"
                className="max-h-72 w-full object-cover cursor-pointer hover:opacity-95 transition-opacity rounded-2xl"
                loading="lazy"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxOpen(true);
                }}
              />
            </div>
          )}

          {/* Message content or caption (rich format for code, vless/vmess configs, links) */}
          {caption && (
            <FormattedMessageText text={caption} />
          )}

          {/* Footer inside bubble: Flame Tag + Time + Read status */}
          <div
            dir="ltr"
            className={`flex items-center gap-1.5 mt-1.5 text-[10px] font-sans justify-end ${
              isOwn ? 'text-slate-500 dark:text-slate-300' : 'text-slate-400 dark:text-slate-400'
            }`}
          >
            {/* Ephemeral Flame Tag - Subtle & Calm */}
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium bg-black/[0.04] dark:bg-white/[0.08] text-slate-600 dark:text-slate-200"
              title={`${t('expiresAt')}${new Date(message.expiresAt).toLocaleTimeString()}`}
            >
              <Flame className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400" />
              <span>{timeLeft}</span>
            </span>

            <span>{formattedTime}</span>

            {isOwn && (
              <span>
                {isPending ? (
                  <Clock className="w-3.5 h-3.5 text-amber-500/80 animate-pulse inline" />
                ) : message.status === 'failed' ? (
                  <span className="text-red-500 text-[10px] font-bold inline">!</span>
                ) : message.isRead ? (
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 inline" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400 inline" />
                )}
              </span>
            )}
          </div>

          {/* Telegram Style Reaction Badge (Image 3) */}
          {reactions.length > 0 && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                triggerLike();
              }}
              className={`absolute -bottom-2.5 ${isOwn ? 'end-2.5' : 'start-2.5'} z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-full border shadow-xs cursor-pointer select-none transition-all duration-150 hover:scale-105 active:scale-95 ${
                hasLiked
                  ? 'bg-[#2AABEE]/20 border-[#2AABEE]/40 text-[#2AABEE] dark:text-[#38b9fc]'
                  : 'bg-white/95 dark:bg-[#1E2430]/95 border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200'
              }`}
              title={reactions.map((r) => r.username).join(', ')}
            >
              <span className="text-xs leading-none">👍</span>
              {/* Reactor User Avatar */}
              <div className="flex items-center -space-x-1 rtl:space-x-reverse">
                {reactions.slice(0, 3).map((r, i) => (
                  r.avatarUrl ? (
                    <img
                      key={r.userId || i}
                      src={r.avatarUrl}
                      alt={r.username}
                      className="w-3.5 h-3.5 rounded-full object-cover border border-white dark:border-[#1E2430]"
                    />
                  ) : (
                    <span
                      key={r.userId || i}
                      className="w-3.5 h-3.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[8px] font-bold flex items-center justify-center border border-white dark:border-[#1E2430]"
                    >
                      {(r.username || '?')[0].toUpperCase()}
                    </span>
                  )
                ))}
              </div>
              {reactions.length > 1 && (
                <span className="text-[10px] font-bold leading-none ms-0.5">
                  {reactions.length}
                </span>
              )}
            </div>
          )}

          {/* Feedback badge for Copied */}
          {copied && (
            <div className={`absolute ${menuDirection === 'down' ? '-bottom-7' : '-top-7'} start-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-semibold shadow-xs animate-message z-50`}>
              {t('copied')}
            </div>
          )}

          {/* Floating Context Menu (triggered by Right Click or Tap) */}
          {showMenu && (
            <div
              ref={menuRef}
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
              className={`absolute ${menuDirection === 'down' ? 'top-full mt-2' : 'bottom-full mb-2'} ${isOwn ? 'end-0' : 'start-0'} w-44 bg-white/95 dark:bg-[#151A24]/95 backdrop-blur-xl border border-black/10 dark:border-white/[0.08] rounded-2xl p-1.5 shadow-floating z-50 animate-message font-sans`}
            >
              {onReact && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerLike();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
                >
                  <span className="text-sm">👍</span>
                  <span>{hasLiked ? t('removeLike') : t('like')}</span>
                </button>
              )}

              {onReply && (
                <button
                  onClick={handleReplyClick}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
                >
                  <Reply className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>{t('reply')}</span>
                </button>
              )}

              <button
                onClick={handleCopy}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <Copy className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span>{t('copyText')}</span>
              </button>

              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>{t('deleteForEveryone')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Full-screen Lightbox Modal */}
        {lightboxOpen && imageUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-message select-none"
            onClick={() => setLightboxOpen(false)}
          >
            <div
              className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={imageUrl}
                alt="attachment preview"
                className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-xl"
              />
              <div className="absolute top-3 end-3 flex items-center gap-2">
                <a
                  href={imageUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/85 transition-colors"
                  title="Download"
                >
                  <Download className="w-5 h-5" />
                </a>
                <button
                  onClick={() => setLightboxOpen(false)}
                  className="w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/85 transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const MessageItem = React.memo(MessageItemComponent);
