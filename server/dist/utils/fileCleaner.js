"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAttachmentFromMessageText = deleteAttachmentFromMessageText;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const index_js_1 = require("../config/index.js");
const chatUploadDir = path_1.default.join(index_js_1.config.dataDir, 'uploads', 'chat');
/**
 * Parses decrypted message text and deletes any referenced chat attachment
 * (image or generic file) from the server disk storage to protect user privacy
 * and prevent orphaned files from filling the disk.
 */
function deleteAttachmentFromMessageText(decryptedText) {
    if (!decryptedText || typeof decryptedText !== 'string')
        return;
    try {
        // 1. Check for image attachment: [image:/uploads/chat/<filename>]
        const imgMatch = decryptedText.match(/\[image:\/uploads\/chat\/([^\]\s]+)\]/);
        if (imgMatch && imgMatch[1]) {
            const filename = path_1.default.basename(imgMatch[1]);
            const targetPath = path_1.default.join(chatUploadDir, filename);
            if (fs_1.default.existsSync(targetPath)) {
                try {
                    fs_1.default.unlinkSync(targetPath);
                }
                catch (unlinkErr) {
                    console.error(`[FileCleaner] Failed to unlink image ${filename}:`, unlinkErr);
                }
            }
        }
        // 2. Check for generic file attachment: [file:/uploads/chat/<filename>|...|...]
        const fileMatch = decryptedText.match(/\[file:\/uploads\/chat\/([^|\]\s]+)\|/);
        if (fileMatch && fileMatch[1]) {
            const filename = path_1.default.basename(fileMatch[1]);
            const targetPath = path_1.default.join(chatUploadDir, filename);
            if (fs_1.default.existsSync(targetPath)) {
                try {
                    fs_1.default.unlinkSync(targetPath);
                }
                catch (unlinkErr) {
                    console.error(`[FileCleaner] Failed to unlink file ${filename}:`, unlinkErr);
                }
            }
        }
    }
    catch (err) {
        console.error('[FileCleaner] Error parsing message attachment for deletion:', err);
    }
}
