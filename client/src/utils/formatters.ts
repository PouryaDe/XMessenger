/**
 * Formats a file size in bytes to a human-readable string (B, KB, MB, GB).
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Automatically detects and repairs Latin-1 / ISO-8859-1 mojibake of UTF-8 text
 * (such as Persian / Arabic filenames mistakenly decoded as Latin-1 by multipart parsers).
 * Handles both pure Latin-1 strings and mixed strings with valid Unicode characters.
 */
export function decodeMojibake(str: string): string {
  if (!str || typeof str !== 'string') return '';
  if (/[\u00C0-\u00FF]/.test(str)) {
    const hasHighChars = str.split('').some((c) => c.charCodeAt(0) > 255);
    if (!hasHighChars) {
      try {
        const bytes = new Uint8Array(str.split('').map((c) => c.charCodeAt(0)));
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        if (!decoded.includes('\uFFFD')) {
          return decoded;
        }
      } catch {}
    } else {
      try {
        return str.replace(/[\u00C0-\u00FF][\u0080-\u00BF]+/g, (match) => {
          const bytes = new Uint8Array(match.split('').map((c) => c.charCodeAt(0)));
          const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
          return decoded.includes('\uFFFD') ? match : decoded;
        });
      } catch {}
    }
  }
  return str;
}

