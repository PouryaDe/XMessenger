import React, { useState, useEffect, useRef } from 'react';
import { Message } from '../../services/api.js';
import { useTranslation } from 'react-i18next';
import { 
  Trash2, 
  Check, 
  CheckCheck, 
  Flame, 
  Copy, 
  User as UserIcon,
  Sparkles
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
  const menuRef = useRef<HTMLDivElement>(null);

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
    navigator.clipboard.writeText(message.text);
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
    setShowMenu(true);
  };

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div
      dir="ltr"
      className={`w-full flex my-2 px-1 animate-message select-none ${isOwn ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`relative flex items-end gap-2.5 max-w-[85%] sm:max-w-md md:max-w-lg ${isOwn ? 'flex-row' : 'flex-row-reverse'}`}>
        
        {/* Message Bubble Card */}
        <div
          onContextMenu={handleContextMenu}
          onClick={() => setShowMenu((prev) => !prev)}
          className={`relative px-4 py-2.5 rounded-[22px] transition-all cursor-pointer text-sm leading-relaxed border ${
            isOwn
              ? 'bg-slate-900 text-white dark:bg-gradient-to-tr dark:from-amber-600/35 dark:to-amber-500/25 dark:text-amber-50 border-black/10 dark:border-amber-500/40 rounded-br-xs shadow-soft'
              : 'bg-white text-slate-900 dark:bg-slate-800/90 dark:text-slate-100 border-black/5 dark:border-white/10 rounded-bl-xs shadow-soft'
          }`}
        >
          {/* Message content (natural directionality for Persian/English) */}
          <p
            dir="auto"
            className="whitespace-pre-wrap select-text font-normal text-start"
          >
            {message.text}
          </p>

          {/* Footer inside bubble: Flame Tag + Time + Read status */}
          <div
            dir="ltr"
            className={`flex items-center gap-1.5 mt-1.5 text-[10px] font-sans justify-end ${
              isOwn ? 'text-slate-300 dark:text-amber-200/80' : 'text-slate-400 dark:text-slate-400'
            }`}
          >
            {/* Ephemeral Flame Tag */}
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium ${
                isOwn
                  ? 'bg-white/15 dark:bg-amber-400/20 text-amber-300 dark:text-amber-200'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
              title={`${t('expiresAt')}${new Date(message.expiresAt).toLocaleTimeString()}`}
            >
              <Flame className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
              <span>{timeLeft}</span>
            </span>

            <span>{formattedTime}</span>

            {isOwn && (
              <span>
                {message.isRead ? (
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400 inline" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-slate-300 dark:text-amber-200/70 inline" />
                )}
              </span>
            )}
          </div>

          {/* Feedback badge for Copied */}
          {copied && (
            <div className="absolute -top-7 start-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-semibold shadow-floating animate-message">
              {t('copied') || 'کپی شد'}
            </div>
          )}

          {/* Floating Context Menu (triggered by Right Click or Tap) */}
          {showMenu && (
            <div
              ref={menuRef}
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
              className={`absolute bottom-full mb-2 ${isOwn ? 'end-0' : 'start-0'} w-44 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-1.5 shadow-floating z-50 animate-message font-sans`}
            >
              <button
                onClick={handleCopy}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
              >
                <Copy className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span>{t('copyText') || 'کپی متن'}</span>
              </button>

              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>{t('deleteForEveryone') || 'حذف دوطرفه'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Circular Avatar Beside Message */}
        <div className="shrink-0 mb-0.5 select-none">
          {isOwn ? (
            <div className="w-8 h-8 rounded-full bg-slate-800 dark:bg-amber-500/25 text-amber-400 border border-black/10 dark:border-amber-400/40 flex items-center justify-center font-bold text-xs uppercase shadow-xs">
              <UserIcon className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-black/5 dark:border-white/10 flex items-center justify-center font-bold text-xs uppercase font-mono shadow-xs">
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
