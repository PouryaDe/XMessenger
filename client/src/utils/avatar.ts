// Deterministic, high-contrast Telegram-style avatar palettes for user initials
const AVATAR_PALETTES = [
  'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-500/30',
  'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 border border-sky-300/80 dark:border-sky-500/30',
  'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-500/30',
  'bg-violet-100 dark:bg-violet-500/20 text-violet-800 dark:text-violet-300 border border-violet-300/80 dark:border-violet-500/30',
  'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300/80 dark:border-rose-500/30',
  'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border border-indigo-300/80 dark:border-indigo-500/30',
  'bg-teal-100 dark:bg-teal-500/20 text-teal-800 dark:text-teal-300 border border-teal-300/80 dark:border-teal-500/30',
  'bg-orange-100 dark:bg-orange-500/20 text-orange-800 dark:text-orange-300 border border-orange-300/80 dark:border-orange-500/30',
];

export function getAvatarPalette(username?: string | null): string {
  if (!username) return AVATAR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash << 5) - hash + username.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[idx];
}
