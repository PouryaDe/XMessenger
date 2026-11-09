import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';

// Blacklist of forbidden dangerous extensions that must never be uploaded
const FORBIDDEN_FILE_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.vbs', '.js', '.jse', '.wsf',
  '.msi', '.msp', '.com', '.scr', '.pif', '.hta', '.jar', '.php', '.phtml',
  '.php3', '.php4', '.php5', '.phps', '.cgi', '.pl', '.py', '.rb', '.asp',
  '.aspx', '.jsp', '.jspx', '.war', '.dll', '.so', '.dylib', '.ps1', '.psm1'
]);

const MAX_CHAT_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

function validateUploadExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return !FORBIDDEN_FILE_EXTENSIONS.has(ext);
}

function validateUploadSize(sizeInBytes: number): boolean {
  return sizeInBytes <= MAX_CHAT_FILE_SIZE;
}

function sanitizeDownloadPath(rawFilename: string, uploadDir: string): { isSafe: boolean; fullPath: string } {
  const safeFilename = path.basename(String(rawFilename || ''));
  const fullPath = path.join(uploadDir, safeFilename);
  // Verify resolved path stays strictly within uploadDir
  const isSafe = fullPath.startsWith(uploadDir) && !safeFilename.includes('..') && safeFilename.length > 0;
  return { isSafe, fullPath };
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
      // Ensure path.basename neutralized the traversal and file points strictly inside mockUploadDir
      assert.strictEqual(isSafe, true);
      assert.strictEqual(path.dirname(fullPath), mockUploadDir);
      assert.ok(!path.basename(fullPath).includes('..'));
    }
  });
});
