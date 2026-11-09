import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Message, User } from '../../services/api.js';
import { useTranslation } from 'react-i18next';
import { FormattedMessageText } from './FormattedMessageText.js';
import { formatMessageTime } from '../../utils/date.js';
import { calculateMessageMenuPosition } from '../../utils/menuPosition.js';
import { 
  Trash2, 
  Check, 
  CheckCheck, 
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
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    transformOrigin: string;
  } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [showReactionAnim, setShowReactionAnim] = useState(false);
  const [reactionAnimEmoji, setReactionAnimEmoji] = useState<string>('👍');
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

  // Calculate pixel-perfect, collision-free menu position clamped to viewport & active chat container
  const computePosition = (bubbleEl: HTMLElement, menuEl?: HTMLElement | null) => {
    const scrollParent = bubbleEl.closest('main');
    return calculateMessageMenuPosition({
      bubbleRect: bubbleEl.getBoundingClientRect(),
      menuWidth: menuEl?.offsetWidth,
      menuHeight: menuEl?.offsetHeight,
      containerRect: scrollParent ? scrollParent.getBoundingClientRect() : null,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      isOwn
    });
  };

  const openMenu = () => {
    if (!bubbleRef.current) return;
    const pos = computePosition(bubbleRef.current, menuRef.current);
    setMenuPosition(pos);
    setShowMenu(true);
  };

  // Re-adjust exact position synchronously before paint once menu element mounts
  useLayoutEffect(() => {
    if (showMenu && bubbleRef.current && menuRef.current) {
      const pos = computePosition(bubbleRef.current, menuRef.current);
      setMenuPosition((prev) => {
        if (!prev || prev.top !== pos.top || prev.left !== pos.left || prev.transformOrigin !== pos.transformOrigin) {
          return pos;
        }
        return prev;
      });
    }
  }, [showMenu, isOwn]);

  // Close context menu on outside click, window resize, scroll, or Escape key
  useEffect(() => {
    if (!showMenu) return;

    function handleDismiss(event: Event) {
      const target = event.target as Node | null;
      if (
        (menuRef.current && target && menuRef.current.contains(target)) ||
        (bubbleRef.current && target && bubbleRef.current.contains(target))
      ) {
        return;
      }
      setShowMenu(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowMenu(false);
      }
    }

    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    document.addEventListener('pointerdown', handleDismiss);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
      document.removeEventListener('pointerdown', handleDismiss);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showMenu]);

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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu();
  };

  const handleBubbleClick = () => {
    // If text was selected or highlighted, don't open/close the context menu
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      return;
    }
    if (showMenu) {
      setShowMenu(false);
    } else {
      openMenu();
    }
  };

  // Mobile Touch Swipe-to-Reply Gesture: strictly leftward swipe only
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

    // Only allow leftward swipe (dx < 0). Disallow rightward movement completely!
    if (dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      // Clamped strictly between -56px and 0px (only moves to the left)
      const clamped = Math.max(-56, dx * 0.65);
      setSwipeOffset(clamped);
    } else if (dx >= 0 && swipeOffset !== 0) {
      setSwipeOffset(0);
    }
  };

  const triggerReaction = (emoji: string = '👍') => {
    const now = Date.now();
    // Guard against duplicate triggers on mobile touch (touchend + synthetic dblclick)
    if (now - lastTriggerLikeRef.current < 450) {
      return;
    }
    lastTriggerLikeRef.current = now;
    setShowMenu(false);
    setReactionAnimEmoji(emoji === '❤️' ? '❤️' : '👍');
    setShowReactionAnim(true);
    setTimeout(() => setShowReactionAnim(false), 700);
    onReact?.(message.id, emoji);
  };

  const handleTouchEnd = () => {
    // Only trigger reply if swiped to the left by at least 36px
    if (swipeOffset <= -36 && onReply) {
      onReply(message);
    } else if (Math.abs(swipeOffset) < 10) {
      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        // Double tap on mobile triggers reaction!
        triggerReaction(userReactionEmoji === '❤️' ? '❤️' : '👍');
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
    setSwipeOffset(0);
    touchStartRef.current = null;
  };

  const formattedTime = formatMessageTime(message.createdAt);

  const reactions = message.reactions || [];
  const userReaction = reactions.find((r) => r.userId === currentUser?.id);
  const userReactionEmoji = userReaction?.emoji;

  // Group reactions by emoji (e.g. 👍 and ❤️)
  const reactionGroups = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number; users: string[]; hasReacted: boolean }>();
    for (const r of reactions) {
      const emoji = r.emoji || '👍';
      const existing = map.get(emoji) || { emoji, count: 0, users: [], hasReacted: false };
      existing.count += 1;
      if (r.username && !existing.users.includes(r.username)) {
        existing.users.push(r.username);
      }
      if (currentUser?.id && r.userId === currentUser.id) {
        existing.hasReacted = true;
      }
      map.set(emoji, existing);
    }
    // Return sorted: 👍 first, ❤️ second, then other emojis
    return Array.from(map.values()).sort((a, b) => {
      if (a.emoji === '👍' && b.emoji !== '👍') return -1;
      if (b.emoji === '👍' && a.emoji !== '👍') return 1;
      if (a.emoji === '❤️' && b.emoji !== '❤️') return -1;
      if (b.emoji === '❤️' && a.emoji !== '❤️') return 1;
      return b.count - a.count;
    });
  }, [reactions, currentUser?.id]);

  // Telegram corner radii: intermediate messages are uniformly rounded; last message in streak has the tail corner
  const cornerRadiusClass = isOwn
    ? (isLastInGroup
        ? 'rounded-[18px] rounded-br-[4px]'
        : 'rounded-[18px]')
    : (isLastInGroup
        ? 'rounded-[18px] rounded-bl-[4px]'
        : 'rounded-[18px]');

  // Spacing: Consecutive messages from same sender are closely grouped (mb-1); last message in streak has generous breathing room (mb-3.5/mb-4) before speaker switches
  const verticalSpacing = `${isLastInGroup ? 'mb-3.5 sm:mb-4' : 'mb-1'} ${isFirstInGroup ? 'mt-1' : ''}`;

  return (
    <div
      id={`msg-${message.id}`}
      dir="ltr"
      className={`w-full flex ${verticalSpacing} px-3 select-none ${shouldAnimate.current ? 'animate-message' : ''} ${isOwn ? 'justify-end' : 'justify-start'} ${showMenu ? 'relative z-40' : 'relative z-0'}`}
    >
      <div
        className="relative max-w-[76%] sm:max-w-[70%] md:max-w-[65%] transition-transform duration-150 ease-out touch-pan-y"
        style={swipeOffset ? { transform: `translateX(${swipeOffset}px)` } : undefined}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Swipe-to-Reply visual indicator (strictly appears on the right when swiped left) */}
        {swipeOffset < -18 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -right-9 w-7 h-7 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center transition-opacity"
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
            triggerReaction(userReactionEmoji === '❤️' ? '❤️' : '👍');
          }}
          className={`relative px-3.5 sm:px-4 pb-2 pt-2 transition-all cursor-pointer text-sm leading-relaxed shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-none border ${cornerRadiusClass} ${
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
              className="absolute -bottom-[1px] -right-[8px] w-[10px] h-[18px] pointer-events-none overflow-visible filter drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.05)] dark:drop-shadow-none"
            >
              <path
                d="M0 0 C0 8 3 16 11 20 L0 20 Z"
                className="fill-[#EDE8E0] dark:fill-[#232936]"
              />
              <path
                d="M0 0 C0 8 3 16 11 20 L0 20"
                fill="none"
                strokeWidth="1"
                className="stroke-black/[0.06] dark:stroke-white/[0.08]"
              />
            </svg>
          )}

          {/* Telegram Incoming Bubble Tail (Bottom-Left) */}
          {isLastInGroup && !isOwn && (
            <svg
              viewBox="0 0 11 20"
              className="absolute -bottom-[1px] -left-[8px] w-[10px] h-[18px] pointer-events-none overflow-visible filter drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.05)] dark:drop-shadow-none -scale-x-100"
            >
              <path
                d="M0 0 C0 8 3 16 11 20 L0 20 Z"
                className="fill-white dark:fill-[#161B24]"
              />
              <path
                d="M0 0 C0 8 3 16 11 20 L0 20"
                fill="none"
                strokeWidth="1"
                className="stroke-black/[0.04] dark:stroke-white/[0.06]"
              />
            </svg>
          )}

          {/* Lightweight animated reaction burst on reaction / double-tap */}
          {showReactionAnim && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
              <div
                className={`animate-like-burst select-none text-3xl sm:text-4xl filter ${
                  reactionAnimEmoji === '❤️'
                    ? 'drop-shadow-[0_2px_10px_rgba(244,63,94,0.45)]'
                    : 'drop-shadow-[0_2px_10px_rgba(42,171,238,0.45)]'
                }`}
              >
                {reactionAnimEmoji}
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

          {/* Bottom row inside message bubble: Reactions (Telegram-style) + Time & Read status */}
          <div
            className={`flex flex-wrap items-end justify-between gap-x-3 gap-y-1 ${
              reactionGroups.length > 0 ? 'mt-2' : 'mt-1'
            }`}
          >
            {/* Telegram-style Reaction Pills inside message bubble */}
            {reactionGroups.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                {reactionGroups.map((group) => {
                  const isHeart = group.emoji === '❤️';
                  const activeStyle = isHeart
                    ? 'bg-rose-500/15 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/35 dark:border-rose-500/40 shadow-xs'
                    : 'bg-[#2AABEE]/15 dark:bg-[#2AABEE]/20 text-[#0c82bf] dark:text-[#2AABEE] border-[#2AABEE]/35 dark:border-[#2AABEE]/40 shadow-xs';
                  const inactiveStyle =
                    'bg-black/[0.04] dark:bg-white/[0.08] text-slate-700 dark:text-slate-300 border-black/[0.06] dark:border-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.12]';

                  return (
                    <button
                      key={group.emoji}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerReaction(group.emoji);
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1 rounded-full text-xs font-medium transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer border select-none ${
                        group.hasReacted ? activeStyle : inactiveStyle
                      }`}
                      title={group.users.length > 0 ? group.users.join(i18n.language === 'fa' ? '، ' : ', ') : undefined}
                    >
                      <span className="text-[13px] sm:text-sm leading-none drop-shadow-xs">{group.emoji}</span>
                      <span className="text-[11px] sm:text-xs font-bold leading-none tabular-nums">
                        {group.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div />
            )}

            {/* Footer inside bubble: Time + Read status */}
            <div
              dir="ltr"
              className={`flex items-center gap-1.5 text-[10px] font-sans justify-end ms-auto pb-0.5 select-none ${
                isOwn ? 'text-slate-500 dark:text-slate-300' : 'text-slate-400 dark:text-slate-400'
              }`}
            >
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
          </div>

          {/* Feedback badge for Copied */}
          {copied && (
            <div className="absolute -top-7 start-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-semibold shadow-xs animate-message z-50">
              {t('copied')}
            </div>
          )}

          {/* Floating Context Menu rendered via Portal in document.body to avoid clipping across all 4 boundaries */}
          {showMenu && menuPosition && createPortal(
            <div
              ref={menuRef}
              dir={i18n.language === 'fa' ? 'rtl' : 'ltr'}
              onClick={(e) => e.stopPropagation()}
              style={{
                top: `${menuPosition.top}px`,
                left: `${menuPosition.left}px`,
                transformOrigin: menuPosition.transformOrigin
              }}
              className="fixed z-[9999] min-w-[200px] max-w-[260px] bg-white/95 dark:bg-[#151A24]/95 backdrop-blur-xl border border-black/10 dark:border-white/[0.08] rounded-2xl p-1.5 shadow-floating animate-message font-sans select-none"
            >
              {/* Telegram-style Quick Reactions Bar at Top of Context Menu */}
              {onReact && (
                <div className="flex items-center justify-around gap-2 px-1.5 py-1 mb-1 border-b border-black/[0.06] dark:border-white/[0.06]">
                  {/* 👍 Emoji Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerReaction('👍');
                    }}
                    className={`flex-1 h-9 rounded-xl flex items-center justify-center transition-all duration-150 hover:scale-110 active:scale-95 cursor-pointer ${
                      userReactionEmoji === '👍'
                        ? 'bg-[#2AABEE]/20 border border-[#2AABEE]/40 shadow-xs ring-2 ring-[#2AABEE]/30'
                        : 'hover:bg-black/5 dark:hover:bg-white/[0.08] border border-transparent'
                    }`}
                    title={userReactionEmoji === '👍' ? t('removeLike') : t('like')}
                  >
                    <span className="text-xl leading-none select-none drop-shadow-xs">👍</span>
                  </button>

                  {/* ❤️ Emoji Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerReaction('❤️');
                    }}
                    className={`flex-1 h-9 rounded-xl flex items-center justify-center transition-all duration-150 hover:scale-110 active:scale-95 cursor-pointer ${
                      userReactionEmoji === '❤️'
                        ? 'bg-rose-500/20 border border-rose-500/40 shadow-xs ring-2 ring-rose-500/30'
                        : 'hover:bg-black/5 dark:hover:bg-white/[0.08] border border-transparent'
                    }`}
                    title={userReactionEmoji === '❤️' ? t('removeHeart') : t('heart')}
                  >
                    <span className="text-xl leading-none select-none drop-shadow-xs">❤️</span>
                  </button>
                </div>
              )}

              {onReply && (
                <button
                  onClick={handleReplyClick}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Reply className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="flex-1 text-start truncate">{t('reply')}</span>
                </button>
              )}

              <button
                onClick={handleCopy}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Copy className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span className="flex-1 text-start truncate">{t('copyText')}</span>
              </button>

              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-start truncate">{t('deleteForEveryone')}</span>
              </button>
            </div>,
            document.body
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
