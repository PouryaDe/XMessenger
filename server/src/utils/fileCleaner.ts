import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';

const chatUploadDir = path.join(config.dataDir, 'uploads', 'chat');

/**
 * Parses decrypted message text and deletes any referenced chat attachment
 * (image or generic file) from the server disk storage to protect user privacy
 * and prevent orphaned files from filling the disk.
 */
export function deleteAttachmentFromMessageText(decryptedText: string): void {
  if (!decryptedText || typeof decryptedText !== 'string') return;

  try {
    // 1. Check for image attachment: [image:/uploads/chat/<filename>]
    const imgMatch = decryptedText.match(/\[image:\/uploads\/chat\/([^\]\s]+)\]/);
    if (imgMatch && imgMatch[1]) {
      const filename = path.basename(imgMatch[1]);
      const targetPath = path.join(chatUploadDir, filename);
      if (fs.existsSync(targetPath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch (unlinkErr) {
          console.error(`[FileCleaner] Failed to unlink image ${filename}:`, unlinkErr);
        }
      }
    }

    // 2. Check for generic file attachment: [file:/uploads/chat/<filename>|...|...]
    const fileMatch = decryptedText.match(/\[file:\/uploads\/chat\/([^|\]\s]+)\|/);
    if (fileMatch && fileMatch[1]) {
      const filename = path.basename(fileMatch[1]);
      const targetPath = path.join(chatUploadDir, filename);
      if (fs.existsSync(targetPath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch (unlinkErr) {
          console.error(`[FileCleaner] Failed to unlink file ${filename}:`, unlinkErr);
        }
      }
    }
  } catch (err) {
    console.error('[FileCleaner] Error parsing message attachment for deletion:', err);
  }
}
