import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { deleteAttachmentFromMessageText } from '../src/utils/fileCleaner.js';
import { config } from '../src/config/index.js';

// Blacklist of forbidden dangerous extensions that must never be uploaded
const FORBIDDEN_FILE_EXTENSIONS = new Set([
  '.php', '.php3', '.php4', '.php5', '.phtml', '.phar',
  '.exe', '.dll', '.com', '.bat', '.cmd', '.vbs', '.vbe',
  '.js', '.jse', '.wsf', '.wsh', '.msc', '.scr',
  '.sh', '.bash', '.csh', '.ksh', '.zsh',
  '.cgi', '.pl', '.py', '.rb',
  '.asp', '.aspx', '.cer', '.asa', '.jsp', '.jspx',
  '.hta', '.jar', '.war', '.ear',
  '.msi', '.msp', '.reg',
  '.ps1', '.psm1', '.psd1',
  '.so', '.dylib'
]);

const MAX_CHAT_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

function validateUploadExtension(filename: string): boolean {
  const cleanOriginal = filename.trim().replace(/[.\s\r\n\t]+$/, '');
  const ext = path.extname(cleanOriginal).toLowerCase();
  return !FORBIDDEN_FILE_EXTENSIONS.has(ext);
}

function validateUploadSize(sizeInBytes: number): boolean {
  return sizeInBytes <= MAX_CHAT_FILE_SIZE;
}

function sanitizeDownloadPath(rawFilename: string, uploadDir: string): { isSafe: boolean; fullPath: string } {
  const safeFilename = path.basename(String(rawFilename || ''));
  const fullPath = path.join(uploadDir, safeFilename);
  const isSafe = fullPath.startsWith(uploadDir) && !safeFilename.includes('..') && safeFilename.length > 0;
  return { isSafe, fullPath };
}

function sanitizeClientFilename(rawName: string): string {
  return (path.basename(rawName || '').replace(/[|\[\]\r\n\t]/g, '_').trim()) || 'file';
}

