# Internationalization (i18n) & Typography Engineering Standard

This document establishes the mandatory localization rules for **XMessenger**.

---

## 1. Centralized Dictionary Architecture (Zero Hardcoded Text)

### 1.1. Core Rule
- **NEVER HARDCODE USER-FACING STRINGS IN TSX/TS FILES**:
  - Writing Persian or English text directly in code (e.g. `alert('خطا در ارسال')`, `<span>کپی شد</span>`) is strictly prohibited.
  - Using ternary operators or `if/else` based on language (e.g. `lang === 'fa' ? 'آنلاین' : 'online'`) is **FORBIDDEN**.
- **Every single user-facing text, label, placeholder, error message, toast, modal title, or confirmation dialog MUST reside in `client/src/i18n/index.ts`** under both the `fa` and `en` dictionaries.
- Components must consume strings strictly through `const { t } = useTranslation();` using `t('key')`.
- Non-React utility functions (e.g. `formatLastSeen` in `date.ts`) must import the singleton `i18n` and call `i18n.t('key')`.

### 1.2. Fallback Rule
- **NEVER write manual Persian fallbacks like `t('key') || 'متن پیش‌فرض'`**:
  - If a key exists in the dictionary, `t('key')` will resolve it.
  - Adding an inline `|| 'فارسی'` fallback causes English users to see Persian text if a key is missed or improperly keyed.
  - Always ensure the key exists in both `fa` and `en` definitions in `client/src/i18n/index.ts`.

---

## 2. Dynamic Interpolation & Pluralization

- For strings requiring variable numbers, dates, or usernames, use standard i18next interpolation:
  - Dictionary entry:
    ```ts
    // fa
    lastSeenMinutesAgo: 'آخرین بازدید {{count}} دقیقه پیش',
    lastSeenToday: 'آخرین بازدید امروز ساعت {{time}}',
    // en
    lastSeenMinutesAgo: 'last seen {{count}} minute ago',
    lastSeenMinutesAgo_plural: 'last seen {{count}} minutes ago',
    lastSeenToday: 'last seen today at {{time}}',
    ```
  - Code invocation:
    ```ts
    i18n.t('lastSeenMinutesAgo', { count: diffMin });
    i18n.t('lastSeenToday', { time: timeStr });
    ```

---

## 3. Bidirectionality & Typography

- **Persian (`fa`)**:
  - Primary Font: **Vazirmatn** (`font-vazir`).
  - Document direction: `dir="rtl"`, document language: `lang="fa"`.
  - Digits: Use Persian local digits (`diffMin.toLocaleString('fa-IR')`) where appropriate for natural readability.
- **English (`en`)**:
  - Primary Font: **Inter** (`font-inter`).
  - Document direction: `dir="ltr"`, document language: `lang="en"`.
- **Text Alignment**:
  - For chat messages containing mixed languages, always use `dir="auto"` and `text-start` so Persian text aligns right and English/numbers align left naturally without breaking bubble layout.
- **Icon Flipping**:
  - Directional icons (such as paper airplanes or chevron arrows) must dynamically flip using `rtl:-scale-x-100` or `rtl:rotate-180`.

---

## 4. API & Backend Error Message Localization Standard

- **No Raw English Error Leaks**:
  - Backend errors from Express routes are returned in English or with machine codes (`INVALID_CREDENTIALS`, `WEAK_PASSWORD`, etc.).
  - **NEVER display raw `err.message` directly in the UI** (e.g. `setError(err.message)` or `alert(err.message)`). Doing so leaks English text to Persian users when bad credentials or network issues occur.
- **Universal Error Translator (`client/src/utils/errors.ts`)**:
  - All catch blocks must translate exceptions through `getErrorMessage(err, fallbackKey)`.
  - Machine error codes (e.g. `INVALID_CREDENTIALS`) and common network/backend error patterns are mapped automatically to the active dictionary locale (`fa` or `en`).
  - In Persian mode, if an unmapped exception occurs, `getErrorMessage` returns a friendly translated Persian fallback rather than leaking raw English stack/network strings.
