// Browser desktop notifications & tab title badge manager

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

export function notifyIncomingMessage(senderName: string, _text?: string) {
  if (typeof window === 'undefined') return;

  // Only notify when tab is backgrounded / hidden
  if (document.hidden) {
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
          tag: 'xmessenger-new-msg'
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
