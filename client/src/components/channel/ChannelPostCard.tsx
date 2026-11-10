import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChannelPost, User } from '../../services/api.js';
import { useTranslation } from 'react-i18next';
import { FormattedMessageText } from '../common/FormattedMessageText.js';
import { formatMessageTime } from '../../utils/date.js';
import { calculateMessageMenuPosition } from '../../utils/menuPosition.js';
import { formatFileSize, decodeMojibake } from '../../utils/formatters.js';
import { 
  Megaphone, 
  Eye, 
  Copy, 
  Trash2, 
  Download, 
  Forward, 
  FileText, 
  X
} from 'lucide-react';

interface Props {
  post: ChannelPost;
  isAdmin: boolean;
  channelTitle: string;
  currentUser: User | null;
  onDelete: (postId: string) => void;
  onReact: (postId: string, emoji: string) => void;
  onViewersClick?: (postId: string) => void;
  onForwardClick?: (post: ChannelPost) => void;
}

export const ChannelPostCard: React.FC<Props> = ({
  post,
  isAdmin,
  channelTitle,
  currentUser,
  onDelete,
  onReact,
  onViewersClick,
  onForwardClick
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
  const [showReactionAnim, setShowReactionAnim] = useState(false);
  const [reactionAnimEmoji, setReactionAnimEmoji] = useState<string>('👍');

  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<number>(0);
  const lastTriggerLikeRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Parse image attachment [image:url]\ncaption
  const imgMatch = post.text.match(/^\[image:(.+?)\](?:\n([\s\S]*))?$/);
  const imageUrl = imgMatch ? imgMatch[1] : null;

  // Parse file attachment format: [file: url | filename | size]
  const fileMatch = post.text.match(/^\[file:(.+?)\|(.+?)\|(\d+?)\](?:\n([\s\S]*))?$/);
  const fileUrl = fileMatch ? fileMatch[1] : null;
  const fileName = fileMatch ? decodeMojibake(fileMatch[2]) : '';
  const fileSize = fileMatch ? parseInt(fileMatch[3], 10) : 0;

  const rawCaption = imgMatch
    ? (imgMatch[2] || '').trim()
    : fileMatch
    ? (fileMatch[4] || '').trim()
    : post.text;
  const caption = decodeMojibake(rawCaption);

  const formattedTime = formatMessageTime(post.createdAt);

  const reactions = post.reactions || [];
  const userReaction = reactions.find((r) => r.userId === currentUser?.id);
  const userReactionEmoji = userReaction?.emoji;

  // Group reactions by emoji
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
    return Array.from(map.values()).sort((a, b) => {
      if (a.emoji === '👍' && b.emoji !== '👍') return -1;
      if (b.emoji === '👍' && a.emoji !== '👍') return 1;
      if (a.emoji === '❤️' && b.emoji !== '❤️') return -1;
      if (b.emoji === '❤️' && a.emoji !== '❤️') return 1;
      return b.count - a.count;
    });
  }, [reactions, currentUser?.id]);

  const computePosition = (cardEl: HTMLElement, menuEl?: HTMLElement | null) => {
    const scrollParent = cardEl.closest('main');
    return calculateMessageMenuPosition({
      bubbleRect: cardEl.getBoundingClientRect(),
      menuWidth: menuEl?.offsetWidth,
      menuHeight: menuEl?.offsetHeight,
      containerRect: scrollParent ? scrollParent.getBoundingClientRect() : null,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      isOwn: false
    });
  };

  const openMenu = () => {
    if (!cardRef.current) return;
    const pos = computePosition(cardRef.current, menuRef.current);
    setMenuPosition(pos);
    setShowMenu(true);
  };

  useLayoutEffect(() => {
    if (showMenu && cardRef.current && menuRef.current) {
      const pos = computePosition(cardRef.current, menuRef.current);
      setMenuPosition((prev) => {
        if (!prev || prev.top !== pos.top || prev.left !== pos.left || prev.transformOrigin !== pos.transformOrigin) {
          return pos;
        }
        return prev;
      });
    }
  }, [showMenu]);

  // Close context menu on outside click, window resize, scroll, or Escape key
  useEffect(() => {
    if (!showMenu) return;

    function handleDismiss(event: Event) {
      const target = event.target as Node | null;
      if (
        (menuRef.current && target && menuRef.current.contains(target)) ||
        (cardRef.current && target && cardRef.current.contains(target))
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

  const triggerReaction = (emoji: string = '👍') => {
    const now = Date.now();
    if (now - lastTriggerLikeRef.current < 450) return;
    lastTriggerLikeRef.current = now;
    setShowMenu(false);
    setReactionAnimEmoji(emoji === '❤️' ? '❤️' : '👍');
    setShowReactionAnim(true);
    setTimeout(() => setShowReactionAnim(false), 700);
    onReact(post.id, emoji);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu();
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // If text was selected by user, don't trigger menu
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) return;

    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, [data-prevent-menu="true"]')) return;

    // On touch screens where context menu may not fire naturally
    if ('ontouchstart' in window && window.innerWidth < 768) {
      openMenu();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  const handleTouchEnd = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      // Double tap on mobile triggers reaction!
      triggerReaction(userReactionEmoji === '❤️' ? '❤️' : '👍');
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
    touchStartRef.current = null;
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    const textToCopy = caption || fileName || '';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onDelete(post.id);
  };

  const handleForward = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onForwardClick?.(post);
  };

  return (
    <div className={`w-full ${showMenu ? 'relative z-40' : 'relative z-0'}`}>
      {/* Telegram Channel Post Card */}
      <article
        ref={cardRef}
        onContextMenu={handleContextMenu}
        onClick={handleCardClick}
        onDoubleClick={(e) => {
          e.stopPropagation();
          triggerReaction(userReactionEmoji === '❤️' ? '❤️' : '👍');
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="w-full bg-white/90 dark:bg-[#121620]/80 backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] rounded-[24px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-sm overflow-hidden transition-all hover:shadow-md animate-fade-in cursor-pointer relative"
      >
        {/* Animated reaction burst on double-tap / reaction */}
        {showReactionAnim && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div
              className={`animate-like-burst select-none text-4xl filter ${
                reactionAnimEmoji === '❤️'
                  ? 'drop-shadow-[0_2px_10px_rgba(244,63,94,0.45)]'
                  : 'drop-shadow-[0_2px_10px_rgba(42,171,238,0.45)]'
              }`}
            >
              {reactionAnimEmoji}
            </div>
          </div>
        )}

        {/* Post Card Header */}
        <div className="px-4 pt-3.5 pb-2 flex items-center justify-between border-b border-black/[0.04] dark:border-white/[0.04] select-none">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Megaphone className="w-3.5 h-3.5" />
            </div>
            <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
              {channelTitle}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            {isAdmin && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(post.id);
                }}
                className="w-6 h-6 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-colors cursor-pointer"
                title={t('delete')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Image Attachment */}
        {imageUrl && (
          <div className="relative w-full bg-black/5 dark:bg-black/20 overflow-hidden max-h-[460px] flex items-center justify-center">
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              className="w-full h-auto max-h-[460px] object-contain hover:opacity-95 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(true);
              }}
            />
          </div>
        )}

        {/* File Attachment */}
        {fileUrl && (
          <div className="p-3">
            <a
              href={`/api/messages/download/${encodeURIComponent(fileUrl.replace('/uploads/chat/', ''))}?name=${encodeURIComponent(fileName)}`}
              target="_blank"
              rel="noopener noreferrer"
              download={fileName}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-3 p-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors border border-black/[0.05] dark:border-white/[0.06]"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                  {fileName}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {formatFileSize(fileSize)}
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                <Download className="w-4 h-4" />
              </div>
            </a>
          </div>
        )}

        {/* Caption / Text */}
        {caption && (
          <div className="px-4 py-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 leading-relaxed break-words whitespace-pre-wrap select-text font-sans">
            <FormattedMessageText text={caption} />
          </div>
        )}

        {/* Bottom Row inside Post Card: Reactions (Pills) + Views & Time (Telegram-style) */}
        <div className="px-4 pb-2.5 pt-1 flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5 select-none">
          {/* Reaction Pills (render only when reactions exist) */}
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
                    className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer border select-none ${
                      group.hasReacted ? activeStyle : inactiveStyle
                    }`}
                    title={group.users.length > 0 ? group.users.join(i18n.language === 'fa' ? '، ' : ', ') : undefined}
                  >
                    <span className="text-[13px] leading-none drop-shadow-xs">{group.emoji}</span>
                    {group.count > 0 && (
                      <span className="ms-1 font-mono text-[11px]">{group.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div />
          )}

          {/* Footer inside card: Views + Time */}
          <div
            dir="ltr"
            className="flex items-center gap-2 text-[11px] font-sans justify-end ms-auto pb-0.5 select-none text-slate-500 dark:text-slate-400"
          >
            {/* View count inside message card */}
            {isAdmin ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewersClick?.(post.id);
                }}
                className="flex items-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer group/eye"
                title={t('postViewers')}
              >
                <Eye className="w-3.5 h-3.5 text-amber-500 group-hover/eye:scale-110 transition-transform" />
                <span className="font-mono text-[10.5px]">{post.viewsCount || 1}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1 select-none">
                <Eye className="w-3.5 h-3.5 text-amber-500" />
                <span className="font-mono text-[10.5px]">{post.viewsCount || 1}</span>
              </div>
            )}

            <span>{formattedTime}</span>
          </div>
        </div>

        {/* Feedback badge for Copied */}
        {copied && (
          <div className="absolute top-2 start-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-semibold shadow-xs animate-message z-50">
            {t('copied')}
          </div>
        )}
      </article>

      {/* Telegram-style Context Menu via Portal */}
      {showMenu && menuPosition && createPortal(
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-xs animate-fade-in"
            onClick={() => setShowMenu(false)}
            onContextMenu={(e) => {
              e.preventDefault();
              setShowMenu(false);
            }}
          />
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              transformOrigin: menuPosition.transformOrigin
            }}
            className="fixed z-[9999] min-w-[200px] max-w-[260px] bg-white/95 dark:bg-[#151A24]/95 backdrop-blur-xl border border-black/10 dark:border-white/[0.08] rounded-2xl p-1.5 shadow-floating animate-message font-sans select-none"
          >
            {/* Telegram-style Quick Reactions Bar at Top of Context Menu */}
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

            {/* Copy Text Option */}
            <button
              onClick={handleCopy}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Copy className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
              <span className="flex-1 text-start truncate">{t('copyText')}</span>
            </button>

            {/* Admin Forward Option */}
            {isAdmin && onForwardClick && (
              <button
                onClick={handleForward}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Forward className="w-4 h-4 text-amber-500 shrink-0 rtl:scale-x-[-1]" />
                <span className="flex-1 text-start truncate">{t('forward')}</span>
              </button>
            )}

            {/* Admin Viewers Option */}
            {isAdmin && onViewersClick && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onViewersClick(post.id);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Eye className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="flex-1 text-start truncate">{t('postViewers')}</span>
              </button>
            )}

            {/* Admin Delete Option */}
            {isAdmin && (
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-start truncate">{t('delete')}</span>
              </button>
            )}
          </div>
        </>,
        document.body
      )}

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
  );
};
