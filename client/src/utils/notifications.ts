// Browser desktop notifications & tab title badge manager
import { useAuthStore } from '../stores/authStore.js';
import { useChatStore } from '../stores/chatStore.js';

let originalTitle = typeof document !== 'undefined' 
  ? ((typeof localStorage !== 'undefined' && localStorage.getItem('xmessenger_app_name')) || document.title || 'XMessenger')
  : 'XMessenger';
let unreadCount = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    clearNotificationCount();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      clearNotificationCount();
    }
  });
}

export function setOriginalDocumentTitle(title: string) {
  if (!title) return;
  originalTitle = title;
  if (unreadCount === 0 && typeof document !== 'undefined') {
    document.title = title;
  }
}

export function clearNotificationCount() {
  unreadCount = 0;
  if (typeof document !== 'undefined' && originalTitle) {
    document.title = originalTitle;
  }
}

/**
 * Checks whether the current user is actively focused on a given conversation or channel screen.
 * If true, any incoming notification (push, desktop banner, audio chimes) is suppressed.
 */
export function isConversationActive(partnerId?: string, isChannel?: boolean): boolean {
  if (typeof document === 'undefined') return false;

  // If document is hidden (background tab or minimized), the user is not actively viewing the screen
  if (document.hidden) return false;

  // If window is not focused (e.g. user is working in another app or tab), user is not actively on screen
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false;

  const authState = useAuthStore.getState();
  const chatState = useChatStore.getState();

  if (!authState.user || authState.user.status !== 'active') return false;

  // 1. Channel post check
  if (isChannel || partnerId === '__channel__') {
    if (authState.user.role === 'admin') {
      return chatState.activeUserId === '__channel__';
    }
    return chatState.activeTab === 'channel';
  }

  // 2. Direct message check
  if (authState.user.role === 'admin') {
    // Admin is active if activeUserId matches the sender's id
    return Boolean(partnerId && chatState.activeUserId === partnerId);
  }

  // Regular user: has only 1 direct support chat with Admin.
  // Active if the user is on the 'chat' tab (not on the 'channel' tab)
  return chatState.activeTab === 'chat';
}

/**
 * Triggers a desktop notification and tab title badge when the user is away from the active chat screen
 */
export function notifyIncomingMessage(senderName: string, _text?: string, partnerId?: string, isChannel?: boolean) {
  if (typeof window === 'undefined') return;

  // Suppress notification if user is already actively viewing this chat
  if (isConversationActive(partnerId, isChannel)) {
    return;
  }

  const isDocInactive = document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus());
  if (isDocInactive) {
    unreadCount += 1;
    document.title = `(${unreadCount}) ${originalTitle || 'XMessenger'}`;

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const isFa = typeof document !== 'undefined' && document.documentElement.lang === 'fa';
        const bodyText = isFa ? 'شما یک پیام جدید دارید' : 'You have a new message';
        const n = new Notification(senderName || (isFa ? 'پیام جدید' : 'New Message'), {
          body: bodyText,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: partnerId ? `msg-${partnerId}` : 'xmessenger-new-msg'
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch (e) {
        // Ignore notification constructor errors in restricted web contexts
      }
    }
  }
}
