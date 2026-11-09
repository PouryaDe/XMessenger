# AGENTS.md — Agent & Developer Reference for XMessenger

This file serves as the high-level roadmap and engineering guide for AI agents working within this codebase. For exhaustive rule sets, consult the [`.agents/rules/`](file:///c:/Users/Lion/Desktop/Projects/XMessenger/.agents/rules/) directory.

---

## 1. Project Overview & Architecture

**XMessenger** is a privacy-first, 1-way hub-and-spoke real-time messenger built with Node.js/Express, SQLite WAL (with AES-256-GCM encryption at rest), Socket.IO, and React (Tailwind CSS, Vite, PWA).

### Hub-and-Spoke Model
- **Admin**: Communicates with all registered users, manages approvals, bans, TTL retention, and system-wide settings.
- **Regular Users**: Can *only* communicate with the admin. Peer-to-peer user discovery or messaging is strictly prohibited by schema, middleware, and socket events.

---

## 2. Core Features & Capabilities

- **Telegram-style Design & UX**:
  - Curved tails on bubble edge (`client/src/components/common/MessageItem.tsx`).
  - Telegram message reactions (`👍` and `❤️`) nested inside bubble footer row with animated bursts and context menu quick-reactions bar.
  - Zero avatar noise in chat stream (avatars displayed solely in header and chat lists).
  - Responsive Admin Settings modal with 2x2 grid tab bar on mobile screens.
- **Maintenance Mode (`system_enabled`)**:
  - Admin toggle in settings.
  - HTTP 503 (`SYSTEM_DISABLED`) barrier for regular users on all messaging endpoints.
  - Live socket guard rejecting `message:send` and `message:react` during maintenance while keeping connection alive for real-time `system:status_changed` reactivation.
  - Dedicated client `SystemDisabledScreen.tsx` with refresh and logout options.
- **Account Ban Security Enforcement**:
  - Live DB check on REST (`authenticate` middleware) and Socket (`message:send`, `message:react`, `message:delete`).
  - Active sockets are immediately disconnected upon ban.
  - Real-time client transition to ban banner and locked input in Admin dashboard.
- **Branding & Presets**:
  - Dynamic PWA icon presets (`preset-x.svg`, `preset-f.svg`, `preset-g.svg`, `preset-r.svg`, `preset-m.svg`, `preset-s.svg`) with specs (PNG/SVG/WebP, min 192x192).
  - Admin avatar presets (`admin-shield.svg`, `admin-support.svg`, `admin-crown.svg`, `admin-star.svg`, `admin-minimal.svg`).
- **Database Backup & Integrity**:
  - SQLite non-blocking online backup via `db.backup()`.
  - Strict validation (`quick_check`, table schemas, admin existence) on restore.
  - Verified AES-256-GCM encryption at rest.

---

## 3. Engineering Rules & Invariants

1. **i18n Standard**: All user-facing text must reside in [`client/src/i18n/index.ts`](file:///c:/Users/Lion/Desktop/Projects/XMessenger/client/src/i18n/index.ts). Never hardcode Persian/English strings or ternary conditionals in components.
2. **Terminal Scripts**: Must be 100% English.
3. **No Over-Engineering**: Do not introduce unnecessary libraries or architectural complexity. Preserve existing fast 0ms hydration and WAL storage patterns.
4. **Testing Invariant**: Always run `npm test --prefix server` and `npm run build --prefix client` before committing.
