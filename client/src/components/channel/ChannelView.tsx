import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { api, ChannelPost } from '../../services/api.js';
import { ChannelPostCard } from './ChannelPostCard.js';
import { DateSeparator } from '../common/DateSeparator.js';
import { PostViewersModal } from './PostViewersModal.js';
import { ForwardPostModal } from './ForwardPostModal.js';
import { isSameDay } from '../../utils/date.js';
import { formatFileSize } from '../../utils/formatters.js';
import { 
  Megaphone, 
  Paperclip, 
  Loader2, 
  X, 
  ArrowLeft, 
  FileText, 
  CheckCircle2,
  ChevronDown
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

interface Props {
  isAdmin?: boolean;
  onBack?: () => void;
  onSwitchToSupportChat?: () => void;
  hideHeader?: boolean;
}

export const ChannelView: React.FC<Props> = ({ isAdmin = false, onBack, onSwitchToSupportChat, hideHeader = false }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const { 
    channelPosts, 
    channelMeta, 
    isLoadingChannel, 
    loadChannelPosts, 
    loadChannelMeta, 
    removeChannelPost,
    markChannelPostAsViewed
  } = useChatStore();

  const [inputText, setInputText] = useState('');
  const [selectedAttachment, setSelectedAttachment] = useState<SelectedAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeViewerPostId, setActiveViewerPostId] = useState<string | null>(null);
  const [activeForwardPost, setActiveForwardPost] = useState<ChannelPost | null>(null);
  const [forwardToast, setForwardToast] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const viewedPostsRef = useRef<Set<string>>(new Set());

  const isInputRtl = !inputText || /[\u0600-\u06FF]/.test(inputText);

  // Load posts and meta on mount
  useEffect(() => {
    loadChannelMeta();
    loadChannelPosts();
  }, []);

  // Track post views when posts are rendered
  useEffect(() => {
    if (!channelPosts || channelPosts.length === 0) return;

    channelPosts.forEach((post) => {
      if (!post.hasViewed && !viewedPostsRef.current.has(post.id)) {
        viewedPostsRef.current.add(post.id);
        markChannelPostAsViewed(post.id);
      }
    });
  }, [channelPosts]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 160);
  };

  const handleSelectedFile = (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (FORBIDDEN_EXTENSIONS.has(ext)) {
      alert(t('executableBlocked') || 'File type blocked for security reasons.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert(t('fileTooLarge') || 'File size exceeds maximum 200MB limit.');
      return;
    }

    const isImage = file.type.startsWith('image/');
    let previewUrl: string | undefined;
    if (isImage) {
      previewUrl = URL.createObjectURL(file);
    }

    setSelectedAttachment({ file, isImage, previewUrl });
  };

  const handleRemoveAttachment = () => {
    if (selectedAttachment?.previewUrl) {
      URL.revokeObjectURL(selectedAttachment.previewUrl);
    }
    setSelectedAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    const trimmed = inputText.trim();
    if (!trimmed && !selectedAttachment) return;

    setIsUploading(true);
    try {
      if (selectedAttachment) {
        const uploadRes = await api.uploadChatAttachment(selectedAttachment.file);
        const fileUrl = uploadRes.url;
        const fileName = uploadRes.filename || selectedAttachment.file.name;
        const fileSize = uploadRes.size || selectedAttachment.file.size;

        if (selectedAttachment.isImage) {
          const formattedText = `[image:${fileUrl}]${trimmed ? `\n${trimmed}` : ''}`;
          await api.createChannelPost(formattedText);
        } else {
          const formattedText = `[file:${fileUrl}|${fileName}|${fileSize}]${trimmed ? `\n${trimmed}` : ''}`;
          await api.createChannelPost(formattedText);
        }
      } else {
        await api.createChannelPost(trimmed);
      }

      setInputText('');
      handleRemoveAttachment();
      setTimeout(() => scrollToBottom('smooth'), 100);
    } catch (err: any) {
      alert(err.message || 'Failed to publish post');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm(t('confirmDeleteChannelPost') || 'Delete this post for all users?')) {
      return;
    }

    try {
      await api.deleteChannelPost(postId);
      removeChannelPost(postId);
    } catch (err: any) {
      alert(err.message || 'Failed to delete post');
    }
  };

  const handleToggleReaction = async (postId: string, emoji: string) => {
    try {
      await api.reactChannelPost(postId, emoji);
    } catch (err: any) {
      console.warn('Reaction error:', err);
    }
  };

  const title = channelMeta?.title || t('channelTitle');
  const subscribersCount = channelMeta?.subscribersCount || 1;

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden select-none">
      {/* Channel Header */}
      {!hideHeader && (
        <header className="pt-safe pb-3.5 px-4 sm:px-6 min-h-[58px] sm:min-h-[64px] border-b border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between shrink-0 bg-white/40 dark:bg-[#0E1218]/40 backdrop-blur-xl z-20">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5 rtl:scale-x-[-1]" />
              </button>
            )}

            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 text-white flex items-center justify-center shadow-xs shrink-0">
              <Megaphone className="w-5 h-5" />
            </div>

            <div className="min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-1.5">
                <h2 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white leading-tight truncate">
                  {title}
                </h2>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              </div>
              {isAdmin && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5 truncate">
                  {subscribersCount} {t('subscribers')}
                </p>
              )}
            </div>
          </div>

          {onSwitchToSupportChat && (
            <button
              onClick={onSwitchToSupportChat}
              className="px-3 py-1.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.07] hover:bg-black/[0.07] dark:hover:bg-white/[0.12] text-xs font-bold text-slate-700 dark:text-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <span>{t('directChat')}</span>
            </button>
          )}
        </header>
      )}

      {/* Forward Toast Feedback */}
      {forwardToast && (
        <div className="px-4 pt-2.5 pb-1 flex justify-center shrink-0 z-30 animate-fade-in">
          <div className="px-4 py-2 rounded-2xl bg-emerald-500 text-white shadow-floating flex items-center gap-2 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4" />
            <span>{forwardToast}</span>
          </div>
        </div>
      )}

      {/* Posts Stream */}
      <div className="relative flex-1 flex flex-col min-h-0 w-full overflow-hidden">
        {isLoadingChannel && channelPosts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3 select-none">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <span className="text-xs">{t('loadingConversation')}</span>
          </div>
        ) : channelPosts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 select-none">
            <div className="w-16 h-16 rounded-full bg-white dark:bg-white/[0.07] backdrop-blur-md shadow-xs border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center mb-3 text-amber-500">
              <Megaphone className="w-8 h-8" />
            </div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              {title}
            </h4>
            <p className="text-xs max-w-xs mt-1 text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('noChannelPosts')}
            </p>
          </div>
        ) : (
          <main
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto overscroll-contain px-2 sm:px-6 pt-4 pb-safe pb-4 sm:pb-6 space-y-4 max-w-3xl mx-auto w-full select-text"
          >
            {channelPosts.map((post, index) => {
              const prevPost = index > 0 ? channelPosts[index - 1] : null;
              const showDateSeparator = !prevPost || !isSameDay(prevPost.createdAt, post.createdAt);

              return (
                <React.Fragment key={post.id}>
                  {showDateSeparator && <DateSeparator date={post.createdAt} />}
                  <ChannelPostCard
                    post={post}
                    isAdmin={isAdmin}
                    channelTitle={title}
                    currentUser={user}
                    onDelete={handleDeletePost}
                    onReact={handleToggleReaction}
                    onViewersClick={(postId) => setActiveViewerPostId(postId)}
                    onForwardClick={(p) => setActiveForwardPost(p)}
                  />
                </React.Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </main>
        )}

        {/* Scroll to bottom floating button */}
        {showScrollBottom && channelPosts.length > 0 && (
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-4 right-6 z-20 w-10 h-10 rounded-full bg-white/95 dark:bg-[#1C222D]/95 text-slate-700 dark:text-slate-200 border border-black/[0.08] dark:border-white/[0.12] shadow-floating backdrop-blur-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer"
            title={t('scrollToBottom')}
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Footer Area: Admin Composer (Telegram Chat Style) */}
      {isAdmin && (
        <footer className="px-3 sm:px-6 pt-2 pb-safe shrink-0 bg-transparent border-t border-black/[0.05] dark:border-white/[0.06]">
          <form onSubmit={handleSend} className="max-w-3xl mx-auto">
            {/* Attachment Preview Chip */}
            {selectedAttachment && (
              <div className="mb-2 p-2 rounded-2xl bg-white/95 dark:bg-[#151922]/95 backdrop-blur-xl border border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-none animate-message">
                <div className="flex items-center gap-2.5 min-w-0">
                  {selectedAttachment.previewUrl ? (
                    <img
                      src={selectedAttachment.previewUrl}
                      alt=""
                      className="w-10 h-10 rounded-xl object-cover shrink-0 border border-black/10 dark:border-white/10"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {selectedAttachment.file.name}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {formatFileSize(selectedAttachment.file.size)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveAttachment}
                  className="w-7 h-7 rounded-full text-slate-400 hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                  title={t('removeAttachment')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Telegram-style Input Pill */}
            <div
              data-input-pill
              dir={i18n.language === 'fa' ? 'rtl' : 'ltr'}
              className="relative flex items-center h-12 px-1.5 rounded-full bg-white dark:bg-[#151922]/95 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none border border-black/[0.08] dark:border-white/[0.08]"
            >
              {/* Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0 ms-1 cursor-pointer"
                title={t('attachFile')}
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Input Field with Auto-Direction, iOS keyboard optimization */}
              <input
                ref={inputRef}
                type="text"
                name="message"
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="on"
                autoCapitalize="sentences"
                spellCheck={false}
                dir={isInputRtl ? 'rtl' : 'ltr'}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  selectedAttachment
                    ? selectedAttachment.isImage
                      ? t('imageCaptionPlaceholder')
                      : t('attachmentCaptionPlaceholder')
                    : t('writeChannelPost')
                }
                disabled={isUploading}
                className={`flex-1 h-full bg-transparent border-none text-xs text-slate-900 dark:text-slate-100 focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 font-sans px-3 ${
                  isInputRtl ? 'text-right' : 'text-left'
                }`}
              />

              {/* Direct Send Icon Button WITHOUT Background (Matches Chat Send Button Exactly) */}
              <button
                type="submit"
                disabled={(!inputText.trim() && !selectedAttachment) || isUploading}
                className="w-9 h-9 flex items-center justify-center text-[#2AABEE] hover:text-[#1d98d6] transition-all hover:scale-110 active:scale-95 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:scale-100 disabled:cursor-not-allowed shrink-0 mx-1 bg-transparent border-none outline-none cursor-pointer"
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

          {/* Hidden File Input placed outside the form to suppress iOS WebKit multi-input accessory navigation arrows */}
          <input
            type="file"
            ref={fileInputRef}
            tabIndex={-1}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleSelectedFile(file);
            }}
          />
        </footer>
      )}

      {/* Modals */}
      {activeViewerPostId && (
        <PostViewersModal
          postId={activeViewerPostId}
          onClose={() => setActiveViewerPostId(null)}
        />
      )}

      {activeForwardPost && (
        <ForwardPostModal
          post={activeForwardPost}
          onClose={() => setActiveForwardPost(null)}
          onSuccess={() => {
            setForwardToast(t('forwardSuccess'));
            setTimeout(() => setForwardToast(null), 3000);
          }}
        />
      )}
    </div>
  );
};
