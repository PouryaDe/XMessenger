# XMessenger Features, Capabilities & Project Scope

This document provides a comprehensive inventory of all built-in features, architectural capabilities, and user requirements implemented in **XMessenger**.

---

## 1. Project Goal & Core Philosophy

- **Goal**: A high-security, hub-and-spoke web-based private messenger tailored for seamless mobile (PWA) and desktop operation.
- **Core Principle**: Absolute user privacy, zero long-term retention of communications, transparent administration, and military-grade encryption at rest.

---

## 2. Communication Model: Hub-and-Spoke (One-Way Routing)

1. **User Isolation**:
   - Regular users cannot see, discover, search, or message other regular users.
   - Each user interacts exclusively with the central administrator (`role: 'admin'`).
2. **Admin Operations**:
   - The Admin can view the list of all registered users in the sidebar.
   - The Admin can filter users by status (`All`, `Pending`, `Active`, `Banned`).
   - The Admin can approve new pending users, ban/unban users, delete users, and wipe conversations.
3. **Live Socket Presence**:
   - Real-time online/offline presence tracking (`presence:init`, `user:online_status`, `admin:online_status`).
   - Real-time bidirectional typing indicators (`typing`).
   - Instant message delivery (`message:new`, `message:sent`).

---

## 3. Disappearing Messages (TTL) & Zero Residual Footprint

1. **Configurable TTL Engine**:
   - Admin can set the global default TTL (e.g. 15 minutes, 1 hour, 6 hours, 24 hours, 2 days, 7 days).
   - Every message receives an exact `expires_at` timestamp.
   - A background engine automatically hard-purges expired messages from SQLite on a periodic schedule.
2. **Ephemeral Countdown Badge**:
   - Each message bubble displays a subtle remaining TTL countdown tag with a subtle flame icon.
3. **Two-Way Instant Deletion ("Delete for Everyone")**:
   - Either party (sender or admin) can delete any message.
   - Executes an immediate `DELETE` from SQLite and dispatches a WebSocket event to purge the message from both screens instantly.
4. **Wipe Entire Chat**:
   - Both users and administrators have the ability to clear the entire conversation history with one click.

---

## 4. Media & Image Messaging

1. **Photo Sending (Paperclip Attachment)**:
   - Users and admins can attach and send images directly in the chat stream.
   - Supports device camera and gallery selection via the paperclip icon.
   - Supports desktop clipboard image paste (`Ctrl+V`) directly into the input bar.
2. **Pre-Send Preview Bar**:
   - Shows image thumbnail, filename, file size, and discard button.
   - Supports adding an optional caption text to the image before sending.
3. **Encrypted Payload Representation**:
   - Stored in the database as `[image:${url}]\n${caption}`, encrypted with AES-256-GCM.
4. **Full-Screen Lightbox**:
   - Tapping/clicking any image in the chat opens an animated high-resolution modal with blur backdrop, close button, and instant download button.

---

## 5. Telegram-Style Date Separators, Grouping & Tails

1. **Consecutive Message Grouping & Spacing**:
   - Consecutive messages from the same sender on the same calendar day are visually grouped together (`mt-1`).
   - Group boundaries and sender switches apply clear vertical separation (`mt-3.5 sm:mt-4`) to eliminate visual crowding.
2. **Integrated Telegram Bubble Tails**:
   - Telegram curved corner SVG tails attach seamlessly to the last message of a streak: bottom-right for outgoing messages, bottom-left for incoming messages.
   - Message bubble max-width is tuned to `max-w-[76%] sm:max-w-[70%] md:max-w-[65%]`.
3. **Centered Sticky/Inline Date Badges**:
   - Messages are partitioned by calendar day using Telegram-style translucent pill badges centered between message groups.
   - Fully localized with zero hardcoded strings (`امروز` / `Today`, `دیروز` / `Yesterday`, or formatted local month and day).
4. **Smart Scroll & Reading Position Preservation**:
   - Prevents auto-scroll bounce: Reading history is strictly preserved when user scrolls up (`isNearBottom = false`), even during periodic 6s heartbeat syncs or incoming messages.
   - Telegram Floating Action Button (`ChevronDown`) appears when scrolled up (>160px) to let users smoothly jump back to the latest messages on demand.

---

## 6. Message Reactions (👍 Like) & Gestures

1. **Double-Tap / Double-Click to Like**:
   - Double-tapping on mobile or double-clicking on desktop triggers an instant `👍` like reaction.
   - Features a lightweight, GPU-accelerated reaction burst animation (`animate-like-burst`) that runs without heavy external animation libraries.
   - Touch events are debounced (450ms) to prevent synthetic `dblclick` event duplicates on iOS/Android.
