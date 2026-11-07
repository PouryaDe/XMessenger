import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  fa: {
    translation: {
      appName: 'ایکس مسنجر',
      tagline: 'پیام‌رسان امن و خصوصی متمرکز',
      login: 'ورود',
      register: 'ثبت‌نام',
      username: 'نام کاربری',
      password: 'رمز عبور',
      confirmPassword: 'تکرار رمز عبور',
      loginToAccount: 'ورود به حساب کاربری',
      createNewAccount: 'ایجاد حساب کاربری جدید',
      noAccount: 'حساب کاربری ندارید؟ ثبت‌نام کنید',
      haveAccount: 'حساب کاربری دارید؟ وارد شوید',
      adminPanel: 'پنل مدیریت',
      chatWithAdmin: 'گفتگو با مدیریت',
      online: 'آنلاین',
      offline: 'آفلاین',
      typing: 'در حال نوشتن...',
      typeMessage: 'پیام خود را بنویسید...',
      send: 'ارسال',
      ephemeralNotice: 'پیام‌ها رمزنگاری شده و پس از مدت معین به‌طور خودکار دوطرفه حذف می‌شوند.',
      deleteForEveryone: 'حذف دوطرفه برای همه',
      confirmDeleteMessage: 'آیا از حذف این پیام برای هر دو طرف اطمینان دارید؟',
      clearChat: 'پاکسازی کل گفتگو',
      confirmClearChat: 'آیا می‌خواهید تمام تاریخچه این گفتگو برای هر دو طرف کاملاً پاک شود؟',
      clearedSuccess: 'گفتگو با موفقیت پاکسازی شد.',
      cancel: 'انصراف',
      delete: 'حذف',
      settings: 'تنظیمات',
      users: 'کاربران',
      chats: 'گفتگوها',
      security: 'امنیت و حریم خصوصی',
      encryptionInfo: 'تمام داده‌ها با استاندارد AES-256-GCM رمزنگاری می‌شوند و هیچ اثری از پیام‌های حذف‌شده در سرور باقی نمی‌ماند.',
      theme: 'پوسته',
      dark: 'تاریک',
      light: 'روشن',
      language: 'زبان',
      logout: 'خروج از حساب',
      changePassword: 'تغییر رمز عبور',
      newPassword: 'رمز عبور جدید',
      currentPassword: 'رمز عبور فعلی',
      save: 'ذخیره',
      // Admin specific
      registrationControl: 'کنترل ثبت‌نام کاربران',
      allowRegistration: 'امکان ثبت‌نام کاربران جدید',
      allowRegistrationDesc: 'در صورت غیرفعال بودن، ثبت‌نام کاربران جدید مسدود می‌شود.',
      registrationApproval: 'تایید دستی ثبت‌نام توسط ادمین',
      registrationApprovalDesc: 'کاربران پس از ثبت‌نام در وضعیت «در انتظار تایید» می‌مانند تا شما آنها را تایید کنید.',
      defaultTtl: 'زمان پیش‌فرض حذف خودکار پیام‌ها (TTL)',
      ttl15m: '۱۵ دقیقه',
      ttl1h: '۱ ساعت',
      ttl6h: '۶ ساعت',
      ttl24h: '۲۴ ساعت (پیش‌فرض)',
      ttl2d: '۲ روز',
      ttl7d: '۷ روز',
      statusActive: 'فعال / تایید شده',
      statusPending: 'در انتظار تایید',
      statusBanned: 'مسدود شده',
      approve: 'تایید کاربر',
      ban: 'مسدود کردن',
      unban: 'رفع مسدودیت',
      deleteUser: 'حذف کاربر و سوابق',
      userList: 'لیست کاربران',
      noUsersFound: 'کاربری یافت نشد',
      searchUsers: 'جستجوی کاربر...',
      allUsers: 'همه',
      pendingUsers: 'در انتظار تایید',
      activeUsers: 'فعال',
      bannedUsers: 'مسدود',
      // Pending screen
      pendingTitle: 'حساب شما در انتظار تایید است',
      pendingDesc: 'ثبت‌نام شما با موفقیت انجام شد. پس از تایید توسط مدیر سیستم، امکان ارسال و دریافت پیام به طور خودکار فعال خواهد شد.',
      refreshStatus: 'بررسی مجدد وضعیت',
      // Errors
      invalidCredentials: 'نام کاربری یا رمز عبور اشتباه است.',
      userExists: 'این نام کاربری قبلاً انتخاب شده است.',
      regDisabled: 'ثبت‌نام در حال حاضر توسط مدیریت غیرفعال است.',
      passwordsDoNotMatch: 'رمزهای عبور با هم مطابقت ندارند.',
      copied: 'کپی شد'
    }
  },
  en: {
    translation: {
      appName: 'XMessenger',
      tagline: 'Secure Hub-and-Spoke Messenger',
      login: 'Login',
      register: 'Register',
      username: 'Username',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      loginToAccount: 'Sign in to your account',
      createNewAccount: 'Create a new account',
      noAccount: "Don't have an account? Register",
      haveAccount: 'Already have an account? Login',
      adminPanel: 'Admin Panel',
      chatWithAdmin: 'Chat with Admin',
      online: 'Online',
      offline: 'Offline',
      typing: 'typing...',
      typeMessage: 'Type a message...',
      send: 'Send',
      ephemeralNotice: 'Messages are encrypted and will automatically disappear for both parties.',
      deleteForEveryone: 'Delete for everyone',
      confirmDeleteMessage: 'Are you sure you want to delete this message for both sides?',
      clearChat: 'Clear Entire Chat',
      confirmClearChat: 'Are you sure you want to wipe all message history for both parties?',
      clearedSuccess: 'Chat history cleared successfully.',
      cancel: 'Cancel',
      delete: 'Delete',
      settings: 'Settings',
      users: 'Users',
      chats: 'Chats',
      security: 'Security & Privacy',
      encryptionInfo: 'All messages are encrypted with AES-256-GCM. No logs or expired traces are preserved.',
      theme: 'Theme',
      dark: 'Dark',
      light: 'Light',
      language: 'Language',
      logout: 'Logout',
      changePassword: 'Change Password',
      newPassword: 'New Password',
      currentPassword: 'Current Password',
      save: 'Save',
      // Admin specific
      registrationControl: 'User Registration Control',
      allowRegistration: 'Allow New User Registrations',
      allowRegistrationDesc: 'If disabled, no new accounts can be created.',
      registrationApproval: 'Manual Admin Approval Required',
      registrationApprovalDesc: 'Newly registered users will remain in pending state until you approve them.',
      defaultTtl: 'Default Message Auto-Delete (TTL)',
      ttl15m: '15 Minutes',
      ttl1h: '1 Hour',
      ttl6h: '6 Hours',
      ttl24h: '24 Hours (Default)',
      ttl2d: '2 Days',
      ttl7d: '7 Days',
      statusActive: 'Active / Approved',
      statusPending: 'Pending Approval',
      statusBanned: 'Banned',
      approve: 'Approve User',
      ban: 'Ban User',
      unban: 'Unban User',
      deleteUser: 'Delete User & History',
      userList: 'User Directory',
      noUsersFound: 'No users found',
      searchUsers: 'Search user...',
      allUsers: 'All',
      pendingUsers: 'Pending',
      activeUsers: 'Active',
      bannedUsers: 'Banned',
      // Pending screen
      pendingTitle: 'Account Pending Approval',
      pendingDesc: 'Your account was created successfully. Once an administrator approves your account, chat access will automatically activate.',
      refreshStatus: 'Check Status',
      // Errors
      invalidCredentials: 'Invalid username or password.',
      userExists: 'Username is already taken.',
      regDisabled: 'Registration is currently disabled by administrator.',
      passwordsDoNotMatch: 'Passwords do not match.',
      copied: 'Copied'
    }
  }
};

const savedLang = localStorage.getItem('xmessenger_lang') || 'fa';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLang,
    fallbackLng: 'fa',
    interpolation: {
      escapeValue: false
    }
  });

// Automatically update HTML dir and lang attributes
export function setAppLanguage(lang: 'fa' | 'en') {
  i18n.changeLanguage(lang);
  localStorage.setItem('xmessenger_lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
}

// Initial set
document.documentElement.lang = savedLang;
document.documentElement.dir = savedLang === 'fa' ? 'rtl' : 'ltr';

export default i18n;
