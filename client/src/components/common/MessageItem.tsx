import React, { useState, useEffect, useRef } from 'react';
import { Message } from '../../services/api.js';
import { useTranslation } from 'react-i18next';
import { 
  Trash2, 
  Check, 
  CheckCheck, 
  Flame, 
  Copy,
  X,
  Download
} from 'lucide-react';

interface Props {
  message: Message;
  isOwn: boolean;
  onDelete: (id: string) => void;
}

export const MessageItem: React.FC<Props> = ({ message, isOwn, onDelete }) => {
  const { t } = useTranslation();
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuDirection, setMenuDirection] = useState<'up' | 'down'>('up');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Parse potential image attachment [image:url]\ncaption
  const imageMatch = message.text.match(/^\[image:(.+?)\](?:\n([\s\S]*))?$/);
  const imageUrl = imageMatch ? imageMatch[1] : null;
  const caption = imageMatch ? (imageMatch[2] || '').trim() : message.text;

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
      // Menu height + margins is ~105px. If space above is less than 135px, open downwards
      if (rect.top < 135) {
        setMenuDirection('down');
      } else {
        setMenuDirection('up');
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

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div
      dir="ltr"
      className={`w-full flex my-1.5 px-3 animate-message select-none ${isOwn ? 'justify-end' : 'justify-start'} ${showMenu ? 'relative z-40' : 'relative z-0'}`}
    >
      <div className="relative max-w-[85%] sm:max-w-md md:max-w-lg">
        
        {/* Message Bubble Card with Telegram Curved Corner Tail */}
        <div
          ref={bubbleRef}
          onContextMenu={handleContextMenu}
          onClick={handleBubbleClick}
          className={`relative px-4 py-2.5 transition-all cursor-pointer text-sm leading-relaxed shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-none border border-black/[0.04] dark:border-white/[0.05] ${
            isOwn
              ? 'bg-[#EFFDDE] text-slate-900 dark:bg-[#2B5278] dark:text-slate-100 rounded-[18px] rounded-br-[2px]'
              : 'bg-white text-slate-900 dark:bg-[#182533] dark:text-slate-100 rounded-[18px] rounded-bl-[2px]'
          }`}
        >
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

          {/* Message content or caption (natural directionality for Persian/English) */}
          {caption && (
            <p
              dir="auto"
              className="whitespace-pre-wrap select-text font-normal text-start"
            >
              {caption}
            </p>
          )}

          {/* Footer inside bubble: Flame Tag + Time + Read status */}
          <div
            dir="ltr"
            className={`flex items-center gap-1.5 mt-1.5 text-[10px] font-sans justify-end ${
              isOwn ? 'text-emerald-900/60 dark:text-slate-300' : 'text-slate-400 dark:text-slate-400'
            }`}
          >
            {/* Ephemeral Flame Tag - Subtle & Calm (No glaring amber) */}
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium ${
                isOwn
                  ? 'bg-black/[0.04] dark:bg-black/25 text-emerald-950/70 dark:text-slate-300'
                  : 'bg-black/[0.04] dark:bg-white/10 text-slate-500 dark:text-slate-400'
              }`}
              title={`${t('expiresAt')}${new Date(message.expiresAt).toLocaleTimeString()}`}
            >
              <Flame className="w-2.5 h-2.5 text-emerald-700/60 dark:text-slate-400" />
              <span>{timeLeft}</span>
            </span>

            <span>{formattedTime}</span>

            {isOwn && (
              <span>
                {message.isRead ? (
                  <CheckCheck className="w-3.5 h-3.5 text-[#4FAE4E] dark:text-[#64B5F6] inline" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400 inline" />
                )}
              </span>
            )}
          </div>

          {/* Telegram-style Curved Bubble Tail (Outgoing = bottom-right, Incoming = bottom-left) */}
          {isOwn ? (
            <svg
              viewBox="0 0 11 20"
              width="11"
              height="20"
              style={{ transform: 'scaleX(-1)' }}
              className="absolute -bottom-[1px] -right-[9px] pointer-events-none fill-[#EFFDDE] dark:fill-[#2B5278]"
              aria-hidden="true"
            >
              <g transform="translate(9 -14)" fill="inherit" fillRule="evenodd">
                <path
                  d="M-6 16h6v17c-.193-2.84-.876-5.767-2.05-8.782-.904-2.325-2.446-4.485-4.625-6.48A1 1 0 01-6 16z"
                  transform="matrix(1 0 0 -1 0 49)"
                />
              </g>
            </svg>
          ) : (
            <svg
              viewBox="0 0 11 20"
              width="11"
              height="20"
              className="absolute -bottom-[1px] -left-[9px] pointer-events-none fill-white dark:fill-[#182533]"
              aria-hidden="true"
            >
              <g transform="translate(9 -14)" fill="inherit" fillRule="evenodd">
                <path
                  d="M-6 16h6v17c-.193-2.84-.876-5.767-2.05-8.782-.904-2.325-2.446-4.485-4.625-6.48A1 1 0 01-6 16z"
                  transform="matrix(1 0 0 -1 0 49)"
                />
              </g>
            </svg>
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
              <button
                onClick={handleCopy}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
              >
                <Copy className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span>{t('copyText')}</span>
              </button>

              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
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
