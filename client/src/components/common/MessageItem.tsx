import React, { useState, useEffect } from 'react';
import { Message } from '../../services/api.js';
import { useTranslation } from 'react-i18next';
import { Trash2, Check, CheckCheck, Flame } from 'lucide-react';

interface Props {
  message: Message;
  isOwn: boolean;
  onDelete: (id: string) => void;
}

export const MessageItem: React.FC<Props> = ({ message, isOwn, onDelete }) => {
  const { t } = useTranslation();
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [showActions, setShowActions] = useState(false);

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

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div
      className={`group flex items-end gap-1.5 my-1.5 animate-message ${
        isOwn ? 'justify-end' : 'justify-start'
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Delete button (hover on desktop or toggle) */}
      {isOwn && showActions && (
        <button
          onClick={() => {
            if (window.confirm(t('confirmDeleteMessage'))) {
              onDelete(message.id);
            }
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-opacity"
          title={t('deleteForEveryone')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}

      {/* Message bubble */}
      <div
        className={`relative max-w-[85%] sm:max-w-md md:max-w-lg px-4 py-2.5 rounded-2xl shadow-sm text-sm break-words leading-relaxed select-text ${
          isOwn
            ? 'bg-primary-600 text-white rounded-br-xs dark:bg-primary-600'
            : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-100 rounded-bl-xs border border-gray-100 dark:border-slate-700/60'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.text}</p>

        {/* Footer: Time + TTL remaining + Read status */}
        <div
          className={`flex items-center gap-1.5 mt-1 text-[11px] font-sans ${
            isOwn ? 'text-primary-100 justify-end' : 'text-gray-400 dark:text-slate-400 justify-end'
          }`}
        >
          {/* TTL Badge */}
          <span
            className="flex items-center gap-0.5 px-1 py-0.2 rounded bg-black/10 dark:bg-white/10 text-[10px]"
            title={`حذف پس‌زمینه در: ${message.expiresAt}`}
          >
            <Flame className="w-2.5 h-2.5 text-amber-300 animate-pulse" />
            <span>{timeLeft}</span>
          </span>

          <span>{formattedTime}</span>

          {isOwn && (
            <span>
              {message.isRead ? (
                <CheckCheck className="w-3.5 h-3.5 text-emerald-200 inline" />
              ) : (
                <Check className="w-3.5 h-3.5 text-primary-200 inline" />
              )}
            </span>
          )}
        </div>
      </div>

      {/* Delete button if message sent by counterpart and admin wants to wipe */}
      {!isOwn && showActions && (
        <button
          onClick={() => {
            if (window.confirm(t('confirmDeleteMessage'))) {
              onDelete(message.id);
            }
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-opacity"
          title={t('deleteForEveryone')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
