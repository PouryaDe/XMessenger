export function formatLastSeen(
  lastSeenIso?: string | null,
  isOnline: boolean = false,
  lang: string = 'fa'
): string {
  if (isOnline) {
    return lang === 'fa' ? 'آنلاین' : 'online';
  }

  if (!lastSeenIso) {
    return lang === 'fa' ? 'آفلاین' : 'offline';
  }

  try {
    const date = new Date(lastSeenIso);
    if (isNaN(date.getTime())) {
      return lang === 'fa' ? 'آفلاین' : 'offline';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    const diffMin = Math.floor(diffSec / 60);

    const timeStr = date.toLocaleTimeString(lang === 'fa' ? 'fa-IR' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    if (diffSec < 60) {
      return lang === 'fa' ? 'آخرین بازدید لحظاتی پیش' : 'last seen just now';
    }

    if (diffMin < 60) {
      if (lang === 'fa') {
        const persianDigits = diffMin.toLocaleString('fa-IR');
        return `آخرین بازدید ${persianDigits} دقیقه پیش`;
      }
      return `last seen ${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    }

    // Check same day (today)
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return lang === 'fa' ? `آخرین بازدید امروز ساعت ${timeStr}` : `last seen today at ${timeStr}`;
    }

    // Check yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return lang === 'fa' ? `آخرین بازدید دیروز ساعت ${timeStr}` : `last seen yesterday at ${timeStr}`;
    }

    // Older date
    if (lang === 'fa') {
      const dateStr = new Intl.DateTimeFormat('fa-IR', {
        month: 'short',
        day: 'numeric'
      }).format(date);
      return `آخرین بازدید ${dateStr} ساعت ${timeStr}`;
    } else {
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
      return `last seen ${dateStr} at ${timeStr}`;
    }
  } catch {
    return lang === 'fa' ? 'آفلاین' : 'offline';
  }
}
