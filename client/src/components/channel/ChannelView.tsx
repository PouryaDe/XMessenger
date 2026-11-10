import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { api, ChannelPost } from '../../services/api.js';
import { FormattedMessageText } from '../common/FormattedMessageText.js';
import { DateSeparator } from '../common/DateSeparator.js';
import { PostViewersModal } from './PostViewersModal.js';
import { ForwardPostModal } from './ForwardPostModal.js';
import { formatMessageTime, isSameDay } from '../../utils/date.js';
import { formatFileSize, decodeMojibake } from '../../utils/formatters.js';
import { 
  Megaphone, 
  Eye, 
  Forward, 
  Trash2, 
  Paperclip, 
  Send, 
  Loader2, 
  X, 
  ArrowLeft, 
  FileText, 
  Download,
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
  const { t } = useTranslation();
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
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollBottom(distanceToBottom > 200);
  };

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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    const trimmed = inputText.trim();
    if (!trimmed && !selectedAttachment) return;

    setIsUploading(true);

    try {
      let finalContent = trimmed;

      if (selectedAttachment) {
        const uploadRes = await api.uploadChatAttachment(selectedAttachment.file);
        const fileUrl = uploadRes.url;
        const fileName = uploadRes.filename || selectedAttachment.file.name;
        const fileSize = uploadRes.size || selectedAttachment.file.size;

        if (selectedAttachment.isImage) {
          finalContent = trimmed
            ? `[image:${fileUrl}]\n${trimmed}`
            : `[image:${fileUrl}]`;
        } else {
          finalContent = trimmed
            ? `[file:${fileUrl}|${fileName}|${fileSize}]\n${trimmed}`
            : `[file:${fileUrl}|${fileName}|${fileSize}]`;
        }
      }

      await api.createChannelPost(finalContent);

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
    if (!isAdmin) return;
    if (!window.confirm(t('confirmDeleteChannelPost'))) return;

    try {
      await api.deleteChannelPost(postId);
      removeChannelPost(postId);
    } catch (err: any) {
      alert(err.message || 'Failed to delete post');
    }
  };

  const handleUserForward = async (post: ChannelPost) => {
    try {
      await api.forwardChannelPost(post.id);
      setForwardToast(t('forwardSuccess'));
      setTimeout(() => setForwardToast(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to forward');
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
  const description = channelMeta?.description || t('channelSubtitle');
  const subscribersCount = channelMeta?.subscribersCount || 1;

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden select-none">
      {/* Channel Header */}
      {!hideHeader && (
        <header className="pt-safe pb-2 px-4 sm:px-6 border-b border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between shrink-0 bg-white/40 dark:bg-[#0E1218]/40 backdrop-blur-xl z-20">
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

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                  {title}
                </h2>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {isAdmin && (
                  <>
                    <span>{subscribersCount} {t('subscribers')}</span>
                    <span>•</span>
                  </>
                )}
                <span className="truncate">{description}</span>
              </div>
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
            {onSwitchToSupportChat && (
              <button
                onClick={onSwitchToSupportChat}
                className="ms-2 px-2 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 text-white underline text-[11px] cursor-pointer"
              >
                {t('directChat')}
              </button>
            )}
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
            <div className="w-16 h-16 rounded-full bg-white dark:bg-white/[0.07] backdrop-blur-md shadow-xs border border-black/5 dark:border-white/[0.08] flex items-center justify-center mb-3 text-amber-500">
              <Megaphone className="w-8 h-8" />
            </div>
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
              {title}
            </h4>
            <p className="text-xs max-w-xs mt-1 text-slate-400 leading-relaxed">
              {t('noChannelPosts')}
            </p>
          </div>
        ) : (
          <main
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto overscroll-contain px-2 sm:px-6 py-4 space-y-4 max-w-3xl mx-auto w-full select-text"
          >
            {channelPosts.map((post, index) => {
              const prevPost = index > 0 ? channelPosts[index - 1] : null;
              const showDateSeparator = !prevPost || !isSameDay(prevPost.createdAt, post.createdAt);

              // Parse post image and file attachments
              const imgMatch = post.text.match(/^\[image:(.+?)\](?:\n([\s\S]*))?$/);
              const imageUrl = imgMatch ? imgMatch[1] : null;

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

              // Group reactions by emoji
              const reactionCounts: Record<string, { count: number; hasReacted: boolean }> = {};
              (post.reactions || []).forEach((r) => {
                if (!reactionCounts[r.emoji]) {
                  reactionCounts[r.emoji] = { count: 0, hasReacted: false };
                }
                reactionCounts[r.emoji].count += 1;
                if (r.userId === user?.id) {
                  reactionCounts[r.emoji].hasReacted = true;
                }
              });

              return (
                <React.Fragment key={post.id}>
                  {showDateSeparator && <DateSeparator date={post.createdAt} />}

                  {/* Telegram Channel Post Card */}
                  <article className="w-full bg-white/80 dark:bg-[#121620]/80 backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] rounded-[24px] shadow-sm overflow-hidden transition-all hover:shadow-md animate-fade-in">
                    {/* Post Card Header */}
                    <div className="px-4 pt-3.5 pb-2 flex items-center justify-between border-b border-black/[0.03] dark:border-white/[0.04]">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                          <Megaphone className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                          {title}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-400 select-none">
                        <span>{formattedTime}</span>
                        {isAdmin && (
                          <button
                            onClick={() => handleDeletePost(post.id)}
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
                          className="w-full h-auto max-h-[460px] object-contain cursor-pointer"
                          onClick={() => window.open(imageUrl, '_blank')}
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
                          className="flex items-center gap-3 p-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors border border-black/[0.04] dark:border-white/[0.06]"
                        >
                          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                              {fileName}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
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
                      <div className="px-4 py-3 text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed break-words whitespace-pre-wrap select-text font-sans">
                        <FormattedMessageText text={caption} />
                      </div>
                    )}

                    {/* Post Card Footer Toolbar (Telegram-Style) */}
                    <div className="px-4 py-2.5 bg-black/[0.015] dark:bg-white/[0.02] border-t border-black/[0.03] dark:border-white/[0.04] flex items-center justify-between gap-2 select-none">
                      {/* Left: Reactions */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {['👍', '❤️'].map((emoji) => {
                          const state = reactionCounts[emoji] || { count: 0, hasReacted: false };
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => handleToggleReaction(post.id, emoji)}
                              className={`h-7 px-2.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                state.hasReacted
                                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 shadow-xs scale-102'
                                  : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 hover:bg-black/[0.07] dark:hover:bg-white/[0.10]'
                              }`}
                            >
                              <span>{emoji}</span>
                              {state.count > 0 && (
                                <span className="text-[11px] font-mono">{state.count}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Right: Views Counter & Forward Button */}
                      <div className="flex items-center gap-2">
                        {/* Views Button (Admin Only) */}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setActiveViewerPostId(post.id)}
                            className="h-7 px-2.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] hover:bg-amber-500/15 text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-transparent hover:border-amber-500/30"
                            title={t('postViewers')}
                          >
                            <Eye className="w-3.5 h-3.5 text-amber-500" />
                            <span className="font-mono text-[11px]">{post.viewsCount || 1}</span>
                          </button>
                        )}

                        {/* Forward Button */}
                        <button
                          type="button"
                          onClick={() => {
                            if (isAdmin) {
                              setActiveForwardPost(post);
                            } else {
                              handleUserForward(post);
                            }
                          }}
                          className="h-7 px-3 rounded-full bg-black/[0.04] dark:bg-white/[0.06] hover:bg-amber-500/15 text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-transparent hover:border-amber-500/30"
                          title={t('forward')}
                        >
                          <Forward className="w-3.5 h-3.5 rtl:scale-x-[-1]" />
                          <span>{t('forward')}</span>
                        </button>
                      </div>
                    </div>
                  </article>
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

      {/* Footer Area: Admin Composer */}
      {isAdmin && (
        <footer className="px-3 sm:px-6 pt-2 pb-safe shrink-0 bg-white/40 dark:bg-[#0E1218]/40 backdrop-blur-xl border-t border-black/[0.05] dark:border-white/[0.06]">
          <form onSubmit={handleSend} className="max-w-3xl mx-auto">
            {/* Attachment Preview */}
            {selectedAttachment && (
              <div className="mb-2 p-2 rounded-2xl bg-black/[0.03] dark:bg-white/[0.06] border border-black/5 dark:border-white/10 flex items-center justify-between gap-3 animate-fade-in">
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
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="relative flex items-center pb-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleSelectedFile(file);
                }}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute start-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-amber-500 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                title={t('attachFile')}
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={t('writeChannelPost')}
                disabled={isUploading}
                className="w-full h-11 ps-11 pe-12 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-xs sm:text-sm text-slate-900 dark:text-white border border-black/5 dark:border-white/10 focus:outline-none focus:border-amber-500/50 shadow-inner font-sans"
              />

              <button
                type="submit"
                disabled={isUploading || (!inputText.trim() && !selectedAttachment)}
                className="absolute end-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-600 active:scale-95 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer disabled:opacity-40"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 rtl:scale-x-[-1]" />
                )}
              </button>
            </div>
          </form>
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