function sanitizeDownloadHeaderName(queryName: string, fallback: string): string {
  return typeof queryName === 'string' && queryName.trim().length > 0
    ? path.basename(queryName.trim()).replace(/[\r\n\t"']/g, '_')
    : fallback;
}

describe('File Attachment Upload & Download Security Tests', () => {
  it('blocks dangerous executable and script extensions from uploading', () => {
    const dangerousFiles = [
      'malware.exe',
      'script.bat',
      'payload.sh',
      'backdoor.php',
      'exploit.py',
      'trojan.jar',
      'virus.msi',
      'install.ps1',
      'powershell.psm1',
      'module.psd1',
      'library.dll',
      'attack.vbs',
      'app.cmd',
      'shell.phtml',
      'rootkit.so'
    ];

    for (const file of dangerousFiles) {
      assert.strictEqual(
        validateUploadExtension(file),
        false,
        `Expected ${file} to be blocked by security filter`
      );
    }
  });

  it('detects and neutralizes extension bypass attempts with trailing dots, whitespace, and case mixing', () => {
    const bypassAttempts = [
      'malware.exe.',
      'malware.exe...',
      'payload.php ',
      'trojan.EXE\t',
      'exploit.BAT.\n',
      'script.ps1...  ',
      'backdoor.PHP4. ',
      'shell.phtml... '
    ];

    for (const attempt of bypassAttempts) {
      assert.strictEqual(
        validateUploadExtension(attempt),
        false,
        `Bypass attempt should have been caught: ${JSON.stringify(attempt)}`
      );
    }
  });

  it('allows safe document, media, and archive extensions', () => {
    const safeFiles = [
      'report.pdf',
      'dataset.csv',
      'presentation.pptx',
      'document.docx',
      'archive.zip',
      'backup.tar.gz',
      'audio.mp3',
      'video.mp4',
      'photo.jpg',
      'illustration.png',
      'notes.txt',
      'wireframe.fig',
      'audio.ogg'
    ];

    for (const file of safeFiles) {
      assert.strictEqual(
        validateUploadExtension(file),
        true,
        `Expected ${file} to be permitted`
      );
    }
  });

  it('strictly enforces the 200 MB maximum file size limit', () => {
    const underLimit = 150 * 1024 * 1024; // 150 MB
    const exactLimit = 200 * 1024 * 1024; // 200 MB
    const overLimit = 200 * 1024 * 1024 + 1; // 200 MB + 1 byte
    const hugeFile = 500 * 1024 * 1024; // 500 MB

    assert.strictEqual(validateUploadSize(underLimit), true);
    assert.strictEqual(validateUploadSize(exactLimit), true);
    assert.strictEqual(validateUploadSize(overLimit), false);
    assert.strictEqual(validateUploadSize(hugeFile), false);
  });

  it('prevents path traversal attempts on file download', () => {
    const mockUploadDir = path.resolve('uploads/chat');

    const maliciousAttempts = [
      '../../etc/passwd',
      '..\\..\\windows\\system32\\config\\sam',
      '....//....//config.json',
      '/etc/shadow',
      'C:\\boot.ini',
      '..\\database.sqlite'
    ];

    for (const attempt of maliciousAttempts) {
      const { isSafe, fullPath } = sanitizeDownloadPath(attempt, mockUploadDir);
      assert.strictEqual(isSafe, true);
      assert.strictEqual(path.dirname(fullPath), mockUploadDir);
      assert.ok(!path.basename(fullPath).includes('..'));
    }
  });

  it('sanitizes pipe and delimiter characters from uploaded filenames', () => {
    const dirtyNames = [
      'my|report|2026.pdf',
      'file[1].zip',
      'invoice\r\n2026.docx',
      'test\tfile.csv'
    ];

    for (const name of dirtyNames) {
      const clean = sanitizeClientFilename(name);
      assert.ok(!clean.includes('|'));
      assert.ok(!clean.includes('['));
      assert.ok(!clean.includes(']'));
      assert.ok(!clean.includes('\r'));
      assert.ok(!clean.includes('\n'));
    }
  });

  it('sanitizes download header filenames against HTTP response splitting', () => {
    const maliciousNames = [
      'test.pdf\r\nSet-Cookie: admin=true',
      'report.pdf" ; filename="evil.exe',
      'invoice\nlocation: https://attacker.com'
    ];

    for (const name of maliciousNames) {
      const clean = sanitizeDownloadHeaderName(name, 'fallback.bin');
      assert.ok(!clean.includes('\r'));
      assert.ok(!clean.includes('\n'));
      assert.ok(!clean.includes('"'));
    }
  });

  it('correctly detects and repairs Multer Latin-1 mojibake for Persian filenames', () => {
    function fixMulterFilename(name: string): string {
      if (!name || typeof name !== 'string') return '';
      if (/[\u00C0-\u00FF]/.test(name)) {
        const hasHighChars = [...name].some((c) => c.charCodeAt(0) > 255);
        if (!hasHighChars) {
          try {
            const fixed = Buffer.from(name, 'latin1').toString('utf8');
            if (!fixed.includes('\uFFFD')) {
              return fixed;
            }
          } catch {}
        } else {
          try {
            return name.replace(/[\u00C0-\u00FF][\u0080-\u00BF]+/g, (match) => {
              const fixed = Buffer.from(match, 'latin1').toString('utf8');
              return fixed.includes('\uFFFD') ? match : fixed;
            });
          } catch {}
        }
      }
      return name;
    }

    const testCases = [
      { original: 'امتحان زبان', latinMojibake: Buffer.from('امتحان زبان', 'utf8').toString('latin1') },
      { original: 'گزارش_مالی_۱۴۰۵', latinMojibake: Buffer.from('گزارش_مالی_۱۴۰۵', 'utf8').toString('latin1') },
      { original: 'فایل صوتی فارسی', latinMojibake: Buffer.from('فایل صوتی فارسی', 'utf8').toString('latin1') },
      { original: '_Persian (auto-generated)_ اقتصاد زیر سایه.txt', latinMojibake: Buffer.from('_Persian (auto-generated)_ اقتصاد زیر سایه.txt', 'utf8').toString('latin1') },
      { original: 'فولدر تست / اقتصاد زیر سایه', latinMojibake: 'فولدر تست / ' + Buffer.from('اقتصاد زیر سایه', 'utf8').toString('latin1') }
    ];

    for (const { original, latinMojibake } of testCases) {
      assert.strictEqual(
        fixMulterFilename(latinMojibake),
        original,
        `Expected mojibake to be restored to ${original}`
      );
    }

    // Ensure English and already-clean Persian are untouched
    assert.strictEqual(fixMulterFilename('EnglishReport.pdf'), 'EnglishReport.pdf');
    assert.strictEqual(fixMulterFilename('امتحان_تمیز.pdf'), 'امتحان_تمیز.pdf');
  });

  it('correctly formats conversation previews in sidebar for image and file attachments', () => {
    function formatSidebarSnippet(text: string): string {
      const imgMatch = text.match(/^\[image:(.+?)\](?:\n([\s\S]*))?$/);
      if (imgMatch) {
        const cap = imgMatch[2] ? imgMatch[2].trim() : '';
        return `📷 عکس${cap ? `: ${cap}` : ''}`;
      }
      const fileMatch = text.match(/^\[file:(.+?)\|(.+?)\|(\d+?)\](?:\n([\s\S]*))?$/);
      if (fileMatch) {
        const fName = fileMatch[2];
        const cap = fileMatch[4] ? fileMatch[4].trim() : '';
        return `📎 ${fName || 'فایل'}${cap ? `: ${cap}` : ''}`;
      }
      return text;
    }

    const textMsg = 'سلام خسته نباشید';
    const imgMsgNoCap = '[image:/uploads/chat/abc-123.jpg]';
    const imgMsgWithCap = '[image:/uploads/chat/abc-123.jpg]\nنمودار تحلیل';
    const fileMsgNoCap = '[file:/api/messages/download/uuid.pdf|گزارش پروژه.pdf|204800]';
    const fileMsgWithCap = '[file:/api/messages/download/uuid.pdf|گزارش پروژه.pdf|204800]\nنسخه نهایی';

    assert.strictEqual(formatSidebarSnippet(textMsg), 'سلام خسته نباشید');
    assert.strictEqual(formatSidebarSnippet(imgMsgNoCap), '📷 عکس');
    assert.strictEqual(formatSidebarSnippet(imgMsgWithCap), '📷 عکس: نمودار تحلیل');
    assert.strictEqual(formatSidebarSnippet(fileMsgNoCap), '📎 گزارش پروژه.pdf');
    assert.strictEqual(formatSidebarSnippet(fileMsgWithCap), '📎 گزارش پروژه.pdf: نسخه نهایی');
  });

  it('unlinks attached files from disk when message text is parsed for deletion', () => {
    const chatUploadDir = path.join(config.dataDir, 'uploads', 'chat');
    if (!fs.existsSync(chatUploadDir)) {
      fs.mkdirSync(chatUploadDir, { recursive: true });
    }

    const testImageFilename = `img-test-${Date.now()}.jpg`;
    const testFileFilename = `file-test-${Date.now()}.pdf`;

    const imagePath = path.join(chatUploadDir, testImageFilename);
    const filePath = path.join(chatUploadDir, testFileFilename);

    fs.writeFileSync(imagePath, 'dummy-image-content');
    fs.writeFileSync(filePath, 'dummy-pdf-content');

    assert.ok(fs.existsSync(imagePath));
    assert.ok(fs.existsSync(filePath));

    // Test deleting image attachment
    const imageMessage = `[image:/uploads/chat/${testImageFilename}]\nHere is the photo`;
    deleteAttachmentFromMessageText(imageMessage);
    assert.strictEqual(fs.existsSync(imagePath), false, 'Image file should have been deleted from disk');

    // Test deleting generic file attachment
    const fileMessage = `[file:/uploads/chat/${testFileFilename}|Report.pdf|1024]\nHere is the report`;
    deleteAttachmentFromMessageText(fileMessage);
    assert.strictEqual(fs.existsSync(filePath), false, 'Generic file should have been deleted from disk');
  });
});
