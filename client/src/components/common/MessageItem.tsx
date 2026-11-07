import React, { useState, useEffect } from 'react';
import { Message } from '../../services/api.js';
import { useTranslation } from 'react-i18next';
import { 
  Trash2, 
  Check, 
  CheckCheck, 
  Flame, 
  Copy, 
  ThumbsUp, 
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
  const [liked, setLiked] = useState(false);

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

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className={`group flex flex-col my-3 animate-message ${isOwn ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-end gap-2.5 max-w-[88%] sm:max-w-md md:max-w-lg ${isOwn ? 'flex-row' : 'flex-row-reverse'}`}>
        
        {/* Message Bubble Card */}
        <div
          className={`relative px-4 py-3 rounded-[22px] shadow-soft border transition-all text-sm leading-relaxed ${
            isOwn
              ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-white/80 dark:border-slate-700/60 rounded-br-xs'
              : 'bg-white/95 dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-white/80 dark:border-slate-800 rounded-bl-xs'
          }`}
        >
          {/* Message content */}
          <p className="whitespace-pre-wrap select-text font-normal">{message.text}</p>

          {/* Footer inside bubble: TTL Badge + Time + Read status */}
          <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-sans justify-end">
            {/* Ephemeral Flame Tag */}
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium"
              title={`زمان انقضا: ${new Date(message.expiresAt).toLocaleTimeString()}`}
            >
              <Flame className="w-2.5 h-2.5 text-amber-500 animate-pulse" />
              <span>{timeLeft}</span>
            </span>

            <span>{formattedTime}</span>

            {isOwn && (
              <span>
                {message.isRead ? (
                  <CheckCheck className="w-3.5 h-3.5 text-primary-500 inline" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-slate-400 inline" />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Circular Avatar Beside Message (as shown in concept image) */}
        <div className="shrink-0 mb-0.5">
          {isOwn ? (
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs uppercase shadow-xs">
              <UserIcon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 to-amber-200 dark:from-amber-600 dark:to-amber-400 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4 text-slate-900 dark:text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Concept Micro-Actions Underneath Bubble */}
      <div className={`flex items-center gap-2 mt-1 px-3 text-slate-400 opacity-60 group-hover:opacity-100 transition-opacity ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <button
          onClick={handleCopy}
          className="p-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          title={copied ? t('copied') : 'کپی متن'}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setLiked(!liked)}
          className={`p-1 transition-colors ${liked ? 'text-primary-500' : 'hover:text-slate-700 dark:hover:text-slate-200'}`}
          title="پسندیدن"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => {
            if (window.confirm(t('confirmDeleteMessage'))) {
              onDelete(message.id);
            }
          }}
          className="p-1 hover:text-red-500 transition-colors"
          title={t('deleteForEveryone')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