2. **Telegram Reaction Badges & Reactor Avatars**:
   - Active reactions appear in a pill badge at the bubble corner with reaction emoji, reactor user avatar stack, and count.
   - Users can toggle reactions via double-tap, tapping the reaction badge, or using the message context menu.
3. **Security & Real-Time Sync**:
   - Reactions are verified server-side (only active conversation participants or admin can react).
   - Emojis are bounded to `<= 16` characters to prevent payload injection.
   - Live synchronization via WebSocket (`message:react` / `message:reaction`) with automatic REST fallback (`POST /api/messages/:id/react`).

---

## 7. Web Push Notifications (PWA & Desktop)

1. **Background & Standalone Delivery**:
   - Delivers native OS notifications when the app is in the background, closed, or device screen is locked.
   - Fully supports Desktop browsers (Chrome, Edge, Safari, Firefox), Android (browser & PWA), and iOS 16.4+ (in standalone Home Screen PWA mode).
2. **Privacy & Focused-Window Respect**:
   - Notifications automatically silence themselves (`silentIfFocused`) when the user is actively focused on the chat window to eliminate intrusive system banners.
   - Notification previews automatically recognize image messages (`📷 Image`) and truncate long text.
3. **Zero Configuration VAPID**:
   - Automated VAPID public/private key generation and persistence in SQLite `settings`.
   - In-app toggle and instant test notification button in both `UserDrawer` and `AdminSettingsModal`.

---

## 8. Security & Encryption Standards

1. **At-Rest Message Encryption**:
   - Every message ciphertext is encrypted using **AES-256-GCM** with a unique 96-bit initialization vector (IV) and 128-bit authentication tag per row.
   - Raw plaintext messages never hit the disk unencrypted.
2. **Password Hashing**:
   - Salted and hashed using `bcrypt` (12 rounds).
3. **JWT Authentication**:
   - Stateless JWT tokens passed via `Authorization: Bearer <token>` and validated on both REST API and Socket.IO handshakes.
4. **Input Sanitization**:
   - All rendered content is strictly sanitized against XSS attacks.

---

## 9. Progressive Web App (PWA), Smooth Updates & Mobile UI

1. **0ms Instant Hydration & Zero Page Jumping**:
   - Authenticated user and conversation state are cached in `localStorage` and `sessionStorage`, enabling instant 0ms app rendering on PWA launch without intermediate loading screens or theme flashes.
   - App updates run with a sleek glassmorphic transition overlay (`Updating Application...`) preventing multi-step screen jumping on mobile.
2. **Narrow Screen Responsiveness**:
   - UserDrawer and AdminSettingsModal maintain strict minimum widths and truncation (`min-w-[5.25rem]`, `truncate`), preventing element wrapping or card breakage on 320px+ viewports.
3. **Mobile Installation (iOS & Android)**:
   - Installable on iOS via Safari ("Add to Home Screen") and Android via Chrome ("Install App").
   - Responsive standalone view with notch (`.pt-safe`) and home indicator (`.pb-safe`) spacing.
4. **Admin Branding & Customization**:
   - **App Name**: Custom system title dynamically reflected in browser title and PWA manifest.
   - **PWA Short Name**: Custom label under the home screen app icon.
   - **PWA Icon Upload**: Admin can upload custom PNG/SVG app icons dynamically served in `/manifest.json`.
   - **Profile Photo Upload**: Admin and users can upload their own profile pictures stored in `/app/data/uploads/avatars`.

---

## 10. Database Backup & Disaster Recovery

1. **Online Database Backup**:
   - Admin can download a verified, consistent `.db` snapshot of the SQLite database at any time via the admin modal (`GET /api/admin/backup`).
   - Uses SQLite's online backup API (`db.backup()`) ensuring zero corruption even during active writes.
2. **Live Database Restore**:
   - Admin can upload a `.db` backup file to restore the entire system (`POST /api/admin/restore`).
   - Implements automated schema integrity checks (`PRAGMA integrity_check`) before swapping the database file.

---

## 11. Multi-Domain Server Architecture

1. **Shared Nginx Gateway**:
   - Reverse proxy container (`xmessenger-nginx`) handling Let's Encrypt SSL certificates and HTTP/2 terminating reverse proxy.
2. **Instance Isolation**:
   - Each domain runs as an independent container (`xmessenger-<domain-slug>`) with isolated data volumes.
3. **Centralized Management CLI**:
   - Manage all domains, SSL renewal, passwords, updates, and logs using `xmessenger` and `xupdate`.
