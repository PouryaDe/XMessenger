import i18n from '../i18n/index.js';

export function formatLastSeen(
  lastSeenIso?: string | null,
  isOnline: boolean = false
): string {
  if (isOnline) {
    return i18n.t('lastSeenOnline');
  }

  if (!lastSeenIso) {
    return i18n.t('lastSeenOffline');
  }

  try {
    const date = new Date(lastSeenIso);
    if (isNaN(date.getTime())) {
      return i18n.t('lastSeenOffline');
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    const diffMin = Math.floor(diffSec / 60);

    const locale = i18n.language === 'fa' ? 'fa-IR' : 'en-US';
    const timeStr = date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    if (diffSec < 60) {
      return i18n.t('lastSeenJustNow');
    }

    if (diffMin < 60) {
      return i18n.t('lastSeenMinutesAgo', { count: diffMin });
    }

    // Check same day (today)
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return i18n.t('lastSeenToday', { time: timeStr });
    }

    // Check yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return i18n.t('lastSeenYesterday', { time: timeStr });
    }

    // Older date
    const dateStr = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric'
    }).format(date);

    return i18n.t('lastSeenAt', { date: dateStr, time: timeStr });
  } catch {
    return i18n.t('lastSeenOffline');
  }
}
