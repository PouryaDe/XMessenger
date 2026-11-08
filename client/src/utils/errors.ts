import i18n from '../i18n/index.js';

const ERROR_CODE_MAP: Record<string, string> = {
  // Machine error codes from backend API
  INVALID_CREDENTIALS: 'invalidCredentials',
  INVALID_INPUT: 'errRequiredFields',
  INVALID_USERNAME: 'errUsernameLength',
  WEAK_PASSWORD: 'errPasswordLength',
  REGISTRATION_DISABLED: 'regDisabled',
  USERNAME_TAKEN: 'userExists',
  INVALID_PASSWORD: 'errCurrentPasswordWrong',
  ACCOUNT_BANNED: 'accessBlocked',
  USER_NOT_FOUND: 'errUserNotFound',
  CANNOT_DELETE: 'errCannotDeleteAdmin',
  NO_FILE: 'errNoFile',
  UPLOAD_FAILED: 'imageUploadFailed',
  BACKUP_FAILED: 'errBackupFailed',
  RESTORE_FAILED: 'errRestoreFailed',
  DOWNLOAD_FAILED: 'errDownloadFailed',
  INVALID_TEXT: 'errEmptyMessage',
  INTERNAL_ERROR: 'errServerError',
  UNAUTHORIZED: 'invalidCredentials',
  FORBIDDEN: 'accessBlocked',
  NOT_FOUND: 'errUserNotFound',
  PASSWORDS_DO_NOT_MATCH: 'passwordsDoNotMatch',
  RECIPIENT_UNAVAILABLE: 'errUserNotFound',
  MISSING_USER_ID: 'errRequiredFields',
  MISSING_RECIPIENT: 'errRequiredFields'
};

const MESSAGE_PATTERN_MAP: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /invalid.*(username|password|credentials)/i, key: 'invalidCredentials' },
  { pattern: /username.*password.*required/i, key: 'errRequiredFields' },
  { pattern: /username.*between.*3.*32/i, key: 'errUsernameLength' },
  { pattern: /password.*at least 6/i, key: 'errPasswordLength' },
  { pattern: /registration.*disabled/i, key: 'regDisabled' },
  { pattern: /username.*already.*(use|taken)/i, key: 'userExists' },
  { pattern: /current password.*incorrect/i, key: 'errCurrentPasswordWrong' },
  { pattern: /account.*(suspended|banned)/i, key: 'accessBlocked' },
  { pattern: /user.*(not found|no longer exists)/i, key: 'errUserNotFound' },
  { pattern: /cannot delete admin/i, key: 'errCannotDeleteAdmin' },
  { pattern: /no.*file.*uploaded/i, key: 'errNoFile' },
  { pattern: /only image files/i, key: 'errOnlyImages' },
  { pattern: /image upload failed|failed to upload image/i, key: 'imageUploadFailed' },
  { pattern: /backup/i, key: 'errBackupFailed' },
  { pattern: /restore/i, key: 'errRestoreFailed' },
  { pattern: /download/i, key: 'errDownloadFailed' },
  { pattern: /cannot be empty|empty message/i, key: 'errEmptyMessage' },
  { pattern: /failed to fetch|network\s*error|load failed/i, key: 'errNetwork' },
  { pattern: /502|503|504|bad gateway|gateway timeout/i, key: 'errServerError' },
  { pattern: /passwords do not match/i, key: 'passwordsDoNotMatch' },
  { pattern: /login failed/i, key: 'errLoginFailed' },
  { pattern: /registration failed/i, key: 'errRegisterFailed' },
  { pattern: /failed to clear chat|error clearing chat/i, key: 'errClearChat' },
  { pattern: /failed to delete user|error deleting user/i, key: 'errDeleteUser' },
  { pattern: /error approving user/i, key: 'errApproveUser' },
  { pattern: /error changing ban status/i, key: 'errBanUser' }
];

/**
 * Universal error message translator.
 * Safely converts error objects, API error codes, or raw English exceptions into
 * the user's active language dictionary text (Persian or English).
 */
export function getErrorMessage(err: any, fallbackKey: string = 'errGeneral'): string {
  if (!err) return i18n.t(fallbackKey);

  // 1. Direct machine code lookup on error object
  const code = err.code || err.error;
  if (code && typeof code === 'string' && ERROR_CODE_MAP[code]) {
    return i18n.t(ERROR_CODE_MAP[code]);
  }

  // 2. Extract string message
  const msg = typeof err === 'string' ? err : (err.message || String(err));
  if (!msg) return i18n.t(fallbackKey);

  // 3. Check if msg itself is a known error code
  if (ERROR_CODE_MAP[msg]) {
    return i18n.t(ERROR_CODE_MAP[msg]);
  }

  // 4. Regex pattern matching against known backend English phrases
  for (const { pattern, key } of MESSAGE_PATTERN_MAP) {
    if (pattern.test(msg)) {
      return i18n.t(key);
    }
  }

  // 5. If the message already contains Persian characters, display it directly
  if (/[\u0600-\u06FF]/.test(msg)) {
    return msg;
  }

  // 6. In Persian mode, prevent raw English leak by returning localized fallback
  if (i18n.language === 'fa') {
    return i18n.t(fallbackKey) || 'خطایی رخ داد. لطفاً مجدداً تلاش کنید.';
  }

  return msg;
}
