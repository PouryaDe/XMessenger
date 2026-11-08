# .agents Directory Specification

This directory holds the agentic knowledge base, architectural contracts, design system specifications, and engineering standards for **XMessenger**.

---

## Knowledge Index & Standards

1. [`rules/ui-ux-design-system.md`](file:///c:/Users/Lion/Desktop/Projects/XMessenger/.agents/rules/ui-ux-design-system.md)
   - Color harmony rules (warm sandy linen `#DFDDD6` canvas, dark obsidian `#0E1218` ambient canvas, and full-bleed transparent header/footer integration).
   - Telegram curved corner tails and removal of redundant in-chat avatars.
   - Static floating pill input bar (zero hover/focus border jumps).
   - Standardized user list cards (`rounded-xl`, subtle hairline borders, no heavy shadows).
   - Unpinned stream TTL notice (floating centered glass pill scrolling naturally with chat).
   - Standard 3-line hamburger menu icon (`Menu` from `lucide-react`).
   - Dynamic smart context menu positioning preventing viewport and header clipping.
   - Mobile PWA notch, dynamic island, and safe area handling (`pt-safe`, `pb-safe`).
   - Segmented control floating circular notification badges (unread chats on All tab, pending count on Pending tab).
   - Deterministic high-contrast initials avatar palettes (`getAvatarPalette`) with defined borders.
   - Chat list row hierarchy: message timestamp in top row, vibrant Telegram emerald unread badge in bottom row.

2. [`rules/i18n-standard.md`](file:///c:/Users/Lion/Desktop/Projects/XMessenger/.agents/rules/i18n-standard.md)
   - Zero hardcoded text rule: All user-facing strings strictly in `client/src/i18n/index.ts`.
   - Complete prohibition of code-level `lang === 'fa' ? ... : ...` ternaries.
   - Dynamic interpolation and pluralization standards.

3. [`rules/cli-console.md`](file:///c:/Users/Lion/Desktop/Projects/XMessenger/.agents/rules/cli-console.md)
   - Strictly 100% English console scripts and terminal outputs.
   - Live Symlink architecture for `/usr/local/bin/xmessenger` and `/usr/local/bin/xupdate`.
   - Fast hot-deploy pipeline (`docker cp` into running containers + Nginx cache flush).

4. [`rules/features-and-capabilities.md`](file:///c:/Users/Lion/Desktop/Projects/XMessenger/.agents/rules/features-and-capabilities.md)
   - Comprehensive inventory of project scope and features:
     - 1-Way Hub-and-Spoke messaging.
     - Telegram message grouping, responsive bubble widths, and curved corner tails.
     - Message reactions (👍 Like) via double-tap, animated burst, and real-time sync.
     - Disappearing TTL messages with background hard-purge.
     - Image messaging with full-screen Lightbox and clipboard paste.
     - Telegram-style date separators and smart scroll preserving reading position.
     - Background Web Push notifications (PWA & Web) with zero-config VAPID.
     - Dynamic PWA with 0ms instant hydration, smooth updates, custom branding, and profile photos.
     - Database online backup and validated restore.
     - Multi-domain Docker deployment with shared Nginx SSL gateway.

5. [`rules/security.md`](file:///c:/Users/Lion/Desktop/Projects/XMessenger/.agents/rules/security.md)
   - AES-256-GCM database encryption at rest.
   - User peer isolation.
   - Hard TTL purge and instant two-way deletion.
   - XSS sanitization and bcrypt password hashing.

6. [`rules/architecture.md`](file:///c:/Users/Lion/Desktop/Projects/XMessenger/.agents/rules/architecture.md)
   - Hub-and-spoke role topology.
   - SQLite WAL storage & persistent volume contracts.
   - Production Docker asset serving and cache headers.
   - Socket.IO real-time event lifecycle.
   - Web Push notification architecture and VAPID key lifecycle.
